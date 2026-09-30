import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { useAuth } from "../../contexts/useAuth";
import {
	accountDbExists,
	applyAccountSettingsSnapshot,
	listAccountDbProfileIds,
	readAccountSettingsSnapshot,
} from "../../services/chatDb";
import { getSavedAccountProfile } from "../../services/savedAccountProfiles";
import { appLog } from "../../utils/logger";

type SourceAccount = { profileId: number; label: string };

/**
 * Copies another account's settings into the signed-in one, for moving to a
 * new Grindr account on the same device. Lists every other account that
 * still has data here, including ones already removed from the switcher.
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
			const snapshot = await readAccountSettingsSnapshot(source.profileId);
			await applyAccountSettingsSnapshot(snapshot);
			toast.success(
				t("data_backup.copy_settings.success", {
					defaultValue: "Settings copied from {{name}}. Reloading…",
					name: source.label,
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
							defaultValue: "Couldn't copy the settings.",
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
								defaultValue: "Copy settings from another account",
							})}
						</p>
						<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
							{t("data_backup.copy_settings.desc", {
								defaultValue:
									"Brings your auto-block rules and keywords, filters, privacy options, location, saved phrases and saved locations over from an account that has data on this device. Chats, blocks and viewers stay with that account.",
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
							{t("data_backup.copy_settings.action", { defaultValue: "Copy here" })}
						</button>
					</div>
				))}
			</div>

			<ConfirmDialog
				isOpen={confirmSource != null}
				title={t("data_backup.copy_settings.confirm_title", {
					defaultValue: "Copy settings from {{name}}?",
					name: confirmSource?.label ?? "",
				})}
				message={t("data_backup.copy_settings.confirm_message", {
					defaultValue:
						"This account's auto-block, filter, privacy and location settings are replaced with {{name}}'s. Saved phrases and saved locations are added to the ones you have. Chats and the block list don't move: to bring the block list, use Import on the Blocked page. The app reloads when it's done.",
					name: confirmSource?.label ?? "",
				})}
				confirmLabel={t("data_backup.copy_settings.confirm", { defaultValue: "Copy settings" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				isProcessing={isCopying}
				onConfirm={() => (confirmSource ? copyFrom(confirmSource) : undefined)}
				onCancel={() => setConfirmSource(null)}
			/>
		</div>
	);
}
