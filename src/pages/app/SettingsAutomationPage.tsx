import { useState } from "react";
import { Save, Download, Upload, Wand2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { BackToSettings } from "../../components/BackToSettings";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { RangeSlider, Slider } from "../../components/ui/range-slider";

export function SettingsAutomationPage() {
    const { t } = useTranslation();

    // Auto-Block State
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    
    // NEW: Background Scanner State
    const [inboxScannerEnabled, setInboxScannerEnabled] = useState(() => window.localStorage.getItem("fg-inbox-scanner-enabled") === "true");
    
    const [isClearKeywordsConfirmOpen, setIsClearKeywordsConfirmOpen] = useState(false);

    const handleClearKeywords = () => {
        setForbiddenWords("");
        setIsClearKeywordsConfirmOpen(false);
        toast.success("All keywords cleared! (Click Save to apply)");
    };

    // Specific Keyword Toggles
    const [blockName, setBlockName] = useState(() => window.localStorage.getItem("fg-block-name") !== "false");
    const [blockBio, setBlockBio] = useState(() => window.localStorage.getItem("fg-block-bio") !== "false");
    const [blockMessage, setBlockMessage] = useState(() => window.localStorage.getItem("fg-block-message") !== "false");
    
    // Bot Evasion Toggle
    const [blockFirstMedia, setBlockFirstMedia] = useState(() => window.localStorage.getItem("fg-block-first-media") === "true");
    
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
    const [minAge, setMinAge] = useState(() => {
        const val = window.localStorage.getItem("fg-block-min-age");
        return val !== null ? val : "18"; 
    });
    const [maxAge, setMaxAge] = useState(() => {
        const val = window.localStorage.getItem("fg-block-max-age");
        return val !== null ? val : "99";
    });
    const [maxDistance, setMaxDistance] = useState(() => {
        const val = window.localStorage.getItem("fg-block-max-distance");
        return val !== null ? val : "50";
    });

    // Auto-Refresh State
    const [refreshEnabled, setRefreshEnabled] = useState(() => window.localStorage.getItem("fg-auto-refresh-enabled") === "true");
    const [refreshInterval, setRefreshInterval] = useState(() => window.localStorage.getItem("fg-auto-refresh-interval") || "5");

    // Instant Save for Toggles
    const handleToggleChatBlock = (val: boolean) => {
        setBlockOnChat(val);
        window.localStorage.setItem("fg-block-chat", String(val));
        toast.success(val ? t("settings_automation.chat_block_enabled", { defaultValue: "Inbox Blocking Enabled" }) : t("settings_automation.chat_block_disabled", { defaultValue: "Inbox Blocking Disabled" }), { id: "chat-block-toggle" });
    };

    const handleToggleInboxScanner = (val: boolean) => {
        setInboxScannerEnabled(val);
        window.localStorage.setItem("fg-inbox-scanner-enabled", String(val));
        toast.success(val ? "Background Scanner Enabled" : "Background Scanner Disabled", { id: "scanner-toggle" });
    };

    const handleToggleRefresh = (val: boolean) => {
        setRefreshEnabled(val);
        window.localStorage.setItem("fg-auto-refresh-enabled", String(val));
        toast.success(val ? t("settings_automation.auto_refresh_enabled", { defaultValue: "Auto Refresh Enabled" }) : t("settings_automation.auto_refresh_disabled", { defaultValue: "Auto Refresh Disabled" }), { id: "refresh-toggle" });
    };

    // Section specific save handlers
    const handleSaveAutoBlock = () => {
        const cleanedArray = forbiddenWords
            .split(',')
            .map(word => word.trim())
            .filter(word => word.length > 0);
        
        const uniqueSortedWords = [...new Set(cleanedArray)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        const finalWordsString = uniqueSortedWords.join(', ');
        
        setForbiddenWords(finalWordsString);

        window.localStorage.setItem("fg-block-name", String(blockName));
        window.localStorage.setItem("fg-block-bio", String(blockBio));
        window.localStorage.setItem("fg-block-message", String(blockMessage));
        window.localStorage.setItem("fg-block-first-media", String(blockFirstMedia));
        window.localStorage.setItem("fg-forbidden-words", finalWordsString); 
        window.localStorage.setItem("fg-block-min-age", minAge);
        window.localStorage.setItem("fg-block-max-age", maxAge);
        window.localStorage.setItem("fg-block-max-distance", maxDistance);
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

    return (
        <section className="app-screen">
            <header className="mb-6">
                <BackToSettings />
                <h1 className="app-title mb-2">
                    {t("settings.automation")}
                </h1>
                <p className="app-subtitle">{t("settings.automation_desc")}</p>
            </header>

            <div className="grid gap-6">
                {/* AUTO BLOCK BOX */}
                <div className="surface-card p-4 sm:p-5">
                    <div className="grid gap-6">
                        {/* Master Toggle */}
                        <div>
                            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                {t("settings_automation.auto_block_title")}
                            </p>
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="grid gap-0.5">
                                    <p className="text-sm font-semibold">{t("settings_automation.apply_to_inbox", { defaultValue: "Enable Inbox Auto-Blocking" })}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{t("settings_automation.apply_to_inbox_desc", { defaultValue: "Instantly blocks new chats that match your criteria." })}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleToggleChatBlock(!blockOnChat)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        blockOnChat ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            blockOnChat ? "translate-x-5" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* Specific Checking Targets & Bot Evasion */}
                            <div className="bg-[var(--surface-1)] rounded-lg p-3 border border-[var(--border)]">
                                <p className="text-xs font-semibold mb-2 text-[var(--text-muted)]">Check Keywords In:</p>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={blockName} onChange={(e) => setBlockName(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                                        Profile Names
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={blockBio} onChange={(e) => setBlockBio(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                                        Profile Bios (About Me)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={blockMessage} onChange={(e) => setBlockMessage(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                                        Incoming Chat Messages
                                    </label>
                                </div>

                                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                                    <p className="text-xs font-semibold mb-2 text-red-400 uppercase tracking-widest">Bot Evasion</p>
                                    <label className="flex items-start gap-3 text-sm cursor-pointer">
                                        <input type="checkbox" checked={blockFirstMedia} onChange={(e) => setBlockFirstMedia(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500 shrink-0" />
                                        <span>
                                            <span className="block font-medium">Block if first message is Media/Album</span>
                                            <span className="text-xs text-[var(--text-muted)] block mt-0.5">Catches bots that put spam text inside pictures. (Note: This will also block real people if they open with a picture and no text).</span>
                                        </span>
                                    </label>
                                </div>
                                
                                {/* NEW: SILENT BACKGROUND SCANNER TOGGLE */}
                                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                    <div className="flex items-center justify-between gap-4 mb-2">
                                        <div className="grid gap-0.5">
                                            <p className="text-sm font-semibold text-amber-500">Silent Background Scanner</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleInboxScanner(!inboxScannerEnabled)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                inboxScannerEnabled ? "bg-amber-500" : "bg-[var(--surface-2)]"
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    inboxScannerEnabled ? "translate-x-5" : "translate-x-0"
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1">
                                        Every time your inbox loads, it creates a queue of profiles you haven't scanned yet. It slowly drips requests in the background (1 request every 1.5 seconds) to fetch their full profile details. <strong>Warning: Consumes high background data/API requests.</strong>
                                    </p>
                                </div>
                                {/* --------------------------------------- */}

                            </div>
                        </div>

                        {/* Keywords */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                    {t("settings_automation.forbidden_keywords_title", { defaultValue: "Forbidden Keywords" })}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const cleaned = forbiddenWords.split(',').map(w => w.trim()).filter(w => w.length > 0);
                                            const unique = [...new Set(cleaned)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                                            setForbiddenWords(unique.join(', '));
                                            toast.success("Keywords sorted and cleaned!");
                                        }}
                                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                    >
                                        <Wand2 className="h-3.5 w-3.5" /> Clean Up
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!forbiddenWords.trim()}
                                        onClick={() => setIsClearKeywordsConfirmOpen(true)}
                                        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Clear
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                {t("settings_automation.forbidden_keywords_desc", { defaultValue: "Block profiles or messages containing these words. Separate with commas (e.g. snapchat, crypto, bot)." })}
                            </p>
                            <textarea
                                value={forbiddenWords}
                                onChange={(e) => setForbiddenWords(e.target.value)}
                                placeholder={t("settings_automation.keywords_placeholder", { defaultValue: "telegram, bot, menu..." })}
                                className="w-full min-h-[120px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                            />
                            <div className="flex gap-2 mt-4">
                                <button type="button" onClick={handleExport} className="flex-1 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-10 font-semibold transition hover:border-[var(--accent)]">
                                    <Download className="mr-2 h-4 w-4" /> {t("settings_automation.export_txt", { defaultValue: "Export (.txt)" })}
                                </button>
                                <label className="flex-1 flex items-center justify-center cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-10 font-semibold transition hover:border-[var(--accent)]">
                                    <Upload className="mr-2 h-4 w-4" /> {t("settings_automation.import_txt", { defaultValue: "Import (.txt)" })}
                                    <input type="file" accept=".txt" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                        </div>

                        {/* Filters */}
                        <div>
                            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                {t("settings_automation.age_limits_title", { defaultValue: "Age & Distance Limits" })}
                            </p>
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                {t("settings_automation.age_limits_desc", { defaultValue: "Block anyone outside of this range. Leave blank to ignore." })}
                            </p>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="text-xs text-[var(--text-muted)]">Minimum Age</label>
                                    <input type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="18 (or empty)" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-[var(--text-muted)]">Maximum Age</label>
                                    <input type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="99 (or empty)" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs text-[var(--text-muted)]">Maximum Distance (Kilometers)</label>
                                    <input type="number" value={maxDistance} onChange={(e) => setMaxDistance(e.target.value)} placeholder="e.g. 50 (or empty for no limit)" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-6 pt-4 border-t border-[var(--border)]">
                                <div className="px-2">
                                    <RangeSlider
                                        label={t("browse_filters.age", { defaultValue: "Quick Age Slider" })}
                                        min={18}
                                        max={99}
                                        minDefault={Number(minAge) || 18}
                                        maxDefault={Number(maxAge) || 99}
                                        onChange={(min, max) => {
                                            setMinAge(String(min));
                                            setMaxAge(String(max));
                                        }}
                                    />
                                </div>

                                <div className="px-2">
                                    <Slider
                                        label="Distance Slider"
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

                        {/* Action Button for Section 1 */}
                        <div className="mt-2 pt-4 border-t border-[var(--border)]">
                            <Button
                                type="button"
                                onClick={handleSaveAutoBlock}
                                variant="primary"
                                className="w-full"
                            >
                                <Save className="h-4 w-4" />
                                {t("settings_automation.update_block_rules", { defaultValue: "Save Auto-Block Settings" })}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* AUTO REFRESH BOX */}
                <div className="surface-card p-4 sm:p-5">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        {t("settings_automation.auto_refresh_title")}
                    </p>
                    <p className="text-sm text-[var(--text-muted)] mb-4">
                        {t("settings_automation.auto_refresh_desc")}
                    </p>

                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="grid gap-0.5">
                                <p className="text-sm font-semibold">{t("settings_automation.enable_refresh")}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {t("settings_automation.enable_refresh_desc")}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleToggleRefresh(!refreshEnabled)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    refreshEnabled ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        refreshEnabled ? "translate-x-5" : "translate-x-0"
                                    }`}
                                />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="px-2">
                                <Slider
                                    label={t("settings_automation.refresh_interval")}
                                    min={5}
                                    max={60}
                                    step={5}
                                    defaultValue={Number(refreshInterval)}
                                    displayValue={t("settings_automation.refresh_interval_unit", { count: refreshInterval })}
                                    onChange={(val) => setRefreshInterval(String(val))}
                                />
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)]">
                                {t("settings_automation.refresh_technical_note")}
                            </p>
                        </div>

                        <div className="mt-2 pt-4 border-t border-[var(--border)]">
                            <Button
                                type="button"
                                onClick={handleSaveRefresh}
                                variant="primary"
                                className="w-full"
                            >
                                <Save className="h-4 w-4" />
                                {t("settings_automation.update_refresh_settings")}
                            </Button>
                        </div>
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
        </section>
    );
}