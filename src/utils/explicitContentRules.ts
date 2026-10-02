/**
 * The decisions behind the explicit-photo filter, kept free of storage and of
 * the detector itself so they can be tested on their own: what a set of
 * detections amounts to, and when a verdict is allowed to block someone.
 *
 * The detector (src-tauri/src/commands/vision.rs) only reports what it saw
 * and how sure it was. Everything that turns that into "block", "keep
 * covered" or "show" lives here.
 */

/** One thing the detector found, as it comes back from `detect_image_content`. */
export type ContentDetection = {
	label: string;
	score: number;
	/** The box around it, as fractions of the photo's width and height. */
	width?: number;
	height?: number;
};

/**
 * What blocks: the user's choice was explicit nudity only. Bare chests are
 * deliberately not here, and neither is anything covered by clothing.
 */
const EXPLICIT_LABELS: ReadonlySet<string> = new Set([
	"MALE_GENITALIA_EXPOSED",
	"FEMALE_GENITALIA_EXPOSED",
	"ANUS_EXPOSED",
	"BUTTOCKS_EXPOSED",
]);

/**
 * Never blocks, but keeps a photo covered. The detector tells a bare male
 * chest from a bare female one, and gets it wrong on some bodies; blocking on
 * that would break the "shirtless is fine" rule, while showing it as checked
 * and fine would be wrong the other way.
 */
const COVER_ONLY_LABELS: ReadonlySet<string> = new Set(["FEMALE_BREAST_EXPOSED"]);

const FACE_LABELS: ReadonlySet<string> = new Set(["FACE_MALE", "FACE_FEMALE"]);

/**
 * At or above this, an explicit detection blocks. Set high on purpose: a
 * wrong block is the worst thing this can do, and anything the detector is
 * less sure of still stays covered without blocking anyone. The first real
 * case, a bare-buttocks profile photo, scored 0.77.
 */
export const EXPLICIT_BLOCK_SCORE = 0.6;
/**
 * Between this and the block score the detector saw something it was not
 * sure about. The photo is neither blocked on nor shown: it stays covered.
 * Deliberately low — a covered photo costs one tap, a shown one cannot be
 * unseen.
 */
export const EXPLICIT_UNSURE_SCORE = 0.15;
const COVER_ONLY_SCORE = 0.35;
/**
 * How sure the detector has to be before a photo counts as showing a face.
 * Provisional, to be set from real photos: so far a face under a cosmetic
 * mask scored 0.57 up close and 0.21 at a modest size, and the back of a head
 * scored 0.33.
 */
export const FACE_VISIBLE_SCORE = 0.45;
/** Below this the detector found no face worth the name. */
export const FACE_ABSENT_SCORE = 0.2;
/**
 * The smallest share of the photo a face may take up and still count: under
 * this the person is too far away to be recognised, which the user counts as
 * not showing a face.
 */
export const FACE_MIN_SHARE = 0.003;

/** What the detector found, reduced to the numbers a verdict is read from. */
export type ContentScores = {
	explicitLabel: string | null;
	explicitScore: number;
	coverOnlyScore: number;
	faceScore: number;
	/**
	 * How much of the photo the strongest face takes up, 0 to 1. Null when
	 * that was not recorded (a check made before sizes were kept).
	 */
	faceShare: number | null;
};

export const NO_CONTENT_SCORES: ContentScores = {
	explicitLabel: null,
	explicitScore: 0,
	coverOnlyScore: 0,
	faceScore: 0,
	faceShare: null,
};

export function scoreDetections(detections: readonly ContentDetection[]): ContentScores {
	const scores: ContentScores = { ...NO_CONTENT_SCORES };
	for (const detection of detections) {
		if (!Number.isFinite(detection.score)) continue;
		if (EXPLICIT_LABELS.has(detection.label) && detection.score > scores.explicitScore) {
			scores.explicitScore = detection.score;
			scores.explicitLabel = detection.label;
		} else if (COVER_ONLY_LABELS.has(detection.label)) {
			scores.coverOnlyScore = Math.max(scores.coverOnlyScore, detection.score);
		} else if (FACE_LABELS.has(detection.label) && detection.score > scores.faceScore) {
			scores.faceScore = detection.score;
			scores.faceShare =
				typeof detection.width === "number" && typeof detection.height === "number"
					? detection.width * detection.height
					: null;
		}
	}
	return scores;
}

/** A video is as explicit as its worst frame, and shows a face if any frame does. */
export function combineContentScores(frames: readonly ContentScores[]): ContentScores {
	const combined: ContentScores = { ...NO_CONTENT_SCORES };
	for (const frame of frames) {
		if (frame.explicitScore > combined.explicitScore) {
			combined.explicitScore = frame.explicitScore;
			combined.explicitLabel = frame.explicitLabel;
		}
		combined.coverOnlyScore = Math.max(combined.coverOnlyScore, frame.coverOnlyScore);
		if (frame.faceScore > combined.faceScore) {
			combined.faceScore = frame.faceScore;
			combined.faceShare = frame.faceShare;
		}
	}
	return combined;
}

/**
 * - "explicit": blocks, and stays covered.
 * - "unsure": never blocks, stays covered.
 * - "clear": shown.
 *
 * There is no verdict for "could not be checked" — that is the absence of
 * one, and the screen treats a missing verdict as covered.
 */
export type ContentVerdict = "explicit" | "unsure" | "clear";

export function verdictFromScores(scores: ContentScores): ContentVerdict {
	if (scores.explicitScore >= EXPLICIT_BLOCK_SCORE) return "explicit";
	if (scores.explicitScore >= EXPLICIT_UNSURE_SCORE) return "unsure";
	if (scores.coverOnlyScore >= COVER_ONLY_SCORE) return "unsure";
	return "clear";
}

/**
 * Whether a photo shows a face, in three values on purpose:
 *
 * - "face": the detector is sure, and the face is big enough to recognise.
 * - "no_face": it found none, or one so small the person is far away.
 * - "unsure": something in between. Nothing may block on this.
 */
export type FaceVerdict = "face" | "no_face" | "unsure";

export function faceVerdict(scores: ContentScores): FaceVerdict {
	if (scores.faceScore < FACE_ABSENT_SCORE) return "no_face";
	if (scores.faceShare != null && scores.faceShare < FACE_MIN_SHARE) return "no_face";
	if (scores.faceScore >= FACE_VISIBLE_SCORE && scores.faceShare != null) return "face";
	return "unsure";
}

/**
 * Whether a profile shows a face, from the verdict on each of its photos
 * (null for a photo that could not be checked).
 *
 * One face is enough for "face". "no_face" needs every photo checked and
 * every one a definite no; a single unchecked or unsure photo makes the whole
 * profile "unsure", because that may be the one with the face in it. The
 * faceless rule only acts on "no_face".
 */
export function profileFaceVerdict(photos: readonly (FaceVerdict | null)[]): FaceVerdict {
	if (photos.some((photo) => photo === "face")) return "face";
	if (photos.length === 0 || photos.some((photo) => photo !== "no_face")) return "unsure";
	return "no_face";
}

/**
 * What one thing somebody sent says about their face: a verdict for a photo
 * or video that was checked, or "unknown" for anything that could not be
 * (an album, a failed download, a detector error).
 */
export type SentMediaFace = FaceVerdict | "unknown";

/**
 * Whether what somebody sent saves them from the faceless rule.
 *
 * Without `needFace`, any media does, as it always has. With it, only media
 * that shows a face — or that could not be judged, since not knowing is never
 * a reason to block. So they are only left unsaved when they sent nothing, or
 * when every single thing they sent was checked and shows no face.
 */
export function sentMediaSaves(media: readonly SentMediaFace[], needFace: boolean): boolean {
	if (media.length === 0) return false;
	if (!needFace) return true;
	return media.some((item) => item !== "no_face");
}

/** Below this, a message time is in seconds rather than milliseconds. */
const SECONDS_THRESHOLD = 100_000_000_000;

function toMilliseconds(timestamp: number): number {
	return timestamp < SECONDS_THRESHOLD ? timestamp * 1000 : timestamp;
}

export type ExplicitBlockDecision =
	| { block: true }
	| {
			block: false;
			why:
				| "blocking_off"
				| "not_explicit"
				| "own_message"
				| "unknown_sender"
				| "before_filter_was_on"
				| "whitelisted"
				| "conversation_archived";
	  };

/**
 * Whether an explicit verdict may block the person who sent the photo.
 *
 * Every "no" here is a case where blocking would act on something other than
 * "this person just sent this account an explicit photo": a photo this
 * account sent, a sender that cannot be named, history from before the filter
 * existed (opening an old chat must not block someone for last year), a chat
 * that is already archived, or somebody the user chose to exempt.
 */
export function decideExplicitBlock(input: {
	blockingEnabled: boolean;
	verdict: ContentVerdict | null;
	senderId: string | number | null | undefined;
	userId: string | number | null | undefined;
	messageTimestamp: number | null | undefined;
	filterEnabledAt: number | null;
	whitelisted: boolean;
	conversationArchived: boolean;
}): ExplicitBlockDecision {
	if (!input.blockingEnabled) return { block: false, why: "blocking_off" };
	if (input.verdict !== "explicit") return { block: false, why: "not_explicit" };
	if (input.senderId == null || input.userId == null) return { block: false, why: "unknown_sender" };
	if (Number(input.senderId) === Number(input.userId)) return { block: false, why: "own_message" };
	if (!Number.isFinite(Number(input.senderId)) || Number(input.senderId) <= 0) {
		return { block: false, why: "unknown_sender" };
	}
	if (
		input.filterEnabledAt == null ||
		input.messageTimestamp == null ||
		!Number.isFinite(input.messageTimestamp) ||
		toMilliseconds(input.messageTimestamp) < input.filterEnabledAt
	) {
		return { block: false, why: "before_filter_was_on" };
	}
	if (input.conversationArchived) return { block: false, why: "conversation_archived" };
	if (input.whitelisted) return { block: false, why: "whitelisted" };
	return { block: true };
}

/** What covers a received photo or video on screen, or null to show it. */
export type ContentCover = "unchecked" | "unsure" | "explicit";

export function coverForVerdict(verdict: ContentVerdict | null | undefined): ContentCover | null {
	if (verdict === "clear") return null;
	if (verdict === "explicit") return "explicit";
	if (verdict === "unsure") return "unsure";
	return "unchecked";
}

const LABEL_WORDS: Record<string, string> = {
	MALE_GENITALIA_EXPOSED: "genitals",
	FEMALE_GENITALIA_EXPOSED: "genitals",
	ANUS_EXPOSED: "anus",
	BUTTOCKS_EXPOSED: "bare buttocks",
};

/** "genitals 83%" — what was found and how sure, for the Stats log and the app log. */
export function describeExplicitScores(scores: ContentScores): string | null {
	if (!scores.explicitLabel) return null;
	const words = LABEL_WORDS[scores.explicitLabel] ?? scores.explicitLabel.toLowerCase();
	return `${words} ${Math.round(scores.explicitScore * 100)}%`;
}

/** The sentence the block notification and the Stats log carry. */
export function explicitBlockReason(kind: "image" | "video"): string {
	return kind === "video" ? "Explicit video" : "Explicit photo";
}

/** The same, for an explicit photo on someone's profile rather than one they sent. */
export const EXPLICIT_PROFILE_PHOTO_REASON = "Explicit profile photo";
