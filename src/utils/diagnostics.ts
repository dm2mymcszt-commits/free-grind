/**
 * TEMPORARY diagnostics for the iOS reloads. Remove once they are confirmed
 * gone, together with SettingsDiagnosticsPage, DiagnosticsHud, the
 * recordBlockEvent and markActivity calls, backgroundWorkGate.ts with its
 * BackgroundPausedBanner, and WebContentTerminations.swift.
 *
 * iOS kills an out-of-memory web content process without warning — no
 * pagehide, no beforeunload — and the page simply starts again. So every run
 * keeps leaving a heartbeat behind, and a start that finds the previous run
 * never said goodbye records an unexpected restart, together with the last
 * snapshot of what that run was holding.
 */

import { getCacheStats } from "./boundedCache";
import { isBackgroundWorkPaused, SAFE_MODE_UNTIL_KEY } from "./backgroundWorkGate";

const STATE_KEY = "fg-diag-state";
const RESTARTS_KEY = "fg-diag-restarts";
const BLOCKS_KEY = "fg-diag-blocks";
export const DIAGNOSTICS_HUD_KEY = "fg-diag-hud";
export const DIAGNOSTICS_HUD_EVENT = "fg-diag-hud-changed";
export const NATIVE_TERMINATIONS_EVENT = "fg:native-terminations";

const HEARTBEAT_MS = 4000;
const MAX_RESTARTS = 40;
const MAX_BLOCKS = 40;
const MAX_ERRORS = 12;
const MAX_ACTIVITIES = 12;
const MB = 1024 * 1024;

/** Restarts on screen this close together are a crash loop, not bad luck. */
const CRASH_LOOP_WINDOW_MS = 3 * 60 * 1000;
const CRASH_LOOP_RESTARTS = 2;
const SAFE_MODE_MS = 20 * 60 * 1000;

const MAX_RECENT_CALLS = 25;
const MAX_IN_FLIGHT_CALLS = 15;
const MAX_LARGEST_CALLS = 6;
/** Saves of the call list are coalesced to this; a heavy call that is still running is caught by the next one. */
const CALL_SAVE_THROTTLE_MS = 250;

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
	/** Whether the crash-loop pause was holding background work back. */
	backgroundPaused?: boolean;
};

export type RecentError = { at: number; message: string };
export type RecentActivity = { at: number; label: string };

/**
 * One call from the page to the native side: a Rust command, a database
 * query, a Grindr request. The page is killed while it holds or unpacks a
 * result far more often than while it computes, so these name the suspect.
 */
export type IpcCall = {
	label: string;
	startedAt: number;
	ms?: number;
	requestKb?: number;
	responseKb?: number;
	failed?: boolean;
};

export type IpcCallLog = {
	/** Started and not yet unpacked when the snapshot was saved. */
	inFlight: IpcCall[];
	recent: IpcCall[];
	/** The biggest results this run, largest first. */
	largest: IpcCall[];
};

export type NativeTermination = {
	at: number;
	reason: string;
	code: number;
	appState: string;
};

type DiagnosticsState = {
	startedAt: number;
	lastBeatAt: number;
	cleanExit: boolean;
	snapshot: DiagnosticsSnapshot | null;
	errors: RecentError[];
	activities: RecentActivity[];
	calls?: IpcCallLog;
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
	calls?: IpcCallLog;
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
		backgroundPaused: isBackgroundWorkPaused(),
	};
}

let state: DiagnosticsState | null = null;

function toKb(bytes: number): number {
	return Math.round(bytes / 102.4) / 10;
}

/** Names an IPC fetch by its command, plus the query or request path when the body carries one. */
export function describeIpcRequest(url: string, body: unknown): { label: string; requestBytes: number } {
	let command = url.replace(/^ipc:\/\/localhost\//, "");
	try {
		command = decodeURIComponent(command);
	} catch {
		// Keep it encoded.
	}
	let requestBytes = 0;
	let head = "";
	if (typeof body === "string") {
		requestBytes = body.length;
		head = body.slice(0, 1500);
	} else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
		requestBytes = body.byteLength;
	}
	// The query or request path says far more than the command name.
	const detail = /"(?:query|path)"\s*:\s*"((?:[^"\\]|\\.){0,120})/.exec(head)?.[1];
	return { label: detail ? `${command} ${detail}` : command, requestBytes };
}

/**
 * When a crash loop should pause background work until, or null. An open
 * pause is left alone, so restarts while paused do not keep extending it.
 */
export function crashLoopPauseUntil(
	restarts: readonly Pick<RestartRecord, "detectedAt" | "wasVisible">[],
	now: number,
	pausedUntil: number,
): number | null {
	if (pausedUntil > now) return null;
	const loop = restarts.filter(
		(restart) => restart.wasVisible && now - restart.detectedAt <= CRASH_LOOP_WINDOW_MS,
	);
	return loop.length >= CRASH_LOOP_RESTARTS ? now + SAFE_MODE_MS : null;
}

/**
 * Wraps fetch to watch Tauri's IPC, which on iOS travels as fetches to
 * ipc://localhost/<command>. A call counts as finished only once its result
 * has been unpacked, since unpacking is where a huge result costs memory.
 */
function installIpcTrace(current: DiagnosticsState): void {
	const originalFetch = window.fetch;
	if (typeof originalFetch !== "function") return;

	const log: IpcCallLog = { inFlight: [], recent: [], largest: [] };
	current.calls = log;
	const pending = new Map<number, IpcCall>();
	const responses = new WeakMap<Response, number>();
	let nextId = 0;
	let saveTimer: number | null = null;

	// Oldest first: a call that has been running longest is the likelier culprit.
	const refreshInFlight = () => {
		const oldest: IpcCall[] = [];
		for (const call of pending.values()) {
			if (oldest.length === MAX_IN_FLIGHT_CALLS) break;
			oldest.push(call);
		}
		log.inFlight = oldest;
	};

	const scheduleSave = () => {
		if (saveTimer !== null) return;
		saveTimer = window.setTimeout(() => {
			saveTimer = null;
			writeJson(STATE_KEY, current);
		}, CALL_SAVE_THROTTLE_MS);
	};

	const finish = (id: number, responseBytes: number | null, failed: boolean) => {
		const call = pending.get(id);
		if (!call) return;
		pending.delete(id);
		refreshInFlight();
		call.ms = Date.now() - call.startedAt;
		if (responseBytes != null) call.responseKb = toKb(responseBytes);
		if (failed) call.failed = true;
		log.recent = [call, ...log.recent].slice(0, MAX_RECENT_CALLS);
		if (responseBytes != null && responseBytes > 64 * 1024) {
			log.largest = [...log.largest, call]
				.sort((a, b) => (b.responseKb ?? 0) - (a.responseKb ?? 0))
				.slice(0, MAX_LARGEST_CALLS);
		}
		scheduleSave();
	};

	window.fetch = function tracedFetch(input: RequestInfo | URL, init?: RequestInit) {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (!url.startsWith("ipc://")) {
			return originalFetch.call(window, input, init);
		}

		const { label, requestBytes } = describeIpcRequest(url, init?.body);
		const id = nextId++;
		const call: IpcCall = { label, startedAt: Date.now() };
		if (requestBytes > 64 * 1024) call.requestKb = toKb(requestBytes);
		pending.set(id, call);
		refreshInFlight();
		// A big request can be the killer itself: save before it leaves.
		if (requestBytes > MB) {
			writeJson(STATE_KEY, current);
		} else {
			scheduleSave();
		}

		return originalFetch.call(window, input, init).then(
			(response) => {
				responses.set(response, id);
				return response;
			},
			(error: unknown) => {
				finish(id, null, true);
				throw error;
			},
		);
	} as typeof window.fetch;

	for (const method of ["arrayBuffer", "json", "text"] as const) {
		const original = Response.prototype[method] as (this: Response) => Promise<unknown>;
		Object.defineProperty(Response.prototype, method, {
			configurable: true,
			writable: true,
			value: function tracedRead(this: Response) {
				const id = responses.get(this);
				const result = original.call(this);
				if (id === undefined) return result;
				const declared = Number(this.headers.get("content-length"));
				return result.then(
					(value) => {
						const bytes = value instanceof ArrayBuffer ? value.byteLength : declared > 0 ? declared : null;
						finish(id, bytes, false);
						return value;
					},
					(error: unknown) => {
						finish(id, null, true);
						throw error;
					},
				);
			},
		});
	}
}

type NativeBridgeWindow = Window & {
	webkit?: { messageHandlers?: Record<string, { postMessage: (message: unknown) => void } | undefined> };
	__FG_NATIVE_TERMINATIONS__?: NativeTermination[];
};

/** The iOS build's native message handler, when this build has one. */
export function getNativeBridge(): { postMessage: (message: unknown) => void } | null {
	if (typeof window === "undefined") return null;
	return (window as NativeBridgeWindow).webkit?.messageHandlers?.fgNative ?? null;
}

/** Asks the native side for its record of why the web content process ended; arrives as NATIVE_TERMINATIONS_EVENT. */
export function requestNativeTerminations(): void {
	try {
		getNativeBridge()?.postMessage({ type: "terminations" });
	} catch {
		// Older builds have no handler.
	}
}

/** null when this build cannot tell, as distinct from an empty list. */
export function getNativeTerminations(): NativeTermination[] | null {
	if (typeof window === "undefined") return null;
	return (window as NativeBridgeWindow).__FG_NATIVE_TERMINATIONS__ ?? null;
}

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
			calls: previous.calls,
		});
		writeJson(RESTARTS_KEY, restarts.slice(0, MAX_RESTARTS));

		try {
			const pauseUntil = crashLoopPauseUntil(
				restarts,
				Date.now(),
				Number(window.localStorage.getItem(SAFE_MODE_UNTIL_KEY) ?? 0),
			);
			if (pauseUntil !== null) {
				window.localStorage.setItem(SAFE_MODE_UNTIL_KEY, String(pauseUntil));
			}
		} catch {
			// Without storage the app just runs normally.
		}
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
	installIpcTrace(current);
	requestNativeTerminations();

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
			currentCalls: state?.calls ?? null,
			// null: this build has no native record. Reasons come from WebKit; a
			// memory kill by iOS itself can still show up as "crash".
			nativeTerminations: getNativeTerminations(),
			restarts: getRestarts(),
			blocks: getBlockEvents(),
		},
		null,
		2,
	);
}
