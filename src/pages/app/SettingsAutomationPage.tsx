import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
    Ban, Clock, Download, RefreshCw, Save, Tag, Upload, Users, 
    Wand2, Trash2, Eye, HardDrive, ShieldAlert, Crosshair, Image as ImageIcon,
    MessageSquare
} from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { RangeSlider, Slider } from "../../components/ui/range-slider";
import { interestViewsStore } from "../../services/interestViewsStore";
import { getLookingForOptions } from "./profile-option-builders";

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === "undefined") return false;
        const isMobilePlatform = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return !isMobilePlatform && window.innerWidth >= 768;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const isMobilePlatform = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setIsDesktop(!isMobilePlatform && window.innerWidth >= 768);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return isDesktop;
}

export function SettingsAutomationPage() {
    const { t } = useTranslation();
    const isDesktop = useIsDesktop();
    const queryClient = useQueryClient();

    // --- AUTO REFRESH STATE ---
    const [refreshEnabled, setRefreshEnabled] = useState(() => window.localStorage.getItem("fg-auto-refresh-enabled") === "true");
    const [refreshInterval, setRefreshInterval] = useState(() => window.localStorage.getItem("fg-auto-refresh-interval") || "5");

    // --- AUTO-BLOCK STATE ---
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
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

    // --- VIEWS RECOVERY STATE ---
    const [viewScannerEnabled, setViewScannerEnabled] = useState(() => window.localStorage.getItem("fg-view-scanner") !== "false");
    const [viewScannerInterval, setViewScannerInterval] = useState(() => window.localStorage.getItem("fg-view-scanner-interval") || "30");
    const [unlockedViewsCount, setUnlockedViewsCount] = useState<number | null>(null);
    const [lockedViewsCount, setLockedViewsCount] = useState<number | null>(null);
    const [lastViewScanTime, setLastViewScanTime] = useState(() => window.localStorage.getItem("fg-view-scanner-last-run"));

    // --- AUTO-DOWNLOAD STATE ---
    const [autoDownloadMedia, setAutoDownloadMedia] = useState(() => window.localStorage.getItem("fg-auto-download-media") === "true");
    const [downloadBaseDir, setDownloadBaseDir] = useState(() => window.localStorage.getItem("fg-download-base-dir") || "Download");

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

    // --- TOGGLE HANDLERS ---
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

    const handleToggleAutoDownload = (val: boolean) => {
        setAutoDownloadMedia(val);
        window.localStorage.setItem("fg-auto-download-media", String(val));
        toast.success(val ? "Auto-Download Enabled" : "Auto-Download Disabled", { id: "download-toggle" });
    };

    const handleToggleRefresh = (val: boolean) => {
        setRefreshEnabled(val);
        window.localStorage.setItem("fg-auto-refresh-enabled", String(val));
        toast.success(val ? t("settings_automation.auto_refresh_enabled", { defaultValue: "Auto Refresh Enabled" }) : t("settings_automation.auto_refresh_disabled", { defaultValue: "Auto Refresh Disabled" }), { id: "refresh-toggle" });
    };

    // --- SAVE HANDLERS ---
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
        window.localStorage.setItem("fg-forbidden-words", finalWordsString); 
        window.localStorage.setItem("fg-block-min-age", minAge);
        window.localStorage.setItem("fg-block-max-age", maxAge);
        window.localStorage.setItem("fg-block-no-age", String(blockNoAge));
        window.localStorage.setItem("fg-block-max-distance", maxDistance);
        window.localStorage.setItem("fg-block-looking-for-mode", blockedLookingForMode);
        window.localStorage.setItem("fg-block-looking-for", JSON.stringify(blockedLookingFor));
        window.localStorage.setItem("fg-autoblock-skip-after-two", String(skipBlockAfterTwo));

        // Trigger immediate background scan with new rules
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));

        toast.success(t("settings_automation.block_rules_updated", { defaultValue: "Block Rules Updated!" }));
    };

    const handleSaveRefresh = () => {
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

    // Risk Colors for Views Scanner Slider
    const viewIntervalNum = Number(viewScannerInterval);
    const riskColor = viewIntervalNum < 15 ? "text-red-500" : viewIntervalNum < 30 ? "text-amber-500" : "text-emerald-500";
    const riskLabel = viewIntervalNum < 15 ? "Aggressive (High risk of rate limits / soft-bans)" : viewIntervalNum < 30 ? "Balanced (Moderate risk)" : "Safe (Low risk of rate limits)";

    return (
        <section className="app-screen pb-32">
            <header className="mb-7">
                <BackToSettings />
                <h1 className="app-title mb-1">{t("settings.automation")}</h1>
                <p className="app-subtitle">{t("settings.automation_desc")}</p>
            </header>

            <div className="grid gap-6">

                {/* VIEWS RECOVERY */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        Background Views Recovery
                    </p>
                    <div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
                        <ToggleRow
                            icon={<Eye className="h-5 w-5" />}
                            iconClass="bg-indigo-500/15 text-indigo-400"
                            label="Enable Background Sweep"
                            description="Silently saves real profile IDs before they get pushed down into the paywall."
                            checked={viewScannerEnabled}
                            onChange={handleToggleViewScanner}
                        />

                        {viewScannerEnabled && (
                            <div className="p-4 grid gap-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-lg bg-[var(--surface-1)] border border-[var(--border)] p-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">Unlocked</p>
                                            <button
                                                type="button"
                                                onClick={() => setIsClearViewsConfirmOpen(true)}
                                                className="text-red-400/80 hover:text-red-400 transition"
                                                title="Reset Cache"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <p className="text-lg font-bold text-[var(--accent)]">
                                            {unlockedViewsCount !== null ? unlockedViewsCount : "..."} <span className="text-[10px] font-medium text-[var(--text-muted)] block">profiles</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-[var(--surface-1)] border border-[var(--border)] p-3">
                                        <p className="text-[10px] uppercase font-semibold text-[var(--text-muted)] mb-1">Locked</p>
                                        <p className="text-lg font-bold text-[var(--text-muted)] mt-1">
                                            {lockedViewsCount !== null ? lockedViewsCount : "..."} <span className="text-[10px] font-medium block">profiles</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-[var(--surface-1)] border border-[var(--border)] p-3">
                                        <p className="text-[10px] uppercase font-semibold text-[var(--text-muted)] mb-1">Last Sweep</p>
                                        <p className="text-lg font-bold text-[var(--text)] mt-1">
                                            {lastViewScanTime ? new Date(parseInt(lastViewScanTime)).toLocaleTimeString() : "Waiting..."}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 mt-2">
                                    <div className="px-2">
                                        <Slider
                                            label="Scan Interval"
                                            min={10}
                                            max={300}
                                            step={10}
                                            defaultValue={viewIntervalNum}
                                            displayValue={`${viewScannerInterval} seconds`}
                                            onChange={(val) => setViewScannerInterval(String(val))}
                                        />
                                    </div>
                                    <p className={`text-[10px] font-semibold mt-1 px-1 ${riskColor}`}>{riskLabel}</p>
                                </div>
								
                                <button
                                    type="button"
                                    onClick={handleSaveViewScanner}
                                    className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold mt-2"
                                >
                                    <Save className="h-4 w-4" /> Save Recovery Settings
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* AUTO DOWNLOAD */}
                {isDesktop && (
                    <div>
                        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                            Auto-Download Media
                        </p>
                        <div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
                            <ToggleRow
                                icon={<HardDrive className="h-5 w-5" />}
                                iconClass="bg-cyan-500/15 text-cyan-400"
                                label="Enable Auto-Downloader"
                                description="Silently save all incoming media to your device organized by profile."
                                checked={autoDownloadMedia}
                                onChange={handleToggleAutoDownload}
                            />

                            {autoDownloadMedia && (
                                <div className="p-4">
                                    <p className="mb-2 text-sm font-semibold text-[var(--text)]">Save Location</p>
                                    <p className="mb-3 text-xs text-[var(--text-muted)] leading-relaxed">
                                        A "FreeGrind_Media" folder will be created inside the location you choose.
                                    </p>
                                    <select
                                        value={downloadBaseDir}
                                        onChange={(e) => {
                                            setDownloadBaseDir(e.target.value);
                                            window.localStorage.setItem("fg-download-base-dir", e.target.value);
                                            toast.success("Save location updated!");
                                        }}
                                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                                    >
                                        <option value="Download">Downloads Folder (Default)</option>
                                        <option value="Picture">Pictures Folder</option>
                                        <option value="Document">Documents Folder</option>
                                        <option value="Video">Videos Folder</option>
                                        <option value="Desktop">Desktop</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* AUTO BLOCK */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        {t("settings_automation.auto_block_title", { defaultValue: "Auto Block" })}
                    </p>
                    <div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
                        <ToggleRow
                            icon={<Ban className="h-5 w-5" />}
                            iconClass="bg-red-500/15 text-red-400"
                            label={t("settings_automation.apply_to_inbox", { defaultValue: "Enable Inbox Auto-Blocking" })}
                            description={t("settings_automation.apply_to_inbox_desc", { defaultValue: "Instantly blocks new chats that match your criteria." })}
                            checked={blockOnChat}
                            onChange={handleToggleChatBlock}
                        />

                        {blockOnChat && (
                            <>
                                {/* Keywords */}
                                <div className="flex items-start gap-3 p-4">
                                    <div className="shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
                                        <Tag className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-sm font-semibold leading-snug">
                                                {t("settings_automation.forbidden_keywords_title", { defaultValue: "Forbidden Keywords" })}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => {
                                                    const cleaned = forbiddenWords.split(',').map(w => w.trim()).filter(w => w.length > 0);
                                                    const unique = [...new Set(cleaned)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                                                    setForbiddenWords(unique.join(', '));
                                                    toast.success("Keywords sorted!");
                                                }} className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] transition">
                                                    <Wand2 className="h-3 w-3" /> Clean
                                                </button>
                                                <button type="button" onClick={() => setIsClearKeywordsConfirmOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-500 transition">
                                                    <Trash2 className="h-3 w-3" /> Clear
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                                            {t("settings_automation.forbidden_keywords_desc", { defaultValue: "Block profiles containing these words. Separate with commas." })}
                                        </p>
										
                                        {/* Keyword Targets */}
                                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 mb-3 border border-[var(--border)] rounded-lg p-2 bg-[var(--surface-1)]">
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                                <input type="checkbox" checked={blockName} onChange={(e) => setBlockName(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Names
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                                <input type="checkbox" checked={blockBio} onChange={(e) => setBlockBio(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Bios
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                                <input type="checkbox" checked={blockMessage} onChange={(e) => setBlockMessage(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Messages
                                            </label>
                                        </div>

                                        <textarea
                                            value={forbiddenWords}
                                            onChange={(e) => setForbiddenWords(e.target.value)}
                                            placeholder={t("settings_automation.keywords_placeholder", { defaultValue: "telegram, bot, cash..." })}
                                            className="input-field min-h-[100px] resize-y"
                                        />
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button type="button" onClick={handleExport} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]">
                                                <Download className="h-3.5 w-3.5" /> {t("settings_automation.export_txt", { defaultValue: "Export" })}
                                            </button>
                                            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold transition hover:border-[var(--text-muted)]">
                                                <Upload className="h-3.5 w-3.5" /> {t("settings_automation.import_txt", { defaultValue: "Import" })}
                                                <input type="file" accept=".txt" onChange={handleImport} className="hidden" />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                 {/* Bot Evasion */}
                                 <div className="flex items-start gap-3 p-4">
                                     <div className="shrink-0 rounded-2xl bg-pink-500/15 p-2.5 text-pink-400">
                                         <ImageIcon className="h-5 w-5" />
                                     </div>
                                     <div className="min-w-0 flex-1">
                                         <p className="text-sm font-semibold leading-snug">Bot Evasion</p>
                                         <label className="flex items-start gap-2 mt-2 cursor-pointer">
                                             <input type="checkbox" checked={blockFirstMedia} onChange={(e) => setBlockFirstMedia(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0" />
                                             <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                 <strong className="text-[var(--text)]">Block if first message is Media.</strong> Catches bots that open with pictures, videos, or albums without text (even if they send multiple media messages).
                                             </span>
                                         </label>
                                         {blockFirstMedia && (
                                             <div className="mt-3 ml-6 flex flex-col gap-2">
                                                 <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                     <input type="checkbox" checked={blockMediaDelayEnabled} onChange={(e) => setBlockMediaDelayEnabled(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                                                     <span className="text-[var(--text-muted)]">Delay block decision (Allow follow-up text)</span>
                                                 </label>
                                                 {blockMediaDelayEnabled && (
                                                     <div className="flex items-center gap-2 pl-5.5">
                                                         <span className="text-xs text-[var(--text-muted)]">Wait duration:</span>
                                                         <select
                                                             value={blockMediaDelayMinutes}
                                                             onChange={(e) => setBlockMediaDelayMinutes(e.target.value)}
                                                             className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                                         >
                                                             <option value="1">1 minute</option>
                                                             <option value="2">2 minutes</option>
                                                             <option value="3">3 minutes</option>
                                                             <option value="4">4 minutes</option>
                                                             <option value="5">5 minutes</option>
                                                         </select>
                                                     </div>
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                 </div>

                                 {/* Inbox Scanner */}
                                 <div className="flex items-start gap-3 p-4">
                                     <div className="shrink-0 rounded-2xl bg-yellow-500/15 p-2.5 text-yellow-400">
                                         <ShieldAlert className="h-5 w-5" />
                                     </div>
                                     <div className="min-w-0 flex-1">
                                         <div className="flex items-center justify-between gap-4">
                                             <p className="text-sm font-semibold leading-snug">Silent Inbox Scanner</p>
                                             <button
                                                 type="button"
                                                 onClick={() => handleToggleInboxScanner(!inboxScannerEnabled)}
                                                 className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${inboxScannerEnabled ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"}`}
                                             >
                                                 <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${inboxScannerEnabled ? "translate-x-5" : "translate-x-0"}`} />
                                             </button>
                                         </div>
                                         <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                                             Queues your unread inbox and safely scans profiles in the background to check against your block rules.
                                         </p>
                                     </div>
                                 </div>

                                  {/* Conversation Shield */}
                                  <div className="flex items-start gap-3 p-4">
                                      <div className="shrink-0 rounded-2xl bg-cyan-500/15 p-2.5 text-cyan-400">
                                          <MessageSquare className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <label className="flex items-start gap-2 cursor-pointer">
                                              <input
                                                  type="checkbox"
                                                  checked={skipBlockAfterTwo}
                                                  onChange={(e) => setSkipBlockAfterTwo(e.target.checked)}
                                                  className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0"
                                              />
                                              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                  <strong className="text-[var(--text)]">Disable Auto-Block for Active Chats.</strong> Stops auto-blocking a profile once you have sent them 2 or more messages, protecting active conversations.
                                              </span>
                                          </label>
                                      </div>
                                  </div>

                                 {/* Tags Block */}
                                 <div className="flex items-start gap-3 p-4">
                                     <div className="shrink-0 rounded-2xl bg-emerald-500/15 p-2.5 text-emerald-400">
                                         <Crosshair className="h-5 w-5" />
                                     </div>
                                     <div className="min-w-0 flex-1">
                                         <p className="text-sm font-semibold leading-snug">Block By "Looking For" Tags</p>
 										
                                         <div className="mt-2 mb-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-2">
                                             <div className="flex flex-col gap-1">
                                                 <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                                     <input type="radio" checked={blockedLookingForMode === "any"} onChange={() => setBlockedLookingForMode("any")} className="h-4 w-4 accent-[var(--accent)]" />
                                                     Block if they have ANY of these
                                                 </label>
                                                 <p className="text-[10px] text-[var(--text-muted)] pl-6">
                                                     Blocks the profile if they have one or more of the selected tags.
                                                 </p>
                                             </div>
                                             <div className="border-t border-[var(--border)] my-1" />
                                             <div className="flex flex-col gap-1">
                                                 <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                                     <input type="radio" checked={blockedLookingForMode === "only"} onChange={() => setBlockedLookingForMode("only")} className="h-4 w-4 accent-[var(--accent)]" />
                                                     Block ONLY if they exclusively want these
                                                 </label>
                                                 <p className="text-[10px] text-[var(--text-muted)] pl-6">
                                                     Blocks the profile only if all their tags are in the selected list (e.g., if they exclusively want those tags).
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

                {/* AUTO REFRESH */}
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