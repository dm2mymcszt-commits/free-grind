import { Database as BunDatabase } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	createSyncOperation,
	createSyncPackage,
	type ImmutableSyncOperation,
	type JsonValue,
	type SyncSection,
} from "../src/services/cloudSync";
import {
	GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES,
	GoogleDriveSyncStore,
	type GoogleDriveSyncSqlDatabase,
} from "../src/services/googleDriveSyncStore";
import type { GoogleDriveSyncEntity } from "../src/services/googleDriveSyncData";

const PROFILE_ID = 12345;
const ACCOUNT = "acct-test-vault";
const LOCAL_DEVICE = "device-windows";
const REMOTE_DEVICE = "device-iphone";

class BunSqliteAdapter implements GoogleDriveSyncSqlDatabase {
	readonly path = ":memory:";
	readonly database: BunDatabase;
	readonly #closeDatabase: boolean;
	failNextShadowWrite = false;
	failNextShadowDelete = false;

	constructor(options: { closeDatabase?: boolean } = {}) {
		this.database = new BunDatabase(":memory:");
		this.#closeDatabase = options.closeDatabase ?? true;
	}

	async execute(query: string, bindValues: unknown[] = []) {
		if (this.failNextShadowWrite && /INSERT INTO sync_entity_shadow/i.test(query)) {
			this.failNextShadowWrite = false;
			throw new Error("injected shadow write failure");
		}
		if (this.failNextShadowDelete && /DELETE FROM sync_entity_shadow/i.test(query)) {
			this.failNextShadowDelete = false;
			throw new Error("injected shadow delete failure");
		}
		const result = this.database.query(query).run(...(bindValues as never[]));
		return {
			rowsAffected: result.changes,
			lastInsertId: Number(result.lastInsertRowid),
		};
	}

	async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
		return this.database.query(query).all(...(bindValues as never[])) as T;
	}

	async close(): Promise<void> {
		if (this.#closeDatabase) this.database.close();
	}
}

function entity(
	section: SyncSection,
	entityType: string,
	entityId: string,
	value: JsonValue,
): GoogleDriveSyncEntity {
	return { section, entityType, entityId, value };
}

async function openTestStore(options?: {
	adapter?: BunSqliteAdapter;
	applyOperation?: Parameters<typeof GoogleDriveSyncStore.open>[1] extends infer Options
		? Options extends { applyOperation?: infer Apply }
			? Apply
			: never
		: never;
}) {
	const adapter = options?.adapter ?? new BunSqliteAdapter();
	let openedUrl = "";
	const store = await GoogleDriveSyncStore.open(PROFILE_ID, {
		databaseFactory: async (databaseUrl) => {
			openedUrl = databaseUrl;
			return adapter;
		},
		applyOperation: options?.applyOperation,
	});
	expect(openedUrl).toBe(`sqlite:google-drive-sync-${PROFILE_ID}.sqlite3`);
	return { store, adapter };
}

async function reconcile(
	store: GoogleDriveSyncStore,
	entities: readonly GoogleDriveSyncEntity[],
	scannedSections: readonly SyncSection[] = ["core"],
) {
	return store.reconcileWithScanner({
		accountNamespace: ACCOUNT,
		sourceDeviceId: LOCAL_DEVICE,
		scannedSections,
		scan: async (onEntity) => {
			for (const current of entities) await onEntity(current);
		},
	});
}

async function readConversationShadow(
	adapter: BunSqliteAdapter,
	entityId: string,
): Promise<ImmutableSyncOperation | undefined> {
	const rows = await adapter.select<Array<{ winning_operation_json: string }>>(
		`SELECT winning_operation_json FROM sync_entity_shadow
		 WHERE account_namespace = ? AND section = 'core'
		   AND entity_type = 'conversation' AND entity_id = ?`,
		[ACCOUNT, entityId],
	);
	return rows[0]
		? (JSON.parse(rows[0].winning_operation_json) as ImmutableSyncOperation)
		: undefined;
}

describe("durable Google Drive reconciliation store", () => {
	test("emits changed rows and tombstones only after a completed scan", async () => {
		const { store } = await openTestStore();
		try {
			const firstEntities = [
				entity("core", "conversation", "one", { title: "One" }),
				entity("core", "conversation", "two", { title: "Two" }),
			];
			expect(await reconcile(store, firstEntities)).toEqual({
				createdUpserts: 2,
				createdTombstones: 0,
				unchangedEntities: 0,
				firstSequence: 1,
				lastSequence: 2,
			});
			expect(await reconcile(store, firstEntities)).toMatchObject({
				createdUpserts: 0,
				createdTombstones: 0,
				unchangedEntities: 2,
			});

			await expect(
				store.reconcileWithScanner({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					scannedSections: ["core"],
					scan: async (onEntity) => {
						await onEntity(firstEntities[0]);
						throw new Error("scan interrupted");
					},
				}),
			).rejects.toThrow("scan interrupted");
			expect((await store.getPendingCounts(ACCOUNT)).changes).toBe(2);

			const completed = await reconcile(store, [
				entity("core", "conversation", "one", { title: "One changed" }),
			]);
			expect(completed).toMatchObject({
				createdUpserts: 1,
				createdTombstones: 1,
				firstSequence: 3,
				lastSequence: 4,
			});
			const operations = await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE);
			expect(operations.map((operation) => operation.originSequence)).toEqual([1, 2, 3, 4]);
			expect(operations[3].mutation.kind).toBe("delete");
			expect(operations[3].entityId).toBe("two");
		} finally {
			await store.close();
		}
	});

	test("recovers an outbox-first crash without duplicating or skipping a sequence", async () => {
		const adapter = new BunSqliteAdapter();
		const { store } = await openTestStore({ adapter });
		try {
			adapter.failNextShadowWrite = true;
			await expect(
				reconcile(store, [entity("core", "conversation", "one", { title: "One" })]),
			).rejects.toThrow("injected shadow write failure");

			const recovered = await reconcile(store, [
				entity("core", "conversation", "one", { title: "One" }),
			]);
			expect(recovered.unchangedEntities).toBe(1);
			expect((await store.getPendingCounts(ACCOUNT)).changes).toBe(1);

			await reconcile(store, [entity("core", "conversation", "one", { title: "Changed" })]);
			const operations = await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE);
			expect(operations.map((operation) => operation.originSequence)).toEqual([1, 2]);
		} finally {
			await store.close();
		}
	});

	test("persists config and immutable outbound package progress", async () => {
		const { store } = await openTestStore();
		try {
			expect(await store.getLocalOriginSequence(ACCOUNT, LOCAL_DEVICE)).toBe(0);
			expect(await store.getConfig()).toEqual({
				enabled: false,
				accountNamespace: null,
				mediaPolicy: "off",
				lastSuccessfulSyncAt: null,
				lastError: null,
			});
			expect(
				await store.updateConfig({
					enabled: true,
					accountNamespace: ACCOUNT,
					mediaPolicy: "wifi-only",
					lastSuccessfulSyncAt: 123,
				}),
			).toMatchObject({
				enabled: true,
				accountNamespace: ACCOUNT,
				mediaPolicy: "wifi-only",
				lastSuccessfulSyncAt: 123,
			});

			await reconcile(store, [
				entity("core", "conversation", "one", { title: "One" }),
				entity("core", "conversation", "two", { title: "Two" }),
			]);
			expect(await store.getLocalOriginSequence(ACCOUNT, LOCAL_DEVICE)).toBe(2);
			const first = await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE, 1);
			const second = await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE, 1);
			expect(first?.syncPackage.sequenceRange).toEqual({ start: 1, end: 1 });
			expect(second?.syncPackage.sequenceRange).toEqual({ start: 2, end: 2 });
			expect(second?.syncPackage.previousPackageDigest).toBe(
				first?.syncPackage.contentDigest,
			);
			expect(await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE)).toBeNull();
			expect(await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE)).toHaveLength(2);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toBeNull();

			await store.markOutboundPackageUploaded(
				first!.syncPackage.packageId,
				"drive-file-one",
				200,
			);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toEqual({
				sequenceEnd: 1,
				contentDigest: first!.syncPackage.contentDigest,
			});
			expect((await store.getPendingCounts(ACCOUNT)).changes).toBe(1);
			await store.markOutboundPackageUploaded(
				second!.syncPackage.packageId,
				"drive-file-two",
				201,
			);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toEqual({
				sequenceEnd: 2,
				contentDigest: second!.syncPackage.contentDigest,
			});
			expect(await store.getPendingCounts(ACCOUNT)).toMatchObject({ changes: 0 });
		} finally {
			await store.close();
		}
	});

	test("stages and confirms a single operation just below the 3 MiB package ceiling", async () => {
		const { store } = await openTestStore();
		try {
			const payload = "x".repeat(
				GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES - 4 * 1024,
			);
			await reconcile(store, [
				entity("core", "conversation", "near-package-limit", { payload }),
			]);

			const staged = await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE);
			expect(staged).not.toBeNull();
			const serializedBytes = new TextEncoder().encode(staged!.serialized).byteLength;
			expect(serializedBytes).toBeLessThanOrEqual(
				GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES,
			);
			expect(serializedBytes).toBeGreaterThan(
				GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES - 8 * 1024,
			);
			expect(
				await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE),
			).toHaveLength(0);
			expect(
				await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE),
			).toHaveLength(1);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toBeNull();

			await store.markOutboundPackageUploaded(
				staged!.syncPackage.packageId,
				"drive-near-package-limit",
				200,
			);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toEqual({
				sequenceEnd: 1,
				contentDigest: staged!.syncPackage.contentDigest,
			});
			expect(await store.getPendingCounts(ACCOUNT)).toMatchObject({ changes: 0 });
		} finally {
			await store.close();
		}
	});

	test("rejects a single oversized package without staging or losing its durable operation", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		const opened = await openTestStore({ adapter });
		let store = opened.store;
		try {
			const payload = "x".repeat(
				GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES + 4 * 1024,
			);
			await reconcile(store, [
				entity("core", "conversation", "over-package-limit", { payload }),
			]);
			const pendingBefore = await store.getPendingCounts(ACCOUNT);
			expect(pendingBefore.changes).toBe(1);
			expect(pendingBefore.bytes).toBeGreaterThan(
				GOOGLE_DRIVE_SYNC_TARGET_PACKAGE_BYTES,
			);

			await expect(
				store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE),
			).rejects.toThrow(
				"A single sync operation exceeds the 3 MiB transport-package limit",
			);
			expect(
				await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE),
			).toEqual([]);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toBeNull();
			expect(await store.getPendingCounts(ACCOUNT)).toEqual(pendingBefore);
			const [stillUnpackaged] = await store.listUnpackagedOperations(
				ACCOUNT,
				LOCAL_DEVICE,
			);
			expect(stillUnpackaged?.entityId).toBe("over-package-limit");
			expect(stillUnpackaged?.mutation).toMatchObject({ kind: "upsert" });

			const packageRows = await adapter.select<Array<{ count: number }>>(
				"SELECT COUNT(*) AS count FROM sync_outbound_packages",
			);
			const operationRows = await adapter.select<
				Array<{ package_id: string | null }>
			>("SELECT package_id FROM sync_outbound_operations");
			expect(packageRows[0]?.count).toBe(0);
			expect(operationRows).toEqual([{ package_id: null }]);

			await store.close();
			store = (await openTestStore({ adapter })).store;
			expect(await store.getPendingCounts(ACCOUNT)).toEqual(pendingBefore);
			expect(
				await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE),
			).toHaveLength(1);
			await expect(
				store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE),
			).rejects.toThrow(
				"A single sync operation exceeds the 3 MiB transport-package limit",
			);
			expect(
				await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE),
			).toEqual([]);
			expect(await store.getOutboundHead(ACCOUNT, LOCAL_DEVICE)).toBeNull();
		} finally {
			await store.close();
			adapter.database.close();
		}
	});

	test("migrates and persists validated bootstrap authority state", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		await adapter.execute(`
			CREATE TABLE sync_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`);
		await adapter.execute(
			"INSERT INTO sync_meta(key, value) VALUES ('schema_version', '1')",
		);
		const { store } = await openTestStore({ adapter });
		const digest = "a".repeat(64);
		try {
			expect(await store.getBootstrapState()).toEqual({
				authorityDeviceId: null,
				authoritySequenceEnd: 0,
				authorityHeadDigest: null,
				bootstrapPending: false,
				anchorRequired: false,
				localBaselineSequence: null,
			});
			expect(
				await store.updateBootstrapState({
					authorityDeviceId: REMOTE_DEVICE,
					authoritySequenceEnd: 12,
					authorityHeadDigest: digest,
					bootstrapPending: true,
					anchorRequired: true,
					localBaselineSequence: 4,
				}),
			).toEqual({
				authorityDeviceId: REMOTE_DEVICE,
				authoritySequenceEnd: 12,
				authorityHeadDigest: digest,
				bootstrapPending: true,
				anchorRequired: true,
				localBaselineSequence: 4,
			});
		} finally {
			await store.close();
		}

		const { store: reopened } = await openTestStore({ adapter });
		try {
			expect(await reopened.getBootstrapState()).toEqual({
				authorityDeviceId: REMOTE_DEVICE,
				authoritySequenceEnd: 12,
				authorityHeadDigest: digest,
				bootstrapPending: true,
				anchorRequired: true,
				localBaselineSequence: 4,
			});
			expect(
				await adapter.select<Array<{ value: string }>>(
					"SELECT value FROM sync_meta WHERE key = 'schema_version'",
				),
			).toEqual([{ value: "4" }]);

			await expect(
				reopened.updateBootstrapState({ authoritySequenceEnd: 0 }),
			).rejects.toThrow("digest must be null exactly");
			await expect(
				reopened.updateBootstrapState({ authorityHeadDigest: null }),
			).rejects.toThrow("digest must be null exactly");
			await expect(
				reopened.updateBootstrapState({ authorityDeviceId: null }),
			).rejects.toThrow("requires an authority device");
			await expect(
				reopened.updateBootstrapState({ localBaselineSequence: null }),
			).rejects.toThrow("must exist exactly while bootstrap is pending");
			await expect(
				reopened.updateBootstrapState({ authorityHeadDigest: "not-a-digest" }),
			).rejects.toThrow();
			await expect(
				reopened.updateBootstrapState({ localBaselineSequence: -1 }),
			).rejects.toThrow();

			await reopened.updateBootstrapState({
				authorityDeviceId: null,
				authoritySequenceEnd: 0,
				authorityHeadDigest: null,
				bootstrapPending: false,
				anchorRequired: false,
				localBaselineSequence: null,
			});
			await expect(
				reopened.updateBootstrapState({ anchorRequired: true }),
			).rejects.toThrow("requires an authority device");
			await expect(
				reopened.updateBootstrapState({
					bootstrapPending: true,
					localBaselineSequence: 0,
				}),
			).rejects.toThrow("requires an authority device");
			await expect(
				reopened.updateBootstrapState({
					authorityDeviceId: REMOTE_DEVICE,
					localBaselineSequence: 0,
				}),
			).rejects.toThrow("must exist exactly while bootstrap is pending");
		} finally {
			await reopened.close();
			adapter.database.close();
		}
	});

	test("atomically binds the first local source identity and keeps it across reopen", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		let { store } = await openTestStore({ adapter });
		try {
			expect(await store.getLocalSourceDeviceId()).toBeNull();
			expect(await store.hasPriorLocalSyncState()).toBe(false);
			expect(await store.bindLocalSourceDeviceId(LOCAL_DEVICE)).toBe(LOCAL_DEVICE);
			expect(await store.getLocalSourceDeviceId()).toBe(LOCAL_DEVICE);
			await expect(
				store.bindLocalSourceDeviceId("different-browser-device"),
			).rejects.toThrow("device ids conflict");
		} finally {
			await store.close();
		}

		store = (await openTestStore({ adapter })).store;
		try {
			expect(await store.getLocalSourceDeviceId()).toBe(LOCAL_DEVICE);
			expect(
				await adapter.select<Array<{ value: string }>>(
					"SELECT value FROM sync_meta WHERE key = 'schema_version'",
				),
			).toEqual([{ value: "4" }]);
		} finally {
			await store.close();
			adapter.database.close();
		}
	});

	test("v4 migration binds the sole pre-v4 local outbox source", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		let { store } = await openTestStore({ adapter });
		try {
			await store.bindLocalSourceDeviceId(LOCAL_DEVICE);
			await reconcile(store, [
				entity("core", "conversation", "pre-v4-pending", { title: "Pending" }),
			]);
			expect(await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE)).not.toBeNull();
			await adapter.execute("DROP TABLE sync_local_identity");
			await adapter.execute(
				"UPDATE sync_meta SET value = '3' WHERE key = 'schema_version'",
			);
		} finally {
			await store.close();
		}

		store = (await openTestStore({ adapter })).store;
		try {
			expect(await store.getLocalSourceDeviceId()).toBe(LOCAL_DEVICE);
			expect(await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE)).toHaveLength(1);
			expect(await store.hasPriorLocalSyncState()).toBe(true);
		} finally {
			await store.close();
		}

		store = (await openTestStore({ adapter })).store;
		try {
			expect(await store.getLocalSourceDeviceId()).toBe(LOCAL_DEVICE);
		} finally {
			await store.close();
			adapter.database.close();
		}
	});

	test("persists pairing-observed remote heads as monotonic rollback floors", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		let { store } = await openTestStore({ adapter });
		const firstDigest = "a".repeat(64);
		const secondDigest = "b".repeat(64);
		try {
			expect(
				await store.commitInboundHeads(ACCOUNT, [
					{
						sourceDeviceId: REMOTE_DEVICE,
						sequenceEnd: 2,
						contentDigest: secondDigest,
					},
				]),
			).toEqual([
				{
					sourceDeviceId: REMOTE_DEVICE,
					sequenceEnd: 2,
					contentDigest: secondDigest,
				},
			]);
			// An older pairing code cannot weaken a floor already committed locally.
			await store.commitInboundHeads(ACCOUNT, [
				{
					sourceDeviceId: REMOTE_DEVICE,
					sequenceEnd: 1,
					contentDigest: firstDigest,
				},
			]);
			await store.close();
			store = (await openTestStore({ adapter })).store;
			expect(await store.listInboundHeads(ACCOUNT)).toEqual([
				{
					sourceDeviceId: REMOTE_DEVICE,
					sequenceEnd: 2,
					contentDigest: secondDigest,
				},
			]);
			await expect(
				store.commitInboundHeads(ACCOUNT, [
					{
						sourceDeviceId: REMOTE_DEVICE,
						sequenceEnd: 2,
						contentDigest: firstDigest,
					},
				]),
			).rejects.toThrow("conflicts with durable history");
		} finally {
			await store.close();
			adapter.database.close();
		}
	});

	test("replays a cross-store domain mutation safely until its receipt is durable", async () => {
		const applied: string[] = [];
		let domainValue: JsonValue | null = null;
		let failAfterMutation = true;
		const { store } = await openTestStore({
			applyOperation: async (operation, expectedOperation) => {
				applied.push(operation.operationId);
				expect(expectedOperation).toBeUndefined();
				if (
					operation.mutation.kind === "upsert" &&
					JSON.stringify(domainValue) === JSON.stringify(operation.mutation.value)
				) {
					return true;
				}
				domainValue =
					operation.mutation.kind === "upsert" ? operation.mutation.value : null;
				if (failAfterMutation) {
					failAfterMutation = false;
					throw new Error("crash after idempotent domain upsert");
				}
				return true;
			},
		});
		try {
			const remoteOperation = createSyncOperation({
				operationId: "op-remote-one",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				sequence: { originSequence: 1, logicalClock: 10 },
				section: "core",
				entityType: "conversation",
				entityId: "one",
				mutation: { kind: "upsert", value: { title: "Remote" } },
			});
			const remotePackage = await createSyncPackage({
				packageId: "pkg-remote-one",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				operations: [remoteOperation],
			});
			const options = {
				expectedAccountNamespace: ACCOUNT,
				expectedSourceDeviceId: REMOTE_DEVICE,
				now: () => 50,
			};
			await expect(store.applyIncomingPackage(remotePackage, options)).rejects.toThrow(
				"crash after idempotent domain upsert",
			);
			expect(domainValue).toEqual({ title: "Remote" });
			expect(await store.applyIncomingPackage(remotePackage, options)).toMatchObject({
				appliedOperations: 1,
				alreadyApplied: false,
			});
			expect(await store.applyIncomingPackage(remotePackage, options)).toMatchObject({
				appliedOperations: 0,
				alreadyApplied: true,
			});
			expect(applied).toEqual(["op-remote-one", "op-remote-one"]);
			expect(await store.getInboundCursor(ACCOUNT, REMOTE_DEVICE)).toEqual({
				nextSequence: 2,
				previousPackageDigest: remotePackage.contentDigest,
			});

			// The incoming winner is now the shadow, so a local-first scan of the
			// same domain value does not echo it back into the outbox.
			expect(
				await reconcile(store, [
					entity("core", "conversation", "one", { title: "Remote" }),
				]),
			).toMatchObject({ createdUpserts: 0, unchangedEntities: 1 });
		} finally {
			await store.close();
		}
	});

	test("receipts a changed-domain race without advancing its shadow and promotes the local edit", async () => {
		const expectedOperationIds: Array<string | undefined> = [];
		const { store, adapter } = await openTestStore({
			applyOperation: async (_operation, expectedOperation) => {
				expectedOperationIds.push(expectedOperation?.operationId);
				return false;
			},
		});
		try {
			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Initial local" }),
			]);
			const [localBaseline] = await store.listUnpackagedOperations(
				ACCOUNT,
				LOCAL_DEVICE,
			);
			const remoteOperation = createSyncOperation({
				operationId: "op-race-remote",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				sequence: { originSequence: 1, logicalClock: 100 },
				section: "core",
				entityType: "conversation",
				entityId: "shared",
				mutation: { kind: "upsert", value: { title: "Remote" } },
			});
			const remotePackage = await createSyncPackage({
				packageId: "pkg-race-remote",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				operations: [remoteOperation],
			});

			expect(
				await store.applyIncomingPackage(remotePackage, {
					expectedAccountNamespace: ACCOUNT,
					expectedSourceDeviceId: REMOTE_DEVICE,
				}),
			).toMatchObject({ appliedOperations: 1, alreadyApplied: false });
			expect(expectedOperationIds).toEqual([localBaseline.operationId]);
			expect((await readConversationShadow(adapter, "shared"))?.operationId).toBe(
				localBaseline.operationId,
			);
			expect(await store.getInboundCursor(ACCOUNT, REMOTE_DEVICE)).toEqual({
				nextSequence: 2,
				previousPackageDigest: remotePackage.contentDigest,
			});

			const promoted = await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Concurrent local" }),
			]);
			expect(promoted).toMatchObject({ createdUpserts: 1, lastSequence: 2 });
			const operations = await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE);
			const promotedOperation = operations[operations.length - 1];
			expect(promotedOperation.mutation).toEqual({
				kind: "upsert",
				value: { title: "Concurrent local" },
			});
			expect(promotedOperation.revision.logicalClock).toBeGreaterThan(
				remoteOperation.revision.logicalClock,
			);
		} finally {
			await store.close();
		}
	});

	test("preserves a post-baseline bootstrap edit and promotes it above the authority clock", async () => {
		const applied: string[] = [];
		const { store, adapter } = await openTestStore({
			applyOperation: async (operation) => {
				applied.push(operation.operationId);
				return true;
			},
		});
		try {
			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Phone baseline" }),
			]);
			const localBaselineSequence = await store.getLocalOriginSequence(
				ACCOUNT,
				LOCAL_DEVICE,
			);
			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Edited while pairing" }),
			]);

			const authorityOperation = createSyncOperation({
				operationId: "op-protected-authority",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				sequence: { originSequence: 1, logicalClock: 100 },
				section: "core",
				entityType: "conversation",
				entityId: "shared",
				mutation: { kind: "upsert", value: { title: "Laptop baseline" } },
			});
			const authorityPackage = await createSyncPackage({
				packageId: "pkg-protected-authority",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				operations: [authorityOperation],
			});
			await expect(
				store.applyIncomingPackage(authorityPackage, {
					expectedAccountNamespace: ACCOUNT,
					bootstrapAuthority: {
						localSourceDeviceId: "",
						localBaselineSequence,
					},
				}),
			).rejects.toThrow();
			await expect(
				store.applyIncomingPackage(authorityPackage, {
					expectedAccountNamespace: ACCOUNT,
					bootstrapAuthority: {
						localSourceDeviceId: LOCAL_DEVICE,
						localBaselineSequence: -1,
					},
				}),
			).rejects.toThrow();
			await expect(
				store.applyIncomingPackage(authorityPackage, {
					expectedAccountNamespace: ACCOUNT,
					bootstrapAuthority: {
						localSourceDeviceId: REMOTE_DEVICE,
						localBaselineSequence,
					},
				}),
			).rejects.toThrow("different source device");
			await store.applyIncomingPackage(authorityPackage, {
				expectedAccountNamespace: ACCOUNT,
				expectedSourceDeviceId: REMOTE_DEVICE,
				bootstrapAuthority: { localSourceDeviceId: LOCAL_DEVICE, localBaselineSequence },
			});

			// Protected post-cutoff state is never overwritten in the domain callback,
			// while the authority shadow becomes the causal comparison point.
			expect(applied).toEqual([]);
			expect((await readConversationShadow(adapter, "shared"))?.operationId).toBe(
				authorityOperation.operationId,
			);
			const promoted = await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Edited while pairing" }),
			]);
			expect(promoted).toMatchObject({ createdUpserts: 1, lastSequence: 3 });
			const operations = await store.listUnpackagedOperations(ACCOUNT, LOCAL_DEVICE);
			const promotedOperation = operations[operations.length - 1];
			expect(promotedOperation.mutation).toEqual({
				kind: "upsert",
				value: { title: "Edited while pairing" },
			});
			expect(promotedOperation.revision.logicalClock).toBeGreaterThan(
				authorityOperation.revision.logicalClock,
			);
		} finally {
			await store.close();
		}
	});

	test("keeps a force-applied authority baseline durable across a crash before supersession", async () => {
		const adapter = new BunSqliteAdapter({ closeDatabase: false });
		let domainValue: JsonValue = { title: "Phone baseline" };
		const applied: string[] = [];
		const first = await openTestStore({
			adapter,
			applyOperation: async (operation, expectedOperation) => {
				applied.push(operation.operationId);
				expect(expectedOperation?.sourceDeviceId).toBe(LOCAL_DEVICE);
				domainValue =
					operation.mutation.kind === "upsert" ? operation.mutation.value : null;
				return true;
			},
		});
		const authorityOperation = createSyncOperation({
			operationId: "op-crash-authority",
			accountNamespace: ACCOUNT,
			sourceDeviceId: REMOTE_DEVICE,
			// Ordinary LWW would retain device-windows for this exact clock tie.
			sequence: { originSequence: 1, logicalClock: 1 },
			section: "core",
			entityType: "conversation",
			entityId: "shared",
			mutation: { kind: "upsert", value: { title: "Laptop authority" } },
		});
		const authorityPackage = await createSyncPackage({
			packageId: "pkg-crash-authority",
			accountNamespace: ACCOUNT,
			sourceDeviceId: REMOTE_DEVICE,
			operations: [authorityOperation],
		});
		const bootstrapOptions = {
			expectedAccountNamespace: ACCOUNT,
			expectedSourceDeviceId: REMOTE_DEVICE,
			bootstrapAuthority: {
				localSourceDeviceId: LOCAL_DEVICE,
				localBaselineSequence: 1,
			},
		};
		try {
			await reconcile(first.store, [
				entity("core", "conversation", "shared", { title: "Phone baseline" }),
			]);
			await first.store.updateConfig({
				enabled: true,
				accountNamespace: ACCOUNT,
			});
			await first.store.updateBootstrapState({
				authorityDeviceId: REMOTE_DEVICE,
				authoritySequenceEnd: 1,
				authorityHeadDigest: authorityPackage.contentDigest,
				bootstrapPending: true,
				anchorRequired: true,
				localBaselineSequence: 1,
			});
			await first.store.applyIncomingPackage(authorityPackage, bootstrapOptions);
			expect(domainValue).toEqual({ title: "Laptop authority" });
			expect((await readConversationShadow(adapter, "shared"))?.operationId).toBe(
				authorityOperation.operationId,
			);
		} finally {
			await first.store.close();
		}

		const reopened = await openTestStore({
			adapter,
			applyOperation: async () => {
				throw new Error("a receipted authority operation must not be applied again");
			},
		});
		try {
			// Startup outbox repair must not resurrect the force-losing phone shadow.
			expect((await readConversationShadow(adapter, "shared"))?.operationId).toBe(
				authorityOperation.operationId,
			);
			expect(
				await reopened.store.applyIncomingPackage(authorityPackage, bootstrapOptions),
			).toMatchObject({ appliedOperations: 0, alreadyApplied: true });
			expect(applied).toEqual([authorityOperation.operationId]);

			expect(
				await reopened.store.supersedeUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "shared",
					supersededByOperationId: authorityOperation.operationId,
					maxOriginSequence: 1,
				}),
			).toBe(1);
			expect((await readConversationShadow(adapter, "shared"))?.operationId).toBe(
				authorityOperation.operationId,
			);
		} finally {
			await reopened.store.close();
			adapter.database.close();
		}
	});

	test("supersedes only matching unuploaded bootstrap conflicts", async () => {
		const applied: string[] = [];
		const { store, adapter } = await openTestStore({
			applyOperation: async (operation) => {
				applied.push(operation.operationId);
			},
		});
		try {
			// Controller contract: capture every local row before considering the
			// laptop's authoritative bootstrap snapshot.
			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Phone copy" }),
				entity("core", "conversation", "phone-only", { title: "Local only" }),
			]);
			const prematurelyStaged = await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE);
			expect(prematurelyStaged?.syncPackage.operationCount).toBe(2);
			const authoritative = createSyncOperation({
				operationId: "op-bootstrap-authority",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				sequence: { originSequence: 1, logicalClock: 100 },
				section: "core",
				entityType: "conversation",
				entityId: "shared",
				mutation: { kind: "upsert", value: { title: "Laptop copy" } },
			});
			const supersedeInput = {
				accountNamespace: ACCOUNT,
				sourceDeviceId: LOCAL_DEVICE,
				section: "core" as const,
				entityType: "conversation",
				entityId: "shared",
				supersededByOperationId: authoritative.operationId,
				maxOriginSequence: 2,
				atMs: 40,
			};
			adapter.failNextShadowDelete = true;
			await expect(
				store.supersedeUnuploadedEntityOperations(supersedeInput),
			).rejects.toThrow("injected shadow delete failure");
			expect(
				await store.listUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "shared",
				}),
			).toHaveLength(1);
			expect(await store.supersedeUnuploadedEntityOperations(supersedeInput)).toBe(1);
			expect(
				await store.listUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "shared",
				}),
			).toHaveLength(0);
			expect(
				await store.listUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "phone-only",
				}),
			).toHaveLength(1);
			expect(await store.getPendingCounts(ACCOUNT)).toMatchObject({ changes: 1 });

			const authoritativePackage = await createSyncPackage({
				packageId: "pkg-bootstrap-authority",
				accountNamespace: ACCOUNT,
				sourceDeviceId: REMOTE_DEVICE,
				operations: [authoritative],
			});
			await store.applyIncomingPackage(authoritativePackage, {
				expectedAccountNamespace: ACCOUNT,
				expectedSourceDeviceId: REMOTE_DEVICE,
			});
			expect(applied).toEqual(["op-bootstrap-authority"]);

			// Superseding invalidates the previously staged immutable package. The
			// replacement starts at sequence 2 (a deliberate, digest-chain-safe gap)
			// and never transports the canceled shared entity operation.
			const phonePackage = await store.createNextOutboundPackage(ACCOUNT, LOCAL_DEVICE);
			expect(phonePackage?.syncPackage.sequenceRange).toEqual({ start: 2, end: 2 });
			expect(
				phonePackage?.syncPackage.operations.map((operation) => operation.entityId),
			).toEqual(["phone-only"]);
			expect(await store.listPendingOutboundPackages(ACCOUNT, LOCAL_DEVICE)).toHaveLength(1);

			const received: string[] = [];
			const { store: receiver } = await openTestStore({
				applyOperation: async (operation) => {
					received.push(operation.entityId);
				},
			});
			try {
				await receiver.applyIncomingPackage(phonePackage!.syncPackage, {
					expectedAccountNamespace: ACCOUNT,
					expectedSourceDeviceId: LOCAL_DEVICE,
				});
				expect(received).toEqual(["phone-only"]);
			} finally {
				await receiver.close();
			}
		} finally {
			await store.close();
		}
	});

	test("never supersedes a phone edit created after the persisted bootstrap cutoff", async () => {
		const { store } = await openTestStore();
		try {
			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Baseline phone copy" }),
			]);
			const baselineCutoff = await store.getLocalOriginSequence(ACCOUNT, LOCAL_DEVICE);
			expect(baselineCutoff).toBe(1);

			await reconcile(store, [
				entity("core", "conversation", "shared", { title: "Edited after baseline" }),
			]);
			expect(await store.getLocalOriginSequence(ACCOUNT, LOCAL_DEVICE)).toBe(2);

			expect(
				await store.supersedeUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "shared",
					supersededByOperationId: "op-bootstrap-cutoff",
					maxOriginSequence: baselineCutoff,
					atMs: 60,
				}),
			).toBe(1);
			const remaining = await store.listUnuploadedEntityOperations({
				accountNamespace: ACCOUNT,
				sourceDeviceId: LOCAL_DEVICE,
				section: "core",
				entityType: "conversation",
				entityId: "shared",
			});
			expect(remaining.map((operation) => operation.originSequence)).toEqual([2]);
			expect(remaining[0].mutation).toEqual({
				kind: "upsert",
				value: { title: "Edited after baseline" },
			});

			await expect(
				store.supersedeUnuploadedEntityOperations({
					accountNamespace: ACCOUNT,
					sourceDeviceId: LOCAL_DEVICE,
					section: "core",
					entityType: "conversation",
					entityId: "shared",
					supersededByOperationId: "op-bootstrap-invalid-cutoff",
					maxOriginSequence: -1,
				}),
			).rejects.toThrow();
		} finally {
			await store.close();
		}
	});
});
