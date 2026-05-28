import { useState } from "react";
import { Save, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { BackToSettings } from "../../components/BackToSettings";
import { useTranslation } from "react-i18next";
import { RangeSlider, Slider } from "../../components/ui/range-slider";

export function SettingsAutomationPage() {
    const { t } = useTranslation();

    // Auto-Block State
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    
    // --- ADDED: Specific Keyword Toggles ---
    const [blockName, setBlockName] = useState(() => window.localStorage.getItem("fg-block-name") !== "false");
    const [blockBio, setBlockBio] = useState(() => window.localStorage.getItem("fg-block-bio") !== "false");
    const [blockMessage, setBlockMessage] = useState(() => window.localStorage.getItem("fg-block-message") !== "false");
    
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
    const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") || "18");
    const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") || "99");
    
    // --- ADDED: Distance Filter ---
    const [maxDistance, setMaxDistance] = useState(() => window.localStorage.getItem("fg-block-max-distance") || "50");

    // Auto-Refresh State
    const [refreshEnabled, setRefreshEnabled] = useState(() => window.localStorage.getItem("fg-auto-refresh-enabled") === "true");
    const [refreshInterval, setRefreshInterval] = useState(() => window.localStorage.getItem("fg-auto-refresh-interval") || "5");

    // Instant Save for Toggles
    const handleToggleChatBlock = (val: boolean) => {
        setBlockOnChat(val);
        window.localStorage.setItem("fg-block-chat", String(val));
        toast.success(val ? t("settings_automation.chat_block_enabled", { defaultValue: "Inbox Blocking Enabled" }) : t("settings_automation.chat_block_disabled", { defaultValue: "Inbox Blocking Disabled" }), { id: "chat-block-toggle" });
    };

    const handleToggleRefresh = (val: boolean) => {
        setRefreshEnabled(val);
        window.localStorage.setItem("fg-auto-refresh-enabled", String(val));
        toast.success(val ? t("settings_automation.auto_refresh_enabled", { defaultValue: "Auto Refresh Enabled" }) : t("settings_automation.auto_refresh_disabled", { defaultValue: "Auto Refresh Disabled" }), { id: "refresh-toggle" });
    };

    // Section specific save handlers
    const handleSaveAutoBlock = () => {
        window.localStorage.setItem("fg-block-name", String(blockName));
        window.localStorage.setItem("fg-block-bio", String(blockBio));
        window.localStorage.setItem("fg-block-message", String(blockMessage));
        window.localStorage.setItem("fg-forbidden-words", forbiddenWords);
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
                                    <p className="text-xs text-[var(--text-muted)]">{t("settings_automation.apply_to_inbox_desc", { defaultValue: "Scan and block incoming chats automatically." })}</p>
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

                            {/* --- ADDED: Specific Checking Targets --- */}
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
                            </div>
                        </div>

                        {/* Keywords */}
                        <div>
                            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                {t("settings_automation.forbidden_keywords_title", { defaultValue: "Forbidden Keywords" })}
                            </p>
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                {t("settings_automation.forbidden_keywords_desc", { defaultValue: "Block profiles/chats containing exact words or phrases. Separate with commas." })}
                            </p>
                            <textarea
                                value={forbiddenWords}
                                onChange={(e) => setForbiddenWords(e.target.value)}
                                placeholder={t("settings_automation.keywords_placeholder", { defaultValue: "e.g. snapchat, crypto, bot" })}
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
                                {t("settings_automation.age_limits_desc", { defaultValue: "Block anyone outside of this range." })}
                            </p>
                            
                            <div className="flex flex-col gap-6">
                                <div className="px-2">
                                    <RangeSlider
                                        label={t("browse_filters.age", { defaultValue: "Age Range" })}
                                        min={18}
                                        max={99}
                                        minDefault={Number(minAge)}
                                        maxDefault={Number(maxAge)}
                                        onChange={(min, max) => {
                                            setMinAge(String(min));
                                            setMaxAge(String(max));
                                        }}
                                    />
                                </div>

                                {/* --- ADDED: Distance Slider --- */}
                                <div className="px-2">
                                    <Slider
                                        label="Maximum Distance"
                                        min={1}
                                        max={200}
                                        step={1}
                                        defaultValue={Number(maxDistance)}
                                        displayValue={`${maxDistance} km`}
                                        onChange={(val) => setMaxDistance(String(val))}
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
                                {t("settings_automation.update_block_rules", { defaultValue: "Update Block Rules" })}
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

                        {/* Action Button for Section 2 */}
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
        </section>
    );
}