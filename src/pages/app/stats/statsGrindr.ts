/**
 * The few things the Stats page asks Grindr for, each fetched at most once
 * per visit (or per Refresh) and only when a section that needs it opens.
 */

import type { createApiFunctions } from "../../../services/apiFunctions";
import { normalizeTimestamp } from "./statsCompute";

type ApiFunctions = ReturnType<typeof createApiFunctions>;

export type TapEntry = {
	profileId: string;
	tapType: number | null;
	timestamp: number | null;
	name: string | null;
	imageHash: string | null;
};

export type OwnAlbumShares = {
	albumId: string;
	name: string | null;
	shares: number | null;
};

export type GrindrStats = {
	blockedIds: () => Promise<Set<string>>;
	taps: () => Promise<TapEntry[]>;
	ownAlbums: () => Promise<OwnAlbumShares[]>;
};

function once<T>(load: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | null = null;
	return () => {
		pending ??= load();
		return pending;
	};
}

/** Albums asked about, at most — one request each. */
const MAX_ALBUMS = 20;

export function createGrindrStats(api: ApiFunctions): GrindrStats {
	return {
		blockedIds: once(
			async () => new Set((await api.getBlockedProfileIds()).map(String)),
		),
		taps: once(async () => {
			const response = await api.getTaps();
			return response.profiles.flatMap((entry): TapEntry[] => {
				const profileId = entry.profileId ?? entry.senderId;
				if (!profileId) return [];
				const rawTime = entry.timestamp ?? entry.sentOn ?? null;
				return [
					{
						profileId: String(profileId),
						tapType: entry.tapType ?? null,
						timestamp: normalizeTimestamp(
							rawTime == null ? null : Number(rawTime),
						),
						name: entry.displayName?.trim() || null,
						imageHash:
							entry.profileImageMediaHash ??
							entry.photoHash ??
							entry.mediaHash ??
							null,
					},
				];
			});
		}),
		ownAlbums: once(async () => {
			const albums = (await api.getOwnAlbums()).slice(0, MAX_ALBUMS);
			return Promise.all(
				albums.map(async (album) => {
					const shares = await api
						.getAlbumShares({ albumId: String(album.albumId) })
						.then((ids) => ids.length)
						.catch(() => null);
					return {
						albumId: String(album.albumId),
						name: album.albumName ?? null,
						shares,
					};
				}),
			);
		}),
	};
}
