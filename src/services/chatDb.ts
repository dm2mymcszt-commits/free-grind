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
import { BaseDirectory, exists, rename } from "@tauri-apps/plugin-fs";
import type { ConversationEntry, Message } from "../types/messages";
import type {
	AlbumMediaUpsertInput,
	AlbumUpsertInput,
	ArchivedReason,
	BlockEventType,
	BlockState,
	DownloadedMediaEntry,
	FullDbExport,
	MediaFileUpsertInput,
	StoredAlbum,
	StoredAlbumMedia,
	StoredAvatar,
	StoredBlockEvent,
	StoredConversation,
	StoredMediaFile,
	StoredMessage,
} from "../types/chat-db";
import type { IndexedMessage } from "../types/chat-cache";
import { appLog } from "../utils/logger";
import { getMessageText } from "../utils/messageText";
import { guardAgainstClosedPool } from "./sqlitePoolGuard";

// Pre-multi-account file. Once a user is known, the active db switches to a
// per-account file (see setActiveChatDbUser) — this name only stays in play
// before login, and as the migration source for existing installs.
const LEGACY_CHAT_DB_FILENAME = "chat.sqlite3";
const LEGACY_CHAT_DB = `sqlite:${LEGACY_CHAT_DB_FILENAME}`;
const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const SQLITE_LOCK_RETRY_DELAYS_MS = [30, 80, 180, 350] as const;

let activeChatDbName = LEGACY_CHAT_DB;

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
	hidden: number;
	block_state: string | null;
	last_seen_in_inbox_at: number | null;
	messages_synced_activity_timestamp: number | null;
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

type BlockEventRow = {
	id: string;
	profile_id: string | null;
	conversation_id: string;
	event_type: string;
	timestamp: number;
	display_name: string | null;
	avatar_media_hash: string | null;
	created_at: number;
};

type DownloadedMediaRow = {
	identifier: string;
	platform: string;
	album_id: string | null;
	byte_size: number;
	mime_type: string | null;
	kind: string | null;
	saved_at: number;
};

let dbPromise: Promise<Database> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function getDb(): Promise<Database> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const db = guardAgainstClosedPool(await Database.load(activeChatDbName), "chat-db");
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
				// Added later: explicit, durable "who blocked whom" state — the
				// source of truth for archive/system-message decisions instead of
				// inferring direction from toggling `archived` on an ambiguous
				// chat.v1.conversation.delete event. NULL = not blocked either way.
				try {
					await db.execute("ALTER TABLE conversations ADD COLUMN block_state TEXT");
				} catch {
					// already migrated
				}
				// Added later: tracks message-fetch progress separately from
				// conversation-metadata freshness so inboxSync can resume an
				// interrupted first sync without re-walking conversations whose
				// messages already landed (see StoredConversation.messagesSyncedActivityTimestamp).
				try {
					await db.execute(
						"ALTER TABLE conversations ADD COLUMN messages_synced_activity_timestamp INTEGER",
					);
				} catch {
					// already migrated
				}
				// Added later: manual, local-only "hide this chat from the inbox"
				// flag — unlike `archived` (server says the conversation is gone),
				// hidden conversations still round-trip through /v4/inbox normally;
				// this only affects the client-side filteredConversations view.
				try {
					await db.execute("ALTER TABLE conversations ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
				} catch {
					// already migrated
				}

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

				await db.execute(`
					CREATE TABLE IF NOT EXISTS downloaded_media (
						identifier TEXT PRIMARY KEY,
						platform TEXT NOT NULL,
						album_id TEXT,
						byte_size INTEGER NOT NULL,
						mime_type TEXT,
						kind TEXT,
						saved_at INTEGER NOT NULL
					)
				`);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS settings (
						key TEXT PRIMARY KEY,
						value TEXT NOT NULL
					)
				`);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS saved_phrases (
						phrase TEXT PRIMARY KEY,
						created_at INTEGER NOT NULL
					)
				`);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS saved_locations (
						id TEXT PRIMARY KEY,
						name TEXT NOT NULL,
						geohash TEXT NOT NULL,
						lat REAL NOT NULL,
						lon REAL NOT NULL,
						created_at INTEGER NOT NULL
					)
				`);

				await db.execute(`
					CREATE TABLE IF NOT EXISTS block_events (
						id TEXT PRIMARY KEY,
						profile_id TEXT,
						conversation_id TEXT NOT NULL,
						event_type TEXT NOT NULL,
						timestamp INTEGER NOT NULL,
						display_name TEXT,
						avatar_media_hash TEXT,
						created_at INTEGER NOT NULL
					)
				`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_block_events_timestamp ON block_events(timestamp DESC)",
				);
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

/**
 * On the very first switch to a given account, if that account doesn't have
 * its own db file yet but the pre-multi-account shared file does, rename it
 * into place instead of starting that account fresh — preserves existing
 * installs' chat history instead of silently losing it. Guarded by the
 * target file's existence so it only ever runs once per account.
 */
async function migrateLegacyDbIfNeeded(profileId: number): Promise<void> {
	const targetFilename = `chat-${profileId}.sqlite3`;
	try {
		const [targetExists, legacyExists] = await Promise.all([
			exists(targetFilename, { baseDir: BaseDirectory.AppData }),
			exists(LEGACY_CHAT_DB_FILENAME, { baseDir: BaseDirectory.AppData }),
		]);
		if (!targetExists && legacyExists) {
			await rename(LEGACY_CHAT_DB_FILENAME, targetFilename, {
				oldPathBaseDir: BaseDirectory.AppData,
				newPathBaseDir: BaseDirectory.AppData,
			});
			appLog.info(`[chat-db] migrated legacy chat db -> ${targetFilename}`);
		}
	} catch (error) {
		appLog.warn("[chat-db] legacy db migration check failed", error);
	}
}

/**
 * Points the chat db at the given account's own file, closing the previous
 * connection first — each account's conversations/messages/media live in a
 * fully separate sqlite file, so switching accounts can never show stale
 * data from a previous one, and switching back needs no refetch.
 */
export async function setActiveChatDbUser(profileId: number | null): Promise<void> {
	const nextDbName = profileId != null ? `sqlite:chat-${profileId}.sqlite3` : LEGACY_CHAT_DB;
	if (nextDbName === activeChatDbName && dbPromise) {
		return;
	}

	if (dbPromise) {
		try {
			const db = await dbPromise;
			// Must pass db.path — close() with no argument closes every open
			// sql plugin pool, not just this one, which was killing the
			// unrelated chat-index connection out from under chatContactIndex.ts
			// on every account switch ("acquire a connection on a closed pool").
			await db.close(db.path);
		} catch (error) {
			appLog.warn("[chat-db] failed to close previous connection", error);
		}
	}

	dbPromise = null;
	writeQueue = Promise.resolve();
	activeChatDbName = nextDbName;

	if (profileId != null) {
		await migrateLegacyDbIfNeeded(profileId);
		await getDb();
		await repairSyntheticBlockedConversations().catch((error) => {
			appLog.warn("[chat-db] failed to repair synthetic blocked conversations", error);
		});
		await repairArchivedConversationPreviews().catch((error) => {
			appLog.warn("[chat-db] failed to repair archived conversation previews", error);
		});
		await purgeEmptySyntheticBlockedConversations().catch((error) => {
			appLog.warn("[chat-db] failed to purge empty synthetic blocked conversations", error);
		});
	}
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
		hidden: Boolean(row.hidden),
		blockState: (row.block_state as BlockState | null) ?? null,
		lastSeenInInboxAt: row.last_seen_in_inbox_at,
		messagesSyncedActivityTimestamp: row.messages_synced_activity_timestamp,
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

/**
 * Records that this conversation's messages are up to date as of
 * `activityTimestamp` (its lastActivityTimestamp at fetch time) — lets
 * inboxSync distinguish "conversation metadata is current" from "messages
 * are current" so a resumed sync only re-fetches conversations that never
 * actually got their messages, instead of every conversation seen so far.
 */
export async function markConversationMessagesSynced(
	conversationId: string,
	activityTimestamp: number | null,
): Promise<void> {
	const db = await getDb();
	await executeWithLockRetry(db, "mark-conversation-messages-synced", async () => {
		await db.execute(
			"UPDATE conversations SET messages_synced_activity_timestamp = $1 WHERE conversation_id = $2",
			[activityTimestamp, conversationId],
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

/**
 * Unarchived conversations recent (or pinned) enough that they'd belong on
 * the same inbox page as `sinceTimestamp` — used to recover a conversation
 * the server has permanently stopped listing (e.g. it was blocked and
 * deleted there; the server only relists it once someone messages that
 * profile afresh) without falling back to the *entire* local history, which
 * would defeat pagination. `sinceTimestamp` should be the least-recent
 * lastActivityTimestamp actually present in the current live response — a
 * locally-known conversation newer than that would have to appear on this
 * same page too, so its absence means the server can no longer produce it at
 * all, not that it merely fell further down the pagination.
 */
export async function listConversationsSince(sinceTimestamp: number): Promise<StoredConversation[]> {
	const db = await getDb();
	const rows = await db.select<ConversationRow[]>(
		"SELECT * FROM conversations WHERE archived = 0 AND (pinned = 1 OR last_activity_timestamp >= $1) ORDER BY pinned DESC, last_activity_timestamp DESC",
		[sinceTimestamp],
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

/**
 * Recovers a conversation whose `conversations` row is gone (e.g. removed via
 * deleteConversationOnly, which only deletes the conversation/meta rows and
 * never touches `messages` — see file header) but whose message history is
 * still sitting in `messages` under a known conversationId. There's nothing
 * left in `conversations` to look this conversationId up by profile id once
 * the row is deleted, so the caller must supply it from elsewhere (chat
 * contact index still remembers it).
 *
 * Returns a synthesized, not-yet-persisted StoredConversation so the caller
 * can hydrate the thread from local history without resurrecting a stale row
 * into the active inbox or assuming the live conversation still exists.
 * The profile itself may still be perfectly reachable, so callers should keep
 * the composer enabled and route sends through the normal targetProfileId
 * path rather than treating this like an archived/read-only thread — a real
 * `conversations` row is only written again once that succeeds (normal
 * upsertConversation path).
 */
export async function recoverOrphanedConversation(
	conversationId: string,
	otherProfileId: string,
): Promise<StoredConversation | null> {
	const db = await getDb();
	const rows = await db.select<MessageRow[]>(
		`SELECT * FROM messages
		 WHERE conversation_id = $1
		 ORDER BY CASE WHEN COALESCE(type, '') LIKE 'System%' THEN 1 ELSE 0 END ASC,
		          timestamp DESC
		 LIMIT 1`,
		[conversationId],
	);
	const lastMessageRow = rows[0];
	if (!lastMessageRow) {
		return null;
	}
	let messageText: string | null = null;
	if (lastMessageRow.body_json) {
		try {
			const body = JSON.parse(lastMessageRow.body_json) as Record<string, unknown>;
			messageText = typeof body.text === "string" ? body.text : null;
		} catch {
			// A malformed historical body should not prevent the conversation
			// itself from being recovered.
		}
	}

	const now = Date.now();
	const entry: ConversationEntry = {
		data: {
			conversationId,
			name: "",
			participants: [{ profileId: Number(otherProfileId) }],
			lastActivityTimestamp: lastMessageRow.timestamp,
			unreadCount: 0,
			preview: {
				conversationId: { value: conversationId },
				messageId: lastMessageRow.message_id,
				senderId: lastMessageRow.sender_id,
				type: lastMessageRow.type ?? "Unknown",
				chat1Type: lastMessageRow.chat1_type,
				text: messageText,
			},
			muted: false,
			pinned: false,
			favorite: false,
		},
	};

	return {
		conversationId,
		otherProfileId,
		entry,
		archived: false,
		archivedReason: null,
		archivedAt: null,
		hidden: false,
		blockState: null,
		lastSeenInInboxAt: null,
		messagesSyncedActivityTimestamp: null,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Finds the newest real conversation that has locally saved incoming content
 * from `profileId` but no conversations row. This is the signature left by
 * the old realtime auto-block race: the incoming message was saved under the
 * server id, then applySelfBlockAction could not find its metadata and made a
 * separate `direct:<profileId>` archive shell.
 */
export async function recoverLatestOrphanedConversationForProfile(
	profileId: string,
): Promise<StoredConversation | null> {
	const numericProfileId = Number(profileId);
	if (!Number.isFinite(numericProfileId)) {
		return null;
	}
	const db = await getDb();
	const rows = await db.select<{ conversation_id: string }[]>(
		`
		SELECT m.conversation_id
		FROM messages m
		LEFT JOIN conversations c ON c.conversation_id = m.conversation_id
		WHERE c.conversation_id IS NULL
		  AND m.sender_id = $1
		  AND COALESCE(m.type, '') NOT LIKE 'System%'
		  AND m.conversation_id NOT LIKE 'direct:%'
		GROUP BY m.conversation_id
		ORDER BY MAX(m.timestamp) DESC
		LIMIT 1
		`,
		[numericProfileId],
	);
	const conversationId = rows[0]?.conversation_id;
	return conversationId
		? recoverOrphanedConversation(conversationId, profileId)
		: null;
}

/**
 * Repairs archives produced by the historical realtime auto-block race.
 * Only synthetic rows containing system markers (no user content) are
 * replaced, so a legitimate local `direct:*` draft can never be discarded.
 */
export async function repairSyntheticBlockedConversations(): Promise<number> {
	const correlationWindowMs = 5 * 60_000;
	const syntheticRows = (await listConversations({ includeArchived: true })).filter(
		(conversation) =>
			conversation.archived &&
			conversation.conversationId.startsWith("direct:") &&
			conversation.otherProfileId != null &&
			conversation.blockState != null,
	);
	let repaired = 0;

	for (const synthetic of syntheticRows) {
		const syntheticMessages = await getMessages(synthetic.conversationId);
		if (syntheticMessages.some((message) => !message.type.startsWith("System"))) {
			continue;
		}

		const recovered = await recoverLatestOrphanedConversationForProfile(
			synthetic.otherProfileId!,
		);
		if (!recovered || recovered.conversationId === synthetic.conversationId) {
			continue;
		}
		const markerTimestamp = syntheticMessages.reduce(
			(latest, message) => Math.max(latest, message.timestamp),
			0,
		);
		const recoveredTimestamp = recovered.entry.data.lastActivityTimestamp ?? 0;
		if (
			markerTimestamp === 0 ||
			recoveredTimestamp === 0 ||
			Math.abs(markerTimestamp - recoveredTimestamp) > correlationWindowMs
		) {
			continue;
		}

		await upsertConversation(recovered.entry, synthetic.otherProfileId);
		await setConversationArchived(
			recovered.conversationId,
			true,
			synthetic.archivedReason ?? "ws_delete",
		);
		await setBlockState(recovered.conversationId, synthetic.blockState);

		const recoveredMessages = await getMessages(recovered.conversationId);
		for (const marker of syntheticMessages.filter((message) =>
			message.type.startsWith("System"),
		)) {
			if (!recoveredMessages.some((message) => message.type === marker.type)) {
				await insertSystemMessage(
					recovered.conversationId,
					marker.type as SystemMessageType,
					marker.timestamp,
				);
			}
		}

		await deleteConversationCascade(synthetic.conversationId);
		repaired += 1;
		appLog.info("[chat-db] repaired synthetic blocked conversation", {
			profileId: synthetic.otherProfileId,
			from: synthetic.conversationId,
			to: recovered.conversationId,
		});
	}

	return repaired;
}

/**
 * Ensures archived inbox rows preview their latest real message rather than
 * a synthetic block marker. The marker belongs in the thread timeline, but
 * using it as the conversation preview makes a chat with preserved content
 * render as "No messages yet" in the archived list.
 */
export async function repairArchivedConversationPreviews(): Promise<number> {
	const archivedRows = (await listConversations({ includeArchived: true })).filter(
		(conversation) => conversation.archived,
	);
	let repaired = 0;

	for (const conversation of archivedRows) {
		const currentPreviewType = conversation.entry.data.preview?.type ?? "";
		if (
			conversation.entry.data.preview &&
			!currentPreviewType.startsWith("System")
		) {
			continue;
		}

		const messages = await getMessages(conversation.conversationId);
		const lastContentMessage = [...messages]
			.reverse()
			.find((message) => !message.type.startsWith("System"));
		if (!lastContentMessage) {
			continue;
		}

		const body = lastContentMessage.body as Record<string, unknown> | null | undefined;
		await upsertConversation(
			{
				...conversation.entry,
				data: {
					...conversation.entry.data,
					lastActivityTimestamp: lastContentMessage.timestamp,
					preview: {
						conversationId: { value: conversation.conversationId },
						messageId: lastContentMessage.messageId,
						senderId: lastContentMessage.senderId,
						type: lastContentMessage.type,
						chat1Type: lastContentMessage.chat1Type,
						text: typeof body?.text === "string" ? body.text : null,
					},
				},
			},
			conversation.otherProfileId,
		);
		repaired += 1;
	}

	return repaired;
}

/**
 * Guards the one-time purge below. Stored per account (settings live in that
 * account's own db file), so each account is cleaned exactly once.
 */
const SYNTHETIC_PLACEHOLDER_PURGE_KEY = "synthetic-block-placeholder-purge-v1";

/**
 * One-time removal of `direct:<profileId>` archive shells that hold nothing.
 *
 * Interest-view auto-blocking used to route every block through
 * applySelfBlockAction, which minted one of these for any profile with no
 * conversation — producing archived "chats" reading "No messages yet" with a
 * single "You blocked this person" marker, for people the user never messaged.
 * The service layer no longer creates them (see
 * ApplySelfBlockActionOptions.materializeMissingConversation); this clears the
 * ones already on disk.
 *
 * Runs after repairSyntheticBlockedConversations, so any shell whose real
 * conversation could be recovered has already been migrated and is not a
 * candidate here. Every guard below has to hold — content-free, media-free,
 * album-free, and marked as blocked by us — so a legitimate local `direct:*`
 * draft or a preserved thread can never be caught by it.
 */
export async function purgeEmptySyntheticBlockedConversations(): Promise<number> {
	const alreadyPurged = await getSetting<boolean>(SYNTHETIC_PLACEHOLDER_PURGE_KEY).catch(
		() => null,
	);
	if (alreadyPurged) {
		return 0;
	}

	const candidates = (await listConversations({ includeArchived: true })).filter(
		(conversation) =>
			conversation.archived &&
			conversation.conversationId.startsWith("direct:") &&
			conversation.blockState === "blocked_by_me",
	);

	let purged = 0;
	for (const candidate of candidates) {
		const messages = await getMessages(candidate.conversationId);
		if (messages.some((message) => !message.type.startsWith("System"))) {
			continue;
		}
		const [media, albums] = await Promise.all([
			getMediaFilesForConversation(candidate.conversationId),
			getAlbumsForConversation(candidate.conversationId),
		]);
		if (media.length > 0 || albums.length > 0) {
			continue;
		}

		await deleteConversationCascade(candidate.conversationId);
		purged += 1;
		appLog.info("[chat-db] purged empty synthetic blocked conversation", {
			conversationId: candidate.conversationId,
			profileId: candidate.otherProfileId,
		});
	}

	await setSetting(SYNTHETIC_PLACEHOLDER_PURGE_KEY, true).catch((error) => {
		appLog.warn("[chat-db] failed to record synthetic placeholder purge", error);
	});
	return purged;
}

/**
 * Bulk lookup of the local block_state for a set of profiles — used to gate
 * profile navigation outside of chat (e.g. Interest/Taps) the same way
 * ChatThreadPanel/ChatInboxPanel gate it via a conversation's archived
 * state, without one DB round trip per row.
 */
export async function getBlockStatesByProfileIds(
	profileIds: string[],
): Promise<Map<string, BlockState>> {
	if (profileIds.length === 0) {
		return new Map();
	}
	const db = await getDb();
	const placeholders = profileIds.map((_, i) => `$${i + 1}`).join(", ");
	const rows = await db.select<{ other_profile_id: string; block_state: string }[]>(
		`SELECT other_profile_id, block_state FROM conversations WHERE other_profile_id IN (${placeholders}) AND block_state IS NOT NULL`,
		profileIds,
	);
	return new Map(rows.map((row) => [row.other_profile_id, row.block_state as BlockState]));
}

/**
 * Backfills other_profile_id for a conversation whose row already exists
 * but was created without it resolved (e.g. a chat.v1.conversation.delete
 * arriving for a conversation started moments earlier, before it's ever been
 * through a normal /v4/inbox sync — upsertConversation is what normally
 * keeps this current, but that requires the participant list from a live
 * inbox entry). Never overwrites a value that's already set.
 */
export async function backfillOtherProfileId(
	conversationId: string,
	otherProfileId: string,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "backfill-other-profile-id", async () => {
		await db.execute(
			"UPDATE conversations SET other_profile_id = $2, updated_at = $3 WHERE conversation_id = $1 AND other_profile_id IS NULL",
			[conversationId, otherProfileId, now],
		);
	});
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
			SET archived = $2, archived_reason = $3, archived_at = $4, updated_at = $5,
			    hidden = CASE WHEN $2 = 1 THEN 0 ELSE hidden END
			WHERE conversation_id = $1
			`,
			[conversationId, archived ? 1 : 0, archived ? reason : null, archived ? now : null, now],
		);
	});
}

export async function setConversationHidden(
	conversationId: string,
	hidden: boolean,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "set-conversation-hidden", async () => {
		await db.execute(
			"UPDATE conversations SET hidden = $2, updated_at = $3 WHERE conversation_id = $1",
			[conversationId, hidden ? 1 : 0, now],
		);
	});
}

/** All conversation ids currently flagged hidden — used to hydrate ChatPage's
 * in-memory set once on mount, since hidden conversations are otherwise
 * indistinguishable from any other row in a normal inbox fetch. */
export async function listHiddenConversationIds(): Promise<string[]> {
	const db = await getDb();
	const rows = await db.select<{ conversation_id: string }[]>(
		"SELECT conversation_id FROM conversations WHERE hidden = 1 AND archived = 0",
	);
	return rows.map((row) => row.conversation_id);
}

/**
 * Sets (or clears, with null) the explicit "who blocked whom" state for a
 * conversation — the source of truth conversationArchive.ts uses to decide
 * archiving/system messages, instead of inferring direction from toggling
 * `archived` on an ambiguous chat.v1.conversation.delete event.
 */
export async function setBlockState(
	conversationId: string,
	blockState: BlockState | null,
): Promise<void> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "set-block-state", async () => {
		await db.execute(
			"UPDATE conversations SET block_state = $2, updated_at = $3 WHERE conversation_id = $1",
			[conversationId, blockState, now],
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

export async function deleteConversationOnly(
	conversationId: string,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "delete-conversation-only", async () => {
		await db.execute("DELETE FROM conversation_meta WHERE conversation_id = $1", [
			conversationId,
		]);
		await db.execute("DELETE FROM conversations WHERE conversation_id = $1", [
			conversationId,
		]);
	});
}

export async function deleteAllArchivedConversations(): Promise<number> {
	const db = await getDb();
	let count = 0;

	await executeWithLockRetry(db, "delete-all-archived-conversations", async () => {
		const rows = await db.select<{ conversation_id: string }[]>(
			"SELECT conversation_id FROM conversations WHERE archived = 1",
		);
		count = rows.length;
		if (count === 0) return;

		await db.execute(
			"DELETE FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE archived = 1)",
		);
		await db.execute(
			"DELETE FROM media_files WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE archived = 1)",
		);
		await db.execute(
			"DELETE FROM album_media WHERE album_id IN (SELECT album_id FROM albums WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE archived = 1))",
		);
		await db.execute(
			"DELETE FROM albums WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE archived = 1)",
		);
		await db.execute(
			"DELETE FROM conversation_meta WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE archived = 1)",
		);
		await db.execute("DELETE FROM conversations WHERE archived = 1");
	});

	return count;
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
	const raw = rows[0]?.last_read_timestamp ?? null;
	if (raw == null || raw <= 0) return null;
	return raw < 100_000_000_000 ? raw * 1000 : raw;
}

export async function setLastReadTimestamp(
	conversationId: string,
	timestamp: number | null,
): Promise<void> {
	const db = await getDb();
	const normalizedMs =
		timestamp != null && timestamp > 0
			? (timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp)
			: null;

	await executeWithLockRetry(db, "set-last-read-timestamp", async () => {
		await db.execute(
			`
			INSERT INTO conversation_meta (conversation_id, last_read_timestamp)
			VALUES ($1, $2)
			ON CONFLICT(conversation_id) DO UPDATE SET last_read_timestamp = excluded.last_read_timestamp
			`,
			[conversationId, normalizedMs],
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

/**
 * Re-keys every locally stored message, cached media file, shared album, and
 * the read-timestamp record from one conversationId to another in place.
 *
 * Needed specifically for graduating a recovered conversation (see
 * recoverOrphanedConversation) when the server assigns a different id for
 * the re-established live conversation: upsertMessages' `ON CONFLICT
 * (message_id) DO UPDATE` does not touch conversation_id, so simply
 * re-appending the old messages under the new id is a no-op for every row
 * that already exists — they'd silently stay attached to the now-orphaned
 * old id. A direct UPDATE is the only way to actually move them.
 *
 * Deliberately NOT wrapped in a SQL transaction — this file's header already
 * documents why (the Tauri SQL plugin's connection pool has no session
 * affinity, so manual BEGIN/COMMIT can silently land on different
 * connections). Instead the `messages` move — the one table that determines
 * whether the caller's "migration failed, keep showing the old id" fallback
 * actually has anything to show — runs LAST. If any earlier statement here
 * throws, `messages` is guaranteed untouched, so a caller that reacts to the
 * failure by keeping the old conversationId around still finds the full
 * history under it. Only once this call returns cleanly has anything
 * genuinely moved.
 */
export async function reassignConversationId(
	oldConversationId: string,
	newConversationId: string,
): Promise<void> {
	if (oldConversationId === newConversationId) {
		return;
	}
	const db = await getDb();
	await executeWithLockRetry(db, "reassign-conversation-id", async () => {
		await db.execute(
			"UPDATE media_files SET conversation_id = $2 WHERE conversation_id = $1",
			[oldConversationId, newConversationId],
		);
		// albums.album_id is its own primary key (conversation_id is just a
		// plain column here, unlike conversation_meta below), so a direct
		// UPDATE can't collide the way the conversation_meta merge below has
		// to guard against.
		await db.execute(
			"UPDATE albums SET conversation_id = $2 WHERE conversation_id = $1",
			[oldConversationId, newConversationId],
		);
		// conversation_meta is keyed by conversation_id as its primary key, so
		// unlike the two UPDATEs above this can't just rewrite the key in place
		// if a row for newConversationId already exists — merge instead, keeping
		// the old (more complete) read timestamp only when it's newer.
		const oldMeta = await db.select<{ last_read_timestamp: number | null }[]>(
			"SELECT last_read_timestamp FROM conversation_meta WHERE conversation_id = $1",
			[oldConversationId],
		);
		const oldTimestamp = oldMeta[0]?.last_read_timestamp ?? null;
		if (oldTimestamp != null) {
			await db.execute(
				`
				INSERT INTO conversation_meta (conversation_id, last_read_timestamp)
				VALUES ($1, $2)
				ON CONFLICT(conversation_id) DO UPDATE SET
					last_read_timestamp = MAX(conversation_meta.last_read_timestamp, excluded.last_read_timestamp)
				`,
				[newConversationId, oldTimestamp],
			);
		}
		await db.execute("DELETE FROM conversation_meta WHERE conversation_id = $1", [
			oldConversationId,
		]);
		// Last on purpose — see the doc comment above.
		await db.execute(
			"UPDATE messages SET conversation_id = $2 WHERE conversation_id = $1",
			[oldConversationId, newConversationId],
		);
	});
}

export type SystemMessageType =
	| "SystemBlocked"
	| "SystemUnblocked"
	| "SystemBlockedBySelf"
	| "SystemUnblockedBySelf";

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
		messageId: `local-system:${type}:${conversationId}`,
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

	// Only the other side's own action gets a durable block_events row — our
	// own block/unblock is already visible from the confirmation dialog and
	// immediate UI change that triggered it (mirrors the toast in
	// ChatRealtimeBridge.tsx, which skips the "...BySelf" variants the same way).
	if (type === "SystemBlocked" || type === "SystemUnblocked") {
		await recordBlockEvent(
			conversationId,
			type === "SystemBlocked" ? "blocked" : "unblocked",
			timestamp,
		);
	}

	return message;
}

/**
 * Snapshots the other participant's name/avatar into a standalone row at the
 * moment they block/unblock us — deliberately not derived from the
 * SystemBlocked/SystemUnblocked messages on read, since a profile that
 * blocked us can later become fully unresolvable (deleted/banned, or its
 * conversation ages out of the live inbox), which would otherwise leave the
 * history page unable to show who it even was.
 */
async function recordBlockEvent(
	conversationId: string,
	eventType: BlockEventType,
	timestamp: number,
): Promise<void> {
	const conversation = await getConversation(conversationId);
	const otherProfileId = conversation?.otherProfileId ?? null;
	const otherParticipant =
		conversation?.entry.data.participants.find(
			(p) => String(p.profileId) === otherProfileId,
		) ?? conversation?.entry.data.participants[0] ?? null;
	const displayName = conversation?.entry.data.name?.trim() || null;
	const avatarMediaHash = otherParticipant?.primaryMediaHash ?? null;

	const id = `${conversationId}:${eventType}:${timestamp}`;
	const db = await getDb();
	const now = Date.now();
	await executeWithLockRetry(db, "insert-block-event", async () => {
		await db.execute(
			`
			INSERT INTO block_events (
				id, profile_id, conversation_id, event_type, timestamp,
				display_name, avatar_media_hash, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT(id) DO UPDATE SET
				profile_id = excluded.profile_id,
				display_name = excluded.display_name,
				avatar_media_hash = excluded.avatar_media_hash
			`,
			[id, otherProfileId, conversationId, eventType, timestamp, displayName, avatarMediaHash, now],
		);
	});
}

function rowToStoredBlockEvent(row: BlockEventRow): StoredBlockEvent {
	return {
		id: row.id,
		profileId: row.profile_id,
		conversationId: row.conversation_id,
		eventType: row.event_type as BlockEventType,
		timestamp: row.timestamp,
		displayName: row.display_name,
		avatarMediaHash: row.avatar_media_hash,
		createdAt: row.created_at,
	};
}

/**
 * All local block/unblock-by-other history, most recent first — backs the
 * Settings block-history page.
 */
export async function listBlockEvents(): Promise<StoredBlockEvent[]> {
	const db = await getDb();
	const rows = await db.select<BlockEventRow[]>(
		"SELECT * FROM block_events ORDER BY timestamp DESC",
	);
	return rows.map(rowToStoredBlockEvent);
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

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Full-database message text search — unlike the in-memory index in
 * pages/app/chat/cache.ts (which only ever sees messages from conversations
 * opened during this session), this scans every conversation's persisted
 * history via chatDb.
 *
 * `body_json` has no dedicated text column, so matching is a raw LIKE over
 * the JSON blob (cheap, no FTS table to maintain) — that can false-positive
 * on a hit inside a non-text field (e.g. a media URL), so rows are
 * re-checked against the same rendered text (getMessageText) used for
 * display before being returned. Over-fetches by 3x to absorb rows dropped
 * by that re-check while still hitting the requested limit when possible.
 */
export async function searchMessages(
	query: string,
	options?: { conversationId?: string; limit?: number },
): Promise<IndexedMessage[]> {
	const needle = query.trim();
	if (!needle) {
		return [];
	}

	const db = await getDb();
	const limit = options?.limit ?? 40;
	const pattern = `%${escapeLikePattern(needle)}%`;

	const rows = options?.conversationId
		? await db.select<MessageRow[]>(
				`
				SELECT * FROM messages
				WHERE conversation_id = $1 AND unsent = 0 AND body_json LIKE $2 ESCAPE '\\'
				ORDER BY timestamp DESC LIMIT $3
				`,
				[options.conversationId, pattern, limit * 3],
			)
		: await db.select<MessageRow[]>(
				`
				SELECT * FROM messages
				WHERE unsent = 0 AND body_json LIKE $1 ESCAPE '\\'
				ORDER BY timestamp DESC LIMIT $2
				`,
				[pattern, limit * 3],
			);

	const needleLower = needle.toLowerCase();
	const results: IndexedMessage[] = [];
	for (const row of rows) {
		const message = rowToStoredMessage(row);
		const text = getMessageText(message);
		const searchText = text.toLowerCase();
		if (!text || !searchText.includes(needleLower)) {
			continue;
		}
		results.push({
			messageId: message.messageId,
			conversationId: message.conversationId,
			senderId: message.senderId,
			timestamp: message.timestamp,
			text,
			searchText,
		});
		if (results.length >= limit) {
			break;
		}
	}

	return results;
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
	// A single message can own more than one row — replying to a picture with
	// a picture stores both the reply-quote thumbnail and the message's own
	// media under the same message_id. Prefer a usable row over a failed one,
	// and the full-size copy over the thumbnail.
	const rows = await db.select<MediaFileRow[]>(
		`SELECT * FROM media_files
		 WHERE message_id = $1
		 ORDER BY (fetch_status = 'ok') DESC, size_bytes DESC, fetched_at DESC
		 LIMIT 1`,
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

/**
 * Deletes a single album and its cached media — used when the user removes
 * a received album from the shared-albums page, whether or not the share
 * itself is still live server-side.
 */
export async function deleteAlbum(albumId: string): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "delete-album", async () => {
		await db.execute("DELETE FROM album_media WHERE album_id = $1", [albumId]);
		await db.execute("DELETE FROM albums WHERE album_id = $1", [albumId]);
	});
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

// ---------------------------------------------------------------------------
// Downloaded media manifest (device-local bookkeeping for saved files —
// never part of the portable chat-data export/import below, since asset
// ids/content URIs/paths are meaningless on a different install/device)
// ---------------------------------------------------------------------------

function rowToDownloadedMediaEntry(row: DownloadedMediaRow): DownloadedMediaEntry {
	return {
		identifier: row.identifier,
		platform: row.platform as DownloadedMediaEntry["platform"],
		albumId: row.album_id,
		byteSize: row.byte_size,
		mimeType: row.mime_type,
		kind: row.kind as DownloadedMediaEntry["kind"],
		savedAt: row.saved_at,
	};
}

export async function insertDownloadedMediaEntry(
	entry: DownloadedMediaEntry,
): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "insert-downloaded-media", async () => {
		await db.execute(
			`
			INSERT INTO downloaded_media (
				identifier, platform, album_id, byte_size, mime_type, kind, saved_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT(identifier) DO UPDATE SET
				platform = excluded.platform,
				album_id = excluded.album_id,
				byte_size = excluded.byte_size,
				mime_type = excluded.mime_type,
				kind = excluded.kind,
				saved_at = excluded.saved_at
			`,
			[
				entry.identifier,
				entry.platform,
				entry.albumId,
				entry.byteSize,
				entry.mimeType,
				entry.kind,
				entry.savedAt,
			],
		);
	});
}

export async function getDownloadedMediaEntries(): Promise<DownloadedMediaEntry[]> {
	const db = await getDb();
	const rows = await db.select<DownloadedMediaRow[]>(
		"SELECT * FROM downloaded_media ORDER BY saved_at DESC",
	);
	return rows.map(rowToDownloadedMediaEntry);
}

export async function getDownloadedMediaUsage(): Promise<{ count: number; totalBytes: number }> {
	const db = await getDb();
	const rows = await db.select<{ count: number; total_bytes: number | null }[]>(
		"SELECT COUNT(*) as count, SUM(byte_size) as total_bytes FROM downloaded_media",
	);
	return {
		count: rows[0]?.count ?? 0,
		totalBytes: rows[0]?.total_bytes ?? 0,
	};
}

export async function deleteDownloadedMediaEntries(identifiers: string[]): Promise<void> {
	if (identifiers.length === 0) {
		return;
	}
	const db = await getDb();

	await executeWithLockRetry(db, "delete-downloaded-media", async () => {
		const placeholders = identifiers.map((_, i) => `$${i + 1}`).join(", ");
		await db.execute(
			`DELETE FROM downloaded_media WHERE identifier IN (${placeholders})`,
			identifiers,
		);
	});
}

// ---------------------------------------------------------------------------
// Full database export/import — every table in this profile's db that's
// portable to another install: chat history and media, albums, avatars,
// saved phrases/locations, and the generic settings key/value store
// (automation rules, privacy toggles, browse filters, location, etc).
// Excludes downloaded_media, which is local device bookkeeping (references
// files on this device's filesystem) with no meaning on another install.
// ---------------------------------------------------------------------------

const FULL_EXPORT_TABLES: {
	name: keyof FullDbExport["tables"];
	primaryKey: string;
	columns: string[];
}[] = [
	{
		name: "conversations",
		primaryKey: "conversation_id",
		columns: [
			"conversation_id", "other_profile_id", "name", "participants_json",
			"last_activity_timestamp", "unread_count", "pinned", "muted", "favorite",
			"preview_json", "archived", "archived_reason", "archived_at", "hidden",
			// block_state and messages_synced_activity_timestamp were added by
			// later ALTER TABLE migrations and had been left out here, so an
			// import lost the recorded block direction (leaving it to be
			// re-inferred, wrongly) and forced a full message re-sync.
			"block_state", "messages_synced_activity_timestamp",
			"last_seen_in_inbox_at", "created_at", "updated_at",
		],
	},
	{
		name: "conversation_meta",
		primaryKey: "conversation_id",
		columns: ["conversation_id", "last_read_timestamp"],
	},
	{
		name: "messages",
		primaryKey: "message_id",
		columns: [
			"message_id", "conversation_id", "sender_id", "timestamp", "type",
			"chat1_type", "body_json", "unsent", "local_history",
			"reply_to_message_id", "reply_preview_json", "reactions_json",
			"created_at", "updated_at",
		],
	},
	{
		name: "media_files",
		primaryKey: "media_key",
		columns: [
			"media_key", "conversation_id", "message_id", "kind", "mime_type",
			"data_base64", "view_once", "size_bytes", "fetch_status", "fetched_at",
		],
	},
	{
		name: "albums",
		primaryKey: "album_id",
		columns: [
			"album_id", "owner_profile_id", "album_name", "conversation_id",
			"shared_via_message_id", "preview_cover_base64", "preview_cover_mime_type",
			"created_at", "updated_at",
		],
	},
	{
		name: "album_media",
		primaryKey: "content_id",
		columns: [
			"content_id", "album_id", "content_type", "data_base64",
			"thumb_data_base64", "remaining_views", "is_viewable", "fetched_at",
		],
	},
	{
		name: "avatars",
		primaryKey: "media_hash",
		columns: ["media_hash", "data_base64", "mime_type", "fetched_at"],
	},
	{
		name: "settings",
		primaryKey: "key",
		columns: ["key", "value"],
	},
	{
		name: "saved_phrases",
		primaryKey: "phrase",
		columns: ["phrase", "created_at"],
	},
	{
		name: "saved_locations",
		primaryKey: "id",
		columns: ["id", "name", "geohash", "lat", "lon", "created_at"],
	},
	{
		// Absent from v1 exports, so Block History came up empty on a restored
		// device. v1 files simply won't carry the key and the importer skips
		// any table it doesn't find, so adding it here is backwards compatible.
		name: "block_events",
		primaryKey: "id",
		columns: [
			"id", "profile_id", "conversation_id", "event_type", "timestamp",
			"display_name", "avatar_media_hash", "created_at",
		],
	},
];

export type PortableTable = (typeof FULL_EXPORT_TABLES)[number];

/**
 * Table descriptors keyed by name. Every generic read/write below resolves
 * its table through this map rather than accepting a caller-supplied name,
 * which is what keeps arbitrary strings out of the interpolated SQL.
 */
const PORTABLE_TABLES_BY_NAME = new Map<string, PortableTable>(
	FULL_EXPORT_TABLES.map((table) => [table.name as string, table]),
);

export function getPortableTable(name: string): PortableTable | null {
	return PORTABLE_TABLES_BY_NAME.get(name) ?? null;
}

function requirePortableTable(name: string): PortableTable {
	const table = getPortableTable(name);
	if (!table) {
		throw new Error(`Unknown portable table: ${name}`);
	}
	return table;
}

export async function countTableRows(name: string): Promise<number> {
	const table = requirePortableTable(name);
	const db = await getDb();
	const rows = await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM ${table.name}`);
	return rows[0]?.count ?? 0;
}

/** Total bytes held by the given TEXT columns — used for the export size preview. */
export async function sumColumnLengths(name: string, columns: string[]): Promise<number> {
	const table = requirePortableTable(name);
	const known = columns.filter((column) => table.columns.includes(column));
	if (known.length === 0) {
		return 0;
	}
	const db = await getDb();
	const expression = known.map((column) => `COALESCE(SUM(LENGTH(${column})), 0)`).join(" + ");
	const rows = await db.select<{ total: number | null }[]>(
		`SELECT ${expression} as total FROM ${table.name}`,
	);
	return rows[0]?.total ?? 0;
}

/**
 * One page of a table, ordered by primary key so paging stays stable across
 * calls. Paging is what keeps a multi-hundred-megabyte media table out of
 * memory during an export — the previous exporter selected every row of
 * every table at once and then stringified the lot.
 */
export async function selectTablePage(
	name: string,
	offset: number,
	limit: number,
	options?: { omitColumns?: string[]; sinceColumn?: string; since?: number },
): Promise<Record<string, unknown>[]> {
	const table = requirePortableTable(name);
	const omit = new Set(options?.omitColumns ?? []);
	const columns = table.columns.filter((column) => !omit.has(column));

	// The watermark column is checked against this table's own schema, so an
	// incremental export can't smuggle an arbitrary identifier into the SQL.
	const sinceColumn =
		options?.sinceColumn && table.columns.includes(options.sinceColumn)
			? options.sinceColumn
			: null;
	const since = options?.since;
	const where = sinceColumn && since ? `WHERE ${sinceColumn} > $1` : "";
	const params = where ? [since] : [];

	const db = await getDb();
	return db.select<Record<string, unknown>[]>(
		`SELECT ${columns.join(", ")} FROM ${table.name} ${where}
		 ORDER BY ${table.primaryKey} LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}`,
		params,
	);
}

/** Rows a delta export would carry — drives the "N changes" count in the UI. */
export async function countTableRowsSince(
	name: string,
	sinceColumn: string,
	since: number,
): Promise<number> {
	const table = requirePortableTable(name);
	if (!table.columns.includes(sinceColumn)) {
		return countTableRows(name);
	}
	const db = await getDb();
	const rows = await db.select<{ count: number }[]>(
		`SELECT COUNT(*) as count FROM ${table.name} WHERE ${sinceColumn} > $1`,
		[since],
	);
	return rows[0]?.count ?? 0;
}

/**
 * Upserts a batch of rows into a portable table. Mirrors the semantics of
 * importFullDatabase — existing rows lose to the imported version, nothing
 * absent from the import is touched — but takes rows a page at a time so a
 * streaming import never has to hold the whole file.
 *
 * Columns absent from a row are written as NULL only when the row genuinely
 * omits them; a section that deliberately skips a heavy column (album cover
 * art, say) passes it in `skipColumns` so the existing value survives.
 */
export async function upsertTableRows(
	name: string,
	rows: Record<string, unknown>[],
	options?: { skipColumns?: string[]; newerThanColumn?: string; maxColumns?: string[] },
): Promise<number> {
	const table = requirePortableTable(name);
	if (rows.length === 0) {
		return 0;
	}

	const skip = new Set(options?.skipColumns ?? []);
	const columns = table.columns.filter((column) => !skip.has(column));
	const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

	// Columns that only ever move forward (a read cursor), merged by taking the
	// larger side rather than whichever file happened to be imported last.
	const maxColumns = new Set(
		(options?.maxColumns ?? []).filter((column) => columns.includes(column)),
	);

	const updates = columns
		.filter((column) => column !== table.primaryKey)
		.map((column) =>
			maxColumns.has(column)
				? `${column} = MAX(COALESCE(excluded.${column}, 0), COALESCE(${table.name}.${column}, 0))`
				: `${column} = excluded.${column}`,
		)
		.join(", ");

	/**
	 * Last-writer-wins guard. Without it an import is a blind overwrite, so
	 * restoring a backup taken on a device that had been sitting closed would
	 * drag live rows backwards — unread counts, last-activity times and
	 * conversation previews all regressing to whatever the stale side held.
	 * Rows the target doesn't have still insert normally; only genuine
	 * conflicts consult the timestamp.
	 */
	const guard =
		options?.newerThanColumn && columns.includes(options.newerThanColumn)
			? ` WHERE COALESCE(excluded.${options.newerThanColumn}, 0) >= COALESCE(${table.name}.${options.newerThanColumn}, 0)`
			: "";

	const sql = `
		INSERT INTO ${table.name} (${columns.join(", ")})
		VALUES (${placeholders})
		ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updates}${guard}
	`;

	let written = 0;
	const db = await getDb();
	await executeWithLockRetry(db, `import-${table.name}`, async () => {
		for (const row of rows) {
			if (!row || typeof row !== "object" || row[table.primaryKey] == null) {
				continue;
			}
			await db.execute(sql, columns.map((column) => row[column] ?? null));
			written += 1;
		}
	});
	return written;
}

/** Empties the named portable tables — the "replace everything" import path. */
export async function clearPortableTables(names: string[]): Promise<void> {
	const tables = names.map(requirePortableTable);
	if (tables.length === 0) {
		return;
	}
	const db = await getDb();
	await executeWithLockRetry(db, "clear-portable-tables", async () => {
		for (const table of tables) {
			await db.execute(`DELETE FROM ${table.name}`);
		}
	});
}

/**
 * The chat database's real on-disk size. Read via pragma rather than a
 * filesystem stat because $APPDATA has no read scope in our fs capability.
 */
export async function getDatabaseSizeBytes(): Promise<number> {
	const db = await getDb();
	const rows = await db.select<{ size: number | null }[]>(
		"SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()",
	);
	return rows[0]?.size ?? 0;
}

/**
 * Dumps every portable table in this profile's db as raw rows, plus the
 * exporting user's id so a later import can refuse to load another
 * account's data.
 */
export async function exportFullDatabase(ownerUserId: number): Promise<FullDbExport> {
	const db = await getDb();
	const tables = {} as FullDbExport["tables"];

	for (const table of FULL_EXPORT_TABLES) {
		const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${table.name}`);
		tables[table.name] = rows;
	}

	return {
		version: 1,
		exportedAt: Date.now(),
		ownerUserId,
		tables,
	};
}

export type ImportFullDatabaseResult =
	| { ok: true; rowsImported: number }
	| { ok: false; error: "wrong_owner" | "invalid_format" };

/**
 * Merge-imports a previously exported database: every row is upserted
 * (existing local rows are overwritten by the imported version on conflict,
 * nothing not present in the import is touched or removed). Only column
 * names from our own known schema are ever interpolated into SQL — unknown
 * keys on an imported row are ignored rather than trusted, since the import
 * file is arbitrary user-supplied JSON.
 */
export async function importFullDatabase(
	data: FullDbExport,
	currentUserId: number,
): Promise<ImportFullDatabaseResult> {
	if (!data || data.version !== 1 || typeof data.ownerUserId !== "number" || !data.tables) {
		return { ok: false, error: "invalid_format" };
	}
	if (data.ownerUserId !== currentUserId) {
		return { ok: false, error: "wrong_owner" };
	}

	const db = await getDb();
	let rowsImported = 0;

	await executeWithLockRetry(db, "import-full-database", async () => {
		for (const table of FULL_EXPORT_TABLES) {
			const rows = data.tables[table.name];
			if (!Array.isArray(rows)) {
				continue;
			}

			const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(", ");
			const updates = table.columns
				.filter((c) => c !== table.primaryKey)
				.map((c) => `${c} = excluded.${c}`)
				.join(", ");
			const sql = `
				INSERT INTO ${table.name} (${table.columns.join(", ")})
				VALUES (${placeholders})
				ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updates}
			`;

			for (const row of rows) {
				if (!row || typeof row !== "object" || (row as Record<string, unknown>)[table.primaryKey] == null) {
					continue;
				}
				const values = table.columns.map((c) => (row as Record<string, unknown>)[c] ?? null);
				await db.execute(sql, values);
				rowsImported += 1;
			}
		}
	});

	return { ok: true, rowsImported };
}

// ---------------------------------------------------------------------------
// Settings (generic per-profile key/value store — JSON-encoded values)
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string): Promise<T | null> {
	const db = await getDb();
	const rows = await db.select<{ value: string }[]>(
		"SELECT value FROM settings WHERE key = $1",
		[key],
	);
	if (!rows[0]) {
		return null;
	}
	try {
		return JSON.parse(rows[0].value) as T;
	} catch (error) {
		appLog.error("[chat-db] failed to parse setting", { key, error });
		return null;
	}
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	const db = await getDb();

	await executeWithLockRetry(db, "set-setting", async () => {
		await db.execute(
			`
			INSERT INTO settings (key, value) VALUES ($1, $2)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value
			`,
			[key, JSON.stringify(value)],
		);
	});
}

// ---------------------------------------------------------------------------
// Saved phrases
// ---------------------------------------------------------------------------

export async function getAllSavedPhrases(): Promise<string[]> {
	const db = await getDb();
	const rows = await db.select<{ phrase: string }[]>(
		"SELECT phrase FROM saved_phrases ORDER BY created_at ASC",
	);
	return rows.map((row) => row.phrase);
}

/** Replace-all: mirrors the old localStorage-backed saveSavedPhrases semantics. */
export async function setSavedPhrases(phrases: string[]): Promise<string[]> {
	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "set-saved-phrases", async () => {
		await db.execute("DELETE FROM saved_phrases");
		for (const phrase of phrases) {
			await db.execute(
				"INSERT INTO saved_phrases (phrase, created_at) VALUES ($1, $2) ON CONFLICT(phrase) DO NOTHING",
				[phrase, now],
			);
		}
	});

	return getAllSavedPhrases();
}

// ---------------------------------------------------------------------------
// Generic per-profile settings consumed only inside a single component
// (no synchronous hot-path access needed) just reuse getSetting/setSetting
// directly with a dedicated key — see PreferencesContext's sibling, the
// chat-page "hide pinned" toggle, browse filters, recent gifs, and seen
// timestamps below.
// ---------------------------------------------------------------------------

export async function getRecentGifs<T>(): Promise<T[]> {
	const stored = await getSetting<T[]>("recentGifs");
	return Array.isArray(stored) ? stored : [];
}

export async function setRecentGifs<T>(gifs: T[]): Promise<T[]> {
	await setSetting("recentGifs", gifs);
	return gifs;
}

// ---------------------------------------------------------------------------
// Saved locations
// ---------------------------------------------------------------------------

export interface StoredSavedLocation {
	id: string;
	name: string;
	geohash: string;
	lat: number;
	lon: number;
}

type SavedLocationRow = StoredSavedLocation & { created_at: number };

export async function getAllSavedLocations(): Promise<StoredSavedLocation[]> {
	const db = await getDb();
	const rows = await db.select<SavedLocationRow[]>(
		"SELECT id, name, geohash, lat, lon FROM saved_locations ORDER BY created_at ASC",
	);
	return rows.map(({ id, name, geohash, lat, lon }) => ({ id, name, geohash, lat, lon }));
}

export async function insertSavedLocation(
	input: StoredSavedLocation,
): Promise<StoredSavedLocation[]> {
	const db = await getDb();

	await executeWithLockRetry(db, "insert-saved-location", async () => {
		await db.execute(
			`
			INSERT INTO saved_locations (id, name, geohash, lat, lon, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			`,
			[input.id, input.name, input.geohash, input.lat, input.lon, Date.now()],
		);
	});

	return getAllSavedLocations();
}

export async function deleteSavedLocationRow(id: string): Promise<StoredSavedLocation[]> {
	const db = await getDb();

	await executeWithLockRetry(db, "delete-saved-location", async () => {
		await db.execute("DELETE FROM saved_locations WHERE id = $1", [id]);
	});

	return getAllSavedLocations();
}

// ---------------------------------------------------------------------------
// One-time migration of legacy global localStorage settings into the
// profile that's active the moment this code first ships — every other
// profile is meant to start with defaults, so this must run exactly once
// across the whole app's lifetime (not once per profile db), guarded by a
// flag outside any per-profile file.
// ---------------------------------------------------------------------------

const LEGACY_SETTINGS_MIGRATED_FLAG = "fg-settings-migrated-to-db";

function readLegacyJson<T>(key: string): T | null {
	const raw = window.localStorage.getItem(key);
	if (!raw) {
		return null;
	}
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export async function migrateLegacySettingsIfNeeded(userId: number): Promise<void> {
	if (window.localStorage.getItem(LEGACY_SETTINGS_MIGRATED_FLAG) === "true") {
		return;
	}

	try {
		// Theme/UI preferences (app_preferences) intentionally stay in
		// localStorage — they apply to the whole app, not per profile. The
		// location fields inside that same blob are the exception: they move
		// into this profile's settings so whichever account is active right
		// now (typically the one the user had open before this migration)
		// keeps its current location instead of losing it.
		const legacyAppPreferences = readLegacyJson<{
			geohash?: string | null;
			locationName?: string | null;
			useAutoLocation?: boolean;
		}>("app_preferences");
		if (legacyAppPreferences && (legacyAppPreferences.geohash != null || legacyAppPreferences.useAutoLocation)) {
			await setSetting("locationPreferences", {
				geohash: legacyAppPreferences.geohash ?? null,
				locationName: legacyAppPreferences.locationName ?? null,
				useAutoLocation: legacyAppPreferences.useAutoLocation === true,
			});
		}

		const legacyPhrases = readLegacyJson<unknown>("fg-saved-phrases");
		if (Array.isArray(legacyPhrases)) {
			const phrases = legacyPhrases.filter((p): p is string => typeof p === "string");
			if (phrases.length > 0) {
				await setSavedPhrases(phrases);
			}
		}

		const legacyLocations = readLegacyJson<unknown>("fg-saved-locations");
		if (Array.isArray(legacyLocations)) {
			for (const entry of legacyLocations) {
				if (
					entry &&
					typeof entry === "object" &&
					typeof (entry as Record<string, unknown>).id === "string" &&
					typeof (entry as Record<string, unknown>).name === "string" &&
					typeof (entry as Record<string, unknown>).geohash === "string" &&
					typeof (entry as Record<string, unknown>).lat === "number" &&
					typeof (entry as Record<string, unknown>).lon === "number"
				) {
					await insertSavedLocation(entry as StoredSavedLocation);
				}
			}
		}

		const legacyAutomation = {
			blockOnChat: window.localStorage.getItem("fg-block-chat") === "true",
			blockGrid: window.localStorage.getItem("fg-block-grid") === "true",
			forbiddenWords: window.localStorage.getItem("fg-forbidden-words") ?? "",
			minAge: window.localStorage.getItem("fg-block-min-age") ?? "18",
			maxAge: window.localStorage.getItem("fg-block-max-age") ?? "99",
			refreshEnabled: window.localStorage.getItem("fg-auto-refresh-enabled") === "true",
			refreshInterval: window.localStorage.getItem("fg-auto-refresh-interval") ?? "5",
		};
		const hadLegacyAutomation = [
			"fg-block-chat",
			"fg-block-grid",
			"fg-forbidden-words",
			"fg-block-min-age",
			"fg-block-max-age",
			"fg-auto-refresh-enabled",
			"fg-auto-refresh-interval",
		].some((key) => window.localStorage.getItem(key) != null);
		if (hadLegacyAutomation) {
			await setSetting("automation", legacyAutomation);
		}

		const legacyRecentGifs = readLegacyJson<unknown>("fg-recent-gifs");
		if (Array.isArray(legacyRecentGifs) && legacyRecentGifs.length > 0) {
			await setSetting("recentGifs", legacyRecentGifs);
		}

		const legacyHidePinned = window.localStorage.getItem("chat_hide_pinned");
		if (legacyHidePinned != null) {
			await setSetting("chatHidePinned", legacyHidePinned === "true");
		}

		const legacyAutoDownload = window.localStorage.getItem("fg-auto-download-media");
		if (legacyAutoDownload != null) {
			await setSetting("autoDownloadMedia", legacyAutoDownload === "true");
		}

		const legacyPrivacyKeys = [
			"fg-hide-read-receipts",
			"fg-show-read-receipt-toggle",
			"fg-read-receipts-exceptions",
			"fg-record-profile-views",
		];
		const hadLegacyPrivacy = legacyPrivacyKeys.some((key) => window.localStorage.getItem(key) != null);
		if (hadLegacyPrivacy) {
			await setSetting("privacy", {
				hideReadReceiptsGlobal: window.localStorage.getItem("fg-hide-read-receipts") === "true",
				showReadReceiptToggle: window.localStorage.getItem("fg-show-read-receipt-toggle") !== "false",
				recordProfileViews: window.localStorage.getItem("fg-record-profile-views") !== "false",
				readReceiptsExceptions: readLegacyJson<Record<string, boolean>>("fg-read-receipts-exceptions") ?? {},
			});
		}

		const legacyBrowseFilters = readLegacyJson<Record<string, unknown>>("open-grind:browse-filters");
		if (legacyBrowseFilters) {
			await setSetting("browseFilters", legacyBrowseFilters);
		}

		const legacySeenKeys: Record<string, string> = {
			interest: "fg-interest-last-seen",
			interestViews: "fg-interest-views-last-seen",
			interestTaps: "fg-interest-taps-last-seen",
			inbox: "fg-inbox-last-seen",
			rightNow: "fg-rightnow-last-seen",
		};
		const hadLegacySeen = Object.values(legacySeenKeys).some((key) => window.localStorage.getItem(key) != null);
		if (hadLegacySeen) {
			const seenTimestamps: Record<string, number> = {};
			for (const [field, key] of Object.entries(legacySeenKeys)) {
				const raw = window.localStorage.getItem(key);
				const value = raw ? Number(raw) : 0;
				seenTimestamps[field] = Number.isFinite(value) ? value : 0;
			}
			await setSetting("seenTimestamps", seenTimestamps);
		}

		appLog.info("[chat-db] migrated legacy localStorage settings into profile db", { userId });
	} catch (error) {
		appLog.error("[chat-db] legacy settings migration failed", error);
	} finally {
		window.localStorage.setItem(LEGACY_SETTINGS_MIGRATED_FLAG, "true");
	}
}
