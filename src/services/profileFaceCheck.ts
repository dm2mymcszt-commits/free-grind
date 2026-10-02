/**
 * profileFaceCheck.ts — whether any of a profile's photos shows a face.
 *
 * Backs the "photos with no face" half of the faceless-profile rule. It only
 * answers the question; the scanner decides what to do with the answer.
 *
 * The answer has three values on purpose. A profile is only "faceless" when
 * every one of its photos was actually downloaded and checked and none shows
 * a face. A photo that would not download, a profile that could not be read,
 * a detector that is not running: all of those are "don't know", and the
 * rule does not act on "don't know".
 *
 * Each photo is checked once and remembered (content_checks, under
 * "profile:<hash>"), piece by piece as well as whole, since a face in a
 * full-length photo is too small to see otherwise.
 */

import type { ProfileDetail } from "../pages/app/GridPage.types";
import * as chatDb from "./chatDb";
import { checkImageBytes, getCachedCheckForMediaKey, saveContentCheck } from "./contentCheck";
import { fetchAndEncode } from "./mediaStore";
import { FACE_SCORE, profileShowsFace } from "../utils/explicitContentRules";
import { appLog } from "../utils/logger";
import { getProfileImageUrl, validateMediaHash } from "../utils/media";
import { classifyProfileAccess } from "../utils/profileAccessStatus";

const MODEL = "nudenet-320n-tiled";
/** More photos than this and the rest are not looked at; the answer is then "don't know" unless a face turned up. */
const MAX_PHOTOS = 8;

const REMEMBER_NO_FACE_MS = 30 * 60 * 1000;
const REMEMBER_UNKNOWN_MS = 5 * 60 * 1000;

type Remembered = { primaryHash: string; showsFace: boolean | null; at: number };
const byProfile = new Map<string, Remembered>();

function remembered(profileId: string, primaryHash: string): boolean | null | undefined {
	const entry = byProfile.get(profileId);
	if (!entry || entry.primaryHash !== primaryHash) return undefined;
	if (entry.showsFace === true) return true;
	// "No face" and "don't know" are asked again after a while: people add
	// photos, and a failed download may work next time.
	const keepFor = entry.showsFace === false ? REMEMBER_NO_FACE_MS : REMEMBER_UNKNOWN_MS;
	return Date.now() - entry.at < keepFor ? entry.showsFace : undefined;
}

/** How strongly one profile photo shows a face, or null when it could not be checked. */
async function faceScoreForPhoto(hash: string): Promise<number | null> {
	const mediaKey = `profile:${hash}`;
	const known =
		getCachedCheckForMediaKey(mediaKey) ?? (await chatDb.getContentCheck(mediaKey).catch(() => null));
	if (known) return known.faceScore;

	const fetched = await fetchAndEncode(getProfileImageUrl(hash, "1024x1024"));
	if (!fetched) return null;
	try {
		const scores = await checkImageBytes(fetched.base64, { tiled: true });
		await saveContentCheck({
			mediaKey,
			messageId: null,
			conversationId: null,
			kind: "image",
			explicitLabel: scores.explicitLabel,
			explicitScore: scores.explicitScore,
			coverOnlyScore: scores.coverOnlyScore,
			faceScore: scores.faceScore,
			model: MODEL,
			checkedAt: Date.now(),
		});
		return scores.faceScore;
	} catch (error) {
		appLog.warn(`[profile-face] could not check photo ${hash}`, error);
		return null;
	}
}

export type ProfileFaceApi = {
	getProfileDetail: (
		profileId: string,
	) => Promise<Pick<ProfileDetail, "displayName" | "lastUpdatedTime" | "medias">>;
};

/**
 * true: at least one photo shows a face. false: every photo was checked and
 * none does. null: it could not be established.
 */
export async function profilePhotosShowFace(
	api: ProfileFaceApi,
	profileId: string,
	primaryHash: string,
): Promise<boolean | null> {
	const cached = remembered(profileId, primaryHash);
	if (cached !== undefined) return cached;

	const remember = (showsFace: boolean | null) => {
		byProfile.set(profileId, { primaryHash, showsFace, at: Date.now() });
		return showsFace;
	};

	if (!validateMediaHash(primaryHash)) return remember(null);

	// The main photo first: it is already known from the inbox, and for most
	// people it settles the question without reading the profile at all.
	const primaryScore = await faceScoreForPhoto(primaryHash);
	if (primaryScore != null && primaryScore >= FACE_SCORE) return remember(true);

	let hashes: string[];
	try {
		const profile = await api.getProfileDetail(profileId);
		// A blocked or deleted profile comes back as an empty shell, which
		// says nothing about what its photos show.
		if (classifyProfileAccess(profile) !== "accessible") {
			return remember(null);
		}
		hashes = [
			...new Set(
				(profile.medias ?? [])
					.map((media) => media.mediaHash?.trim() ?? "")
					.filter((hash) => hash !== primaryHash && validateMediaHash(hash)),
			),
		];
	} catch (error) {
		appLog.warn(`[profile-face] could not read profile ${profileId}`, error);
		return remember(null);
	}

	const scores: (number | null)[] = [primaryScore];
	for (const hash of hashes.slice(0, MAX_PHOTOS - 1)) {
		const score = await faceScoreForPhoto(hash);
		if (score != null && score >= FACE_SCORE) return remember(true);
		scores.push(score);
	}
	// Photos past the limit were not looked at, so "none shows a face" cannot be said.
	if (hashes.length > MAX_PHOTOS - 1) scores.push(null);

	return remember(profileShowsFace(scores));
}
