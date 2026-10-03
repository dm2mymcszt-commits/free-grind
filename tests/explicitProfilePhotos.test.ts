import { afterAll, beforeEach, describe, expect, test } from "bun:test";

const store = new Map<string, string>();
const globalScope = globalThis as unknown as { window?: unknown };
const previousWindow = globalScope.window;
afterAll(() => {
	if (previousWindow === undefined) delete globalScope.window;
	else globalScope.window = previousWindow;
});
// One hash already on record, as after a restart.
store.set("fg-explicit-profile-photos", JSON.stringify(["a".repeat(40)]));
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
	addEventListener: () => {},
	removeEventListener: () => {},
	// Present, so the app counts as running inside Tauri.
	__TAURI_INTERNALS__: { invoke: async () => { throw new Error("not in this test"); } },
};

const { isExplicitProfilePhoto, rememberExplicitProfilePhoto, subscribeToExplicitProfilePhotos } = await import(
	"../src/services/explicitProfilePhotos"
);

const REMEMBERED = "a".repeat(40);
const NEW = "b".repeat(40);
const OTHER = "c".repeat(40);

describe("explicit profile photos", () => {
	beforeEach(() => {
		store.set("fg-explicit-filter", "true");
	});

	test("a photo on record from an earlier session is left out from the first render", () => {
		expect(isExplicitProfilePhoto(REMEMBERED)).toBe(true);
	});

	test("any other photo is drawn as before", () => {
		expect(isExplicitProfilePhoto(OTHER)).toBe(false);
		expect(isExplicitProfilePhoto(null)).toBe(false);
	});

	test("a photo newly found explicit is remembered, kept across restarts, and announced once", () => {
		let announced = 0;
		const unsubscribe = subscribeToExplicitProfilePhotos(() => {
			announced += 1;
		});
		rememberExplicitProfilePhoto(NEW);
		rememberExplicitProfilePhoto(NEW);
		unsubscribe();
		expect(announced).toBe(1);
		expect(isExplicitProfilePhoto(NEW)).toBe(true);
		expect(JSON.parse(store.get("fg-explicit-profile-photos")!)).toContain(NEW);
	});

	test("with the filter off nothing is left out", () => {
		store.set("fg-explicit-filter", "false");
		expect(isExplicitProfilePhoto(REMEMBERED)).toBe(false);
	});
});
