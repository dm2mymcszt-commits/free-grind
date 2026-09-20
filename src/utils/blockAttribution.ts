/**
 * The rules behind "who blocked whom", kept free of storage so they can be
 * tested on their own — the same split as statsLogRules.ts.
 *
 * Getting these wrong is silent and durable: a wrong answer writes a permanent
 * system message into a thread, skews the Stats "Blocked you" figures, and can
 * aim counter-block at someone who never blocked anybody. Both rules below are
 * therefore written to say nothing rather than guess.
 */

import type { BlockState } from "../types/chat-db";

/**
 * Who an inaccessible conversation (a 403 on its messages, a delete event)
 * should be attributed to, or null for "don't attribute it at all".
 *
 *  - An existing block_state settles it. A 403 on an already-blocked
 *    conversation is that same block still in force, not a new event, and
 *    re-deriving attribution there is exactly how an account's own block came
 *    back minutes later as "You were blocked".
 *  - An inconclusive lookup attributes nothing. Both signals fail *towards*
 *    "they blocked me" — a block list request that errors, a conversation
 *    whose other_profile_id was never backfilled — so anything short of a real
 *    answer is left for a later sweep that can confirm it.
 */
export function resolveBlockAttribution(input: {
	/** The durable record, if this conversation already has one. */
	knownBlockState: BlockState | null;
	/** This device ran the block itself (its own pre-request marker). */
	selfMarked: boolean;
	/** The server's block list says we block them — null when it couldn't answer. */
	blockedByMeLookup: boolean | null;
}): BlockState | null {
	if (input.knownBlockState !== null) return null;
	if (input.selfMarked) return "blocked_by_me";
	if (input.blockedByMeLookup === null) return null;
	return input.blockedByMeLookup ? "blocked_by_me" : "blocked_by_other";
}

/** The block/unblock markers a single conversation holds, by timestamp. */
export type ConversationBlockMarkers = {
	blockedByOther: number | null;
	blockedBySelf: number | null;
	unblockedBySelf: number | null;
};

/**
 * Whether a conversation's "You were blocked" marker records a block nobody
 * made — true only when this account's own block was already in force when
 * that marker was written, which is the shape the 403 bug produced.
 *
 * Two orderings are real blocks and must survive:
 *  - they blocked first and this account blocked back;
 *  - this account blocked, unblocked, and only then was blocked by them —
 *    the unblock is the only way they could reach this account again.
 */
export function isFalseBlockedByOtherMarker(markers: ConversationBlockMarkers): boolean {
	const { blockedByOther, blockedBySelf, unblockedBySelf } = markers;
	if (blockedByOther == null || blockedBySelf == null) return false;
	if (blockedByOther <= blockedBySelf) return false;
	if (
		unblockedBySelf != null &&
		unblockedBySelf > blockedBySelf &&
		unblockedBySelf < blockedByOther
	) {
		return false;
	}
	return true;
}
