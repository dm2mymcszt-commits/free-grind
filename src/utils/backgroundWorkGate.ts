/**
 * TEMPORARY, part of the iOS restart diagnostics (see diagnostics.ts).
 *
 * Every restart starts the background work — the view and inbox scanners, the
 * inbox and taps sync, Drive catch-up — again from where the killed run left
 * off, so if one of them is what gets the page killed, the app never gets to
 * stay up. After repeated restarts diagnostics.ts opens a pause window, and
 * while it is open that work waits until the user resumes it. If the restarts
 * stop, background work is the cause; if they don't, it isn't.
 */

import { useSyncExternalStore } from "react";

export const SAFE_MODE_UNTIL_KEY = "fg-diag-safe-mode-until";

let paused: boolean | null = null;
const listeners = new Set<() => void>();

function readPaused(): boolean {
	if (paused === null) {
		try {
			paused = Number(window.localStorage.getItem(SAFE_MODE_UNTIL_KEY) ?? 0) > Date.now();
		} catch {
			paused = false;
		}
	}
	return paused;
}

export function isBackgroundWorkPaused(): boolean {
	return readPaused();
}

export function resumeBackgroundWork(): void {
	try {
		window.localStorage.removeItem(SAFE_MODE_UNTIL_KEY);
	} catch {
		// The in-memory switch below is what the running session reads.
	}
	if (!readPaused()) return;
	paused = false;
	for (const listener of listeners) listener();
}

export function subscribeBackgroundWork(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Runs `work` now, or once background work is resumed. Returns a cancel function. */
export function whenBackgroundWorkAllowed(work: () => void): () => void {
	if (!readPaused()) {
		work();
		return () => undefined;
	}
	const unsubscribe = subscribeBackgroundWork(() => {
		unsubscribe();
		work();
	});
	return unsubscribe;
}

export function useBackgroundWorkPaused(): boolean {
	return useSyncExternalStore(subscribeBackgroundWork, readPaused, () => false);
}
