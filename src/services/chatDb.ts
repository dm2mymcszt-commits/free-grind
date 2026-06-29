/**
 * chatDb.ts — the durable chat database.
 *
 * Backs conversations, messages, media bytes (base64), albums, and avatars in
 * a single sqlite file. Nothing here is ever deleted by app logic except via
 * the explicit cascade delete used by the user-initiated "Delete conversation"
 * action — everything else (archive, unsend, expiry) is a flag flip, never a
 * row removal.
 *
 * Mirrors the connection/pragma/write-queue/lock-retry pattern already proven
 * in chatContactIndex.ts (the Tauri SQL plugin uses a connection pool without
 * session affinity, so manual BEGIN transactions are unreliable — avoid them).
 *
 * Booleans are bound as literal 1/0 integers (not JS true/false) and JSON
 * fields are JSON.stringify'd before binding — the plugin's JS->Rust bind path
 * has no BLOB-producing branch and serializes anything that isn't a string or
 * number through a generic JSON path, so we own the encoding explicitly rather
 * than rely on its implicit behavior. Media bytes are stored as base64 TEXT
 * for the same reason (no real BLOB write path from JS).
 */

import Database from "@tauri-apps/plugin-sql";
import type { ConversationEntry, Message } from "../types/messages";
import type {
	AlbumMediaUpsertInput,
	AlbumUpsertInput,
	ArchivedReason,
	MediaFileUpsertInput,
	StoredAlbum,
	StoredAlbumMedia,
	StoredAvatar,
	StoredConversation,
	StoredMediaFile,
	StoredMessage,
} from "../types/chat-db";
import { appLog } from "../utils/logger";

const CHAT_DB = "sqlite:chat.sqlite3";
const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const SQLITE_LOCK_RETRY_DELAYS_MS = [30, 80, 180, 350] as const;

type ConversationRow = {
	conversation_id: string;
	other_profile_id: string | null;
	name: string | null;
	participants_json: string;
	last_activity_timestamp: number | null;
	unread_count: number;
	pinned: number;
	muted: number;
	favorite: number;
	preview_json: string | null;
	archived: number;
	archived_reason: string | null;
	archived_at: number | null;
	last_seen_in_inbox_at: number | null;
	created_at: number;
	updated_at: number;
};

type MessageRow = {
	message_id: string;
	conversation_id: string;
	sender_id: number;
	timestamp: number;
	type: string | null;
	chat1_type: string | null;
	body_json: string | null;
	unsent: number;
	local_history: number;
	reply_to_message_id: string | null;
	reply_preview_json: string | null;
	reactions_json: string | null;
};

type MediaFileRow = {
	media_key: string;
	conversation_id: string | null;
	message_id: string | null;
	kind: string;
	mime_type: string | null;
	data_base64: string;
	view_once: number;
	size_bytes: number | null;
	fetch_status: string;
	fetched_at: number;
};

type AlbumRow = {
	album_id: string;
	owner_profile_id: string | null;
	album_name: string | null;
	conversation_id: string | null;
	shared_via_message_id: string | null;
	preview_cover_base64: string | null;
	preview_cover_mime_type: string | null;
	created_at: number;
	updated_at: number;
};

type AlbumMediaRow = {
	content_id: string;
	album_id: string;
	content_type: string | null;
	data_base64: string | null;
	thumb_data_base64: string | null;
	remaining_views: number | null;
	is_viewable: number | null;
	fetched_at: number | null;
};

type AvatarRow = {
	media_hash: string;
	data_base64: string;
	mime_type: string | null;
	fetched_at: number;
};

let dbPromise: Promise<Database> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function getDb(): Promise<Database> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const db = await Database.load(CHAT_DB);
			try {
				await db.execute("PRAGMA journal_mode = WAL");
				await db.execute("PRAGMA synchronous = NORMAL");
				await db.execute(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
			} catch (error) {
				appLog.warn("[chat-db] failed to set pragmas", error);
			}

			await executeWithLockRetry(db, "init-tables", async () => {
				await db.execute(`
					CREATE TABLE IF NOT EXISTS conversations (
						conversation_id TEXT PRIMARY KEY,
						other_profile_id TEXT,
						name TEXT,
						participants_json TEXT NOT NULL,
						last_activity_timestamp INTEGER,
						unread_count INTEGER NOT NULL DEFAULT 0,
						pinned INTEGER NOT NULL DEFAULT 0,
						muted INTEGER NOT NULL DEFAULT 0,
						favorite INTEGER NOT NULL DEFAULT 0,
						preview_json TEXT,
						archived INTEGER NOT NULL DEFAULT 0,
						archived_reason TEXT,
						archived_at INTEGER,
						last_seen_in_inbox_at INTEGER,
						created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)
				`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_conversations_other_profile ON conversations(other_profile_id)",
				);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(archived)",
				);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS conversation_meta (
						conversation_id TEXT PRIMARY KEY,
						last_read_timestamp INTEGER
					)
				`);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS messages (
						message_id TEXT PRIMARY KEY,
						conversation_id TEXT NOT NULL,
						sender_id INTEGER NOT NULL,
						timestamp INTEGER NOT NULL,
						type TEXT,
						chat1_type TEXT,
						body_json TEXT,
						unsent INTEGER NOT NULL DEFAULT 0,
						local_history INTEGER NOT NULL DEFAULT 0,
						reply_to_message_id TEXT,
						reply_preview_json TEXT,
						reactions_json TEXT,
						created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)
				`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_messages_conversation_ts ON messages(conversation_id, timestamp)",
				);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id)",
				);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS media_files (
						media_key TEXT PRIMARY KEY,
						conversation_id TEXT,
						message_id TEXT,
						kind TEXT NOT NULL,
						mime_type TEXT,
						data_base64 TEXT NOT NULL,
						view_once INTEGER NOT NULL DEFAULT 0,
						size_bytes INTEGER,
						fetch_status TEXT NOT NULL DEFAULT 'ok',
						fetched_at INTEGER NOT NULL
					)
				`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_media_files_message ON media_files(message_id)",
				);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS albums (
						album_id TEXT PRIMARY KEY,
						owner_profile_id TEXT,
						album_name TEXT,
						conversation_id TEXT,
						shared_via_message_id TEXT,
						created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)
				`);
				// Added later: the chat bubble's blurred teaser preview, which comes
				// from the sharing message's own body (coverUrl/previewUrl) and is
				// visually distinct from the album's actual (clear) content
				// thumbnails in album_media. Best-effort migration — ignore
				// "duplicate column" once it already exists.
				try {
					await db.execute("ALTER TABLE albums ADD COLUMN preview_cover_base64 TEXT");
				} catch {
					// already migrated
				}
				try {
					await db.execute("ALTER TABLE albums ADD COLUMN preview_cover_mime_type TEXT");
				} catch {
					// already migrated
				}

				await db.execute(`
					CREATE TABLE IF NOT EXISTS album_media (
						content_id TEXT PRIMARY KEY,
						album_id TEXT NOT NULL,
						content_type TEXT,
						data_base64 TEXT,
						thumb_data_base64 TEXT,
						remaining_views INTEGER,
						is_viewable INTEGER,
						fetched_at INTEGER
					)
				`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id)",
				);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS avatars (
						media_hash TEXT PRIMARY KEY,
						data_base64 TEXT NOT NULL,
						mime_type TEXT,
						fetched_at INTEGER NOT NULL
					)
				`);
			});

			return db;
		})();
	}

	return dbPromise;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isSqliteLockedError(error: unknown): boolean {
	if (typeof error !== "string") {
		const message = error instanceof Error ? error.message : JSON.stringify(error);
		if (!message) {
			return false;
		}
		return /database is locked|\(code:\s*(5|517)\)/i.test(message);
	}

	return /database is locked|\(code:\s*(5|517)\)/i.test(error);
}

async function executeWithLockRetry(
	_db: Database,
	label: string,
	run: () => Promise<void>,
): Promise<void> {
	const queuedRun = async () => {
		const maxAttempts = SQLITE_LOCK_RETRY_DELAYS_MS.length + 1;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				await run();
				if (attempt > 1) {
					appLog.warn("[chat-db] recovered from sqlite lock", { label, attempt });
				}
				return;
			} catch (error) {
				const locked = isSqliteLockedError(error);
				if (!locked || attempt >= maxAttempts) {
					throw error;
				}

				const delayMs = SQLITE_LOCK_RETRY_DELAYS_MS[attempt - 1] ?? 400;
				appLog.warn("[chat-db] sqlite lock during write, retrying", {
					label,
					attempt,
					delayMs,
				});
				await sleep(delayMs);
			}
		}
	};

	const current = writeQueue.then(queuedRun, queuedRun);
	writeQueue = current.then(() => undefined, () => undefined);
	await current;
}

export async function initChatDb(): Promise<void> {
	await getDb();
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

function rowToStoredConversation(row: ConversationRow): StoredConversation {
	const entry: ConversationEntry = {
		data: {
			conversationId: row.conversation_id,
			name: row.name ?? "",
			participants: JSON.parse(
				row.participants_json,
			) as ConversationEntry["data"]["participants"],
			lastActivityTimestamp: row.last_activity_timestamp,
			unreadCount: row.unread_count,
			preview: row.preview_json
				? (JSON.parse(row.preview_json) as ConversationEntry["data"]["preview"])
				: null,
			muted: Boolean(row.muted),
			pinned: Boolean(row.pinned),
			favorite: Boolean(row.favorite),
		},
	};

	return {
		conversationId: row.conversation_id,
		otherProfileId: row.other_profile_id,
		entry,
		archived: Boolean(row.archived),
		archivedReason: (row.archived_reason as ArchivedReason | null) ?? null,
		archivedAt: row.archived_at,
		lastSeenInInboxAt: row.last_seen_in_inbox_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function upsertConversation(
	entry: ConversationEntry,
	otherProfileId: string | null,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-conversation", async () => {
		await db.execute(
			`
			INSERT INTO conversations (
				conversation_id, other_profile_id, name, participants_json,
				last_activity_timestamp, unread_count, pinned, muted, favorite,
				preview_json, archived, archived_reason, archived_at,
				last_seen_in_inbox_at, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, NULL, NULL, NULL, $11, $11)
			ON CONFLICT(conversation_id) DO UPDATE SET
				other_profile_id = excluded.other_profile_id,
				name = excluded.name,
				participants_json = excluded.participants_json,
				last_activity_timestamp = excluded.last_activity_timestamp,
				unread_count = excluded.unread_count,
				pinned = excluded.pinned,
				muted = excluded.muted,
				favorite = excluded.favorite,
				preview_json = excluded.preview_json,
				updated_at = excluded.updated_at
			`,
			[
				entry.data.conversationId,
				otherProfileId,
				entry.data.name ?? "",
				JSON.stringify(entry.data.participants ?? []),
				entry.data.lastActivityTimestamp ?? null,
				entry.data.unreadCount ?? 0,
				entry.data.pinned ? 1 : 0,
				entry.data.muted ? 1 : 0,
				entry.data.favorite ? 1 : 0,
				entry.data.preview ? JSON.stringify(entry.data.preview) : null,
				now,
			],
		);
	});
}

export async function getConversation(
	conversationId: string,
): Promise<StoredConversation | null> {
	const db = await getDb();
	const rows = await db.select<ConversationRow[]>(
		"SELECT * FROM conversations WHERE conversation_id = $1",
		[conversationId],
	);
	const row = rows[0];
	return row ? rowToStoredConversation(row) : null;
}

export async function listConversations(options?: {
	includeArchived?: boolean;
}): Promise<StoredConversation[]> {
	const db = await getDb();
	const rows = options?.includeArchived
		? await db.select<ConversationRow[]>(
				"SELECT * FROM conversations ORDER BY pinned DESC, last_activity_timestamp DESC",
			)
		: await db.select<ConversationRow[]>(
				"SELECT * FROM conversations WHERE archived = 0 ORDER BY pinned DESC, last_activity_timestamp DESC",
			);
	return rows.map(rowToStoredConversation);
}

export async function findConversationByProfileId(
	profileId: string,
): Promise<StoredConversation | null> {
	const db = await getDb();
	const rows = await db.select<ConversationRow[]>(
		"SELECT * FROM conversations WHERE other_profile_id = $1 ORDER BY updated_at DESC LIMIT 1",
		[profileId],
	);
	const row = rows[0];
	return row ? rowToStoredConversation(row) : null;
}

export async function setConversationArchived(
	conversationId: string,
	archived: boolean,
	reason: ArchivedReason | null,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "set-conversation-archived", async () => {
		await db.execute(
			`
			UPDATE conversations
			SET archived = $2, archived_reason = $3, archived_at = $4, updated_at = $5
			WHERE conversation_id = $1
			`,
			[conversationId, archived ? 1 : 0, archived ? reason : null, archived ? now : null, now],
		);
	});
}

export async function touchConversationSeenInInbox(
	conversationId: string,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "touch-conversation-seen", async () => {
		await db.execute(
			"UPDATE conversations SET last_seen_in_inbox_at = $2 WHERE conversation_id = $1",
			[conversationId, now],
		);
	});
}

/**
 * Persists a conversation's unread count directly (e.g. clearing it to 0 once
 * read). Needed for archived conversations specifically — they never go
 * through upsertConversation again (that only happens on a live /v4/inbox
 * fetch, which an archived conversation by definition no longer appears in),
 * so without this the stored count would resurface stale on next app start.
 */
export async function setConversationUnreadCount(
	conversationId: string,
	unreadCount: number,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "set-conversation-unread-count", async () => {
		await db.execute(
			"UPDATE conversations SET unread_count = $2, updated_at = $3 WHERE conversation_id = $1",
			[conversationId, unreadCount, Date.now()],
		);
	});
}

export async function deleteConversationCascade(
	conversationId: string,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "delete-conversation-cascade", async () => {
		await db.execute("DELETE FROM messages WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM media_files WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute(
			"DELETE FROM album_media WHERE album_id IN (SELECT album_id FROM albums WHERE conversation_id = $1)",
			[conversationId],
		);
		await db.execute("DELETE FROM albums WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM conversation_meta WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM conversations WHERE conversation_id = $1", [
			conversationId,
		]);
	});
}

// ---------------------------------------------------------------------------
// conversation_meta (last-read tracking)
// ---------------------------------------------------------------------------

export async function getLastReadTimestamp(
	conversationId: string,
): Promise<number | null> {
	const db = await getDb();
	const rows = await db.select<{ last_read_timestamp: number | null }[]>(
		"SELECT last_read_timestamp FROM conversation_meta WHERE conversation_id = $1",
		[conversationId],
	);
	return rows[0]?.last_read_timestamp ?? null;
}

export async function setLastReadTimestamp(
	conversationId: string,
	timestamp: number | null,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "set-last-read-timestamp", async () => {
		await db.execute(
			`
			INSERT INTO conversation_meta (conversation_id, last_read_timestamp)
			VALUES ($1, $2)
			ON CONFLICT(conversation_id) DO UPDATE SET last_read_timestamp = excluded.last_read_timestamp
			`,
			[conversationId, timestamp],
		);
	});
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function rowToStoredMessage(row: MessageRow): StoredMessage {
	return {
		messageId: row.message_id,
		conversationId: row.conversation_id,
		senderId: row.sender_id,
		timestamp: row.timestamp,
		type: row.type ?? "Unknown",
		chat1Type: row.chat1_type,
		body: row.body_json ? JSON.parse(row.body_json) : null,
		unsent: Boolean(row.unsent),
		reactions: row.reactions_json
			? (JSON.parse(row.reactions_json) as Message["reactions"])
			: [],
		replyToMessage: row.reply_to_message_id,
		replyPreview: row.reply_preview_json ? JSON.parse(row.reply_preview_json) : null,
		localHistory: Boolean(row.local_history),
	};
}

export async function upsertMessages(
	conversationId: string,
	messages: Message[],
): Promise<void> {
	if (messages.length === 0) {
		return;
	}

	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-messages", async () => {
		for (const message of messages) {
			const replyToMessageId =
				typeof message.replyToMessage === "string"
					? message.replyToMessage
					: typeof (message.replyToMessage as Record<string, unknown> | null)
								?.messageId === "string"
						? ((message.replyToMessage as Record<string, unknown>)
								.messageId as string)
						: null;

			await db.execute(
				`
				INSERT INTO messages (
					message_id, conversation_id, sender_id, timestamp, type, chat1_type,
					body_json, unsent, local_history, reply_to_message_id,
					reply_preview_json, reactions_json, created_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $12)
				ON CONFLICT(message_id) DO UPDATE SET
					sender_id = excluded.sender_id,
					timestamp = excluded.timestamp,
					type = excluded.type,
					chat1_type = excluded.chat1_type,
					body_json = excluded.body_json,
					unsent = excluded.unsent,
					reply_to_message_id = excluded.reply_to_message_id,
					reply_preview_json = excluded.reply_preview_json,
					reactions_json = excluded.reactions_json,
					updated_at = excluded.updated_at
				`,
				[
					message.messageId,
					conversationId,
					message.senderId,
					message.timestamp,
					message.type ?? "Unknown",
					message.chat1Type ?? null,
					message.body != null ? JSON.stringify(message.body) : null,
					message.unsent ? 1 : 0,
					replyToMessageId,
					message.replyPreview != null ? JSON.stringify(message.replyPreview) : null,
					JSON.stringify(message.reactions ?? []),
					now,
				],
			);
		}
	});
}

export type SystemMessageType = "SystemBlocked" | "SystemUnblocked";

/**
 * Inserts a synthetic, locally-generated message marking a block/unblock
 * directly into the conversation's history — never comes from the server,
 * just a local record of when we noticed the conversation got archived
 * (likely blocked) or unarchived (likely unblocked) again.
 */
export async function insertSystemMessage(
	conversationId: string,
	type: SystemMessageType,
	timestamp: number = Date.now(),
): Promise<Message> {
	const message: Message = {
		messageId: `local-system:${type}:${conversationId}:${timestamp}`,
		conversationId,
		senderId: 0,
		timestamp,
		unsent: false,
		reactions: [],
		type,
		chat1Type: null,
		body: null,
		replyToMessage: null,
		replyPreview: null,
	};
	await upsertMessages(conversationId, [message]);
	return message;
}

export async function getMessages(conversationId: string): Promise<StoredMessage[]> {
	const db = await getDb();
	const rows = await db.select<MessageRow[]>(
		"SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC",
		[conversationId],
	);
	return rows.map(rowToStoredMessage);
}

/**
 * One page of messages, most-recent-first within the page but returned in
 * ascending order for display — mirrors the live API's cursor pagination
 * (uses the existing conversation_id+timestamp index) so an archived
 * conversation's "load older messages" behaves identically to a live one,
 * just paging through chatDb instead of the server.
 */
export async function getMessagesPage(
	conversationId: string,
	options: { beforeTimestamp?: number; limit: number },
): Promise<StoredMessage[]> {
	const db = await getDb();
	const rows =
		options.beforeTimestamp != null
			? await db.select<MessageRow[]>(
					"SELECT * FROM messages WHERE conversation_id = $1 AND timestamp < $2 ORDER BY timestamp DESC LIMIT $3",
					[conversationId, options.beforeTimestamp, options.limit],
				)
			: await db.select<MessageRow[]>(
					"SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT $2",
					[conversationId, options.limit],
				);
	return rows.map(rowToStoredMessage).sort((a, b) => a.timestamp - b.timestamp);
}

export async function setMessageLocalHistory(
	messageId: string,
	localHistory: boolean,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "set-message-local-history", async () => {
		await db.execute(
			"UPDATE messages SET local_history = $2, updated_at = $3 WHERE message_id = $1",
			[messageId, localHistory ? 1 : 0, Date.now()],
		);
	});
}

/**
 * Optimistic local path for the user's own unsend: flags the row as both
 * unsent and local_history immediately, without waiting for the server
 * round-trip (which arrives later via the normal upsertMessages merge).
 */
export async function markMessageUnsentLocally(messageId: string): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "mark-message-unsent-locally", async () => {
		await db.execute(
			"UPDATE messages SET unsent = 1, local_history = 1, updated_at = $2 WHERE message_id = $1",
			[messageId, Date.now()],
		);
	});
}

export async function deleteMessageRow(messageId: string): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "delete-message", async () => {
		await db.execute("DELETE FROM messages WHERE message_id = $1", [messageId]);
	});
}

export async function clearMessagesForConversation(
	conversationId: string,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "clear-messages-for-conversation", async () => {
		await db.execute("DELETE FROM messages WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM media_files WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM conversation_meta WHERE conversation_id = $1", [
			conversationId,
		]);
	});
}

export async function exportAllMessages(): Promise<Record<string, Message[]>> {
	const db = await getDb();
	const rows = await db.select<MessageRow[]>(
		"SELECT * FROM messages ORDER BY conversation_id ASC, timestamp ASC",
	);

	const result: Record<string, Message[]> = {};
	for (const row of rows) {
		const stored = rowToStoredMessage(row);
		const { localHistory: _localHistory, ...message } = stored;
		if (!result[row.conversation_id]) {
			result[row.conversation_id] = [];
		}
		result[row.conversation_id].push(message);
	}
	return result;
}

// ---------------------------------------------------------------------------
// Media files
// ---------------------------------------------------------------------------

function rowToStoredMediaFile(row: MediaFileRow): StoredMediaFile {
	return {
		mediaKey: row.media_key,
		conversationId: row.conversation_id,
		messageId: row.message_id,
		kind: row.kind as StoredMediaFile["kind"],
		mimeType: row.mime_type,
		dataBase64: row.data_base64,
		viewOnce: Boolean(row.view_once),
		sizeBytes: row.size_bytes,
		fetchStatus: row.fetch_status as StoredMediaFile["fetchStatus"],
		fetchedAt: row.fetched_at,
	};
}

export async function upsertMediaFile(input: MediaFileUpsertInput): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-media-file", async () => {
		await db.execute(
			`
			INSERT INTO media_files (
				media_key, conversation_id, message_id, kind, mime_type,
				data_base64, view_once, size_bytes, fetch_status, fetched_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT(media_key) DO UPDATE SET
				conversation_id = excluded.conversation_id,
				message_id = excluded.message_id,
				kind = excluded.kind,
				mime_type = excluded.mime_type,
				data_base64 = excluded.data_base64,
				view_once = excluded.view_once,
				size_bytes = excluded.size_bytes,
				fetch_status = excluded.fetch_status,
				fetched_at = excluded.fetched_at
			`,
			[
				input.mediaKey,
				input.conversationId,
				input.messageId,
				input.kind,
				input.mimeType,
				input.dataBase64,
				input.viewOnce ? 1 : 0,
				input.sizeBytes,
				input.fetchStatus,
				now,
			],
		);
	});
}

export async function getMediaFile(
	mediaKey: string,
): Promise<StoredMediaFile | null> {
	const db = await getDb();
	const rows = await db.select<MediaFileRow[]>(
		"SELECT * FROM media_files WHERE media_key = $1",
		[mediaKey],
	);
	const row = rows[0];
	return row ? rowToStoredMediaFile(row) : null;
}

/**
 * Looks up cached media by message_id rather than media_key — needed when
 * the live message body no longer carries a usable URL (expired, archived
 * conversation, server stopped refreshing it) so the original media_key
 * (often derived from a hash/URL in that body) can't be recomputed anymore.
 * message_id never changes, so this always finds a prior capture.
 */
export async function getMediaFileByMessageId(
	messageId: string,
): Promise<StoredMediaFile | null> {
	const db = await getDb();
	const rows = await db.select<MediaFileRow[]>(
		"SELECT * FROM media_files WHERE message_id = $1 LIMIT 1",
		[messageId],
	);
	const row = rows[0];
	return row ? rowToStoredMediaFile(row) : null;
}

/**
 * All successfully-cached image/video media for a conversation, newest
 * first — the local, always-available backing for the "received media"
 * panel (chatDb is the single source there, not the live API, since the
 * whole point is staying viewable after the server no longer serves it).
 */
export async function getMediaFilesForConversation(
	conversationId: string,
): Promise<StoredMediaFile[]> {
	const db = await getDb();
	const rows = await db.select<MediaFileRow[]>(
		`
		SELECT mf.* FROM media_files mf
		LEFT JOIN messages m ON m.message_id = mf.message_id
		WHERE mf.conversation_id = $1
			AND mf.fetch_status = 'ok'
			AND mf.kind IN ('image', 'video')
		ORDER BY COALESCE(m.timestamp, mf.fetched_at) DESC
		`,
		[conversationId],
	);
	return rows.map(rowToStoredMediaFile);
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

function rowToStoredAlbum(row: AlbumRow): StoredAlbum {
	return {
		albumId: row.album_id,
		ownerProfileId: row.owner_profile_id,
		albumName: row.album_name,
		conversationId: row.conversation_id,
		sharedViaMessageId: row.shared_via_message_id,
		previewCoverBase64: row.preview_cover_base64 ?? null,
		previewCoverMimeType: row.preview_cover_mime_type ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function upsertAlbum(input: AlbumUpsertInput): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-album", async () => {
		await db.execute(
			`
			INSERT INTO albums (
				album_id, owner_profile_id, album_name, conversation_id,
				shared_via_message_id, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $6)
			ON CONFLICT(album_id) DO UPDATE SET
				owner_profile_id = COALESCE(excluded.owner_profile_id, owner_profile_id),
				album_name = COALESCE(excluded.album_name, album_name),
				conversation_id = COALESCE(excluded.conversation_id, conversation_id),
				shared_via_message_id = COALESCE(excluded.shared_via_message_id, shared_via_message_id),
				updated_at = excluded.updated_at
			`,
			[
				input.albumId,
				input.ownerProfileId,
				input.albumName,
				input.conversationId,
				input.sharedViaMessageId,
				now,
			],
		);
	});
}

/**
 * Stores the chat bubble's blurred teaser preview for an album — sourced
 * from the sharing message's own body (coverUrl/previewUrl), not the
 * album's actual content. Upserts a minimal row if the album hasn't been
 * captured at all yet (this can run independently of/before the full
 * album capture, since the preview comes from a different source and may
 * still be capturable even if the album API itself is gated).
 */
export async function upsertAlbumPreviewCover(
	albumId: string,
	base64: string,
	mimeType: string | null,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-album-preview-cover", async () => {
		await db.execute(
			`
			INSERT INTO albums (
				album_id, owner_profile_id, album_name, conversation_id,
				shared_via_message_id, preview_cover_base64, preview_cover_mime_type,
				created_at, updated_at
			) VALUES ($1, NULL, NULL, NULL, NULL, $2, $3, $4, $4)
			ON CONFLICT(album_id) DO UPDATE SET
				preview_cover_base64 = excluded.preview_cover_base64,
				preview_cover_mime_type = excluded.preview_cover_mime_type,
				updated_at = excluded.updated_at
			`,
			[albumId, base64, mimeType, now],
		);
	});
}

export async function getAllAlbums(): Promise<StoredAlbum[]> {
	const db = await getDb();
	const rows = await db.select<AlbumRow[]>(
		"SELECT * FROM albums ORDER BY updated_at DESC",
	);
	return rows.map(rowToStoredAlbum);
}

export async function getAlbum(albumId: string): Promise<StoredAlbum | null> {
	const db = await getDb();
	const rows = await db.select<AlbumRow[]>(
		"SELECT * FROM albums WHERE album_id = $1",
		[albumId],
	);
	const row = rows[0];
	return row ? rowToStoredAlbum(row) : null;
}

/** All albums ever shared within this conversation, eagerly captured and durable. */
export async function getAlbumsForConversation(
	conversationId: string,
): Promise<StoredAlbum[]> {
	const db = await getDb();
	const rows = await db.select<AlbumRow[]>(
		"SELECT * FROM albums WHERE conversation_id = $1 ORDER BY updated_at DESC",
		[conversationId],
	);
	return rows.map(rowToStoredAlbum);
}

function rowToStoredAlbumMedia(row: AlbumMediaRow): StoredAlbumMedia {
	return {
		contentId: row.content_id,
		albumId: row.album_id,
		contentType: row.content_type,
		dataBase64: row.data_base64,
		thumbDataBase64: row.thumb_data_base64,
		remainingViews: row.remaining_views,
		isViewable: row.is_viewable == null ? null : Boolean(row.is_viewable),
		fetchedAt: row.fetched_at,
	};
}

export async function upsertAlbumMedia(input: AlbumMediaUpsertInput): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-album-media", async () => {
		await db.execute(
			`
			INSERT INTO album_media (
				content_id, album_id, content_type, data_base64, thumb_data_base64,
				remaining_views, is_viewable, fetched_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT(content_id) DO UPDATE SET
				album_id = excluded.album_id,
				content_type = excluded.content_type,
				data_base64 = excluded.data_base64,
				thumb_data_base64 = excluded.thumb_data_base64,
				remaining_views = excluded.remaining_views,
				is_viewable = excluded.is_viewable,
				fetched_at = excluded.fetched_at
			`,
			[
				input.contentId,
				input.albumId,
				input.contentType,
				input.dataBase64,
				input.thumbDataBase64,
				input.remainingViews,
				input.isViewable == null ? null : input.isViewable ? 1 : 0,
				now,
			],
		);
	});
}

export async function getAlbumMedia(albumId: string): Promise<StoredAlbumMedia[]> {
	const db = await getDb();
	const rows = await db.select<AlbumMediaRow[]>(
		"SELECT * FROM album_media WHERE album_id = $1",
		[albumId],
	);
	return rows.map(rowToStoredAlbumMedia);
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

export async function upsertAvatar(
	mediaHash: string,
	dataBase64: string,
	mimeType: string | null,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-avatar", async () => {
		await db.execute(
			`
			INSERT INTO avatars (media_hash, data_base64, mime_type, fetched_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT(media_hash) DO UPDATE SET
				data_base64 = excluded.data_base64,
				mime_type = excluded.mime_type,
				fetched_at = excluded.fetched_at
			`,
			[mediaHash, dataBase64, mimeType, now],
		);
	});
}

export async function getAvatar(mediaHash: string): Promise<StoredAvatar | null> {
	const db = await getDb();
	const rows = await db.select<AvatarRow[]>(
		"SELECT * FROM avatars WHERE media_hash = $1",
		[mediaHash],
	);
	const row = rows[0];
	return row
		? {
				mediaHash: row.media_hash,
				dataBase64: row.data_base64,
				mimeType: row.mime_type,
				fetchedAt: row.fetched_at,
			}
		: null;
}
