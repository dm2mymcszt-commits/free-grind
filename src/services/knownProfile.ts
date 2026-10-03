/**
 * What this device still remembers about someone whose profile Grindr will
 * not show: their chat, and their row in the saved viewers. Read-only, and
 * every source is optional — a miss just means that source knew nothing.
 */

import type { BlockState } from "../types/chat-db";
import type { KnownProfile } from "../utils/unavailableProfile";
import { findConversationByProfileId } from "./chatDb";
import { interestViewsStore } from "./interestViewsStore";

export type LocalProfileKnowledge = {
	conversationId: string | null;
	blockState: BlockState | null;
	/** Most trusted first — see pickKnownProfile. */
	candidates: KnownProfile[];
};

export async function lookUpLocalProfile(profileId: string): Promise<LocalProfileKnowledge> {
	const [stored, view] = await Promise.all([
		findConversationByProfileId(profileId).catch(() => null),
		interestViewsStore.getByProfileId(profileId).catch(() => null),
	]);

	const candidates: KnownProfile[] = [];
	if (stored) {
		const participant = stored.entry.data.participants.find(
			(entry) => String(entry.profileId) === profileId,
		);
		candidates.push({
			name: stored.entry.data.name,
			imageHash: participant?.primaryMediaHash ?? null,
		});
	}
	if (view) {
		candidates.push({ name: view.displayName, imageHash: view.imageHash });
	}

	return {
		conversationId: stored?.conversationId ?? null,
		blockState: stored?.blockState ?? null,
		candidates,
	};
}

/**
 * The name and picture out of a POST /v3/profiles answer. That endpoint still
 * describes people this account has blocked, where the single-profile one
 * only returns the stub.
 */
export function readProfileCard(raw: unknown, profileId: string): KnownProfile | null {
	const profiles =
		raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
			? (raw as { profiles: unknown[] }).profiles
			: [];
	for (const entry of profiles) {
		if (!entry || typeof entry !== "object") continue;
		const card = entry as {
			profileId?: unknown;
			displayName?: unknown;
			profileImageMediaHash?: unknown;
		};
		if (card.profileId == null || String(card.profileId) !== profileId) continue;
		return {
			name: typeof card.displayName === "string" ? card.displayName : null,
			imageHash:
				typeof card.profileImageMediaHash === "string" ? card.profileImageMediaHash : null,
		};
	}
	return null;
}
