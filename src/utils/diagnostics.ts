/**
 * TEMPORARY diagnostics for the iOS reloads. Remove once they are confirmed
 * gone, together with SettingsDiagnosticsPage, DiagnosticsHud and the
 * recordBlockEvent calls.
 *
 * iOS kills an out-of-memory web content process without warning — no
 * pagehide, no beforeunload — and the page simply starts again. So every run
 * keeps leaving a heartbeat behind, and a start that finds the previous run
 * never said goodbye records an unexpected restart, together with the last
 * snapshot of what that run was holding.
 */

import { getCacheStats } from "./boundedCache";

const STATE_KEY = "fg-diag-state";
const RESTARTS_KEY = "fg-diag-restarts";
const BLOCKS_KEY = "fg-diag-blocks";
export const DIAGNOSTICS_HUD_KEY = "fg-diag-hud";
export const DIAGNOSTICS_HUD_EVENT = "fg-diag-hud-changed";

const HEARTBEAT_MS = 4000;
const MAX_RESTARTS = 40;
const MAX_BLOCKS = 40;
const MAX_ERRORS = 12;
const MAX_ACTIVITIES = 12;
const MB = 1024 * 1024;

export type DiagnosticsSnapshot = {
	at: number;
	route: string;
	visibility: string;
	uptimeMs: number;
	cacheMb: number;
	caches: { name: string; entries: number; mb: number; limitMb: number }[];
	domNodes: number;
	images: number;
	videos: number;
	jsHeapMb: number | null;
};

export type RecentError = { at: number; message: string };
export type RecentActivity = { at: number; label: string };

type DiagnosticsState = {
	startedAt: number;
	lastBeatAt: number;
	cleanExit: boolean;
	snapshot: DiagnosticsSnapshot | null;
	errors: RecentError[];
	activities: RecentActivity[];
};

export type RestartRecord = {
	detectedAt: number;
	previousStartedAt: number;
	lastBeatAt: number;
	uptimeMs: number;
	/** False when the previous run was last seen in the background, where iOS may kill apps anyway. */
	wasVisible: boolean;
	snapshot: DiagnosticsSnapshot | null;
	errors: RecentError[];
	/** The last heavy things the run started, newest first: what it was doing when it died. */
	activities: RecentActivity[];
};

export type BlockRecord = {
	at: number;
	source: string;
	profileId: string;
	detail: string | null;
};

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function writeJson(key: string, value: unknown): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Diagnostics must never be what breaks the app.
	}
}

function roundMb(bytes: number): number {
	return Math.round((bytes / MB) * 10) / 10;
}

export function takeSnapshot(startedAt: number): DiagnosticsSnapshot {
	const caches = getCacheStats().map((cache) => ({
		name: cache.name,
		entries: cache.entries,
		mb: roundMb(cache.chars),
		limitMb: roundMb(cache.maxChars),
	}));
	const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
	const now = Date.now();
	return {
		at: now,
		route: window.location.pathname,
		visibility: document.visibilityState,
		uptimeMs: now - startedAt,
		cacheMb: Math.round(caches.reduce((sum, cache) => sum + cache.mb, 0) * 10) / 10,
		caches,
		domNodes: document.getElementsByTagName("*").length,
		images: document.images.length,
		videos: document.getElementsByTagName("video").length,
		jsHeapMb: memory ? roundMb(memory.usedJSHeapSize) : null,
	};
}

let state: DiagnosticsState | null = null;

export function installDiagnostics(): void {
	if (state || typeof window === "undefined") {
		return;
	}

	const previous = readJson<DiagnosticsState | null>(STATE_KEY, null);
	if (previous && !previous.cleanExit) {
		const restarts = readJson<RestartRecord[]>(RESTARTS_KEY, []);
		restarts.unshift({
			detectedAt: Date.now(),
			previousStartedAt: previous.startedAt,
			lastBeatAt: previous.lastBeatAt,
			uptimeMs: previous.lastBeatAt - previous.startedAt,
			wasVisible: previous.snapshot?.visibility === "visible",
			snapshot: previous.snapshot,
			errors: previous.errors ?? [],
			activities: previous.activities ?? [],
		});
		writeJson(RESTARTS_KEY, restarts.slice(0, MAX_RESTARTS));
	}

	const startedAt = Date.now();
	const current: DiagnosticsState = {
		startedAt,
		lastBeatAt: startedAt,
		cleanExit: false,
		snapshot: null,
		errors: [],
		activities: [],
	};
	state = current;

	const beat = () => {
		current.lastBeatAt = Date.now();
		try {
			current.snapshot = takeSnapshot(startedAt);
		} catch {
			// Keep the previous snapshot.
		}
		writeJson(STATE_KEY, current);
	};

	beat();
	window.setInterval(beat, HEARTBEAT_MS);
	document.addEventListener("visibilitychange", beat);
	window.addEventListener("pagehide", () => {
		current.cleanExit = true;
		writeJson(STATE_KEY, current);
	});
	// A page brought back from the back/forward cache is running again.
	window.addEventListener("pageshow", () => {
		current.cleanExit = false;
		beat();
	});

	const recordError = (message: string) => {
		current.errors = [{ at: Date.now(), message: message.slice(0, 300) }, ...current.errors].slice(
			0,
			MAX_ERRORS,
		);
	};
	window.addEventListener("error", (event) => recordError(`Error: ${event.message}`));
	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason;
		recordError(`Rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
	});
}

/**
 * Notes a heavy step as it starts, saved at once rather than with the next
 * heartbeat: iOS kills the process mid-step without warning, so the last
 * entry left behind names what was running.
 */
export function markActivity(label: string): void {
	if (!state) {
		return;
	}
	state.activities = [{ at: Date.now(), label: label.slice(0, 160) }, ...state.activities].slice(
		0,
		MAX_ACTIVITIES,
	);
	writeJson(STATE_KEY, state);
}

export function getSessionStartedAt(): number {
	return state?.startedAt ?? Date.now();
}

export function getRestarts(): RestartRecord[] {
	return readJson<RestartRecord[]>(RESTARTS_KEY, []);
}

export function getBlockEvents(): BlockRecord[] {
	return readJson<BlockRecord[]>(BLOCKS_KEY, []);
}

/** Notes what blocked whom, so a block nobody can explain can be traced to its source. */
export function recordBlockEvent(source: string, profileId: string | number, detail?: string | null): void {
	if (typeof window === "undefined") {
		return;
	}
	const events = readJson<BlockRecord[]>(BLOCKS_KEY, []);
	events.unshift({ at: Date.now(), source, profileId: String(profileId), detail: detail ?? null });
	writeJson(BLOCKS_KEY, events.slice(0, MAX_BLOCKS));
}

export function clearDiagnostics(): void {
	try {
		window.localStorage.removeItem(RESTARTS_KEY);
		window.localStorage.removeItem(BLOCKS_KEY);
	} catch {
		// Nothing to clear.
	}
}

export function isDiagnosticsHudEnabled(): boolean {
	try {
		return window.localStorage.getItem(DIAGNOSTICS_HUD_KEY) === "true";
	} catch {
		return false;
	}
}

export function setDiagnosticsHudEnabled(enabled: boolean): void {
	try {
		window.localStorage.setItem(DIAGNOSTICS_HUD_KEY, String(enabled));
	} catch {
		// The overlay just stays as it was.
	}
	window.dispatchEvent(new Event(DIAGNOSTICS_HUD_EVENT));
}

export function buildDiagnosticsReport(): string {
	return JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			userAgent: navigator.userAgent,
			current: takeSnapshot(getSessionStartedAt()),
			restarts: getRestarts(),
			blocks: getBlockEvents(),
		},
		null,
		2,
	);
}
