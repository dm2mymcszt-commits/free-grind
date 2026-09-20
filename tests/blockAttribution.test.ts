import { describe, expect, test } from "bun:test";
import {
	isFalseBlockedByOtherMarker,
	resolveBlockAttribution,
	restoredStateAfterFalseMarker,
} from "../src/utils/blockAttribution";

describe("resolveBlockAttribution", () => {
	// The bug this guards: blocking someone, then opening that thread, got a
	// 403 on its messages and re-derived attribution from scratch. The
	// self-marker was already spent by the original block and both remaining
	// signals fail towards "they blocked me", so the thread ended up reading
	// "You blocked this person" followed minutes later by "You were blocked".
	test("a block this account already made is never re-attributed", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: "blocked_by_me",
				selfMarked: false,
				blockedByMeLookup: null,
			}),
		).toBeNull();
		expect(
			resolveBlockAttribution({
				knownBlockState: "blocked_by_me",
				selfMarked: false,
				blockedByMeLookup: false,
			}),
		).toBeNull();
	});

	test("a block already attributed to them is not repeated either", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: "blocked_by_other",
				selfMarked: false,
				blockedByMeLookup: false,
			}),
		).toBeNull();
	});

	test("a lookup that could not answer attributes nothing", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: false,
				blockedByMeLookup: null,
			}),
		).toBeNull();
	});

	test("this device's own marker settles it without a lookup", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: true,
				blockedByMeLookup: null,
			}),
		).toBe("blocked_by_me");
	});

	// The reported sequence: blocked 18:10, unblocked 18:12, and "You were
	// blocked" landing in that same minute. After the unblock the block list
	// truthfully says this account does not block them, which on its own is
	// indistinguishable from having been blocked.
	test("this account's own unblock, still settling, is not their block", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: false,
				blockedByMeLookup: false,
				selfActedRecently: true,
			}),
		).toBeNull();
	});

	test("the grace window never hides this device's own block either", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: true,
				blockedByMeLookup: null,
				selfActedRecently: true,
			}),
		).toBe("blocked_by_me");
	});

	test("outside the window an answered lookup still attributes normally", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: false,
				blockedByMeLookup: false,
				selfActedRecently: false,
			}),
		).toBe("blocked_by_other");
	});

	test("an answered lookup decides a genuinely new block either way", () => {
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: false,
				blockedByMeLookup: true,
			}),
		).toBe("blocked_by_me");
		expect(
			resolveBlockAttribution({
				knownBlockState: null,
				selfMarked: false,
				blockedByMeLookup: false,
			}),
		).toBe("blocked_by_other");
	});
});

// What the repair pass deletes. Every case here is a thread someone actually
// has in their history, so a wrong "true" erases a real block from the record.
describe("isFalseBlockedByOtherMarker", () => {
	const BLOCK = 1_000;

	test("blocked by them while this account's own block was in force", () => {
		// The reported thread: "You blocked this person 17:32", then a
		// "You were blocked 17:36" that nothing could have observed.
		expect(
			isFalseBlockedByOtherMarker({
				blockedBySelf: BLOCK,
				blockedByOther: BLOCK + 240_000,
				unblockedBySelf: null,
			}),
		).toBe(true);
	});

	test("they blocked first and this account blocked back — both real", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedByOther: BLOCK,
				blockedBySelf: BLOCK + 60_000,
				unblockedBySelf: null,
			}),
		).toBe(false);
	});

	test("blocked, unblocked, then blocked by them much later — real", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedBySelf: BLOCK,
				unblockedBySelf: BLOCK + 60_000,
				blockedByOther: BLOCK + 60_000 + 10 * 60_000,
			}),
		).toBe(false);
	});

	// The second reported thread: blocked 18:10, unblocked 18:12, "You were
	// blocked" in that same minute — the unblock still settling, not them.
	test("a block landing while this account's unblock settles is false", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedBySelf: BLOCK,
				unblockedBySelf: BLOCK + 120_000,
				blockedByOther: BLOCK + 120_000 + 3_000,
			}),
		).toBe(true);
	});

	test("the settle window is a gap, not a free pass on the whole sequence", () => {
		// One second past the window is taken at face value.
		expect(
			isFalseBlockedByOtherMarker(
				{
					blockedBySelf: BLOCK,
					unblockedBySelf: BLOCK + 10_000,
					blockedByOther: BLOCK + 10_000 + 120_001,
				},
				120_000,
			),
		).toBe(false);
	});

	test("an unblock that predates this account's block does not excuse it", () => {
		// An older unblock left over from a previous round is not the unblock
		// that would have let them reach this account again.
		expect(
			isFalseBlockedByOtherMarker({
				unblockedBySelf: BLOCK - 60_000,
				blockedBySelf: BLOCK,
				blockedByOther: BLOCK + 60_000,
			}),
		).toBe(true);
	});

	test("a block by them alone is untouched", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedByOther: BLOCK,
				blockedBySelf: null,
				unblockedBySelf: null,
			}),
		).toBe(false);
	});

	test("a thread with no block by them has nothing to repair", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedByOther: null,
				blockedBySelf: BLOCK,
				unblockedBySelf: null,
			}),
		).toBe(false);
	});

	test("two markers on the same millisecond count as theirs first", () => {
		// Ties go to "real": erasing a genuine block is the worse mistake.
		expect(
			isFalseBlockedByOtherMarker({
				blockedBySelf: BLOCK,
				blockedByOther: BLOCK,
				unblockedBySelf: null,
			}),
		).toBe(false);
	});
});

// What the conversation is left in once its false marker is deleted. Getting
// this wrong leaves an unblocked person stranded in the archive with no
// unblock button, because the server's block list no longer holds them.
describe("restoredStateAfterFalseMarker", () => {
	const BLOCK = 1_000;

	test("a block with no unblock after it goes back to blocked_by_me", () => {
		expect(
			restoredStateAfterFalseMarker({
				blockedBySelf: BLOCK,
				blockedByOther: BLOCK + 240_000,
				unblockedBySelf: null,
			}),
		).toBe("blocked_by_me");
	});

	test("an unblock after the block clears the state entirely", () => {
		expect(
			restoredStateAfterFalseMarker({
				blockedBySelf: BLOCK,
				unblockedBySelf: BLOCK + 120_000,
				blockedByOther: BLOCK + 123_000,
			}),
		).toBeNull();
	});

	test("an unblock older than the block does not clear it", () => {
		expect(
			restoredStateAfterFalseMarker({
				unblockedBySelf: BLOCK - 60_000,
				blockedBySelf: BLOCK,
				blockedByOther: BLOCK + 60_000,
			}),
		).toBe("blocked_by_me");
	});
});
