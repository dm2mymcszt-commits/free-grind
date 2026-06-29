import type { ConversationEntry, Message } from "./messages";

export type ArchivedReason = "not_found" | "ws_delete";

export type StoredConversation = {
	conversationId: string;
	otherProfileId: string | null;
	entry: ConversationEntry;
	archived: boolean;
	archivedReason: ArchivedReason | null;
	archivedAt: number | null;
	lastSeenInInboxAt: number | null;
	createdAt: number;
	updatedAt: number;
};

export type StoredMessage = Message & {
	localHistory: boolean;
};

export type MediaKind = "image" | "video" | "audio";
export type MediaFetchStatus = "pending" | "ok" | "failed";

export type MediaFileUpsertInput = {
	mediaKey: string;
	conversationId: string | null;
	messageId: string | null;
	kind: MediaKind;
	mimeType: string | null;
	dataBase64: string;
	viewOnce: boolean;
	sizeBytes: number | null;
	fetchStatus: MediaFetchStatus;
};

export type StoredMediaFile = {
	mediaKey: string;
	conversationId: string | null;
	messageId: string | null;
	kind: MediaKind;
	mimeType: string | null;
	dataBase64: string;
	viewOnce: boolean;
	sizeBytes: number | null;
	fetchStatus: MediaFetchStatus;
	fetchedAt: number;
};

export type AlbumUpsertInput = {
	albumId: string;
	ownerProfileId: string | null;
	albumName: string | null;
	conversationId: string | null;
	sharedViaMessageId: string | null;
};

export type StoredAlbum = {
	albumId: string;
	ownerProfileId: string | null;
	albumName: string | null;
	conversationId: string | null;
	sharedViaMessageId: string | null;
	previewCoverBase64: string | null;
	previewCoverMimeType: string | null;
	createdAt: number;
	updatedAt: number;
};

export type AlbumMediaUpsertInput = {
	contentId: string;
	albumId: string;
	contentType: string | null;
	dataBase64: string | null;
	thumbDataBase64: string | null;
	remainingViews: number | null;
	isViewable: boolean | null;
};

export type StoredAlbumMedia = {
	contentId: string;
	albumId: string;
	contentType: string | null;
	dataBase64: string | null;
	thumbDataBase64: string | null;
	remainingViews: number | null;
	isViewable: boolean | null;
	fetchedAt: number | null;
};

export type StoredAvatar = {
	mediaHash: string;
	dataBase64: string;
	mimeType: string | null;
	fetchedAt: number;
};
