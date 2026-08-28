/**
 * mediaStore.ts — eager fetch-and-store of chat media bytes into chatDb.
 *
 * Once a message's image/video/audio URL is resolved (even momentarily,
 * since CloudFront signed URLs expire on a timer), the bytes are downloaded
 * via @tauri-apps/plugin-http (bypasses webview CORS — same pattern already
 * proven in saveMedia.ts against these exact CDN hosts) and stored as base64
 * in chat.sqlite3, so the content survives URL expiry / view-once forever.
 * The tap-to-reveal/blur UI is unaffected — only where the bytes come from
 * changes.
 */

import { fetch } from "@tauri-apps/plugin-http";
import * as chatDb from "./chatDb";
import {
	getMediaCaptureTarget,
	getReplyImageHashTarget,
	isMediaMessage,
} from "../pages/app/chat/chatUtils";
import type { MediaCaptureTarget } from "../pages/app/chat/chatUtils";
import type { MediaKind } from "../types/chat-db";
import type { UiMessage } from "../types/chat-page";
import { appLog } from "../utils/logger";
import { isAutoDownloadMediaEnabled } from "../utils/mediaSettings";
import { limitChatDbBlobRead } from "../utils/chatDbBlobLimiter";

// De-dupe concurrent fetches for the same key (e.g. multiple hydration passes
// racing for the same image).
const inFlight = new Map<string, Promise<void>>();

// Synchronous in-memory cache so render code (which can't await a DB read)
// can prefer the locally-stored copy once it's available. Populated as
// fetchAndStoreMedia resolves (whether by downloading or finding a DB hit).
const memoryCache = new Map<string, string>();
const cacheListeners = new Set<() => void>();

function setCachedMediaUri(mediaKey: string, uri: string): void {
	memoryCache.set(mediaKey, uri);
	for (const listener of cacheListeners) {
		listener();
	}
}

/** Synchronous read of the in-memory media cache. */
export function getCachedMediaUri(mediaKey: string | null | undefined): string | null {
	if (!mediaKey) {
		return null;
	}
	return memoryCache.get(mediaKey) ?? null;
}

/** Subscribe to in-memory cache updates; returns an unsubscribe function. */
export function subscribeToMediaCache(listener: () => void): () => void {
	cacheListeners.add(listener);
	return () => {
		cacheListeners.delete(listener);
	};
}

function bytesToBase64(data: ArrayBuffer, mimeType: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([data], { type: mimeType || "application/octet-stream" });
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const commaIndex = dataUrl.indexOf(",");
			resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
		};
		reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
		reader.readAsDataURL(blob);
	});
}

export function toDataUri(mimeType: string | null, base64: string): string {
	return `data:${mimeType || "application/octet-stream"};base64,${base64}`;
}

/**
 * Checks whether a CloudFront signed URL has expired by reading the
 * `Expires` query parameter (Unix epoch seconds). No network request needed.
 * Returns false if the URL cannot be parsed or has no Expires param.
 */
export function isSignedUrlExpired(url: string): boolean {
	try {
		const expires = new URL(url).searchParams.get("Expires");
		if (!expires) return false;
		return Date.now() > Number(expires) * 1000;
	} catch {
		return false;
	}
}

export type FetchedMedia = {
	base64: string;
	mimeType: string | null;
	sizeBytes: number;
};

/** Downloads `url` and base64-encodes it. Returns null on any failure (logs, never throws). */
export async function fetchAndEncode(url: string): Promise<FetchedMedia | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download media (${response.status})`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const mimeType =
			response.headers.get("content-type")?.split(";")[0]?.trim() || null;
		const base64 = await bytesToBase64(arrayBuffer, mimeType || "application/octet-stream");
		return { base64, mimeType, sizeBytes: arrayBuffer.byteLength };
	} catch (error) {
		appLog.warn(`[media-store] failed to fetch/encode ${url}`, error);
		return null;
	}
}

export type FetchAndStoreMediaParams = {
	mediaKey: string;
	kind: MediaKind;
	url: string;
	conversationId: string | null;
	messageId: string | null;
	viewOnce: boolean;
	// Whether the signed-in user sent this message themselves — auto-download
	// to the device's Downloads folder only ever mirrors media *received*
	// from someone else, never the user's own outgoing photos/videos.
	isOwnMessage: boolean;
	// Set for captures of secondary preview content (reply-quote thumbnails,
	// reaction bubbles) rather than the actual media a message is about —
	// never worth mirroring to the device's Downloads folder even when
	// received. Defaults to false.
	skipAutoDownload?: boolean;
};

async function downloadAndStore(params: FetchAndStoreMediaParams): Promise<void> {
	const { mediaKey, kind, url, conversationId, messageId, viewOnce, isOwnMessage, skipAutoDownload } = params;
	const fetched = await fetchAndEncode(url);

	if (!fetched) {
		await chatDb
			.upsertMediaFile({
				mediaKey,
				conversationId,
				messageId,
				kind,
				mimeType: null,
				dataBase64: "",
				viewOnce,
				sizeBytes: null,
				fetchStatus: "failed",
			})
			.catch(() => {});
		return;
	}

	await chatDb.upsertMediaFile({
		mediaKey,
		conversationId,
		messageId,
		kind,
		mimeType: fetched.mimeType,
		dataBase64: fetched.base64,
		viewOnce,
		sizeBytes: fetched.sizeBytes,
		fetchStatus: "ok",
	});
	setCachedMediaUri(mediaKey, toDataUri(fetched.mimeType, fetched.base64));
	// This message now has bytes on disk, so a message-id-keyed lookup that
	// previously came back empty would succeed — let it be retried.
	if (messageId) {
		emptyMessageMediaLookups.delete(messageId);
	}

	if (!isOwnMessage && !skipAutoDownload && (kind === "image" || kind === "video")) {
		void maybeAutoDownloadToDevice(fetched.base64, fetched.mimeType, kind, conversationId);
	}
}

/**
 * Mirrors newly-cached media into the device's Downloads folder, if the user
 * has opted in. Dynamically imported to avoid a circular dependency —
 * saveMedia.ts itself imports toDataUri from this module.
 */
async function maybeAutoDownloadToDevice(
	base64: string,
	mimeType: string | null,
	kind: "image" | "video",
	conversationId: string | null,
): Promise<void> {
	if (!isAutoDownloadMediaEnabled()) {
		return;
	}
	try {
		const { saveMediaBytesToDeviceSilent } = await import("./saveMedia");
		await saveMediaBytesToDeviceSilent(base64, mimeType, kind, conversationId);
	} catch (error) {
		appLog.warn("[media-store] auto-download to device failed", error);
	}
}

/**
 * Fetch and store media bytes for `mediaKey` if not already cached. Safe to
 * call repeatedly/concurrently (fire-and-forget) — de-duped in-flight,
 * skipped once already stored, retried on a previous failure. Never throws.
 */
export async function fetchAndStoreMedia(
	params: FetchAndStoreMediaParams,
): Promise<void> {
	const { mediaKey, url } = params;
	if (!mediaKey || !url) {
		return;
	}

	const existing = inFlight.get(mediaKey);
	if (existing) {
		return existing;
	}

	const run = (async () => {
		try {
			const cached = await limitChatDbBlobRead(() => chatDb.getMediaFile(mediaKey));
			if (cached?.fetchStatus === "ok") {
				setCachedMediaUri(mediaKey, toDataUri(cached.mimeType, cached.dataBase64));
				return;
			}
			// Signed URLs that already expired are guaranteed to 403 — skip the
			// network round-trip (and the log spam it'd produce) instead of
			// re-hitting CloudFront every time this message is re-processed
			// (poll, realtime merge, hydration pass) until a fresh URL arrives.
			if (isSignedUrlExpired(url)) {
				if (cached?.fetchStatus !== "failed") {
					await chatDb
						.upsertMediaFile({
							mediaKey,
							conversationId: params.conversationId,
							messageId: params.messageId,
							kind: params.kind,
							mimeType: null,
							dataBase64: "",
							viewOnce: params.viewOnce,
							sizeBytes: null,
							fetchStatus: "failed",
						})
						.catch(() => {});
				}
				return;
			}
			await downloadAndStore(params);
		} finally {
			inFlight.delete(mediaKey);
		}
	})();

	inFlight.set(mediaKey, run);
	return run;
}

/**
 * Returns a ready-to-use data: URI for previously-stored media, or null if
 * not cached (yet, or the last fetch failed).
 */
export async function getLocalMediaUri(
	mediaKey: string | null | undefined,
): Promise<string | null> {
	if (!mediaKey) {
		return null;
	}
	const stored = await limitChatDbBlobRead(() => chatDb.getMediaFile(mediaKey));
	if (!stored || stored.fetchStatus !== "ok") {
		return null;
	}
	return toDataUri(stored.mimeType, stored.dataBase64);
}

/**
 * The primary media_key (see chatUtils.ts's getMediaKeyForMessage) is
 * derived from whatever the live message body currently offers — a hash,
 * a URL, a mediaId. Once the server stops including that field (expired
 * signed URL no longer refreshed, conversation archived, etc.) the same
 * message can no longer reproduce that key, even though chatDb may still
 * have the bytes filed under it. message_id is stable forever, so this is
 * a parallel, URL-independent cache namespace keyed by it instead — used
 * as a fallback wherever the primary lookup can't even be attempted.
 */
export function getMessageFallbackMediaKey(messageId: string): string {
	return `msg:${messageId}`;
}

// Message ids whose message-id-keyed lookup came back with nothing usable.
// Render code calls hydrateMediaByMessageId on every pass for a bubble whose
// body has lost its URL, and without this each of those passes would re-read
// a blob table. Cleared for a message the moment anything is stored for it,
// so a later capture is still picked up.
const emptyMessageMediaLookups = new Set<string>();

/**
 * Populates the in-memory cache (under the message-id fallback key) from
 * whatever's already stored for this message, regardless of whether the
 * live message currently carries a usable URL. Safe to call repeatedly,
 * including from render.
 */
export async function hydrateMediaByMessageId(messageId: string): Promise<void> {
	const key = getMessageFallbackMediaKey(messageId);
	if (
		memoryCache.has(key) ||
		inFlight.has(key) ||
		emptyMessageMediaLookups.has(messageId)
	) {
		return;
	}

	const run = (async () => {
		try {
			const stored = await limitChatDbBlobRead(() =>
				chatDb.getMediaFileByMessageId(messageId),
			);
			if (stored?.fetchStatus === "ok") {
				setCachedMediaUri(key, toDataUri(stored.mimeType, stored.dataBase64));
			} else {
				emptyMessageMediaLookups.add(messageId);
			}
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, run);
	return run;
}

/** What a pre-block media capture attempt managed to secure locally. */
export type MediaCaptureResult = {
	messageId: string;
	mediaKey: string;
	kind: MediaKind;
	/** Bytes for this message are in chatDb with fetchStatus "ok". */
	captured: boolean;
	/**
	 * The URL this message offers is a signed URL that has already expired, so
	 * it is guaranteed to 403 — no later retry can do better than what's
	 * cached, and it must not hold a block back.
	 */
	unavailable: boolean;
};

/**
 * Downloads and stores every image/video/audio attachment in `messages`,
 * awaited, and reports per-message whether the bytes actually landed.
 *
 * The fire-and-forget captureMediaForMessages in ChatPage exists to keep the
 * open thread's cache warm; this is its counterpart for the auto-block path,
 * where the block permanently revokes the signed URLs these messages carry
 * and there is no second chance. Resolves (never rejects).
 *
 * Reply-quote and ProfilePhotoReply thumbnails are captured alongside, on a
 * best-effort basis — those resolve from content-addressed CDN hashes that
 * outlive the conversation, so they're worth grabbing but aren't reported as
 * something a block could destroy.
 */
export async function captureMessageMediaForArchival(
	messages: UiMessage[],
	conversationId: string,
	userId: number | null,
): Promise<MediaCaptureResult[]> {
	const targets: { message: UiMessage; target: MediaCaptureTarget }[] = [];
	const sideCaptures: Promise<void>[] = [];

	for (const message of messages) {
		const target = getMediaCaptureTarget(message);
		if (target) {
			targets.push({ message, target });
		} else if (isMediaMessage(message)) {
			// An attachment whose body has already lost its URL — nothing left to
			// download, but pull whatever's already stored into the in-memory
			// cache so the archived thread renders it.
			sideCaptures.push(hydrateMediaByMessageId(message.messageId));
		}

		const replyTarget = getReplyImageHashTarget(message);
		if (replyTarget) {
			sideCaptures.push(
				fetchAndStoreMedia({
					mediaKey: replyTarget.mediaKey,
					kind: "image",
					url: replyTarget.url,
					conversationId,
					messageId: message.messageId,
					viewOnce: false,
					isOwnMessage: false,
					skipAutoDownload: true,
				}),
			);
		}
	}

	const [results] = await Promise.all([
		Promise.all(
			targets.map(async ({ message, target }): Promise<MediaCaptureResult> => {
				// fetchAndStoreMedia never throws and de-dupes in flight by
				// mediaKey, so a racing scanner joins this download rather than
				// issuing a second one.
				await fetchAndStoreMedia({
					mediaKey: target.mediaKey,
					kind: target.kind,
					url: target.url,
					conversationId,
					messageId: message.messageId,
					viewOnce: target.viewOnce,
					isOwnMessage: userId != null && Number(message.senderId) === Number(userId),
				});

				// It records failures as a row with fetchStatus "failed" rather
				// than signalling them, so success has to be read back off the row.
				const stored = await limitChatDbBlobRead(() =>
					chatDb.getMediaFile(target.mediaKey),
				).catch(() => null);

				return {
					messageId: message.messageId,
					mediaKey: target.mediaKey,
					kind: target.kind,
					captured: stored?.fetchStatus === "ok",
					unavailable: isSignedUrlExpired(target.url),
				};
			}),
		),
		Promise.all(sideCaptures),
	]);

	return results;
}
