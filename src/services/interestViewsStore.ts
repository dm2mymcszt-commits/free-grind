import { appLog } from "../utils/logger";

type StoredInterestView = {
	profileId: string;
	displayName: string;
	imageHash: string | null;
	timestamp: number | null;
	viewCount: number | null;
	updatedAt: number;
};

const DB_NAME = "open-grind-interest";
const DB_VERSION = 1;
const STORE_NAME = "views";

const MAX_STORED_VIEWS = 2000;
const MAX_VIEW_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		try {
			const request = window.indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: "profileId" });
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = (e) => {
				appLog.error("[interestStore] IDB Open Error", e);
				resolve(null);
			};
		} catch (err) {
			appLog.error("[interestStore] IDB Fatal Error", err);
			resolve(null);
		}
	});
}

export const interestViewsStore = {
	async count(): Promise<number> {
		const db = await openDatabase();
		if (!db) return 0;

		return new Promise((resolve) => {
			try {
				const tx = db.transaction(STORE_NAME, "readonly");
				const store = tx.objectStore(STORE_NAME);
				const req = store.count();

				req.onsuccess = () => {
					const c = req.result || 0;
					db.close();
					resolve(c);
				};
				req.onerror = () => {
					db.close();
					resolve(0);
				};
			} catch {
				db.close();
				resolve(0);
			}
		});
	},

	async getAll(): Promise<StoredInterestView[]> {
		const db = await openDatabase();
		if (!db) return [];

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const rows = (request.result as StoredInterestView[]) || [];
				const now = Date.now();

				// 1. Filter: Only return data younger than 30 days & non-previews
				const activeRows = rows.filter((row) => {
					if (row.profileId.startsWith("preview:")) return false;
					const age = now - (row.timestamp ?? row.updatedAt);
					return age < MAX_VIEW_AGE_MS;
				});

				// 2. Sort: Newest first
				activeRows.sort((a, b) => (b.timestamp ?? b.updatedAt) - (a.timestamp ?? a.updatedAt));

				db.close();

				// 3. Limit: Return maximum MAX_STORED_VIEWS entries
				resolve(activeRows.slice(0, MAX_STORED_VIEWS));
			};

			request.onerror = (event) => {
				appLog.error("[interestStore] getAll request failed", event);
				db.close();
				resolve([]);
			};
		});
	},

	async upsertMany(rows: Omit<StoredInterestView, "updatedAt">[]): Promise<void> {
		if (rows.length === 0) return;

		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const now = Date.now();

			for (const row of rows) {
				store.put({ ...row, updatedAt: now });
			}

			tx.oncomplete = () => {
				db.close();
				resolve();
				void this.cleanup();
			};

			tx.onerror = (e) => {
				appLog.error("[interestStore] IDB Upsert Error", e);
				db.close();
				resolve();
			};
		});
	},

	async cleanup(): Promise<void> {
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const rows = (request.result as StoredInterestView[]) || [];
				const now = Date.now();
				const toDelete: string[] = [];

				// 1. Mark all items older than 30 days or preview placeholders for deletion
				rows.forEach((row) => {
					if (row.profileId.startsWith("preview:") || now - (row.timestamp ?? row.updatedAt) > MAX_VIEW_AGE_MS) {
						toDelete.push(row.profileId);
					}
				});

				// 2. If still exceeding limit, remove the oldest entries
				const remaining = rows
					.filter((r) => !toDelete.includes(r.profileId))
					.sort((a, b) => (b.timestamp ?? b.updatedAt) - (a.timestamp ?? a.updatedAt));

				if (remaining.length > MAX_STORED_VIEWS) {
					remaining.slice(MAX_STORED_VIEWS).forEach((r) => {
						toDelete.push(r.profileId);
					});
				}

				// Perform deletions
				for (const id of toDelete) {
					store.delete(id);
				}
			};

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (event) => {
				appLog.error("[interestStore] cleanup transaction failed", event);
				db.close();
				resolve();
			};
		});
	},

	async clear(): Promise<void> {
		const db = await openDatabase();
		if (!db) {
			try {
				window.indexedDB.deleteDatabase(DB_NAME);
			} catch {}
			return;
		}

		return new Promise((resolve) => {
			let isDone = false;
			const finish = () => {
				if (isDone) return;
				isDone = true;
				try { db.close(); } catch {}
				resolve();
			};

			try {
				const tx = db.transaction(STORE_NAME, "readwrite");
				const store = tx.objectStore(STORE_NAME);
				store.clear();

				tx.oncomplete = finish;
				tx.onerror = finish;
			} catch {
				finish();
			}

			// Timeout fallback
			setTimeout(() => {
				if (!isDone) {
					finish();
					try { window.indexedDB.deleteDatabase(DB_NAME); } catch {}
				}
			}, 1000);
		});
	},

	async deleteMany(ids: string[]): Promise<void> {
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			for (const id of ids) {
				store.delete(id);
			}

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (event) => {
				appLog.error("[interestStore] deleteMany transaction failed", event);
				db.close();
				resolve();
			};
		});
	},
};

export type { StoredInterestView };