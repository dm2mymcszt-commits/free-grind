import { SyncProtocolError } from "./errors";
import { fingerprintOperation, verifySyncPackage } from "./package";
import type { ImmutableSyncOperation, SyncPackage } from "./types";

export type AppliedOperationReceipt = Readonly<{
	operationId: string;
	accountNamespace: string;
	sourceDeviceId: string;
	originSequence: number;
	fingerprint: string;
	appliedAtMs: number;
}>;

export type AppliedPackageReceipt = Readonly<{
	packageId: string;
	accountNamespace: string;
	sourceDeviceId: string;
	sequenceStart: number;
	sequenceEnd: number;
	contentDigest: string;
	previousPackageDigest: string | null;
	appliedAtMs: number;
}>;

/**
 * All methods are invoked inside one serialized apply scope. Stores that can
 * keep entity data and receipts in one database should make it atomic. A
 * cross-store implementation must instead make `applyOperation` idempotent and
 * persist its receipt only after the domain mutation succeeds, so interruption
 * replays the same operation safely.
 */
export interface SyncApplyTransaction {
	getAppliedOperation(
		operationId: string,
	): Promise<AppliedOperationReceipt | undefined>;
	applyOperation(operation: ImmutableSyncOperation): Promise<void>;
	recordAppliedOperation(receipt: AppliedOperationReceipt): Promise<void>;
	getAppliedPackage(
		packageId: string,
	): Promise<AppliedPackageReceipt | undefined>;
	recordAppliedPackage(receipt: AppliedPackageReceipt): Promise<void>;
}

export interface SyncApplyStore {
	transaction<T>(
		accountNamespace: string,
		action: (transaction: SyncApplyTransaction) => Promise<T>,
	): Promise<T>;
}

export type ApplySyncPackageOptions = Readonly<{
	expectedAccountNamespace: string;
	expectedSourceDeviceId?: string;
	expectedPreviousPackageDigest?: string | null;
	expectedNextSequence?: number;
	now?: () => number;
}>;

export type ApplySyncPackageResult = Readonly<{
	packageId: string;
	contentDigest: string;
	appliedOperations: number;
	duplicateOperations: number;
	alreadyApplied: boolean;
	sequenceEnd: number;
}>;

function hasExpectedPreviousDigest(
	options: ApplySyncPackageOptions,
): options is ApplySyncPackageOptions & {
	expectedPreviousPackageDigest: string | null;
} {
	return Object.prototype.hasOwnProperty.call(
		options,
		"expectedPreviousPackageDigest",
	);
}

function assertExpectedIdentity(
	syncPackage: SyncPackage,
	options: ApplySyncPackageOptions,
): void {
	if (syncPackage.accountNamespace !== options.expectedAccountNamespace) {
		throw new SyncProtocolError(
			"identity-mismatch",
			"Refusing to apply a sync package for a different account",
		);
	}
	if (
		options.expectedSourceDeviceId !== undefined &&
		syncPackage.sourceDeviceId !== options.expectedSourceDeviceId
	) {
		throw new SyncProtocolError(
			"identity-mismatch",
			"Refusing to apply a sync package from an unexpected source device",
		);
	}
}

function assertExpectedPosition(
	syncPackage: SyncPackage,
	options: ApplySyncPackageOptions,
): void {
	if (
		hasExpectedPreviousDigest(options) &&
		syncPackage.previousPackageDigest !== options.expectedPreviousPackageDigest
	) {
		throw new SyncProtocolError(
			"chain-mismatch",
			"Sync package does not continue the expected source-device chain",
		);
	}
	if (
		options.expectedNextSequence !== undefined &&
		syncPackage.sequenceRange.start !== options.expectedNextSequence
	) {
		throw new SyncProtocolError(
			"sequence-gap",
			`Expected source sequence ${options.expectedNextSequence}, received ${syncPackage.sequenceRange.start}`,
		);
	}
}

/**
 * Verifies the complete immutable package before opening the transaction, then
 * atomically applies unseen operations and records their receipts. Replays are
 * harmless; reusing an ID for different content is rejected.
 */
export async function applySyncPackageIdempotently(
	input: unknown,
	store: SyncApplyStore,
	options: ApplySyncPackageOptions,
): Promise<ApplySyncPackageResult> {
	const syncPackage = await verifySyncPackage(input);
	assertExpectedIdentity(syncPackage, options);
	const fingerprints = await Promise.all(
		syncPackage.operations.map((operation) => fingerprintOperation(operation)),
	);
	const now = options.now ?? Date.now;

	return store.transaction(
		syncPackage.accountNamespace,
		async (transaction) => {
			const existingPackage = await transaction.getAppliedPackage(
				syncPackage.packageId,
			);
			if (existingPackage) {
				if (
					existingPackage.accountNamespace !== syncPackage.accountNamespace ||
					existingPackage.contentDigest !== syncPackage.contentDigest
				) {
					throw new SyncProtocolError(
						"identifier-collision",
						`Package ID ${syncPackage.packageId} identifies different content`,
					);
				}
				return {
					packageId: syncPackage.packageId,
					contentDigest: syncPackage.contentDigest,
					appliedOperations: 0,
					duplicateOperations: syncPackage.operationCount,
					alreadyApplied: true,
					sequenceEnd: syncPackage.sequenceRange.end,
				};
			}
			assertExpectedPosition(syncPackage, options);

			let appliedOperations = 0;
			let duplicateOperations = 0;
			for (let index = 0; index < syncPackage.operations.length; index += 1) {
				const operation = syncPackage.operations[index];
				const fingerprint = fingerprints[index];
				const existingOperation = await transaction.getAppliedOperation(
					operation.operationId,
				);
				if (existingOperation) {
					if (
						existingOperation.accountNamespace !== operation.accountNamespace ||
						existingOperation.fingerprint !== fingerprint
					) {
						throw new SyncProtocolError(
							"identifier-collision",
							`Operation ID ${operation.operationId} identifies different content`,
						);
					}
					duplicateOperations += 1;
					continue;
				}

				await transaction.applyOperation(operation);
				await transaction.recordAppliedOperation({
					operationId: operation.operationId,
					accountNamespace: operation.accountNamespace,
					sourceDeviceId: operation.sourceDeviceId,
					originSequence: operation.originSequence,
					fingerprint,
					appliedAtMs: now(),
				});
				appliedOperations += 1;
			}

			await transaction.recordAppliedPackage({
				packageId: syncPackage.packageId,
				accountNamespace: syncPackage.accountNamespace,
				sourceDeviceId: syncPackage.sourceDeviceId,
				sequenceStart: syncPackage.sequenceRange.start,
				sequenceEnd: syncPackage.sequenceRange.end,
				contentDigest: syncPackage.contentDigest,
				previousPackageDigest: syncPackage.previousPackageDigest,
				appliedAtMs: now(),
			});

			return {
				packageId: syncPackage.packageId,
				contentDigest: syncPackage.contentDigest,
				appliedOperations,
				duplicateOperations,
				alreadyApplied: false,
				sequenceEnd: syncPackage.sequenceRange.end,
			};
		},
	);
}
