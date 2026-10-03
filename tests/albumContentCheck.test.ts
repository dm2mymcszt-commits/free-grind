import { afterAll, beforeEach, describe, expect, test } from "bun:test";

// The detector is stood in for through window.__TAURI_INTERNALS__, as in
// contentCheck.test.ts: no module is replaced, and everything else Tauri is
// asked for (the database included) is refused.
type Detection = { label: string; score: number };

const store = new Map<string, string>();
let detectorCalls = 0;
let detectorAnswer: Detection[] | Error = [];

const globalScope = globalThis as unknown as { window?: unknown };
const previousWindow = globalScope.window;
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
	addEventListener: () => {},
	removeEventListener: () => {},
	__TAURI_INTERNALS__: {
		invoke: async (command: string) => {
			if (command !== "detect_image_content") {
				throw new Error(`no ${command} in this test`);
			}
			detectorCalls += 1;
			if (detectorAnswer instanceof Error) throw detectorAnswer;
			return { detections: detectorAnswer, imageWidth: 10, imageHeight: 10, elapsedMs: 1 };
		},
	},
};

const { setExplicitFilterEnabled, setExplicitVerdictHandler, verdictOf } = await import(
	"../src/services/contentCheck"
);
const { albumItemKey, checkAlbumItem, filterAlbumContent, getAlbumCover, getAlbumItemCover } = await import(
	"../src/services/albumContentCheck"
);

const EXPLICIT: Detection[] = [{ label: "MALE_GENITALIA_EXPOSED", score: 0.9 }];
// "/9j/" is how a JPEG starts in base64, "AAAAIGZ0eXBpc29t" an MP4.
const JPEG = { base64: "/9j/4AAQSkZJRgABAQ", mimeType: "image/jpeg" };
const MP4 = { base64: "AAAAIGZ0eXBpc29tAAACAGlzb21pc28y", mimeType: "video/mp4" };

let nextAlbum = 9000;
function item(albumId: number, contentId: number, overrides: Partial<Parameters<typeof checkAlbumItem>[0]> = {}) {
	return {
		albumId,
		contentId,
		contentType: "image/jpeg",
		main: JPEG,
		preview: null,
		messageId: `album-message-${albumId}`,
		conversationId: "1:2",
		...overrides,
	};
}

describe("album items", () => {
	const announced: string[] = [];

	beforeEach(() => {
		store.clear();
		setExplicitFilterEnabled(true);
		detectorCalls = 0;
		detectorAnswer = [];
		announced.length = 0;
		nextAlbum += 1;
		setExplicitVerdictHandler((event) => {
			announced.push(`${event.messageId}:${event.check.mediaKey}`);
		});
	});

	test("an explicit item is covered and announced with the message that shared the album", async () => {
		detectorAnswer = EXPLICIT;
		const check = await checkAlbumItem(item(nextAlbum, 1));
		expect(verdictOf(check)).toBe("explicit");
		expect(getAlbumItemCover(nextAlbum, 1)).toBe("explicit");
		expect(announced).toEqual([`album-message-${nextAlbum}:${albumItemKey(nextAlbum, 1)}`]);
	});

	test("a clear item is shown and announces nothing", async () => {
		await checkAlbumItem(item(nextAlbum, 1));
		expect(getAlbumItemCover(nextAlbum, 1)).toBeNull();
		expect(announced).toEqual([]);
	});

	test("an item nobody checked is covered", () => {
		expect(getAlbumItemCover(nextAlbum, 77)).toBe("unchecked");
	});

	test("an album nobody has looked into keeps its cover hidden", () => {
		expect(getAlbumCover(nextAlbum)).toBe("unchecked");
	});

	test("a video's still preview is what gets checked, not the video", async () => {
		detectorAnswer = EXPLICIT;
		const check = await checkAlbumItem(
			item(nextAlbum, 1, { contentType: "video/mp4", main: MP4, preview: JPEG }),
		);
		expect(check?.kind).toBe("image");
		expect(detectorCalls).toBe(1);
	});

	test("an item with no bytes at all cannot be checked", async () => {
		expect(await checkAlbumItem(item(nextAlbum, 1, { main: null, preview: null }))).toBeNull();
		expect(detectorCalls).toBe(0);
		expect(getAlbumItemCover(nextAlbum, 1)).toBe("unchecked");
	});

	test("a detector failure leaves the item covered", async () => {
		detectorAnswer = new Error("could not decode image");
		expect(await checkAlbumItem(item(nextAlbum, 1))).toBeNull();
		expect(getAlbumItemCover(nextAlbum, 1)).toBe("unchecked");
	});
});

describe("filterAlbumContent", () => {
	beforeEach(() => {
		store.clear();
		setExplicitFilterEnabled(true);
		detectorAnswer = [];
		nextAlbum += 1;
		setExplicitVerdictHandler(null);
	});

	const content = [{ contentId: 1 }, { contentId: 2 }, { contentId: 3 }];

	test("only cleared items are let through; explicit and unchecked ones are counted", async () => {
		await checkAlbumItem(item(nextAlbum, 1));
		detectorAnswer = EXPLICIT;
		await checkAlbumItem(item(nextAlbum, 2));
		const result = filterAlbumContent(nextAlbum, content, false);
		expect(result.content).toEqual([{ contentId: 1 }]);
		expect(result.hiddenCount).toBe(2);
	});

	test("the account's own album is shown whole", () => {
		const result = filterAlbumContent(nextAlbum, content, true);
		expect(result.content).toHaveLength(3);
		expect(result.hiddenCount).toBe(0);
	});

	test("with the filter off everything is shown", () => {
		setExplicitFilterEnabled(false);
		const result = filterAlbumContent(nextAlbum, content, false);
		expect(result.content).toHaveLength(3);
		expect(result.hiddenCount).toBe(0);
	});
});
