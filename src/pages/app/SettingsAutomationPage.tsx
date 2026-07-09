import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
    Ban, Clock, Download, RefreshCw, Save, Tag, Upload, Users, 
    Wand2, Trash2, Eye, ShieldAlert, Crosshair,
    ShieldCheck, Plus, LockKeyhole, Workflow, Loader2
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useTranslation } from "react-i18next";
import { RangeSlider, Slider } from "../../components/ui/range-slider";
import { interestViewsStore } from "../../services/interestViewsStore";
import { getLookingForOptions } from "./profile-option-builders";
import { getAutoBlockWhitelist, removeFromAutoBlockWhitelist } from "../../utils/privacy";
import { useAuth } from "../../contexts/useAuth";
import { getAutomationSettings, setAutomationSettings } from "../../utils/autoblock";
import {
	createEmptyAutomationRule,
	getAutomationRules,
	setAutomationRules,
	type AutomationRule,
	type AutomationRuleCondition,
} from "../../utils/automationRules";
import { AutomationRuleEditor } from "../../components/settings/AutomationRuleEditor";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import type { Album } from "../../types/albums";

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// Only the three top-level structural words (when / and / then) are
// highlighted bright; everything else — including the or/and used to join
// multiple triggers, conditions, or actions — stays subtle/muted.
function keyword(text: string, key: string): React.ReactNode {
	return (
		<span key={key} className="font-semibold text-[var(--text)]">
			{text}
		</span>
	);
}

// Pushes `items` into `nodes`, comma-separated with a plain-text `conjunction`
// before the last one (e.g. "a, b or c"). Only the three structural words
// (when / and / then) get the bright highlight treatment, not these.
function pushJoined(nodes: React.ReactNode[], items: string[], conjunction: string) {
	items.forEach((item, i) => {
		if (i > 0) {
			nodes.push(", ");
			if (i === items.length - 1) {
				nodes.push(`${conjunction} `);
			}
		}
		nodes.push(item);
	});
}

function describeCondition(c: AutomationRuleCondition, t: TFunc): string {
	switch (c.type) {
		case "profile_picture":
			return t(c.has ? "settings_automation.phrase_has_profile_picture" : "settings_automation.phrase_no_profile_picture");
		case "age_above":
			return t("settings_automation.phrase_age_above", { value: c.value });
		case "age_below":
			return t("settings_automation.phrase_age_below", { value: c.value });
		case "bio_contains_keyword":
			return renderKeywordCondition(t, "bio", c);
		case "message_contains_keyword":
			return renderKeywordCondition(t, "message", c);
		case "display_name_contains_keyword":
			return renderKeywordCondition(t, "display_name", c);
	}
}

function renderKeywordCondition(
	t: TFunc,
	kind: "bio" | "message" | "display_name",
	c: { useForbiddenList?: boolean; keywords: string; negate?: boolean },
): string {
	const variant = c.negate ? "prefix_not" : "prefix";
	const suffixVariant = c.negate ? "suffix_not" : "suffix";
	const prefix = t(`settings_automation.phrase_${kind}_${variant}`);
	const suffix = t(`settings_automation.phrase_${kind}_${suffixVariant}`).trim();
	const value = c.useForbiddenList ? t("settings_automation.keyword_source_forbidden") : `"${c.keywords}"`;
	return suffix ? `${prefix} ${value} ${suffix}` : `${prefix} ${value}`;
}

function describeRule(rule: AutomationRule, t: TFunc): React.ReactNode[] {
	const triggerPhrases = rule.triggers.map((trig) => t(`settings_automation.trigger_phrase_${trig}`));
	const actionPhrases = rule.actions.map((a) => t(`settings_automation.action_phrase_${a.type}`));

	const or = t("settings_automation.rule_or_label");
	const and = t("settings_automation.rule_and_label");

	const nodes: React.ReactNode[] = [keyword(t("settings_automation.phrase_when"), "when"), " "];
	pushJoined(nodes, triggerPhrases, or);

	if (rule.conditions.length > 0) {
		const conditionPhrases = rule.conditions.map((c) => describeCondition(c, t));
		const conditionConjunction = rule.matchMode === "any" ? or : and;
		nodes.push(" ", keyword(and, "cond-lead"), " ");
		pushJoined(nodes, conditionPhrases, conditionConjunction);
	}

	nodes.push(" ", keyword(t("settings_automation.phrase_then"), "then"), " ");
	pushJoined(nodes, actionPhrases, and);
	return nodes;
}

export function SettingsAutomationPage() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const apiFunctions = useApiFunctions();
	const { settingsReady } = useAuth();

	// --- 1. Automation Rules State ---
	const [rules, setRules] = useState<AutomationRule[]>(() => getAutomationRules());
	const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
	const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
	const [albums, setAlbums] = useState<Album[]>([]);

	useEffect(() => {
		apiFunctions.listAlbums().then(setAlbums).catch(() => {});
	}, [apiFunctions]);

	// --- 2. Auto Block State ---
	const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
	const [forbiddenWords, setForbiddenWords] = useState(() => getAutomationSettings().forbiddenWords);
	const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") ?? "18");
	const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") ?? "99");
	const [blockNoAge, setBlockNoAge] = useState(() => window.localStorage.getItem("fg-block-no-age") === "true");
	const [maxDistance, setMaxDistance] = useState(() => window.localStorage.getItem("fg-block-max-distance") ?? "50");
	const [isClearKeywordsConfirmOpen, setIsClearKeywordsConfirmOpen] = useState(false);
	const [isClearViewsConfirmOpen, setIsClearViewsConfirmOpen] = useState(false);

	// Keyword Targets
	const [blockName, setBlockName] = useState(() => window.localStorage.getItem("fg-block-name") !== "false");
	const [blockBio, setBlockBio] = useState(() => window.localStorage.getItem("fg-block-bio") !== "false");
	const [blockMessage, setBlockMessage] = useState(() => window.localStorage.getItem("fg-block-message") !== "false");
	
	// Bot Evasion & Background Scanner
	const [blockFirstMedia, setBlockFirstMedia] = useState(() => window.localStorage.getItem("fg-block-first-media") === "true");
	const [blockMediaDelayEnabled, setBlockMediaDelayEnabled] = useState(() => window.localStorage.getItem("fg-block-media-delay-enabled") === "true");
	const [blockMediaDelayMinutes, setBlockMediaDelayMinutes] = useState(() => window.localStorage.getItem("fg-block-media-delay-minutes") || "2");
	const [inboxScannerEnabled, setInboxScannerEnabled] = useState(() => window.localStorage.getItem("fg-inbox-scanner-enabled") === "true");
	const [skipBlockAfterTwo, setSkipBlockAfterTwo] = useState(() => window.localStorage.getItem("fg-autoblock-skip-after-two") === "true");

	const [whitelist, setWhitelist] = useState<{ profileId: string; displayName: string }[]>([]);
	useEffect(() => {
		setWhitelist(getAutoBlockWhitelist());
	}, []);

	// Grindr Tags Block State
	const [blockedLookingForMode, setBlockedLookingForMode] = useState(() => window.localStorage.getItem("fg-block-looking-for-mode") || "any");
	const [blockedLookingFor, setBlockedLookingFor] = useState<number[]>(() => {
		try {
			const saved = window.localStorage.getItem("fg-block-looking-for");
			return saved ? JSON.parse(saved) as number[] : [];
		} catch {
			return [];
		}
	});

	// --- 3. Views Recovery State ---
	const [viewScannerEnabled, setViewScannerEnabled] = useState(() => window.localStorage.getItem("fg-view-scanner") !== "false");
	const [viewScannerInterval, setViewScannerInterval] = useState(() => window.localStorage.getItem("fg-view-scanner-interval") || "30");
	const [unlockedViewsCount, setUnlockedViewsCount] = useState<number | null>(null);
	const [lockedViewsCount, setLockedViewsCount] = useState<number | null>(null);
	const [lastViewScanTime, setLastViewScanTime] = useState(() => window.localStorage.getItem("fg-view-scanner-last-run"));

	// --- 4. Auto Refresh State ---
	const [refreshEnabled, setRefreshEnabled] = useState(() => getAutomationSettings().refreshEnabled);
	const [refreshInterval, setRefreshInterval] = useState(() => getAutomationSettings().refreshInterval);

	// Sync states on settingsReady
	useEffect(() => {
		if (!settingsReady) return;
		setRules(getAutomationRules());
		const settings = getAutomationSettings();
		setForbiddenWords(settings.forbiddenWords);
		setRefreshEnabled(settings.refreshEnabled);
		setRefreshInterval(settings.refreshInterval);
	}, [settingsReady]);

	// --- Handlers ---
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
		setEditingRule(null);
		toast.success(t("settings_automation.rule_deleted"));
	};

	const handleToggleRefresh = (val: boolean) => {
		setRefreshEnabled(val);
		void setAutomationSettings({ refreshEnabled: val });
		toast.success(val ? t("settings_automation.auto_refresh_enabled") : t("settings_automation.auto_refresh_disabled"), { id: "refresh-toggle" });
	};

	const handleToggleChatBlock = (val: boolean) => {
		setBlockOnChat(val);
		window.localStorage.setItem("fg-block-chat", String(val));
		toast.success(val ? t("settings_automation.chat_block_enabled", { defaultValue: "Inbox Blocking Enabled" }) : t("settings_automation.chat_block_disabled", { defaultValue: "Inbox Blocking Disabled" }), { id: "chat-block-toggle" });
	};

	const handleToggleInboxScanner = (val: boolean) => {
		setInboxScannerEnabled(val);
		window.localStorage.setItem("fg-inbox-scanner-enabled", String(val));
		toast.success(val ? "Background Scanner Enabled" : "Background Scanner Disabled", { id: "scanner-toggle" });
		if (val) {
			window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
		}
	};

	const handleToggleViewScanner = (val: boolean) => {
		setViewScannerEnabled(val);
		window.localStorage.setItem("fg-view-scanner", String(val));
		toast.success(val ? "Views Recovery Enabled" : "Views Recovery Disabled", { id: "view-scanner-toggle" });
	};

	// Live update the Views Recovery Stats every 5 seconds
	useEffect(() => {
		const fetchStats = () => {
			void interestViewsStore.getAll().then(rows => {
				const unlocked = rows.filter(r => r.profileId && !r.profileId.startsWith("preview:"));
				const locked = rows.filter(r => r.profileId && r.profileId.startsWith("preview:"));
				setUnlockedViewsCount(unlocked.length);
				setLockedViewsCount(locked.length);
			});
			setLastViewScanTime(window.localStorage.getItem("fg-view-scanner-last-run"));
		};
		fetchStats();
		const interval = setInterval(fetchStats, 5000);
		return () => clearInterval(interval);
	}, []);

	const handleClearKeywords = () => {
		setForbiddenWords("");
		setIsClearKeywordsConfirmOpen(false);
		toast.success("All keywords cleared! (Click Save to apply)");
	};

	const handleClearViewsCache = () => {
		void interestViewsStore.clear().then(() => {
			queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
			queryClient.removeQueries({ queryKey: ["interest", "list"] });
			setUnlockedViewsCount(0);
			setLockedViewsCount(0);
			setIsClearViewsConfirmOpen(false);
			toast.success("Unlocked views cache has been cleared!");
		});
	};

	const handleSaveViewScanner = () => {
		window.localStorage.setItem("fg-view-scanner-interval", viewScannerInterval);
		toast.success("Views Recovery Settings Updated!");
	};

	const handleSaveAutoBlock = () => {
		const cleanedArray = forbiddenWords.split(',').map(word => word.trim()).filter(word => word.length > 0);
		const uniqueSortedWords = [...new Set(cleanedArray)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		const finalWordsString = uniqueSortedWords.join(', ');
		
		setForbiddenWords(finalWordsString);

		window.localStorage.setItem("fg-block-name", String(blockName));
		window.localStorage.setItem("fg-block-bio", String(blockBio));
		window.localStorage.setItem("fg-block-message", String(blockMessage));
		window.localStorage.setItem("fg-block-first-media", String(blockFirstMedia));
		window.localStorage.setItem("fg-block-media-delay-enabled", String(blockMediaDelayEnabled));
		window.localStorage.setItem("fg-block-media-delay-minutes", blockMediaDelayMinutes);
		window.localStorage.setItem("fg-block-min-age", minAge);
		window.localStorage.setItem("fg-block-max-age", maxAge);
		window.localStorage.setItem("fg-block-no-age", String(blockNoAge));
		window.localStorage.setItem("fg-block-max-distance", maxDistance);
		window.localStorage.setItem("fg-block-looking-for-mode", blockedLookingForMode);
		window.localStorage.setItem("fg-block-looking-for", JSON.stringify(blockedLookingFor));
		window.localStorage.setItem("fg-autoblock-skip-after-two", String(skipBlockAfterTwo));

		void setAutomationSettings({ forbiddenWords: finalWordsString });

		// Trigger immediate background scan with new rules
		window.dispatchEvent(new Event("fg-trigger-inbox-scan"));

		toast.success(t("settings_automation.block_rules_updated", { defaultValue: "Block Rules Updated!" }));
	};

	const handleSaveRefresh = () => {
		void setAutomationSettings({ refreshInterval, refreshEnabled });
		window.localStorage.setItem("fg-auto-refresh-interval", refreshInterval);
		toast.success(t("settings_automation.refresh_settings_updated", { defaultValue: "Refresh Settings Updated!" }));
	};

	const handleExport = () => {
		const blob = new Blob([forbiddenWords], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "free-grind-keywords.txt";
		a.click();
		URL.revokeObjectURL(url);
		toast.success(t("settings_automation.keywords_exported", { defaultValue: "Keywords Exported!" }));
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			setForbiddenWords(text);
			toast.success(t("settings_automation.keywords_imported", { defaultValue: "Keywords Imported! Remember to save." }));
		};
		reader.readAsText(file);
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.automation")}</h1>
				<p className="app-subtitle">{t("settings_automation.subtitle", { defaultValue: "Configure rules for auto-replying, custom blocking, and page refreshing." })}</p>
			</header>

			<div className="grid min-w-0 gap-6">

				{/* 1. CUSTOM RULES */}
				<div className="min-w-0">
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
						<div className="flex min-w-0 items-center gap-2">
							<Workflow className="h-4 w-4 text-[var(--accent)]" />
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_automation.custom_rules_title", { defaultValue: "Custom Rules" })}
							</p>
						</div>
						<Button
							type="button"
							size="sm"
							onClick={() => setEditingRule(createEmptyAutomationRule())}
							className="h-7 gap-1 px-2.5"
						>
							<Plus className="h-3.5 w-3.5" />
							{t("settings_automation.new_rule")}
						</Button>
					</div>

					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						{rules.length === 0 ? (
							<div className="flex flex-col items-center justify-center p-8 text-center">
								<div className="mb-3 rounded-full bg-[var(--surface-2)] p-3 text-[var(--text-muted)]">
									<LockKeyhole className="h-6 w-6" />
								</div>
								<p className="text-sm font-semibold">{t("settings_automation.no_rules_title")}</p>
								<p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
									{t("settings_automation.no_rules_desc")}
								</p>
							</div>
						) : (
							rules.map((rule) => (
								<div key={rule.id} className="flex items-start gap-3 p-4">
									<button
										type="button"
										onClick={() => setEditingRule(rule)}
										className="min-w-0 flex-1 text-left transition hover:opacity-80"
									>
										<p className="truncate text-sm font-semibold leading-snug">
											{rule.name || t("settings_automation.unnamed_rule")}
										</p>
										<p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
											{describeRule(rule, t)}
										</p>
									</button>
									<button
										type="button"
										onClick={() => handleToggleRule(rule.id, !rule.enabled)}
										className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
											rule.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
										}`}
									>
										<span
											className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
												rule.enabled ? "translate-x-5" : "translate-x-0"
											}`}
										/>
									</button>
								</div>
							))
						)}
					</div>
				</div>

				{/* 2. AUTO-BLOCK (LEGACY & CUSTOM BLOCKERS COMBINED) */}
				<div className="min-w-0">
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.autoblock_title", { defaultValue: "Auto-Block & Evasion" })}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						
						{/* Enable Inbox Auto-Blocker */}
						<ToggleRow
							icon={<Ban className="h-5 w-5" />}
							iconClass="bg-red-500/15 text-red-400"
							label={t("settings_automation.enable_chat_block", { defaultValue: "Enable Auto-Blocker" })}
							description={t("settings_automation.enable_chat_block_desc", { defaultValue: "Silently auto-blocks profiles matching your rules on incoming chats." })}
							checked={blockOnChat}
							onChange={handleToggleChatBlock}
						/>

						{blockOnChat && (
							<>
								{/* Targets configuration */}
								<div className="flex items-start gap-3 p-4 bg-[var(--surface-2)]/30">
									<div className="shrink-0 rounded-2xl bg-slate-500/15 p-2.5 text-slate-400">
										<Crosshair className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">Keyword Target Sections</p>
										<p className="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
											Select where matching keywords should trigger a block.
										</p>
										<div className="mt-3 flex flex-wrap gap-2">
											<button type="button" onClick={() => setBlockName(!blockName)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${blockName ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-readable)]" : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)]"}`}>
												Display Name
											</button>
											<button type="button" onClick={() => setBlockBio(!blockBio)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${blockBio ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-readable)]" : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)]"}`}>
												Profile Bio (About)
											</button>
											<button type="button" onClick={() => setBlockMessage(!blockMessage)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${blockMessage ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-readable)]" : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)]"}`}>
												Incoming Messages
											</button>
										</div>
									</div>
								</div>

								{/* Forbidden Keywords */}
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-amber-500/15 p-2.5 text-amber-400">
										<Tag className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between">
											<p className="text-sm font-semibold leading-snug">
												{t("settings_automation.forbidden_words", { defaultValue: "Forbidden Keywords" })}
											</p>
											<div className="flex items-center gap-1.5">
												<label className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 text-[var(--text-muted)] hover:text-[var(--text)] transition" title="Import Keywords">
													<Upload className="h-3.5 w-3.5" />
													<input type="file" accept=".txt" onChange={handleImport} className="hidden" />
												</label>
												<button type="button" onClick={handleExport} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 text-[var(--text-muted)] hover:text-[var(--text)] transition" title="Export Keywords">
													<Download className="h-3.5 w-3.5" />
												</button>
												<button type="button" onClick={() => setIsClearKeywordsConfirmOpen(true)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 text-red-500 hover:bg-red-500/10 transition" title="Clear Keywords">
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											</div>
										</div>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											{t("settings_automation.forbidden_words_desc", { defaultValue: "Comma-separated words (e.g. cash, sell, snap). Matches are case-insensitive and enforce word boundaries." })}
										</p>
										<div className="mt-3">
											<textarea
												value={forbiddenWords}
												onChange={(e) => setForbiddenWords(e.target.value)}
												placeholder="Enter keywords here..."
												className="textarea-field w-full h-24 text-xs font-mono"
											/>
										</div>
									</div>
								</div>

								{/* Bot Evasion */}
								<div className="flex items-start gap-3 p-4 bg-[var(--surface-2)]/30">
									<div className="shrink-0 rounded-2xl bg-cyan-500/15 p-2.5 text-cyan-400">
										<Wand2 className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">Bot Evasion & Protection</p>
										<p className="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
											Delay auto-block triggers to behave more like a human user.
										</p>
										
										<div className="mt-3 grid gap-3">
											<label className="flex items-start gap-2 cursor-pointer">
												<input type="checkbox" checked={blockFirstMedia} onChange={(e) => setBlockFirstMedia(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
												<span className="text-xs text-[var(--text-muted)] leading-relaxed">
													<strong className="text-[var(--text)]">Block profiles sharing media first.</strong> Automatically blocks any profile whose very first message is an image, video, or audio clip.
												</span>
											</label>

											<div className="border-t border-[var(--border)] pt-3">
												<label className="flex items-start gap-2 cursor-pointer">
													<input type="checkbox" checked={blockMediaDelayEnabled} onChange={(e) => setBlockMediaDelayEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
													<span className="text-xs text-[var(--text-muted)] leading-relaxed">
														<strong className="text-[var(--text)]">Enable humanized blocker delay.</strong> Delays the server-side block call to make it look natural to spam monitors.
													</span>
												</label>
												
												{blockMediaDelayEnabled && (
													<div className="mt-3 pl-6">
														<Slider
															label="Blocker Delay Interval (Minutes)"
															min={1}
															max={10}
															step={1}
															defaultValue={Number(blockMediaDelayMinutes)}
															displayValue={`${blockMediaDelayMinutes} min`}
															onChange={(val) => setBlockMediaDelayMinutes(String(val))}
														/>
													</div>
												)}
											</div>

											<div className="border-t border-[var(--border)] pt-3">
												<label className="flex items-start gap-2 cursor-pointer">
													<input type="checkbox" checked={inboxScannerEnabled} onChange={(e) => handleToggleInboxScanner(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
													<span className="text-xs text-[var(--text-muted)] leading-relaxed">
														<strong className="text-[var(--text)]">Enable background inbox scanner.</strong> Scans your inbox automatically in the background to clean out spam bots while the app is running.
													</span>
												</label>
											</div>

											<div className="border-t border-[var(--border)] pt-3">
												<label className="flex items-start gap-2 cursor-pointer">
													<input type="checkbox" checked={skipBlockAfterTwo} onChange={(e) => setSkipBlockAfterTwo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
													<span className="text-xs text-[var(--text-muted)] leading-relaxed">
														<strong className="text-[var(--text)]">Do not block after 2 outgoing messages.</strong> Skips auto-blocking if you have already sent 2 or more messages to them. Prevents blocking active chats.
													</span>
												</label>
											</div>
										</div>
									</div>
								</div>

								{/* Grindr tags blocker */}
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
										<Tag className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">Grindr Tag Blocker</p>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											Block users that have any of the checked Looking For tags in their profile.
										</p>

										<div className="mt-3 rounded-lg bg-[var(--surface-2)] p-2">
											<div className="flex items-center gap-4">
												<p className="text-xs font-semibold">Match Mode:</p>
												<label className="flex items-center gap-1.5 text-xs cursor-pointer">
													<input type="radio" name="tag-mode" value="any" checked={blockedLookingForMode === "any"} onChange={() => setBlockedLookingForMode("any")} className="accent-[var(--accent)]" />
													Block if matches ANY
												</label>
												<label className="flex items-center gap-1.5 text-xs cursor-pointer">
													<input type="radio" name="tag-mode" value="only" checked={blockedLookingForMode === "only"} onChange={() => setBlockedLookingForMode("only")} className="accent-[var(--accent)]" />
													Block if matches ONLY
												</label>
											</div>
											<div className="mt-1 px-1">
												<p className="text-[10px] text-[var(--text-muted)]">
													{blockedLookingForMode === "any" 
														? "Blocks the profile if they have any of your selected tags."
														: "Blocks the profile only if all their tags are in the selected list (e.g., if they exclusively want those tags)."}
												</p>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-2 mt-3">
											{getLookingForOptions(t).map((option) => (
												<label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer bg-[var(--surface-1)] p-2 rounded-lg border border-[var(--border)] transition hover:border-[var(--accent)]">
													<input type="checkbox" checked={blockedLookingFor.includes(option.value)} onChange={(e) => {
														if (e.target.checked) setBlockedLookingFor(prev => [...prev, option.value]);
														else setBlockedLookingFor(prev => prev.filter(v => v !== option.value));
													}} className="h-3.5 w-3.5 accent-[var(--accent)] shrink-0" />
													<span className="truncate">{option.label}</span>
												</label>
											))}
										</div>
									</div>
								</div>

								{/* Age & Distance Limits */}
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
										<Users className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">
											{t("settings_automation.age_limits_title", { defaultValue: "Age & Distance Limits" })}
										</p>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											{t("settings_automation.age_limits_desc", { defaultValue: "Block anyone outside of this range." })}
										</p>
										
										<div className="mt-4 px-2 grid gap-6">
											<RangeSlider
												label={t("browse_filters.age", { defaultValue: "Age Limit" })}
												min={18}
												max={99}
												minDefault={Number(minAge) || 18}
												maxDefault={Number(maxAge) || 99}
												onChange={(min, max) => {
													setMinAge(String(min));
													setMaxAge(String(max));
												}}
											/>
											
											<label className="flex items-start gap-2 -mt-2 cursor-pointer">
												<input type="checkbox" checked={blockNoAge} onChange={(e) => setBlockNoAge(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
												<span className="text-xs text-[var(--text-muted)] leading-relaxed">
													<strong className="text-[var(--text)]">Block profiles with no age set.</strong> Prevents profiles that hide their age from bypassing the age limit rules.
												</span>
											</label>
											
											<Slider
												label="Max Distance (Kilometers)"
												min={1}
												max={500}
												step={1}
												defaultValue={maxDistance === "" ? 500 : Math.min(Number(maxDistance), 500)}
												displayValue={maxDistance === "" || Number(maxDistance) >= 500 ? "No Limit" : `${maxDistance} km`}
												onChange={(val) => {
													if (val >= 500) setMaxDistance("");
													else setMaxDistance(String(val));
												}}
											/>
										</div>
									</div>
								</div>

								{/* Whitelisted exceptions */}
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-emerald-500/15 p-2.5 text-emerald-400">
										<ShieldCheck className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">Auto-Block Whitelist</p>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											Profiles added here are excluded from auto-blocking rules.
										</p>

										{whitelist.length === 0 ? (
											<p className="mt-3 text-xs text-[var(--text-muted)] italic">No profiles whitelisted yet.</p>
										) : (
											<div className="mt-3 max-h-[200px] overflow-y-auto border border-[var(--border)] rounded-xl bg-[var(--surface-1)] divide-y divide-[var(--border)]">
												{whitelist.map((profile) => (
													<div key={profile.profileId} className="flex items-center justify-between p-2.5 text-xs">
														<div className="min-w-0 flex-1 pr-2">
															<p className="font-semibold truncate">{profile.displayName}</p>
															<p className="text-[10px] text-[var(--text-muted)]">ID: {profile.profileId}</p>
														</div>
														<button
															type="button"
															onClick={() => {
																removeFromAutoBlockWhitelist(profile.profileId);
																setWhitelist(getAutoBlockWhitelist());
																toast.success(`Removed ${profile.displayName} from whitelist.`);
															}}
															className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-semibold text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition"
														>
															Remove
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>

								<div className="p-4">
									<button
										type="button"
										onClick={handleSaveAutoBlock}
										className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
									>
										<Save className="h-4 w-4" />
										{t("settings_automation.update_block_rules", { defaultValue: "Save Auto-Block Settings" })}
									</button>
								</div>
							</>
						)}
					</div>
				</div>

				{/* 3. VIEWS RECOVERY (GHOST SCANNER AND STATISTICS) */}
				<div className="min-w-0">
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						Background Views Recovery
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						
						{/* Toggle row for Views Recovery */}
						<ToggleRow
							icon={<Eye className="h-5 w-5" />}
							iconClass="bg-indigo-500/15 text-indigo-400"
							label="Enable Views Scanner"
							description="Runs in background and recovers profiles that viewed you, bypassing the premium wall."
							checked={viewScannerEnabled}
							onChange={handleToggleViewScanner}
						/>

						{viewScannerEnabled && (
							<>
								{/* Recovery Stats */}
								<div className="flex items-start gap-3 p-4 bg-[var(--surface-2)]/30">
									<div className="shrink-0 rounded-2xl bg-sky-500/15 p-2.5 text-sky-400">
										<ShieldAlert className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between">
											<p className="text-sm font-semibold leading-snug">Scanner Statistics</p>
											<button type="button" onClick={() => setIsClearViewsConfirmOpen(true)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1.5 text-red-500 hover:bg-red-500/10 transition" title="Reset Cache">
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
										<p className="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
											Cached profile logs collected by the background scanner.
										</p>
										
										<div className="grid grid-cols-2 gap-3 mt-4">
											<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
												<p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Unlocked Profiles</p>
												<p className="text-xl font-bold mt-1 text-emerald-400 tabular-nums">
													{unlockedViewsCount ?? <Loader2 className="h-4 w-4 animate-spin inline" />}
												</p>
												<p className="text-[10px] text-[var(--text-muted)] mt-0.5">Fully readable profiles</p>
											</div>
											<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
												<p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Masked Views</p>
												<p className="text-xl font-bold mt-1 text-amber-400 tabular-nums">
													{lockedViewsCount ?? <Loader2 className="h-4 w-4 animate-spin inline" />}
												</p>
												<p className="text-[10px] text-[var(--text-muted)] mt-0.5">Placeholder previews</p>
											</div>
										</div>
										<p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
											Last completed background scan: <strong className="text-[var(--text)]">{lastViewScanTime ? new Date(Number(lastViewScanTime)).toLocaleTimeString() : "Never"}</strong>
										</p>
									</div>
								</div>

								{/* Interval configuration */}
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-violet-500/15 p-2.5 text-violet-400">
										<Clock className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="min-w-0 flex-1 text-sm font-semibold leading-snug">Scan Interval</p>
											<span className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-bold">
												{viewScannerInterval} sec
											</span>
										</div>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											How often the background worker syncs view history. Faster is more real-time, but draws more battery.
										</p>
										<div className="mt-3 px-2">
											<Slider
												label=""
												hideHeader
												min={10}
												max={180}
												step={10}
												defaultValue={Number(viewScannerInterval)}
												displayValue={`${viewScannerInterval} sec`}
												onChange={(val) => setViewScannerInterval(String(val))}
											/>
											<div className="flex justify-between mt-1">
												<span className="text-[10px] text-[var(--text-muted)]">10 sec</span>
												<span className="text-[10px] text-[var(--text-muted)]">180 sec</span>
											</div>
										</div>
									</div>
								</div>

								<div className="p-4">
									<button
										type="button"
										onClick={handleSaveViewScanner}
										className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
									>
										<Save className="h-4 w-4" />
										Save Scanner Interval
									</button>
								</div>
							</>
						)}
					</div>
				</div>

				{/* 4. AUTO REFRESH */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.auto_refresh_title", { defaultValue: "Auto Refresh Grid" })}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						<ToggleRow
							icon={<RefreshCw className="h-5 w-5" />}
							iconClass="bg-green-500/15 text-green-400"
							label={t("settings_automation.enable_refresh", { defaultValue: "Enable Auto-Refresh" })}
							description={t("settings_automation.enable_refresh_desc", { defaultValue: "Automatically refresh the grid." })}
							checked={refreshEnabled}
							onChange={handleToggleRefresh}
						/>

						{refreshEnabled && (
							<>
								<div className="flex items-start gap-3 p-4">
									<div className="shrink-0 rounded-2xl bg-blue-500/15 p-2.5 text-blue-400">
										<Clock className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
												{t("settings_automation.refresh_interval", { defaultValue: "Refresh Interval" })}
											</p>
											<span className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-bold">
												{t("settings_automation.refresh_interval_unit", { count: Number(refreshInterval), defaultValue: `${refreshInterval} min` })}
											</span>
										</div>
										<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
											{t("settings_automation.refresh_technical_note", { defaultValue: "Too frequent refreshing may cause rate limits." })}
										</p>
										<div className="mt-3 px-2">
											<Slider
												label=""
												hideHeader
												min={5}
												max={60}
												step={5}
												defaultValue={Number(refreshInterval)}
												displayValue={t("settings_automation.refresh_interval_unit", { count: Number(refreshInterval), defaultValue: `${refreshInterval} min` })}
												onChange={(val) => setRefreshInterval(String(val))}
											/>
											<div className="flex justify-between mt-1">
												<span className="text-[10px] text-[var(--text-muted)]">5 min</span>
												<span className="text-[10px] text-[var(--text-muted)]">60 min</span>
											</div>
										</div>
									</div>
								</div>
								<div className="p-4">
									<button
										type="button"
										onClick={handleSaveRefresh}
										className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
									>
										<Save className="h-4 w-4" />
										{t("settings_automation.update_refresh_settings", { defaultValue: "Save Refresh Settings" })}
									</button>
								</div>
							</>
						)}
					</div>
				</div>

			</div>

			<AutomationRuleEditor
				isOpen={editingRule !== null}
				rule={editingRule}
				albums={albums}
				onSave={handleSaveRule}
				onCancel={() => setEditingRule(null)}
				onDelete={editingRule && !editingRule.locked ? () => setDeletingRuleId(editingRule.id) : undefined}
			/>

			<ConfirmDialog
				isOpen={deletingRuleId !== null}
				title={t("settings_automation.delete_rule", { defaultValue: "Delete Automation Rule" })}
				message={t("settings_automation.delete_rule_confirm", { defaultValue: "Are you sure you want to delete this automation rule?" })}
				confirmLabel={t("settings_automation.delete_rule", { defaultValue: "Delete Rule" })}
				cancelLabel={t("settings_automation.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				onConfirm={handleDeleteRule}
				onCancel={() => setDeletingRuleId(null)}
			/>

			<ConfirmDialog
				isOpen={isClearKeywordsConfirmOpen}
				title="Clear All Keywords"
				message="Are you sure you want to delete all your forbidden keywords? This cannot be undone unless you have a backup."
				confirmLabel="Delete All"
				cancelLabel="Cancel"
				onConfirm={handleClearKeywords}
				onCancel={() => setIsClearKeywordsConfirmOpen(false)}
				confirmTone="danger"
			/>

			<ConfirmDialog
				isOpen={isClearViewsConfirmOpen}
				title="Reset Unlocked Views Cache"
				message="Are you sure you want to clear your unlocked cache profiles? This will delete all saved profiles from the Background Views Recovery database. This cannot be undone."
				confirmLabel="Reset Cache"
				cancelLabel="Cancel"
				onConfirm={handleClearViewsCache}
				onCancel={() => setIsClearViewsConfirmOpen(false)}
				confirmTone="danger"
			/>
		</section>
	);
}
