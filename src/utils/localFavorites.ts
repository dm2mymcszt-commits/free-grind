/**
 * The profile ids this device knows are favourited, kept because /v4/inbox is
 * not a usable source for it.
 *
 * The inbox accepts a `favoritesOnly` filter and every conversation carries a
 * `favorite` boolean, but neither can be relied on: a filtered request comes
 * back with profiles that are not favourited, and a conversation with someone
 * who is favourited can still arrive with the flag false. Filtering the inbox
 * on either one alone therefore shows the wrong people and hides the right
 * ones — both of which happened.
 *
 * This is written by every favourite toggle in the app, so it is exact for
 * anything favourited here, and it is only ever used to *widen* the inbox
 * filter: a conversation still qualifies if the server says `favorite`. A
 * favourite made in the real Grindr client that the server never reflects is
 * the one case neither source covers.
 */

const STORAGE_KEY = "fg-local-favorites";

export const LOCAL_FAVORITES_EVENT = "fg-local-favorites-updated";

export function getLocalFavoriteIds(): Set<string> {
	if (typeof window === "undefined") return new Set();
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
	} catch {
		return new Set();
	}
}

export function isLocallyFavorited(profileId: string | number | null | undefined): boolean {
	if (profileId == null) return false;
	return getLocalFavoriteIds().has(String(profileId));
}

/**
 * Records a favourite toggle. Removal matters as much as addition — without it
 * an unfavourited profile would linger under the filter forever, which is the
 * mirror image of the bug this exists to fix.
 */
export function setLocalFavorite(
	profileId: string | number | null | undefined,
	isFavorite: boolean,
): void {
	if (profileId == null || typeof window === "undefined") return;
	const id = String(profileId);
	const ids = getLocalFavoriteIds();
	if (isFavorite === ids.has(id)) return;
	if (isFavorite) ids.add(id);
	else ids.delete(id);
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
		window.dispatchEvent(new Event(LOCAL_FAVORITES_EVENT));
	} catch {
		// A device with storage unavailable simply falls back to the server's
		// own flag, which is the behaviour that existed before this.
	}
}
