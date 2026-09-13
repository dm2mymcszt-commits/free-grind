import { afterEach, expect, test } from "bun:test";

const globals = globalThis as { window?: unknown };
const originalWindow = globals.window;

afterEach(() => {
	// Other files check `typeof window` to decide whether they run in a browser.
	globals.window = originalWindow;
});

test("work waits while paused and runs once resumed", async () => {
	const storage = new Map<string, string>([["fg-diag-safe-mode-until", String(Date.now() + 60_000)]]);
	globals.window = {
		localStorage: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
		},
	};

	const gate = await import("../src/utils/backgroundWorkGate");
	expect(gate.isBackgroundWorkPaused()).toBe(true);

	const ran: string[] = [];
	gate.whenBackgroundWorkAllowed(() => ran.push("kept"));
	const cancel = gate.whenBackgroundWorkAllowed(() => ran.push("cancelled"));
	cancel();
	expect(ran).toEqual([]);

	gate.resumeBackgroundWork();
	expect(ran).toEqual(["kept"]);
	expect(gate.isBackgroundWorkPaused()).toBe(false);
	expect(storage.has("fg-diag-safe-mode-until")).toBe(false);

	gate.whenBackgroundWorkAllowed(() => ran.push("immediate"));
	expect(ran).toEqual(["kept", "immediate"]);
});
