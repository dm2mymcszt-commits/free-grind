import { describe, expect, test } from "bun:test";
import {
	combineContentScores,
	coverForVerdict,
	decideExplicitBlock,
	describeExplicitScores,
	EXPLICIT_BLOCK_SCORE,
	EXPLICIT_PROFILE_PHOTO_REASON,
	EXPLICIT_UNSURE_SCORE,
	explicitNotice,
	FACE_MIN_SHARE,
	faceVerdict,
	NO_CONTENT_SCORES,
	profileFaceVerdict,
	scoreDetections,
	sentMediaSaves,
	verdictFromScores,
} from "../src/utils/explicitContentRules";

const ME = 924035175;
const THEM = 111;
const ENABLED_AT = 1_790_000_000_000;

function verdictOf(detections: { label: string; score: number }[]) {
	return verdictFromScores(scoreDetections(detections));
}

describe("verdictFromScores", () => {
	test("nothing found is clear", () => {
		expect(verdictOf([])).toBe("clear");
	});

	test("a confident explicit detection is explicit", () => {
		expect(verdictOf([{ label: "MALE_GENITALIA_EXPOSED", score: 0.83 }])).toBe("explicit");
		expect(verdictOf([{ label: "ANUS_EXPOSED", score: EXPLICIT_BLOCK_SCORE }])).toBe("explicit");
		expect(verdictOf([{ label: "BUTTOCKS_EXPOSED", score: 0.6 }])).toBe("explicit");
	});

	test("the first real case blocks: a bare-buttocks photo with the back of a head", () => {
		expect(
			verdictOf([
				{ label: "BUTTOCKS_EXPOSED", score: 0.771 },
				{ label: "FACE_MALE", score: 0.329 },
				{ label: "MALE_BREAST_EXPOSED", score: 0.245 },
			]),
		).toBe("explicit");
	});

	test("a detection the detector is only half sure of covers, and does not block", () => {
		expect(verdictOf([{ label: "BUTTOCKS_EXPOSED", score: 0.5 }])).toBe("unsure");
		expect(verdictOf([{ label: "MALE_GENITALIA_EXPOSED", score: 0.59 }])).toBe("unsure");
	});

	test("a weak explicit detection is unsure, never clear", () => {
		expect(verdictOf([{ label: "MALE_GENITALIA_EXPOSED", score: 0.3 }])).toBe("unsure");
		expect(verdictOf([{ label: "MALE_GENITALIA_EXPOSED", score: EXPLICIT_UNSURE_SCORE }])).toBe("unsure");
	});

	test("a shirtless photo is clear, however confident", () => {
		expect(
			verdictOf([
				{ label: "MALE_BREAST_EXPOSED", score: 0.95 },
				{ label: "BELLY_EXPOSED", score: 0.9 },
				{ label: "ARMPITS_EXPOSED", score: 0.8 },
				{ label: "FACE_MALE", score: 0.9 },
			]),
		).toBe("clear");
	});

	test("underwear is clear: covered is not exposed", () => {
		expect(
			verdictOf([
				{ label: "BUTTOCKS_COVERED", score: 0.9 },
				{ label: "ANUS_COVERED", score: 0.7 },
				{ label: "FEMALE_GENITALIA_COVERED", score: 0.7 },
			]),
		).toBe("clear");
	});

	test("a bare female chest covers the photo but does not block", () => {
		expect(verdictOf([{ label: "FEMALE_BREAST_EXPOSED", score: 0.9 }])).toBe("unsure");
		expect(verdictOf([{ label: "FEMALE_BREAST_EXPOSED", score: 0.2 }])).toBe("clear");
	});

	test("the strongest explicit detection decides, whatever else is there", () => {
		const scores = scoreDetections([
			{ label: "BELLY_EXPOSED", score: 0.99 },
			{ label: "BUTTOCKS_EXPOSED", score: 0.5 },
			{ label: "MALE_GENITALIA_EXPOSED", score: 0.7 },
		]);
		expect(scores.explicitLabel).toBe("MALE_GENITALIA_EXPOSED");
		expect(describeExplicitScores(scores)).toBe("genitals 70%");
	});

	test("the notice says what was seen and how sure", () => {
		const scores = scoreDetections([{ label: "BUTTOCKS_EXPOSED", score: 0.771 }]);
		expect(explicitNotice(EXPLICIT_PROFILE_PHOTO_REASON, scores)).toBe(
			"Explicit profile photo: bare buttocks, 77% sure",
		);
		expect(explicitNotice("Explicit photo", scoreDetections([]))).toBe("Explicit photo");
	});

	test("a score that is not a number is ignored", () => {
		expect(verdictOf([{ label: "MALE_GENITALIA_EXPOSED", score: Number.NaN }])).toBe("clear");
	});
});

describe("combineContentScores", () => {
	test("a video is as explicit as its worst frame", () => {
		const combined = combineContentScores([
			scoreDetections([{ label: "FACE_MALE", score: 0.8 }]),
			scoreDetections([{ label: "MALE_GENITALIA_EXPOSED", score: 0.7 }]),
			scoreDetections([]),
		]);
		expect(verdictFromScores(combined)).toBe("explicit");
		expect(combined.faceScore).toBe(0.8);
	});

	test("no frames is no evidence of anything", () => {
		expect(combineContentScores([])).toEqual(NO_CONTENT_SCORES);
	});
});

function face(score: number, width = 0.3, height = 0.3) {
	return scoreDetections([{ label: "FACE_MALE", score, width, height }]);
}

describe("faceVerdict", () => {
	test("a confident, close face is a face", () => {
		expect(faceVerdict(face(0.9))).toBe("face");
	});

	test("nothing found is no face", () => {
		expect(faceVerdict(scoreDetections([]))).toBe("no_face");
		expect(faceVerdict(face(0.1))).toBe("no_face");
	});

	test("a face too small to recognise is no face, however sure the detector is", () => {
		const side = Math.sqrt(FACE_MIN_SHARE) * 0.9;
		expect(faceVerdict(face(0.9, side, side))).toBe("no_face");
	});

	test("in between is unsure: the back of a head scored 0.33", () => {
		expect(faceVerdict(face(0.33))).toBe("unsure");
	});

	test("the strongest face decides, with its own size", () => {
		const scores = scoreDetections([
			{ label: "FACE_MALE", score: 0.5, width: 0.01, height: 0.01 },
			{ label: "FACE_FEMALE", score: 0.8, width: 0.4, height: 0.4 },
		]);
		expect(scores.faceScore).toBe(0.8);
		expect(scores.faceShare).toBeCloseTo(0.16);
		expect(faceVerdict(scores)).toBe("face");
	});

	test("a check made before sizes were kept is never a definite face or a far-away one", () => {
		const old = { ...NO_CONTENT_SCORES, faceScore: 0.9, faceShare: null };
		expect(faceVerdict(old)).toBe("unsure");
		expect(faceVerdict({ ...old, faceScore: 0.05 })).toBe("no_face");
	});
});

describe("profileFaceVerdict", () => {
	test("one photo with a face is enough", () => {
		expect(profileFaceVerdict(["no_face", "no_face", "face"])).toBe("face");
		expect(profileFaceVerdict([null, "face"])).toBe("face");
	});

	test("no face only when every photo is a definite no", () => {
		expect(profileFaceVerdict(["no_face", "no_face"])).toBe("no_face");
	});

	test("a photo that could not be checked, or is unsure, leaves the profile unsure", () => {
		expect(profileFaceVerdict(["no_face", null])).toBe("unsure");
		expect(profileFaceVerdict(["no_face", "unsure"])).toBe("unsure");
		expect(profileFaceVerdict([null])).toBe("unsure");
	});

	test("no photos at all is not this rule's business", () => {
		expect(profileFaceVerdict([])).toBe("unsure");
	});
});

describe("sentMediaSaves", () => {
	test("sending nothing saves nobody", () => {
		expect(sentMediaSaves([], false)).toBe(false);
		expect(sentMediaSaves([], true)).toBe(false);
	});

	test("without the face option, any media saves, as before", () => {
		expect(sentMediaSaves(["no_face"], false)).toBe(true);
	});

	test("with it, a photo of a face saves", () => {
		expect(sentMediaSaves(["no_face", "face"], true)).toBe(true);
	});

	test("with it, photos that all show no face do not save", () => {
		expect(sentMediaSaves(["no_face", "no_face"], true)).toBe(false);
	});

	test("anything that could not be judged saves: an album, a failed check, an unsure face", () => {
		expect(sentMediaSaves(["no_face", "unknown"], true)).toBe(true);
		expect(sentMediaSaves(["unsure"], true)).toBe(true);
	});
});

describe("coverForVerdict", () => {
	test("only a clear verdict uncovers", () => {
		expect(coverForVerdict("clear")).toBeNull();
		expect(coverForVerdict("explicit")).toBe("explicit");
		expect(coverForVerdict("unsure")).toBe("unsure");
	});

	test("a photo nobody has checked stays covered", () => {
		expect(coverForVerdict(null)).toBe("unchecked");
		expect(coverForVerdict(undefined)).toBe("unchecked");
	});
});

describe("decideExplicitBlock", () => {
	const base = {
		blockingEnabled: true,
		verdict: "explicit" as const,
		senderId: THEM,
		userId: ME,
		messageTimestamp: ENABLED_AT + 60_000,
		filterEnabledAt: ENABLED_AT,
		whitelisted: false,
		conversationArchived: false,
	};

	test("an explicit photo from someone else, sent after the filter went on, blocks", () => {
		expect(decideExplicitBlock(base)).toEqual({ block: true });
	});

	test("an unsure or clear verdict never blocks", () => {
		expect(decideExplicitBlock({ ...base, verdict: "unsure" })).toEqual({ block: false, why: "not_explicit" });
		expect(decideExplicitBlock({ ...base, verdict: "clear" })).toEqual({ block: false, why: "not_explicit" });
	});

	test("a photo that could not be checked never blocks", () => {
		expect(decideExplicitBlock({ ...base, verdict: null })).toEqual({ block: false, why: "not_explicit" });
	});

	test("this account's own photo never blocks the other person", () => {
		expect(decideExplicitBlock({ ...base, senderId: ME })).toEqual({ block: false, why: "own_message" });
		expect(decideExplicitBlock({ ...base, senderId: String(ME) })).toEqual({ block: false, why: "own_message" });
	});

	test("a sender that cannot be named is not blocked", () => {
		expect(decideExplicitBlock({ ...base, senderId: null })).toEqual({ block: false, why: "unknown_sender" });
		expect(decideExplicitBlock({ ...base, senderId: 0 })).toEqual({ block: false, why: "unknown_sender" });
		expect(decideExplicitBlock({ ...base, userId: null })).toEqual({ block: false, why: "unknown_sender" });
	});

	test("old history does not block: only photos sent after the filter went on", () => {
		expect(decideExplicitBlock({ ...base, messageTimestamp: ENABLED_AT - 1 })).toEqual({
			block: false,
			why: "before_filter_was_on",
		});
		expect(decideExplicitBlock({ ...base, messageTimestamp: null })).toEqual({
			block: false,
			why: "before_filter_was_on",
		});
		expect(decideExplicitBlock({ ...base, filterEnabledAt: null })).toEqual({
			block: false,
			why: "before_filter_was_on",
		});
	});

	test("a message time in seconds is read as seconds", () => {
		expect(decideExplicitBlock({ ...base, messageTimestamp: (ENABLED_AT + 60_000) / 1000 })).toEqual({ block: true });
		expect(decideExplicitBlock({ ...base, messageTimestamp: (ENABLED_AT - 60_000) / 1000 })).toEqual({
			block: false,
			why: "before_filter_was_on",
		});
	});

	test("whitelisted people are covered, not blocked", () => {
		expect(decideExplicitBlock({ ...base, whitelisted: true })).toEqual({ block: false, why: "whitelisted" });
	});

	test("an archived chat is left alone", () => {
		expect(decideExplicitBlock({ ...base, conversationArchived: true })).toEqual({
			block: false,
			why: "conversation_archived",
		});
	});

	test("blocking switched off blocks nobody", () => {
		expect(decideExplicitBlock({ ...base, blockingEnabled: false })).toEqual({ block: false, why: "blocking_off" });
	});
});
