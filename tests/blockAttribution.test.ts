import { describe, expect, test } from "bun:test";
import {
	isFalseBlockedByOtherMarker,
	resolveBlockAttribution,
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

	test("blocked, unblocked, then blocked by them — real, the unblock let them back", () => {
		expect(
			isFalseBlockedByOtherMarker({
				blockedBySelf: BLOCK,
				unblockedBySelf: BLOCK + 60_000,
				blockedByOther: BLOCK + 120_000,
			}),
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
