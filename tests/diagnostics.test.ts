import { describe, expect, test } from "bun:test";
import { crashLoopPauseUntil, describeIpcRequest } from "../src/utils/diagnostics";

describe("describeIpcRequest", () => {
	test("names a database call by its query", () => {
		const body = JSON.stringify({ db: "sqlite:chat-1.sqlite3", query: "SELECT * FROM messages WHERE id = $1", values: [1] });
		expect(describeIpcRequest("ipc://localhost/plugin%3Asql%7Cselect", body)).toEqual({
			label: "plugin:sql|select SELECT * FROM messages WHERE id = $1",
			requestBytes: body.length,
		});
	});

	test("names a Grindr request by its path", () => {
		const body = JSON.stringify({ method: "GET", path: "/v4/inbox?page=1" });
		expect(describeIpcRequest("ipc://localhost/request", body).label).toBe("request /v4/inbox?page=1");
	});

	test("measures a binary body without reading it", () => {
		expect(describeIpcRequest("ipc://localhost/plugin%3Afs%7Cwrite_file", new Uint8Array(2048))).toEqual({
			label: "plugin:fs|write_file",
			requestBytes: 2048,
		});
	});
});

describe("crashLoopPauseUntil", () => {
	const now = 10_000_000;

	test("pauses after two restarts on screen within three minutes", () => {
		const restarts = [
			{ detectedAt: now, wasVisible: true },
			{ detectedAt: now - 20_000, wasVisible: true },
		];
		expect(crashLoopPauseUntil(restarts, now, 0)).toBe(now + 20 * 60 * 1000);
	});

	test("ignores a single restart, old ones, and ones in the background", () => {
		expect(crashLoopPauseUntil([{ detectedAt: now, wasVisible: true }], now, 0)).toBeNull();
		expect(
			crashLoopPauseUntil(
				[
					{ detectedAt: now, wasVisible: true },
					{ detectedAt: now - 4 * 60 * 1000, wasVisible: true },
				],
				now,
				0,
			),
		).toBeNull();
		expect(
			crashLoopPauseUntil(
				[
					{ detectedAt: now, wasVisible: true },
					{ detectedAt: now - 10_000, wasVisible: false },
				],
				now,
				0,
			),
		).toBeNull();
	});

	test("does not extend a pause that is still open", () => {
		const restarts = [
			{ detectedAt: now, wasVisible: true },
			{ detectedAt: now - 20_000, wasVisible: true },
		];
		expect(crashLoopPauseUntil(restarts, now, now + 60_000)).toBeNull();
	});
});
