import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
    Ban, Download, Save, Tag, Upload, Users, 
    Wand2, Trash2, Eye, EyeOff, ShieldAlert, Crosshair, Image as ImageIcon,
    MessageSquare, ShieldCheck, Zap
} from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { RangeSlider, Slider } from "../../components/ui/range-slider";
import { interestViewsStore } from "../../services/interestViewsStore";
import { getLookingForOptions } from "./profile-option-builders";
import { getThumbImageUrl } from "../../utils/media";
import { getAutoBlockWhitelist, removeFromAutoBlockWhitelist, AUTO_BLOCK_WHITELIST_UPDATED_EVENT } from "../../utils/privacy";
import { useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { getForbiddenWords, setForbiddenWords as setForbiddenWordsInStore } from "../../utils/autoblock";

export function SettingsAutomationPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const apiFunctions = useApiFunctions();

    // --- AUTO-BLOCK STATE ---
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    const [forbiddenWords, setForbiddenWords] = useState(() => getForbiddenWords() || window.localStorage.getItem("fg-forbidden-words") || "");
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
    const [skipBlockCount, setSkipBlockCount] = useState(() => window.localStorage.getItem("fg-autoblock-skip-after-count") || "3");

    // Seen/Read Auto-Block
    const [blockSeenEnabled, setBlockSeenEnabled] = useState(() => window.localStorage.getItem("fg-block-seen-enabled") === "true");
    const [blockSeenMinutes, setBlockSeenMinutes] = useState(() => window.localStorage.getItem("fg-block-seen-time") || "5");

    const [blockRightNow, setBlockRightNow] = useState(() => window.localStorage.getItem("fg-block-right-now") === "true");

    const [blockFacelessNoMedia, setBlockFacelessNoMedia] = useState(() => window.localStorage.getItem("fg-block-faceless-no-media") === "true");
    const [blockFacelessDelay, setBlockFacelessDelay] = useState(() => window.localStorage.getItem("fg-block-faceless-delay") || "5");
    const [whitelist, setWhitelist] = useState<{ profileId: string; displayName: string; primaryMediaHash?: string | null }[]>([]);
    useEffect(() => {
        setWhitelist(getAutoBlockWhitelist());
    }, []);

    useEffect(() => {
        const handleWhitelistUpdated = () => {
            setWhitelist(getAutoBlockWhitelist());
        };
        window.addEventListener(AUTO_BLOCK_WHITELIST_UPDATED_EVENT, handleWhitelistUpdated);
        return () => window.removeEventListener(AUTO_BLOCK_WHITELIST_UPDATED_EVENT, handleWhitelistUpdated);
    }, []);

    useEffect(() => {
        const handleWordsUpdated = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail;
            if (typeof detail === "string") {
                setForbiddenWords(detail);
            } else {
                setForbiddenWords(getForbiddenWords());
            }
        };
        window.addEventListener("fg-forbidden-words-updated", handleWordsUpdated);
        return () => window.removeEventListener("fg-forbidden-words-updated", handleWordsUpdated);
    }, []);

    useEffect(() => {
        const fetchMissingWhitelistProfiles = async () => {
            const missingIds = whitelist
                .filter(x => !x.primaryMediaHash)
                .map(x => x.profileId);
            
            if (missingIds.length === 0) return;

            try {
                const raw = await apiFunctions.getProfilesByIds(missingIds);
                const profiles =
                    raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
                        ? (raw as { profiles: unknown[] }).profiles
                        : [];

                if (profiles.length > 0) {
                    let updated = false;
                    const list = getAutoBlockWhitelist();
                    
                    for (const p of profiles) {
                        if (!p || typeof p !== "object") continue;
                        const idRaw = (p as { profileId?: unknown }).profileId;
                        if (idRaw == null) continue;
                        const profileId = String(idRaw);
                        const hashRaw = (p as { profileImageMediaHash?: unknown }).profileImageMediaHash;
                        const nameRaw = (p as { displayName?: unknown }).displayName;
                        
                        const itemIndex = list.findIndex(x => String(x.profileId) === profileId);
                        if (itemIndex !== -1) {
                            const currentItem = list[itemIndex];
                            if (typeof hashRaw === "string" && hashRaw.trim().length > 0 && currentItem.primaryMediaHash !== hashRaw) {
                                currentItem.primaryMediaHash = hashRaw;
                                updated = true;
                            }
                            if (typeof nameRaw === "string" && nameRaw.trim().length > 0 && currentItem.displayName !== nameRaw) {
                                currentItem.displayName = nameRaw;
                                updated = true;
                            }
                        }
                    }
                    
                    if (updated) {
                        window.localStorage.setItem("fg-auto-block-whitelist", JSON.stringify(list));
                        setWhitelist(list);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch missing whitelist profile details", err);
            }
        };

        if (whitelist.length > 0) {
            fetchMissingWhitelistProfiles();
        }
    }, [whitelist, apiFunctions]);

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
    const [lastViewScanTime, setLastViewScanTime] = useState(() => window.localStorage.getItem("fg-view-scanner-last-run"));

    // Live update the Views Recovery Stats every 5 seconds
    useEffect(() => {
        const fetchStats = () => {
            void interestViewsStore.count().then(cnt => {
                setUnlockedViewsCount(cnt);
            });
            setLastViewScanTime(window.localStorage.getItem("fg-view-scanner-last-run"));
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleClearKeywords = () => {
        setForbiddenWords("");
        void setForbiddenWordsInStore("");
        window.localStorage.removeItem("fg-forbidden-words");
        setIsClearKeywordsConfirmOpen(false);
        toast.success("All keywords cleared! (Click Save to apply)");
    };

    const handleClearViewsCache = () => {
        setUnlockedViewsCount(0);
        setIsClearViewsConfirmOpen(false);
        toast.success("Unlocked views cache has been cleared!");

        void interestViewsStore.clear().finally(() => {
            queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
            queryClient.removeQueries({ queryKey: ["interest", "list"] });
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
        void setForbiddenWordsInStore(finalWordsString);

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
        window.localStorage.setItem("fg-autoblock-skip-after-count", skipBlockCount);
        window.localStorage.setItem("fg-block-seen-enabled", String(blockSeenEnabled));
        window.localStorage.setItem("fg-block-seen-time", blockSeenMinutes);
        window.localStorage.setItem("fg-block-right-now", String(blockRightNow));
        window.localStorage.setItem("fg-block-faceless-no-media", String(blockFacelessNoMedia));
        window.localStorage.setItem("fg-block-faceless-delay", blockFacelessDelay);

        // Trigger immediate background scan with new rules
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));

        toast.success(t("settings_automation.block_rules_updated", { defaultValue: "Block Rules Updated!" }));
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
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-[var(--surface-1)] border border-[var(--border)] p-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">Saved Profiles</p>
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
                                                    const cleanStr = unique.join(', ');
                                                    setForbiddenWords(cleanStr);
                                                    void setForbiddenWordsInStore(cleanStr);
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
                                         <label className="flex items-center gap-2 cursor-pointer">
                                             <input
                                                 type="checkbox"
                                                 checked={skipBlockAfterTwo}
                                                 onChange={(e) => setSkipBlockAfterTwo(e.target.checked)}
                                                 className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                             />
                                             <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                 <strong className="text-[var(--text)]">Disable Auto-Block for Active Chats.</strong> Automatically whitelists and stops auto-blocking a profile once you have sent them messages.
                                             </span>
                                         </label>
                                         {skipBlockAfterTwo && (
                                             <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--text-muted)] pl-6">
                                                 <span>Auto-whitelist profile after sending</span>
                                                 <input
                                                     type="number"
                                                     min="1"
                                                     max="50"
                                                     value={skipBlockCount}
                                                     onChange={(e) => setSkipBlockCount(e.target.value)}
                                                     className="w-14 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-center font-bold text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                                                 />
                                                 <span>sent message{Number(skipBlockCount) !== 1 ? "s" : ""} (default: 3)</span>
                                             </div>
                                         )}
                                     </div>
                                 </div>

                                  {/* Seen / Read Auto-Block */}
                                  <div className="flex items-start gap-3 p-4">
                                      <div className="shrink-0 rounded-2xl bg-rose-500/15 p-2.5 text-rose-400">
                                          <EyeOff className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                  type="checkbox"
                                                  checked={blockSeenEnabled}
                                                  onChange={(e) => setBlockSeenEnabled(e.target.checked)}
                                                  className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                              />
                                              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                  <strong className="text-[var(--text)]">Block if Left on Seen / Read.</strong> Automatically blocks someone if they read your last message but don't reply within the set time.
                                              </span>
                                          </label>
                                          {blockSeenEnabled && (
                                              <div className="flex items-center gap-2 mt-3 ml-6">
                                                  <span className="text-xs text-[var(--text-muted)]">Block after:</span>
                                                  <select
                                                      value={blockSeenMinutes}
                                                      onChange={(e) => setBlockSeenMinutes(e.target.value)}
                                                      className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                                  >
                                                      <option value="1">1 minute</option>
                                                      <option value="2">2 minutes</option>
                                                      <option value="3">3 minutes</option>
                                                      <option value="5">5 minutes</option>
                                                      <option value="10">10 minutes</option>
                                                      <option value="15">15 minutes</option>
                                                      <option value="30">30 minutes</option>
                                                      <option value="60">1 hour</option>
                                                  </select>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Faceless No Media Block */}
                                  <div className="flex items-start gap-3 p-4">
                                      <div className="shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
                                          <Users className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                  type="checkbox"
                                                  checked={blockFacelessNoMedia}
                                                  onChange={(e) => setBlockFacelessNoMedia(e.target.checked)}
                                                  className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                              />
                                              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                  <strong className="text-[var(--text)]">Block Faceless Profiles with No Media.</strong> Automatically blocks profiles with no profile picture if they haven't sent any media (photos, videos, albums) after the set time from their first message.
                                              </span>
                                          </label>
                                          {blockFacelessNoMedia && (
                                              <div className="flex items-center gap-2 mt-3 ml-6">
                                                  <span className="text-xs text-[var(--text-muted)]">Block after:</span>
                                                  <select
                                                      value={blockFacelessDelay}
                                                      onChange={(e) => setBlockFacelessDelay(e.target.value)}
                                                      className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                                  >
                                                      <option value="1">1 minute</option>
                                                      <option value="2">2 minutes</option>
                                                      <option value="3">3 minutes</option>
                                                      <option value="5">5 minutes</option>
                                                      <option value="10">10 minutes</option>
                                                      <option value="15">15 minutes</option>
                                                      <option value="30">30 minutes</option>
                                                      <option value="60">1 hour</option>
                                                  </select>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Right Now Auto-Block */}
                                  <div className="flex items-start gap-3 p-4">
                                      <div className="shrink-0 rounded-2xl bg-amber-500/15 p-2.5 text-amber-400">
                                          <Zap className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                  type="checkbox"
                                                  checked={blockRightNow}
                                                  onChange={(e) => setBlockRightNow(e.target.checked)}
                                                  className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                              />
                                              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                  <strong className="text-[var(--text)]">Block Profiles with "Right Now" Status.</strong> Automatically blocks profiles that currently have an active "Right now" status or post.
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
                                                      <div key={profile.profileId} className="flex items-center justify-between p-2.5 text-xs gap-3">
                                                          <div
                                                              onClick={() => navigate(`/profile/${profile.profileId}`, { state: { returnTo: "/settings/automation" } })}
                                                              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:bg-[var(--surface-2)]/40 p-1 -m-1 rounded-lg transition"
                                                          >
                                                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
                                                                  {profile.primaryMediaHash ? (
                                                                      <img
                                                                          src={getThumbImageUrl(profile.primaryMediaHash, "75x75")}
                                                                          alt=""
                                                                          className="h-full w-full object-cover"
                                                                      />
                                                                  ) : (
                                                                      <div className="flex h-full w-full items-center justify-center font-bold text-[var(--text-muted)] uppercase text-[10px]">
                                                                          {profile.displayName ? profile.displayName.slice(0, 2) : "??"}
                                                                      </div>
                                                                  )}
                                                              </div>
                                                              <div className="min-w-0 flex-1">
                                                                  <p className="font-semibold truncate text-[var(--text)] hover:text-[var(--accent)] transition">{profile.displayName}</p>
                                                                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">ID: {profile.profileId}</p>
                                                              </div>
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