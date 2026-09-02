import { describe, expect, test } from "bun:test";
import {
	InMemorySyncSequenceAllocator,
	SyncProtocolError,
	applySyncPackageIdempotently,
	createSyncOperation,
	createSyncPackage,
	parseAndVerifySyncPackage,
	selectWinningOperation,
	serializeSyncPackage,
	type AppliedOperationReceipt,
	type AppliedPackageReceipt,
	type ImmutableSyncOperation,
	type SyncApplyStore,
	type SyncApplyTransaction,
} from "../src/services/cloudSync";

const ACCOUNT = "acct-test";
const DEVICE = "device-windows";

async function makeOperations() {
	const allocator = new InMemorySyncSequenceAllocator();
	const first = createSyncOperation({
		operationId: "op-first",
		accountNamespace: ACCOUNT,
		sourceDeviceId: DEVICE,
		sequence: await allocator.next(ACCOUNT, DEVICE),
		section: "core",
		entityType: "conversation",
		entityId: "123",
		createdAtMs: 10,
		mutation: { kind: "upsert", value: { unread: 2, tags: ["one"] } },
	});
	const second = createSyncOperation({
		operationId: "op-second",
		accountNamespace: ACCOUNT,
		sourceDeviceId: DEVICE,
		sequence: await allocator.next(ACCOUNT, DEVICE),
		section: "core",
		entityType: "conversation",
		entityId: "456",
		createdAtMs: 20,
		mutation: { kind: "delete" },
	});
	return [first, second] as const;
}

class MemoryApplyStore implements SyncApplyStore, SyncApplyTransaction {
	readonly operations = new Map<string, AppliedOperationReceipt>();
	readonly packages = new Map<string, AppliedPackageReceipt>();
	readonly appliedEntities: ImmutableSyncOperation[] = [];

	async transaction<T>(
		_accountNamespace: string,
		action: (transaction: SyncApplyTransaction) => Promise<T>,
	): Promise<T> {
		return action(this);
	}

	async getAppliedOperation(operationId: string) {
		return this.operations.get(operationId);
	}

	async applyOperation(operation: ImmutableSyncOperation) {
		this.appliedEntities.push(operation);
	}

	async recordAppliedOperation(receipt: AppliedOperationReceipt) {
		this.operations.set(receipt.operationId, receipt);
	}

	async getAppliedPackage(packageId: string) {
		return this.packages.get(packageId);
	}

	async recordAppliedPackage(receipt: AppliedPackageReceipt) {
		this.packages.set(receipt.packageId, receipt);
	}
}

describe("cloud sync protocol foundation", () => {
	test("creates, hashes, freezes, serializes, and strictly verifies immutable packages", async () => {
		const operations = await makeOperations();
		const syncPackage = await createSyncPackage({
			packageId: "pkg-first",
			accountNamespace: ACCOUNT,
			sourceDeviceId: DEVICE,
			createdAtMs: 30,
			operations,
		});

		expect(Object.isFrozen(syncPackage)).toBe(true);
		expect(Object.isFrozen(syncPackage.operations[0].mutation)).toBe(true);
		expect(syncPackage.sequenceRange).toEqual({ start: 1, end: 2 });
		expect(syncPackage.sections).toEqual(["core"]);
		expect(
			await parseAndVerifySyncPackage(serializeSyncPackage(syncPackage)),
		).toEqual(syncPackage);

		const tampered = JSON.parse(serializeSyncPackage(syncPackage));
		tampered.operations[0].mutation.value.unread = 99;
		await expect(
			parseAndVerifySyncPackage(JSON.stringify(tampered)),
		).rejects.toMatchObject({
			code: "integrity-failed",
		});

		const extraField = JSON.parse(serializeSyncPackage(syncPackage));
		extraField.unexpected = true;
		await expect(
			parseAndVerifySyncPackage(JSON.stringify(extraField)),
		).rejects.toMatchObject({
			code: "invalid-package",
		});

		const sequenceGap = JSON.parse(serializeSyncPackage(syncPackage));
		sequenceGap.operations[1].originSequence = 3;
		await expect(
			parseAndVerifySyncPackage(JSON.stringify(sequenceGap)),
		).rejects.toMatchObject({
			code: "sequence-gap",
		});
	});

	test("allocates independent monotonic account/device sequences and observes Lamport clocks", async () => {
		const allocator = new InMemorySyncSequenceAllocator();
		expect(await allocator.next("acct-a", "device-a")).toEqual({
			originSequence: 1,
			logicalClock: 1,
		});
		expect(await allocator.next("acct-a", "device-a", 8)).toEqual({
			originSequence: 2,
			logicalClock: 9,
		});
		expect(await allocator.next("acct-b", "device-a")).toEqual({
			originSequence: 1,
			logicalClock: 1,
		});
		await allocator.observe("acct-a", "device-a", 20);
		expect(await allocator.next("acct-a", "device-a")).toEqual({
			originSequence: 3,
			logicalClock: 21,
		});
	});

	test("uses deterministic logical revisions and lets tombstones win exact ties", () => {
		const base = {
			operationId: "op-upsert",
			accountNamespace: ACCOUNT,
			sourceDeviceId: DEVICE,
			originSequence: 4,
			revision: { logicalClock: 7, deviceId: DEVICE },
			section: "preferences" as const,
			entityType: "setting",
			entityId: "theme",
			createdAtMs: 1,
			mutation: { kind: "upsert" as const, value: "dark" },
		};
		const tombstone = {
			...base,
			operationId: "op-delete",
			mutation: { kind: "delete" as const },
		};
		expect(selectWinningOperation(base, tombstone)).toBe(tombstone);
	});

	test("applies each operation once and rejects package identifier reuse", async () => {
		const operations = await makeOperations();
		const syncPackage = await createSyncPackage({
			packageId: "pkg-replay",
			accountNamespace: ACCOUNT,
			sourceDeviceId: DEVICE,
			createdAtMs: 30,
			operations,
		});
		const store = new MemoryApplyStore();
		const options = {
			expectedAccountNamespace: ACCOUNT,
			expectedPreviousPackageDigest: null,
			expectedNextSequence: 1,
			now: () => 50,
		};

		expect(
			await applySyncPackageIdempotently(syncPackage, store, options),
		).toMatchObject({
			appliedOperations: 2,
			duplicateOperations: 0,
			alreadyApplied: false,
		});
		expect(
			await applySyncPackageIdempotently(syncPackage, store, {
				...options,
				expectedPreviousPackageDigest: syncPackage.contentDigest,
				expectedNextSequence: 3,
			}),
		).toMatchObject({
			appliedOperations: 0,
			duplicateOperations: 2,
			alreadyApplied: true,
		});
		expect(store.appliedEntities).toHaveLength(2);

		const replacement = await createSyncPackage({
			packageId: "pkg-replay",
			accountNamespace: ACCOUNT,
			sourceDeviceId: DEVICE,
			createdAtMs: 31,
			operations,
		});
		await expect(
			applySyncPackageIdempotently(replacement, store, options),
		).rejects.toBeInstanceOf(SyncProtocolError);
	});
});
