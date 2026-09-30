import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { useAuth } from "../../contexts/useAuth";
import {
	accountDbExists,
	applyAccountSettingsSnapshot,
	insertMovedHistoryRows,
	listAccountDbProfileIds,
	readAccountHistorySnapshot,
	readAccountSettingsSnapshot,
	replacePastContacts,
} from "../../services/chatDb";
import { getSavedAccountProfile } from "../../services/savedAccountProfiles";
import { appLog } from "../../utils/logger";
import { buildPastContacts } from "../../utils/pastContactRules";

type SourceAccount = { profileId: number; label: string };

/**
 * Moves what another account on this device knew into the signed-in one,
 * for starting over with a new Grindr account: its settings, its Stats
 * history, and a per-person memory of who wrote, who got an answer and who
 * was blocked (see utils/pastContactRules.ts). Lists every other account
 * that still has data here, even one signed out or removed from the
 * switcher. Running it again replaces the memory from that account.
 */
export function CopyAccountSettingsCard() {
	const { t } = useTranslation();
	const { userId, savedAccounts, settingsReady } = useAuth();
	const [sources, setSources] = useState<SourceAccount[]>([]);
	const [confirmSource, setConfirmSource] = useState<SourceAccount | null>(null);
	const [isCopying, setIsCopying] = useState(false);

	useEffect(() => {
		if (!settingsReady || userId == null) {
			setSources([]);
			return;
		}
		let cancelled = false;
		void (async () => {
			const ids = new Set<number>(await listAccountDbProfileIds());
			for (const account of savedAccounts) {
				const id = Number(account.profileId);
				if (Number.isSafeInteger(id) && id > 0) ids.add(id);
			}
			ids.delete(userId);
			const found: SourceAccount[] = [];
			for (const profileId of ids) {
				if (!(await accountDbExists(profileId))) continue;
				const saved = savedAccounts.find((account) => account.profileId === String(profileId));
				const label =
					getSavedAccountProfile(String(profileId)).displayName ||
					saved?.email ||
					t("data_backup.copy_settings.unnamed_account", {
						defaultValue: "Account {{id}}",
						id: profileId,
					});
				found.push({ profileId, label });
			}
			if (!cancelled) setSources(found);
		})();
		return () => {
			cancelled = true;
		};
	}, [settingsReady, userId, savedAccounts, t]);

	if (sources.length === 0) {
		return null;
	}

	const copyFrom = async (source: SourceAccount) => {
		setIsCopying(true);
		try {
			// Read everything before writing anything, so a source that can't
			// be read leaves this account untouched.
			const settings = await readAccountSettingsSnapshot(source.profileId);
			const history = await readAccountHistorySnapshot(source.profileId);
			const contacts = buildPastContacts({
				sourceProfileId: String(source.profileId),
				messages: history.messages,
				loggedBlocks: history.loggedBlocks,
				displayNames: history.displayNames,
			});

			await applyAccountSettingsSnapshot(settings);
			await replacePastContacts(String(source.profileId), contacts);
			for (const { table, rows } of history.historyRows) {
				await insertMovedHistoryRows(table, rows);
			}
			toast.success(
				t("data_backup.copy_settings.success", {
					defaultValue: "Moved from {{name}}: {{count}} people remembered. Reloading…",
					name: source.label,
					count: contacts.length,
				}),
			);
			// Every copied setting is cached in memory or React state and only
			// loaded at start or on an account switch, like after an import.
			window.location.reload();
		} catch (error) {
			appLog.error("[copy-settings] failed", error);
			toast.error(
				error instanceof Error && error.message
					? error.message
					: t("data_backup.copy_settings.failed", {
							defaultValue: "Couldn't move the data.",
						}),
			);
			setIsCopying(false);
			setConfirmSource(null);
		}
	};

	return (
		<div>
			<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
				{t("data_backup.copy_settings.section", { defaultValue: "Other accounts" })}
			</p>
			<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
				<div className="flex items-start gap-3 px-4 py-3.5">
					<div className="shrink-0 rounded-2xl bg-sky-500/15 p-2.5 text-sky-400">
						<Copy className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold leading-snug">
							{t("data_backup.copy_settings.title", {
								defaultValue: "Move from another account",
							})}
						</p>
						<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
							{t("data_backup.copy_settings.desc", {
								defaultValue:
									"Brings over from an account that has data on this device: your settings, auto-block rules and keywords, filters, privacy, location, saved phrases and places, the Stats history, and a memory of everyone that account talked to or blocked, shown in chats, the inbox and profiles. Old chats and viewers stay with that account; the block list is imported on the Blocked page.",
							})}
						</p>
					</div>
				</div>
				{sources.map((source) => (
					<div key={source.profileId} className="flex items-center justify-between gap-4 px-4 py-3.5">
						<p className="min-w-0 truncate text-sm font-medium text-[var(--text)]">{source.label}</p>
						<button
							type="button"
							onClick={() => setConfirmSource(source)}
							disabled={isCopying}
							className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface)] disabled:opacity-50"
						>
							{isCopying && confirmSource?.profileId === source.profileId ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
							{t("data_backup.copy_settings.action", { defaultValue: "Move here" })}
						</button>
					</div>
				))}
			</div>

			<ConfirmDialog
				isOpen={confirmSource != null}
				title={t("data_backup.copy_settings.confirm_title", {
					defaultValue: "Move from {{name}}?",
					name: confirmSource?.label ?? "",
				})}
				message={t("data_backup.copy_settings.confirm_message", {
					defaultValue:
						"This account's settings are replaced with {{name}}'s, and its Stats history and memory of past contacts are added. Saved phrases and places are added to yours. Old chats and the block list don't move: to bring the block list, use Import on the Blocked page. The app reloads when it's done.",
					name: confirmSource?.label ?? "",
				})}
				confirmLabel={t("data_backup.copy_settings.confirm", { defaultValue: "Move" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				isProcessing={isCopying}
				onConfirm={() => (confirmSource ? copyFrom(confirmSource) : undefined)}
				onCancel={() => setConfirmSource(null)}
			/>
		</div>
	);
}
