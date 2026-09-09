import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// autoblock.ts imports the Tauri notification plugin for the notify half of
// the module, which has no browserless implementation to import. `mock.module`
// is process-wide and permanent in bun — it replaces the module for every file
// that runs afterwards too — so stub the one thing that genuinely cannot be
// loaded and nothing else. In particular chatDb must NOT be stubbed here: the
// Drive-sync and backup suites import the real one, and a partial stub of it
// silently strips exports out from under them.
mock.module("@tauri-apps/plugin-notification", () => ({
	isPermissionGranted: async () => false,
	requestPermission: async () => "denied",
	sendNotification: () => {},
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

const { getMatchedForbiddenWord, getMatchedFirstMessageWord, hasRightNowStatus } =
	await import("../src/utils/autoblock");

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

// The openers list exists precisely because these words are unremarkable in
// the middle of a conversation — matching must be the whole message, not a
// substring, or it collapses back into the forbidden-keywords rule.
describe("first-message-only openers", () => {
	beforeEach(() => {
		store.clear();
		store.set("fg-first-message-words", "hot, hey sexy, ?");
	});

	test("matches an opener that is exactly the entry", () => {
		expect(getMatchedFirstMessageWord("hot")).toBe("hot");
		expect(getMatchedFirstMessageWord("Hot")).toBe("hot");
		expect(getMatchedFirstMessageWord("  Hot  ")).toBe("hot");
		expect(getMatchedFirstMessageWord("hey sexy")).toBe("hey sexy");
	});

	test("ignores the punctuation people put around a one-word opener", () => {
		expect(getMatchedFirstMessageWord("Hot!")).toBe("hot");
		expect(getMatchedFirstMessageWord("hot...")).toBe("hot");
		expect(getMatchedFirstMessageWord("*hot*")).toBe("hot");
		expect(getMatchedFirstMessageWord("?")).toBe("?");
	});

	test("does not match when the word is only part of the message", () => {
		expect(getMatchedFirstMessageWord("Hello, hot")).toBeNull();
		expect(getMatchedFirstMessageWord("hot?? you free")).toBeNull();
		expect(getMatchedFirstMessageWord("you look hot")).toBeNull();
		expect(getMatchedFirstMessageWord("hotel")).toBeNull();
	});

	test("is independent of the forbidden keyword list", () => {
		store.clear();
		store.set("fg-forbidden-words", "hot");
		expect(getMatchedFirstMessageWord("hot")).toBeNull();
	});

	test("an empty list matches nothing", () => {
		store.clear();
		expect(getMatchedFirstMessageWord("hot")).toBeNull();
		expect(getMatchedFirstMessageWord("")).toBeNull();
	});
});
