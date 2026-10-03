/**
 * explicitProfilePhotos.ts — which profile photos the detector called
 * explicit, kept where a render can ask without waiting.
 *
 * Blocking someone over an explicit profile photo archives their chat, and
 * the archived chat still draws that photo as their avatar. This is what
 * lets the avatar be left out instead: a set of photo hashes, in memory and
 * in localStorage so it is there from the first render after a restart,
 * topped up once per session from the checks already in the database.
 */

import { EXPLICIT_BLOCK_SCORE } from "../utils/explicitContentRules";
import { appLog } from "../utils/logger";
import * as chatDb from "./chatDb";
import { isExplicitFilterEnabled } from "./contentCheck";

const STORAGE_KEY = "fg-explicit-profile-photos";
/** Newest kept; an avatar this old has long scrolled out of any list. */
const MAX_REMEMBERED = 600;

function readStored(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
		return Array.isArray(parsed) ? parsed.filter((hash): hash is string => typeof hash === "string") : [];
	} catch {
		return [];
	}
}

const hashes = new Set<string>(readStored());
const listeners = new Set<() => void>();

function persist(): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...hashes].slice(-MAX_REMEMBERED)));
	} catch {
		// Still held in memory for this session.
	}
}

/** Whether this photo is one to leave out. Never, with the filter off. */
export function isExplicitProfilePhoto(hash: string | null | undefined): boolean {
	return !!hash && hashes.has(hash) && isExplicitFilterEnabled();
}

export function rememberExplicitProfilePhoto(hash: string): void {
	if (hashes.has(hash)) return;
	hashes.add(hash);
	persist();
	for (const listener of listeners) listener();
}

/** Subscribe to the set growing; returns an unsubscribe function. */
export function subscribeToExplicitProfilePhotos(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

let backfillStartedFor: number | null | undefined;

/**
 * Adds the explicit profile photos already on record for this account: the
 * ones checked before this set existed, or on a device whose localStorage
 * was cleared. Runs once per account per session; safe to call on every render.
 */
export function backfillExplicitProfilePhotos(): void {
	const account = chatDb.getActiveChatDbUser();
	if (account == null || backfillStartedFor === account || !isExplicitFilterEnabled()) return;
	backfillStartedFor = account;
	void chatDb
		.getExplicitProfilePhotoHashes(EXPLICIT_BLOCK_SCORE)
		.then((found) => {
			let added = false;
			for (const hash of found) {
				if (!hashes.has(hash)) {
					hashes.add(hash);
					added = true;
				}
			}
			if (added) {
				persist();
				for (const listener of listeners) listener();
			}
		})
		.catch((error) => {
			appLog.warn("[explicit-profile-photos] could not read earlier checks", error);
		});
}
