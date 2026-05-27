import { createChatService } from "./chatService";
import type { RestFetcher } from "../types/chat-service";
import {
	ApiFunctionError,
	submitIssueReport,
	trackUpdateCheck,
	registerPresence,
} from "./apiHelpers";
import { createAlbumMethods } from "./api/albumMethods";
import { createProfileMethods } from "./api/profileMethods";
import { createInterestMethods } from "./api/interestMethods";
import { createAgeVerificationMethods } from "./api/ageVerificationMethods";
import { createFeedMethods } from "./api/feedMethods";
import { createPresenceMethods } from "./api/presenceMethods";
import { createFavoritesMethods } from "./api/favoritesMethods";
import type { RightNowFeedItem, RightNowCreatePostRequest, RightNowCreatePostMedia, RightNowUpdatePostRequest } from "../types/right-now";

export {
	ApiFunctionError,
	submitIssueReport,
	trackUpdateCheck,
	registerPresence,
};

export type { RightNowFeedItem, RightNowCreatePostRequest, RightNowCreatePostMedia, RightNowUpdatePostRequest };

export function createApiFunctions(
	fetchRest: RestFetcher, 
	sendWebsocket: (payload: unknown) => Promise<void>, // <-- WE ADDED THIS
	t: (key: string) => string
) {
	// Pass sendWebsocket into the chat service
	const chatService = createChatService(fetchRest, sendWebsocket, t);

	return {
		...chatService,
		...createInterestMethods(fetchRest, t),
		...createAlbumMethods(fetchRest, t),
		...createProfileMethods(fetchRest, t),
		...createAgeVerificationMethods(fetchRest, t),
		...createFeedMethods(fetchRest, t),
		...createPresenceMethods(),
		...createFavoritesMethods(fetchRest, t),

		async request(
			path: string,
			options?: {
				method?: string;
				body?: unknown;
				rawBody?: Uint8Array;
				contentType?: string;
				abortController?: AbortController;
			},
		) {
			return fetchRest(path, options);
		},
	};
}