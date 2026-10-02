/**
 * detectorTestRun.ts — TEMPORARY. Collects real photos and what the detector
 * makes of each, so the thresholds in utils/explicitContentRules.ts can be
 * set from real cases instead of guesses.
 *
 * It writes, into `<app data>/detector-test/<run>/` on this device:
 * - the profile photos of the people in the inbox, and the photos they sent;
 * - the main photo of the most recent saved viewers;
 * - results.json, with everything the detector found in each, whole and
 *   piece by piece.
 *
 * It changes nothing and blocks nobody: no rule reads any of this. The
 * photos are ones the account can already see. They stay on this device and
 * are meant to be deleted, along with this file and its button, once the
 * thresholds are settled.
 */

import { invoke } from "@tauri-apps/api/core";
import type { ConversationEntry, InboxResponse, MessagesResponse } from "../types/messages";
import { getMediaCaptureTarget, getOtherParticipant } from "../pages/app/chat/chatUtils";
import type { ContentDetection } from "../utils/explicitContentRules";
import { appLog } from "../utils/logger";
import { getProfileImageUrl, validateMediaHash } from "../utils/media";
import * as chatDb from "./chatDb";
import { detectRaw } from "./contentCheck";
import { interestViewsStore } from "./interestViewsStore";
import { fetchAndEncode } from "./mediaStore";
import { photoHashesOf, type ProfilePhotoApi } from "./profilePhotoCheck";

const INBOX_PAGES = 2;
const MAX_INBOX_PROFILES = 80;
const MAX_PHOTOS_PER_PROFILE = 8;
const MAX_SENT_PHOTOS_PER_CHAT = 6;
const MAX_VIEWERS = 250;

export type DetectorTestApi = ProfilePhotoApi & {
	listConversations: (params: { page: number }) => Promise<InboxResponse>;
	listMessages: (params: { conversationId: string }) => Promise<MessagesResponse>;
};

export type DetectorTestProgress = {
	stage: string;
	done: number;
	total: number;
	photos: number;
};

export type DetectorTestResult = {
	dir: string;
	profiles: number;
	photos: number;
	failed: number;
};

type Entry = {
	source: "inbox_profile" | "sent" | "viewer";
	profileId: string;
	name: string;
	file: string | null;
	/** The profile photo's hash, or the message id for something they sent. */
	id: string;
	primary?: boolean;
	width?: number;
	height?: number;
	whole?: ContentDetection[];
	tiled?: ContentDetection[];
	error?: string;
};

function extensionFor(mimeType: string | null): string {
	if (mimeType?.includes("png")) return "png";
	if (mimeType?.includes("webp")) return "webp";
	if (mimeType?.includes("gif")) return "gif";
	return "jpg";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the collection. `shouldStop` is asked between photos; what was
 * collected up to then is still written out.
 */
export async function runDetectorTestCollection(
	api: DetectorTestApi,
	userId: number,
	onProgress: (progress: DetectorTestProgress) => void,
	shouldStop: () => boolean,
): Promise<DetectorTestResult> {
	const run = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const entries: Entry[] = [];
	let dir = "";
	let photos = 0;
	let failed = 0;

	const write = async (name: string, payload: { dataBase64?: string; text?: string }) => {
		dir = await invoke<string>("detector_test_write", { run, name, ...payload });
	};

	const collect = async (
		base: Omit<Entry, "file" | "whole" | "tiled" | "width" | "height" | "error">,
		fileStem: string,
		load: () => Promise<{ base64: string; mimeType: string | null } | null>,
	) => {
		try {
			const loaded = await load();
			if (!loaded) throw new Error("could not download");
			const whole = await detectRaw(loaded.base64, false);
			const tiled = await detectRaw(loaded.base64, true);
			const file = `${fileStem}.${extensionFor(loaded.mimeType)}`;
			await write(file, { dataBase64: loaded.base64 });
			entries.push({
				...base,
				file,
				width: whole.imageWidth,
				height: whole.imageHeight,
				whole: whole.detections,
				tiled: tiled.detections,
			});
			photos += 1;
		} catch (error) {
			failed += 1;
			entries.push({ ...base, file: null, error: error instanceof Error ? error.message : String(error) });
		}
	};

	// --- The people in the inbox: every profile photo, and what they sent.
	const conversations: ConversationEntry[] = [];
	for (let page = 1; page <= INBOX_PAGES; page += 1) {
		const response = await api.listConversations({ page }).catch(() => null);
		if (!response) break;
		conversations.push(...response.entries);
		if (response.nextPage == null) break;
	}
	const chats = conversations.slice(0, MAX_INBOX_PROFILES);
	const seenProfiles = new Set<string>();

	for (const [index, conversation] of chats.entries()) {
		if (shouldStop()) break;
		onProgress({ stage: "Inbox", done: index, total: chats.length, photos });
		const profileId = getOtherParticipant(conversation, userId)?.profileId?.toString();
		const conversationId = conversation.data.conversationId;
		if (!profileId) continue;
		seenProfiles.add(profileId);
		const name = conversation.data.name?.trim() || "";

		try {
			const profile = await api.getProfileDetail(profileId);
			const hashes = photoHashesOf(profile).slice(0, MAX_PHOTOS_PER_PROFILE);
			for (const [photoIndex, hash] of hashes.entries()) {
				if (shouldStop()) break;
				await collect(
					{ source: "inbox_profile", profileId, name, id: hash, primary: photoIndex === 0 },
					`p${profileId}_${photoIndex}_${hash.slice(0, 8)}`,
					() => fetchAndEncode(getProfileImageUrl(hash, "1024x1024")),
				);
			}
		} catch (error) {
			appLog.warn(`[detector-test] could not read profile ${profileId}`, error);
		}

		try {
			const messages = (await api.listMessages({ conversationId })).messages ?? [];
			let sent = 0;
			for (const message of messages) {
				if (shouldStop() || sent >= MAX_SENT_PHOTOS_PER_CHAT) break;
				if (Number(message.senderId) === Number(userId)) continue;
				const target = getMediaCaptureTarget(message);
				if (!target || target.kind !== "image") continue;
				sent += 1;
				await collect(
					{ source: "sent", profileId, name, id: message.messageId },
					`m${profileId}_${sent}`,
					async () => {
						const stored = await chatDb.getMediaFile(target.mediaKey).catch(() => null);
						if (stored?.fetchStatus === "ok" && stored.dataBase64) {
							return { base64: stored.dataBase64, mimeType: stored.mimeType };
						}
						return fetchAndEncode(target.url);
					},
				);
			}
		} catch (error) {
			appLog.warn(`[detector-test] could not read chat ${conversationId}`, error);
		}

		// The same pacing the scanners keep between profiles.
		await sleep(1000);
	}

	// --- Recent viewers: a larger sample of main profile photos, with no
	// requests to Grindr beyond downloading the photo itself.
	const viewers = (await interestViewsStore.getAll().catch(() => []))
		.filter(
			(viewer) =>
				viewer.imageHash != null && validateMediaHash(viewer.imageHash) && !seenProfiles.has(viewer.profileId),
		)
		.slice(0, MAX_VIEWERS);
	for (const [index, viewer] of viewers.entries()) {
		if (shouldStop()) break;
		onProgress({ stage: "Viewers", done: index, total: viewers.length, photos });
		const hash = viewer.imageHash as string;
		await collect(
			{ source: "viewer", profileId: viewer.profileId, name: viewer.displayName ?? "", id: hash, primary: true },
			`v${viewer.profileId}_${hash.slice(0, 8)}`,
			() => fetchAndEncode(getProfileImageUrl(hash, "1024x1024")),
		);
	}

	await write("results.json", {
		text: JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries }, null, 1),
	});
	onProgress({ stage: "Done", done: 1, total: 1, photos });
	return { dir, profiles: seenProfiles.size + viewers.length, photos, failed };
}

// ---------------------------------------------------------------------------
// One collection at a time, kept here rather than in the Settings page: it
// runs for minutes, and leaving the page must neither stop it nor lose where
// it put the photos.
// ---------------------------------------------------------------------------

export type DetectorTestState = {
	running: DetectorTestProgress | null;
	/** How the last collection ended, for display. */
	result: string | null;
};

let state: DetectorTestState = { running: null, result: null };
let stopRequested = false;
const stateListeners = new Set<() => void>();

function setState(next: DetectorTestState): void {
	state = next;
	for (const listener of stateListeners) listener();
}

export function getDetectorTestState(): DetectorTestState {
	return state;
}

export function subscribeToDetectorTest(listener: () => void): () => void {
	stateListeners.add(listener);
	return () => {
		stateListeners.delete(listener);
	};
}

export function stopDetectorTestCollection(): void {
	stopRequested = true;
}

export async function startDetectorTestCollection(api: DetectorTestApi, userId: number): Promise<void> {
	if (state.running) return;
	stopRequested = false;
	setState({ running: { stage: "Starting", done: 0, total: 0, photos: 0 }, result: null });
	try {
		const result = await runDetectorTestCollection(
			api,
			userId,
			(running) => setState({ running, result: null }),
			() => stopRequested,
		);
		setState({
			running: null,
			result: `${result.photos} photos from ${result.profiles} profiles saved${result.failed > 0 ? ` (${result.failed} could not be read)` : ""}: ${result.dir}`,
		});
	} catch (error) {
		setState({
			running: null,
			result: `Collecting failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}
