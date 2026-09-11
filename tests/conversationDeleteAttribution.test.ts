import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as chatDb from "../src/services/chatDb";
import {
	markConversationDeleteHandled,
	toggleArchiveOnConversationDelete,
} from "../src/services/conversationArchive";

const store = new Map<string, string>();
const dispatched: { type: string; detail: unknown }[] = [];
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
	dispatchEvent: (event: Event) => {
		dispatched.push({ type: event.type, detail: (event as CustomEvent).detail });
		return true;
	},
};

const USER_ID = 1;

type Harness = ReturnType<typeof mockChatDb>;

function mockChatDb(otherProfileId: string) {
	const spies = {
		getConversation: spyOn(chatDb, "getConversation").mockImplementation(
			async (conversationId: string) =>
				({
					conversationId,
					otherProfileId,
					blockState: null,
					archived: false,
					archivedReason: null,
				}) as unknown as Awaited<ReturnType<typeof chatDb.getConversation>>,
		),
		backfillOtherProfileId: spyOn(chatDb, "backfillOtherProfileId").mockResolvedValue(undefined),
		setConversationArchived: spyOn(chatDb, "setConversationArchived").mockResolvedValue(undefined),
		setBlockState: spyOn(chatDb, "setBlockState").mockResolvedValue(undefined),
		insertSystemMessage: spyOn(chatDb, "insertSystemMessage").mockImplementation(
			async (conversationId: string, type: string) =>
				({
					messageId: `local-system:${type}:${conversationId}`,
					conversationId,
					senderId: 0,
					timestamp: Date.now(),
					type,
					body: null,
				}) as unknown as Awaited<ReturnType<typeof chatDb.insertSystemMessage>>,
		),
	};
	return {
		...spies,
		restore: () => {
			for (const spy of Object.values(spies)) spy.mockRestore();
		},
	};
}

function counterBlockEvents() {
	return dispatched.filter((event) => event.type === "fg:trigger-counter-block");
}

// Each test uses its own conversation: the handler deliberately ignores a
// repeat event for the same conversation within a short window.
let nextOther = 500;

describe("conversation.delete attribution", () => {
	let harness: Harness | null = null;

	beforeEach(() => {
		store.clear();
		store.set("fg-autoblock-counter-block", "true");
		dispatched.length = 0;
	});

	afterEach(() => {
		harness?.restore();
		harness = null;
	});

	function fresh() {
		const other = String(nextOther++);
		harness = mockChatDb(other);
		return { conversationId: `${USER_ID}:${other}`, other, db: harness };
	}

	test("a delete for a profile that is still visible is not treated as a block", async () => {
		// This is what our own delete looks like when it arrives from another
		// device, and what an unblock looks like: their profile is visible.
		const { conversationId, db } = fresh();
		const result = await toggleArchiveOnConversationDelete(
			[conversationId],
			null,
			undefined,
			undefined,
			async () => "accessible",
			USER_ID,
		);
		expect(db.setBlockState).not.toHaveBeenCalled();
		expect(db.setConversationArchived).not.toHaveBeenCalled();
		expect(db.insertSystemMessage).not.toHaveBeenCalled();
		expect(counterBlockEvents()).toEqual([]);
		expect(result.archived).toEqual([]);
		expect(result.systemMessages).toEqual([]);
	});

	test("a lookup that fails is not treated as a block", async () => {
		const { conversationId, db } = fresh();
		await toggleArchiveOnConversationDelete(
			[conversationId],
			null,
			undefined,
			undefined,
			async () => {
				throw new Error("network down");
			},
			USER_ID,
		);
		expect(db.setBlockState).not.toHaveBeenCalled();
		expect(db.insertSystemMessage).not.toHaveBeenCalled();
		expect(counterBlockEvents()).toEqual([]);
	});

	test("a lookup that says blocked records the block and hands it to counter-block", async () => {
		const { conversationId, other, db } = fresh();
		const result = await toggleArchiveOnConversationDelete(
			[conversationId],
			null,
			undefined,
			undefined,
			async () => "blocked",
			USER_ID,
		);
		expect(db.setBlockState).toHaveBeenCalledWith(conversationId, "blocked_by_other");
		expect(db.setConversationArchived).toHaveBeenCalledWith(conversationId, true, "ws_delete");
		expect(db.insertSystemMessage).toHaveBeenCalledWith(conversationId, "SystemBlocked");
		expect(result.archived).toEqual([conversationId]);
		expect(counterBlockEvents()).toEqual([
			{ type: "fg:trigger-counter-block", detail: { profileId: other, conversationId } },
		]);
	});

	test("a deleted or banned account is archived as not found, never as a block", async () => {
		const { conversationId, db } = fresh();
		await toggleArchiveOnConversationDelete(
			[conversationId],
			null,
			undefined,
			undefined,
			async () => "not_found",
			USER_ID,
		);
		expect(db.setConversationArchived).toHaveBeenCalledWith(conversationId, true, "not_found");
		expect(db.setBlockState).not.toHaveBeenCalled();
		expect(db.insertSystemMessage).not.toHaveBeenCalled();
		expect(counterBlockEvents()).toEqual([]);
	});

	test("the echo of a delete this device just made is ignored outright", async () => {
		const { conversationId, db } = fresh();
		let lookups = 0;
		markConversationDeleteHandled(conversationId);
		await toggleArchiveOnConversationDelete(
			[conversationId],
			null,
			undefined,
			undefined,
			async () => {
				lookups += 1;
				return "blocked";
			},
			USER_ID,
		);
		expect(lookups).toBe(0);
		expect(db.getConversation).not.toHaveBeenCalled();
		expect(db.setBlockState).not.toHaveBeenCalled();
	});
});
