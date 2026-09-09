import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as chatDb from "../src/services/chatDb";
import { reconcileCounterBlocks } from "../src/services/conversationArchive";

const store = new Map<string, string>();
const globalScope = globalThis as unknown as { window?: unknown };
const previousWindow = globalScope.window;
// bun shares one global across test files; put it back so a later suite does
// not take a browser code path because of this one.
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
	},
	dispatchEvent: () => true,
};

type StoredShape = Awaited<ReturnType<typeof chatDb.listConversations>>[number];

function conversation(overrides: Partial<StoredShape>): StoredShape {
	return {
		conversationId: "1:2",
		otherProfileId: "2",
		blockState: null,
		archived: false,
		...overrides,
	} as StoredShape;
}

function setup(options: {
	stored?: StoredShape[];
	missing?: StoredShape[];
}) {
	const listConversations = spyOn(chatDb, "listConversations").mockResolvedValue(
		options.stored ?? [],
	);
	const listMissing = spyOn(chatDb, "listConversationsMissingFromInbox").mockResolvedValue(
		options.missing ?? [],
	);
	const blocked: string[] = [];
	const blockProfile = async (profileId: string) => {
		blocked.push(profileId);
	};
	return {
		blocked,
		blockProfile,
		restore: () => {
			listMissing.mockRestore();
			listConversations.mockRestore();
		},
		listMissing,
	};
}

describe("counter-block reconciliation", () => {
	beforeEach(() => {
		store.clear();
		store.set("fg-autoblock-counter-block", "true");
	});

	test("blocks back someone attributed to the other party", async () => {
		const harness = setup({
			stored: [conversation({ conversationId: "1:2", otherProfileId: "2", blockState: "blocked_by_other" })],
		});
		try {
			const result = await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
			});
			expect(harness.blocked).toEqual(["2"]);
			expect(result.counterBlocked).toEqual(["2"]);
		} finally {
			harness.restore();
		}
	});

	test("does nothing while the setting is off", async () => {
		store.set("fg-autoblock-counter-block", "false");
		const harness = setup({
			stored: [conversation({ blockState: "blocked_by_other" })],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
			});
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test("does not re-block someone this account already blocked", async () => {
		const harness = setup({
			stored: [conversation({ otherProfileId: "2", blockState: "blocked_by_other" })],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: ["2"],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
			});
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test("leaves conversations alone that were never attributed to a block", async () => {
		const harness = setup({
			stored: [
				conversation({ otherProfileId: "2", blockState: null }),
				conversation({ conversationId: "1:3", otherProfileId: "3", blockState: "blocked_by_me" }),
			],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
			});
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test("never reads the missing set without a complete inbox walk", async () => {
		const harness = setup({
			missing: [conversation({ conversationId: "1:9", otherProfileId: "9" })],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
			});
			// An incomplete walk cannot tell "gone" from "on a page we skipped".
			expect(harness.listMissing).not.toHaveBeenCalled();
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test.each([
		["accessible" as const],
		["not_found" as const],
	])("a conversation gone from the inbox is not blocked when the probe says %s", async (status) => {
		const harness = setup({
			missing: [conversation({ conversationId: "1:9", otherProfileId: "9" })],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
				missingFromInbox: {
					sweepStartedAt: 1,
					checkConversationAccessible: async () => status,
				},
			});
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test("a probe that throws is treated as accessible, never as a block", async () => {
		const harness = setup({
			missing: [conversation({ conversationId: "1:9", otherProfileId: "9" })],
		});
		try {
			await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: harness.blockProfile,
				missingFromInbox: {
					sweepStartedAt: 1,
					checkConversationAccessible: async () => {
						throw new Error("network down");
					},
				},
			});
			expect(harness.blocked).toEqual([]);
		} finally {
			harness.restore();
		}
	});

	test("a failed block is swallowed so the rest of the sweep still runs", async () => {
		const harness = setup({
			stored: [
				conversation({ conversationId: "1:2", otherProfileId: "2", blockState: "blocked_by_other" }),
				conversation({ conversationId: "1:3", otherProfileId: "3", blockState: "blocked_by_other" }),
			],
		});
		const attempted: string[] = [];
		try {
			const result = await reconcileCounterBlocks({
				blockedProfileIds: [],
				currentUserId: 1,
				blockProfile: async (profileId) => {
					attempted.push(profileId);
					if (profileId === "2") throw new Error("rejected");
				},
			});
			expect(attempted).toEqual(["2", "3"]);
			// Only the one that landed is reported; "2" keeps its blocked_by_other
			// state and is retried by the next sweep.
			expect(result.counterBlocked).toEqual(["3"]);
		} finally {
			harness.restore();
		}
	});
});
