import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// autoblock.ts pulls in the Tauri notification plugin and the chat database
// purely for the notify/persist halves of the module. The keyword matcher
// itself touches neither, so stub them rather than stand up a runtime.
mock.module("@tauri-apps/plugin-notification", () => ({
	isPermissionGranted: async () => false,
	requestPermission: async () => "denied",
	sendNotification: () => {},
}));
mock.module("../src/services/tauriWebSocket", () => ({ isTauriRuntime: () => false }));
mock.module("../src/services/chatDb", () => ({
	getSetting: async () => null,
	setSetting: async () => {},
}));

const store = new Map<string, string>();
const globalScope = globalThis as unknown as { window?: unknown };
const previousWindow = globalScope.window;
// Bun shares one global object across test files, and a bare `window` is
// enough to make DOM-sniffing libraries in later files take their browser
// path and then reach for `document`. Put it back when this file is done.
afterAll(() => {
	if (previousWindow === undefined) delete globalScope.window;
	else globalScope.window = previousWindow;
});
globalScope.window = {
	localStorage: {
		getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
	},
	dispatchEvent: () => true,
};

const { getMatchedForbiddenWord, hasRightNowStatus } = await import("../src/utils/autoblock");

function setKeywords(list: string): void {
	store.set("fg-forbidden-words", list);
}

describe("forbidden keyword matching", () => {
	beforeEach(() => {
		store.clear();
	});

	test("matches a display name that is exactly the keyword", () => {
		setKeywords("fem, femboy, chaud");
		expect(getMatchedForbiddenWord("fem", "name")).toBe("fem");
		expect(getMatchedForbiddenWord("Fem", "name")).toBe("fem");
		expect(getMatchedForbiddenWord(" fem ", "name")).toBe("fem");
	});

	test("still requires a whole word, so it cannot block by accident", () => {
		setKeywords("fem, sub");
		expect(getMatchedForbiddenWord("femboy", "name")).toBeNull();
		expect(getMatchedForbiddenWord("submit", "message")).toBeNull();
		expect(getMatchedForbiddenWord("confemination", "bio")).toBeNull();
	});

	test("a keyword the engine cannot compile does not disable the rest of the list", () => {
		// A lone surrogate — what a truncated emoji in a pasted or imported
		// list looks like — is rejected outright by the unicode-mode regex.
		setKeywords(`fem, \uD800, chaud`);
		expect(getMatchedForbiddenWord("fem", "name")).toBe("fem");
		expect(getMatchedForbiddenWord("chaud", "message")).toBe("chaud");
	});

	test("editing the list takes effect on the next check", () => {
		setKeywords("chaud");
		expect(getMatchedForbiddenWord("fem", "name")).toBeNull();
		setKeywords("chaud, fem");
		expect(getMatchedForbiddenWord("fem", "name")).toBe("fem");
	});

	test("the per-field toggles still gate their own field only", () => {
		setKeywords("fem");
		store.set("fg-block-name", "false");
		expect(getMatchedForbiddenWord("fem", "name")).toBeNull();
		expect(getMatchedForbiddenWord("fem", "bio")).toBe("fem");
	});
});

// The inbox entry carries only the RightNowStatus string, so these three
// values are the whole input space this check sees there.
describe("right now status", () => {
	beforeEach(() => {
		store.clear();
		store.set("fg-block-right-now", "true");
	});

	test("only an active hosting status counts", () => {
		expect(hasRightNowStatus({ rightNow: "HOSTING" })).toBe(true);
		expect(hasRightNowStatus({ rightNow: "NOT_HOSTING" })).toBe(true);
	});

	test("NOT_ACTIVE and a missing status never count", () => {
		expect(hasRightNowStatus({ rightNow: "NOT_ACTIVE" })).toBe(false);
		expect(hasRightNowStatus({ rightNow: null })).toBe(false);
		expect(hasRightNowStatus({})).toBe(false);
	});

	test("the setting still gates it", () => {
		store.set("fg-block-right-now", "false");
		expect(hasRightNowStatus({ rightNow: "HOSTING" })).toBe(false);
	});
});
