import { useEffect, useState } from "react";
import { Clock, Download, Lock, Pencil, Plus, RefreshCw, Save, Tag, Trash2, Upload, Workflow } from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useTranslation } from "react-i18next";
import { Slider } from "../../components/ui/range-slider";
import { useAuth } from "../../contexts/useAuth";
import { getAutomationSettings, setAutomationSettings } from "../../utils/autoblock";
import {
	createEmptyAutomationRule,
	getAutomationRules,
	setAutomationRules,
	type AutomationRule,
} from "../../utils/automationRules";
import { AutomationRuleEditor } from "../../components/settings/AutomationRuleEditor";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import type { Album } from "../../types/albums";

function Chip({ tone, children }: { tone: "trigger" | "condition" | "action" | "neutral"; children: React.ReactNode }) {
	const toneClass =
		tone === "trigger"
			? "bg-blue-500/15 text-blue-300"
			: tone === "condition"
				? "bg-purple-500/15 text-purple-300"
				: tone === "action"
					? "bg-orange-500/15 text-orange-300"
					: "bg-[var(--surface-2)] text-[var(--text-muted)]";
	return (
		<span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${toneClass}`}>
			{children}
		</span>
	);
}

export function SettingsAutomationPage() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const { settingsReady } = useAuth();

	const [rules, setRules] = useState<AutomationRule[]>(() => getAutomationRules());
	const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
	const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
	const [albums, setAlbums] = useState<Album[]>([]);

	useEffect(() => {
		apiFunctions.listAlbums().then(setAlbums).catch(() => {});
	}, [apiFunctions]);

	// The automation caches (rules + legacy auto-block/refresh settings) load
	// asynchronously right after login (see AuthContext) and only afterwards
	// does settingsReady flip true. Landing on this page before that finishes
	// would otherwise permanently freeze this page's state on an empty/stale
	// snapshot taken at mount — re-sync once the cache is guaranteed loaded.
	useEffect(() => {
		if (!settingsReady) return;
		setRules(getAutomationRules());
		const settings = getAutomationSettings();
		setForbiddenWords(settings.forbiddenWords);
		setRefreshEnabled(settings.refreshEnabled);
		setRefreshInterval(settings.refreshInterval);
	}, [settingsReady]);

	const persistRules = (next: AutomationRule[]) => {
		setRules(next);
		void setAutomationRules(next);
	};

	const handleToggleRule = (id: string, enabled: boolean) => {
		persistRules(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
	};

	const handleSaveRule = (rule: AutomationRule) => {
		const exists = rules.some((r) => r.id === rule.id);
		persistRules(exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]);
		setEditingRule(null);
		toast.success(t("settings_automation.rule_saved"));
	};

	const handleDeleteRule = () => {
		if (!deletingRuleId) return;
		if (rules.find((r) => r.id === deletingRuleId)?.locked) {
			setDeletingRuleId(null);
			return;
		}
		persistRules(rules.filter((r) => r.id !== deletingRuleId));
		setDeletingRuleId(null);
		toast.success(t("settings_automation.rule_deleted"));
	};

	const [forbiddenWords, setForbiddenWords] = useState(() => getAutomationSettings().forbiddenWords);
	const [refreshEnabled, setRefreshEnabled] = useState(() => getAutomationSettings().refreshEnabled);
	const [refreshInterval, setRefreshInterval] = useState(() => getAutomationSettings().refreshInterval);

	const handleToggleRefresh = (val: boolean) => {
		setRefreshEnabled(val);
		void setAutomationSettings({ refreshEnabled: val });
		toast.success(val ? t("settings_automation.auto_refresh_enabled") : t("settings_automation.auto_refresh_disabled"), { id: "refresh-toggle" });
	};

	const handleSaveAutoBlock = () => {
		void setAutomationSettings({ forbiddenWords });
		toast.success(t("settings_automation.block_rules_updated"));
	};

	const handleSaveRefresh = () => {
		void setAutomationSettings({ refreshInterval });
		toast.success(t("settings_automation.refresh_settings_updated"));
	};

	const handleExport = () => {
		const blob = new Blob([forbiddenWords], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "free-grind-keywords.txt";
		a.click();
		URL.revokeObjectURL(url);
		toast.success(t("settings_automation.keywords_exported"));
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			setForbiddenWords(text);
			toast.success(t("settings_automation.keywords_imported"));
		};
		reader.readAsText(file);
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.automation")}</h1>
				<p className="app-subtitle">{t("settings.automation_desc")}</p>
			</header>

			<div className="grid gap-6">
				{/* CUSTOM RULES */}
				<div>
					<div className="mb-2 flex items-center justify-between px-1">
						<div className="flex items-center gap-2">
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_automation.custom_rules_title")}
							</p>
							<span className="rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--accent-contrast)]">
								{t("settings_automation.experimental_badge")}
							</span>
						</div>
						<button
							type="button"
							disabled={!settingsReady}
							onClick={() => setEditingRule(createEmptyAutomationRule())}
							className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--surface-2)] disabled:pointer-events-none disabled:opacity-50"
						>
							<Plus className="h-3.5 w-3.5" />
							{t("settings_automation.add_rule")}
						</button>
					</div>

					{!settingsReady ? (
						<div className="surface-card flex items-center justify-center p-6">
							<p className="text-sm text-[var(--text-muted)]">{t("settings_automation.loading_rules")}</p>
						</div>
					) : rules.length === 0 ? (
						<div className="surface-card flex flex-col items-center gap-2 p-6 text-center">
							<Workflow className="h-6 w-6 text-[var(--text-muted)]" />
							<p className="text-sm text-[var(--text-muted)]">{t("settings_automation.no_rules_yet")}</p>
						</div>
					) : (
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{rules.map((rule) => (
								<div
									key={rule.id}
									className={`flex items-start gap-3 p-4 transition-opacity ${rule.enabled ? "" : "opacity-55"}`}
								>
									<div className="shrink-0 rounded-2xl bg-indigo-500/15 p-2.5 text-indigo-400">
										<Workflow className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-3">
											<p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">
												{rule.nameKey ? t(rule.nameKey) : rule.name || t("settings_automation.unnamed_rule")}
											</p>
											<label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
												<input
													type="checkbox"
													checked={rule.enabled}
													onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
													className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
												/>
												<span className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface-2)] transition-colors peer-checked:border-transparent peer-checked:bg-[var(--accent)]" />
												<span className="absolute left-1 h-5 w-5 rounded-full bg-[var(--text)] transition-transform peer-checked:translate-x-5 peer-checked:bg-[var(--accent-contrast)]" />
											</label>
										</div>

										<div className="mt-2 grid gap-2">
											<div className="grid gap-1">
												<span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
													{t("settings_automation.rule_when_label")}
													{rule.triggers.length > 1 && ` (${t("settings_automation.match_mode_any")})`}
												</span>
												<div className="flex flex-wrap gap-1.5">
													{rule.triggers.map((trig) => (
														<Chip key={trig} tone="trigger">
															{t(`settings_automation.rule_trigger_${trig}`)}
														</Chip>
													))}
												</div>
											</div>

											{rule.conditions.length > 0 && (
												<div className="grid gap-1">
													<span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
														{t("settings_automation.conditions_label")}
														{rule.conditions.length > 1 &&
															` (${t(`settings_automation.match_mode_${rule.matchMode}`)})`}
													</span>
													<div className="flex flex-wrap gap-1.5">
													{rule.conditions.map((c, i) => (
														<Chip key={i} tone="condition">
															{c.type === "profile_picture"
																? t(`settings_automation.condition_${c.has ? "has" : "no"}_profile_picture`)
																: c.type === "bio_contains_keyword" ||
																	  c.type === "message_contains_keyword" ||
																	  c.type === "display_name_contains_keyword"
																	? t(`settings_automation.condition_short_${c.type}`)
																	: t(`settings_automation.condition_${c.type}`)}
															{(c.type === "age_above" || c.type === "age_below") && ` ${c.value}`}
															{(c.type === "bio_contains_keyword" ||
																c.type === "message_contains_keyword" ||
																c.type === "display_name_contains_keyword") &&
																(c.useForbiddenList
																	? `: ${t("settings_automation.keyword_source_forbidden")}`
																	: c.keywords && `: ${c.keywords}`)}
														</Chip>
													))}
													</div>
												</div>
											)}

											<div className="grid gap-1">
												<span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
													{t("settings_automation.rule_then_label")}
												</span>
												<div className="flex flex-wrap gap-1.5">
													{rule.actions.map((a, i) => (
														<Chip key={i} tone="action">
															{t(`settings_automation.action_${a.type}`)}
														</Chip>
													))}
												</div>
											</div>
										</div>

										<div className="mt-2 flex items-center justify-end gap-4">
											<button
												type="button"
												onClick={() => setEditingRule(rule)}
												className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]"
											>
												<Pencil className="h-3.5 w-3.5" />
												{t("settings_automation.edit_rule")}
											</button>
											{rule.locked ? (
												<span
													className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] opacity-60"
													title={t("settings_automation.locked_rule_hint")}
												>
													<Lock className="h-3.5 w-3.5" />
													{t("settings_automation.locked_rule")}
												</span>
											) : (
											<button
												type="button"
												onClick={() => setDeletingRuleId(rule.id)}
												className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 transition hover:text-red-300"
											>
												<Trash2 className="h-3.5 w-3.5" />
												{t("settings_automation.delete_rule")}
											</button>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* FORBIDDEN KEYWORDS */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.forbidden_keywords_title")}
					</p>
					<div className="surface-card overflow-hidden">
						<div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
								<Tag className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
									{t("settings_automation.forbidden_keywords_desc")}
								</p>
								<textarea
									value={forbiddenWords}
									onChange={(e) => setForbiddenWords(e.target.value)}
									placeholder={t("settings_automation.keywords_placeholder")}
									className="input-field mt-3 min-h-[100px] resize-y"
								/>
								<div className="mt-2 grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={handleExport}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]"
									>
										<Download className="h-3.5 w-3.5" />
										{t("settings_automation.export_txt")}
									</button>
									<label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]">
										<Upload className="h-3.5 w-3.5" />
										{t("settings_automation.import_txt")}
										<input type="file" accept=".txt" onChange={handleImport} className="hidden" />
									</label>
								</div>
							</div>
						</div>

						<div className="border-t border-[var(--border)] p-4">
							<button
								type="button"
								onClick={handleSaveAutoBlock}
								className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
							>
								<Save className="h-4 w-4" />
								{t("settings_automation.update_block_rules")}
							</button>
						</div>
					</div>
				</div>

				{/* AUTO REFRESH */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.auto_refresh_title")}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						<ToggleRow
							icon={<RefreshCw className="h-5 w-5" />}
							iconClass="bg-green-500/15 text-green-400"
							label={t("settings_automation.enable_refresh")}
							description={t("settings_automation.enable_refresh_desc")}
							checked={refreshEnabled}
							onChange={handleToggleRefresh}
						/>

						{refreshEnabled && <div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-blue-500/15 p-2.5 text-blue-400">
								<Clock className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
										{t("settings_automation.refresh_interval")}
									</p>
									<span className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-bold">
										{t("settings_automation.refresh_interval_unit", { count: refreshInterval })}
									</span>
								</div>
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
									{t("settings_automation.refresh_technical_note")}
								</p>
								<div className="mt-3 px-2">
									<Slider
										label=""
										hideHeader
										min={5}
										max={60}
										step={5}
										defaultValue={Number(refreshInterval)}
										displayValue={t("settings_automation.refresh_interval_unit", { count: refreshInterval })}
										onChange={(val) => setRefreshInterval(String(val))}
									/>
									<div className="flex justify-between mt-1">
										<span className="text-[10px] text-[var(--text-muted)]">5 min</span>
										<span className="text-[10px] text-[var(--text-muted)]">60 min</span>
									</div>
								</div>
							</div>
						</div>}

						{refreshEnabled && <div className="p-4">
							<button
								type="button"
								onClick={handleSaveRefresh}
								className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
							>
								<Save className="h-4 w-4" />
								{t("settings_automation.update_refresh_settings")}
							</button>
						</div>}
					</div>
				</div>
			</div>

			<AutomationRuleEditor
				isOpen={editingRule !== null}
				rule={editingRule}
				albums={albums}
				onSave={handleSaveRule}
				onCancel={() => setEditingRule(null)}
			/>

			<ConfirmDialog
				isOpen={deletingRuleId !== null}
				title={t("settings_automation.delete_rule")}
				message={t("settings_automation.delete_rule_confirm")}
				confirmLabel={t("settings_automation.delete_rule")}
				cancelLabel={t("settings_automation.cancel")}
				confirmTone="danger"
				onConfirm={handleDeleteRule}
				onCancel={() => setDeletingRuleId(null)}
			/>
		</section>
	);
}
