import { useEffect, useMemo, useState } from "react";
import {
    Flame, Languages, LayoutGrid, Monitor, Moon, Ruler, Sparkles, Star, Sun,
    MessageSquare, Bot, ScanSearch, EyeOff, ImageOff, RotateCcw, Activity, Shield
} from "lucide-react";
import toast from "react-hot-toast";
import { usePreferences, ACCENT_PRESETS, type ColorScheme } from "../../contexts/PreferencesContext";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import {
    SUPPORTED_LOCALE_OPTIONS,
    resolveSupportedLocale,
} from "../../utils/locales";
import { type UnitsPreset } from "../../utils/units";
import {
    readAnalyticsConsentChoice,
    writeAnalyticsConsentChoice,
    type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";

const TRANSLATE_LANGUAGES = [
    { code: "", label: "Use App/System Language" },
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "pt", label: "Portuguese" },
    { code: "it", label: "Italian" },
    { code: "nl", label: "Dutch" },
    { code: "ar", label: "Arabic" },
    { code: "ru", label: "Russian" },
    { code: "zh-CN", label: "Chinese (Simplified)" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
];

function normalizeHex(value: string): string {
    const cleaned = value.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
        return `#${cleaned
            .split("")
            .map((char) => char + char)
            .join("")
            .toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        return `#${cleaned.toLowerCase()}`;
    }
    return "";
}

function getContrastForHex(hexColor: string): "#1a1a1a" | "#ffffff" {
    const normalized = normalizeHex(hexColor);
    if (!normalized) return "#1a1a1a";

    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);

    const toLinear = (channel: number) => {
        const normalizedChannel = channel / 255;
        if (normalizedChannel <= 0.03928) {
            return normalizedChannel / 12.92;
        }
        return ((normalizedChannel + 0.055) / 1.055) ** 2.4;
    };

    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    const contrastWithDark = (luminance + 0.05) / 0.05;
    const contrastWithLight = 1.05 / (luminance + 0.05);

    return contrastWithDark >= contrastWithLight ? "#1a1a1a" : "#ffffff";
}

function SelectRow({
    icon, iconClass, label, value, onChange, options,
}: {
    icon: React.ReactNode; iconClass: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`rounded-2xl p-2.5 shrink-0 ${iconClass}`}>{icon}</div>
            <p className="min-w-0 flex-1 text-sm font-semibold">{label}</p>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 pr-7 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
            >
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{children}</p>;
}

export function CustomizabilityPage() {
    const { i18n, t } = useTranslation();
    const {
        colorScheme,
        accentColor,
        mobileGridColumns,
        unitsPreset,
        revealEffectEnabled,
        revealEffectStrength,
        blurIncomingMedia,
        setPreferences,
    } = usePreferences();

    const [customHex, setCustomHex] = useState(accentColor);
    const [hexError, setHexError] = useState<string | null>(null);

    const [showRightNow, setShowRightNow] = useState(() => window.localStorage.getItem("fg-show-right-now") !== "false");
    const [showInterest, setShowInterest] = useState(() => window.localStorage.getItem("fg-show-interest") !== "false");
    const [defaultInterestTab, setDefaultInterestTab] = useState(() => window.localStorage.getItem("fg-interest-default-tab") || "taps");

    // --- CUSTOM STATE (TRANSLATION) ---
    const [translateEnabled, setTranslateEnabled] = useState(() => window.localStorage.getItem("fg-translate-enabled") !== "false");
    const [autoTranslate, setAutoTranslate] = useState(() => window.localStorage.getItem("fg-translate-auto") === "true");
    const [translateLanguage, setTranslateLanguage] = useState(() => window.localStorage.getItem("fg-translate-language") || "");
    const [translateEngine, setTranslateEngine] = useState(() => window.localStorage.getItem("fg-translate-engine") || "google");
    const [deepLXUrl, setDeepLXUrl] = useState(() => window.localStorage.getItem("fg-deeplx-url") || "");
    const [openAIKey, setOpenAIKey] = useState(() => window.localStorage.getItem("fg-openai-key") || "");
    const [geminiKey, setGeminiKey] = useState(() => window.localStorage.getItem("fg-gemini-key") || "");

    // --- CUSTOM STATE (PRIVACY & MEDIA) ---
    const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(() => readAnalyticsConsentChoice());

    const schemeOptions = useMemo(() => [
        { value: "system" as ColorScheme, label: t("customizability.schemes.system"), icon: <Monitor className="h-5 w-5" /> },
        { value: "light" as ColorScheme, label: t("customizability.schemes.light"), icon: <Sun className="h-5 w-5" /> },
        { value: "dark" as ColorScheme, label: t("customizability.schemes.dark"), icon: <Moon className="h-5 w-5" /> },
    ], [t]);
    const selectedLocale = resolveSupportedLocale(i18n.language);

    useEffect(() => setCustomHex(accentColor), [accentColor]);

    const handleSchemeChange = (scheme: ColorScheme) => void setPreferences({ colorScheme: scheme });
    const handleAccentChange = (preset: (typeof ACCENT_PRESETS)[number]) => void setPreferences({ accentColor: preset.color, accentContrast: preset.contrast });
    const handleLocaleChange = async (locale: string) => {
        try {
            const nextLocale = resolveSupportedLocale(locale);
            await i18n.changeLanguage(nextLocale);
            document.documentElement.lang = nextLocale;
        } catch (error) {
            toast.error("Failed to change language.");
        }
    };
    const handleUnitsPresetChange = (preset: UnitsPreset) => void setPreferences({ unitsPreset: preset });

    const handleApplyCustomHex = () => {
        const normalized = normalizeHex(customHex);
        if (!normalized) { setHexError(t("customizability.hex_error")); return; }
        setHexError(null);
        void setPreferences({ accentColor: normalized, accentContrast: getContrastForHex(normalized) });
    };

    const handlePickColor = (value: string) => {
        const normalized = normalizeHex(value);
        if (!normalized) return;
        setCustomHex(normalized);
        setHexError(null);
        void setPreferences({ accentColor: normalized, accentContrast: getContrastForHex(normalized) });
    };

    return (
        <section className="app-screen pb-32">
            <header className="mb-7">
                <BackToSettings />
                <h1 className="app-title mb-1">{t("settings.customizability")}</h1>
                <p className="app-subtitle">{t("customizability.subtitle")}</p>
            </header>

            <div className="grid gap-8">

                {/* APPEARANCE */}
                <div>
                    <SectionLabel>{t("customizability.appearance")}</SectionLabel>
                    <div className="grid gap-3">
                        <div className="surface-card p-4">
                            <p className="mb-3 text-sm font-semibold">{t("customizability.color_scheme")}</p>
                            <div className="grid grid-cols-3 gap-2">
                                {schemeOptions.map(({ value, label, icon }) => {
                                    const isActive = colorScheme === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => handleSchemeChange(value)}
                                            className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all"
                                            style={{
                                                borderColor: isActive ? "var(--accent)" : "var(--border)",
                                                background: isActive ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface-2)",
                                                color: isActive ? "var(--accent-readable)" : "var(--text)",
                                            }}
                                        >
                                            {icon}
                                            <span className="text-xs font-medium">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Accent Color */}
                        <div className="surface-card overflow-hidden">
                            <div className="p-4">
                                <p className="mb-3 text-sm font-semibold">{t("customizability.accent_color")}</p>
                                <div className="flex flex-wrap gap-3 p-1">
                                    {ACCENT_PRESETS.map((preset) => {
                                        const isActive = accentColor === preset.color;
                                        return (
                                            <button
                                                key={preset.color}
                                                type="button"
                                                onClick={() => handleAccentChange(preset)}
                                                title={preset.name}
                                                className="relative h-8 w-8 rounded-full transition-transform hover:scale-110 sm:h-10 sm:w-10"
                                                style={{ background: preset.color, outline: isActive ? `2.5px solid ${preset.color}` : "none", outlineOffset: "3px" }}
                                            >
                                                {isActive && <span className="absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold sm:text-sm" style={{ color: preset.contrast }}>✓</span>}
                                            </button>
                                        );
                                    })}
                                    {(() => {
                                        const isCustom = !ACCENT_PRESETS.some((p) => p.color === accentColor);
                                        return (
                                            <label
                                                htmlFor="accent-color-picker"
                                                className="relative h-8 w-8 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110 sm:h-10 sm:w-10"
                                                style={{ background: isCustom ? accentColor : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", outline: isCustom ? `2.5px solid ${accentColor}` : "none", outlineOffset: "3px" }}
                                                title={t("customizability.picker")}
                                            >
                                                <input id="accent-color-picker" type="color" value={normalizeHex(customHex) || "#ffcc01"} onChange={(event) => handlePickColor(event.target.value)} className="sr-only" />
                                                {isCustom && <span className="absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold sm:text-sm" style={{ color: getContrastForHex(accentColor) }}>✓</span>}
                                            </label>
                                        );
                                    })()}
                                </div>
                                <div className="mt-4">
                                    <div className={`flex h-10 items-center overflow-hidden rounded-lg border bg-[var(--surface-2)] px-3 transition-colors focus-within:border-[var(--accent)] ${hexError ? "border-red-400" : "border-[var(--border)]"}`}>
                                        <span className="mr-2.5 h-4 w-4 shrink-0 rounded-full border border-white/20" style={{ background: normalizeHex(customHex) || accentColor }} />
                                        <input
                                            type="text"
                                            value={customHex}
                                            onChange={(e) => { setCustomHex(e.target.value); if (hexError) setHexError(null); }}
                                            onBlur={handleApplyCustomHex}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleApplyCustomHex(); }}
                                            placeholder="#22c55e"
                                            className="h-full flex-1 bg-transparent font-mono text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* LAYOUT & GRID */}
                <div>
                    <SectionLabel>{t("customizability.layout")}</SectionLabel>
                    <div className="grid gap-3">
                        <div className="surface-card overflow-hidden">
                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-2xl bg-blue-500/15 p-2.5 text-blue-400 shrink-0">
                                        <LayoutGrid className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold leading-snug">{t("customizability.browse_grid_mobile")}</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{t("customizability.browse_grid_mobile_desc")}</p>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            {(["2", "3"] as const).map((cols) => (
                                                <button
                                                    key={cols}
                                                    type="button"
                                                    onClick={() => void setPreferences({ mobileGridColumns: cols })}
                                                    className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
                                                    style={{ borderColor: mobileGridColumns === cols ? "var(--accent)" : "var(--border)", background: mobileGridColumns === cols ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface-2)", color: mobileGridColumns === cols ? "var(--accent-readable)" : "var(--text)" }}
                                                >
                                                    {t(`customizability.columns_${cols}`)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-[var(--border)]">
                                <ToggleRow
                                    icon={<Sparkles className="h-5 w-5" />} iconClass="bg-violet-500/15 text-violet-400"
                                    label={t("customizability.reveal_effect.enable")} description={t("customizability.reveal_effect.enable_desc")}
                                    checked={revealEffectEnabled} onChange={(checked) => void setPreferences({ revealEffectEnabled: checked })}
                                />
                                {revealEffectEnabled && (
                                    <div className="grid grid-cols-2 gap-2 pb-4 pl-[68px] pr-[76px]">
                                        {(["subtle", "pronounced"] as const).map((s) => (
                                            <button
                                                key={s} type="button" onClick={() => void setPreferences({ revealEffectStrength: s })}
                                                className="rounded-xl border-2 p-3 text-sm font-semibold transition-all"
                                                style={{ borderColor: revealEffectStrength === s ? "var(--accent)" : "var(--border)", background: revealEffectStrength === s ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface-2)", color: revealEffectStrength === s ? "var(--accent-readable)" : "var(--text)" }}
                                            >
                                                {t(`customizability.reveal_effect.strengths.${s}`)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* NAVIGATION TABS */}
                <div>
                    <SectionLabel>{t("customizability.navigation_tabs")}</SectionLabel>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        <ToggleRow
                            icon={<Flame className="h-5 w-5" />} iconClass="bg-orange-500/15 text-orange-400"
                            label={t("customizability.show_right_now")} description={t("customizability.show_right_now_desc", { defaultValue: "Show the Right Now tab." })}
                            checked={showRightNow}
                            onChange={(checked) => { setShowRightNow(checked); window.localStorage.setItem("fg-show-right-now", String(checked)); window.location.reload(); }}
                        />
                        <ToggleRow
                            icon={<Star className="h-5 w-5" />} iconClass="bg-yellow-500/15 text-yellow-400"
                            label={t("customizability.show_interest")} description={t("customizability.show_interest_desc", { defaultValue: "Show the Interest tab." })}
                            checked={showInterest}
                            onChange={(checked) => { setShowInterest(checked); window.localStorage.setItem("fg-show-interest", String(checked)); window.location.reload(); }}
                        />
                        {showInterest && (
                            <SelectRow
                                icon={<Star className="h-5 w-5 opacity-50" />} iconClass="bg-yellow-500/10 text-yellow-400"
                                label={t("customizability.default_interest_view")} value={defaultInterestTab}
                                onChange={(val) => { setDefaultInterestTab(val); window.localStorage.setItem("fg-interest-default-tab", val); }}
                                options={[{ value: "taps", label: t("customizability.interest_show_taps", { defaultValue: "Taps First" }) }, { value: "views", label: t("customizability.interest_show_views", { defaultValue: "Views First" }) }]}
                            />
                        )}
                    </div>
                </div>

                {/* NEW: CHAT TRANSLATION */}
                <div>
                    <SectionLabel>Chat Translation</SectionLabel>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        <ToggleRow
                            icon={<MessageSquare className="h-5 w-5" />} iconClass="bg-emerald-500/15 text-emerald-400"
                            label="Enable Translation" description="Shows a translate icon next to incoming messages."
                            checked={translateEnabled}
                            onChange={(checked) => { setTranslateEnabled(checked); window.localStorage.setItem("fg-translate-enabled", String(checked)); }}
                        />
                        {translateEnabled && (
                            <>
                                <ToggleRow
                                    icon={<Bot className="h-5 w-5" />} iconClass="bg-teal-500/15 text-teal-400"
                                    label="Auto-Translate" description="Automatically translates new messages as they arrive."
                                    checked={autoTranslate}
                                    onChange={(checked) => { setAutoTranslate(checked); window.localStorage.setItem("fg-translate-auto", String(checked)); }}
                                />
                                <SelectRow
                                    icon={<Languages className="h-5 w-5" />} iconClass="bg-blue-500/15 text-blue-400"
                                    label="Target Language" value={translateLanguage}
                                    onChange={(val) => { setTranslateLanguage(val); window.localStorage.setItem("fg-translate-language", val); }}
                                    options={TRANSLATE_LANGUAGES.map(l => ({ value: l.code, label: l.label }))}
                                />
                                <SelectRow
                                    icon={<Activity className="h-5 w-5" />} iconClass="bg-indigo-500/15 text-indigo-400"
                                    label="Translation Engine" value={translateEngine}
                                    onChange={(val) => { setTranslateEngine(val); window.localStorage.setItem("fg-translate-engine", val); }}
                                    options={[
                                        { value: "google", label: "Google Translate (Free)" },
                                        { value: "gemini", label: "Google Gemini AI (Free API Key)" },
                                        { value: "deeplx", label: "DeepLX (Custom URL)" },
                                        { value: "openai", label: "OpenAI ChatGPT (Paid API)" },
                                    ]}
                                />
                                {translateEngine === "deeplx" && (
                                    <div className="px-4 py-3 bg-[var(--surface-2)]">
                                        <p className="mb-2 text-xs font-semibold text-[var(--text)]">DeepLX URL</p>
                                        <input type="text" value={deepLXUrl} onChange={(e) => { setDeepLXUrl(e.target.value); window.localStorage.setItem("fg-deeplx-url", e.target.value.trim()); }} placeholder="https://api.deeplx.org/translate" className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                                    </div>
                                )}
                                {translateEngine === "openai" && (
                                    <div className="px-4 py-3 bg-[var(--surface-2)]">
                                        <p className="mb-2 text-xs font-semibold text-[var(--text)]">OpenAI API Key</p>
                                        <input type="password" value={openAIKey} onChange={(e) => { setOpenAIKey(e.target.value); window.localStorage.setItem("fg-openai-key", e.target.value.trim()); }} placeholder="sk-proj-..." className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                                    </div>
                                )}
                                {translateEngine === "gemini" && (
                                    <div className="px-4 py-3 bg-[var(--surface-2)]">
                                        <p className="mb-2 text-xs font-semibold text-[var(--text)]">Gemini API Key</p>
                                        <input type="password" value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); window.localStorage.setItem("fg-gemini-key", e.target.value.trim()); }} placeholder="AIza..." className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>



                {/* REGIONAL & SYSTEM */}
                <div>
                    <SectionLabel>{t("customizability.regional")}</SectionLabel>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        <SelectRow
                            icon={<Languages className="h-5 w-5" />} iconClass="bg-cyan-500/15 text-cyan-400"
                            label={t("settings.language")} value={selectedLocale}
                            onChange={(val) => void handleLocaleChange(val)} options={SUPPORTED_LOCALE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        />
                        <SelectRow
                            icon={<Ruler className="h-5 w-5" />} iconClass="bg-sky-500/15 text-sky-400"
                            label={t("customizability.units")} value={unitsPreset}
                            onChange={(val) => handleUnitsPresetChange(val as UnitsPreset)}
                            options={[{ value: "world", label: t("customizability.units_world") }, { value: "uk", label: t("customizability.units_uk") }, { value: "american", label: t("customizability.units_american") }]}
                        />
                    </div>
                </div>

                {/* ADVANCED */}
                <div>
                    <SectionLabel>Advanced</SectionLabel>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-red-500/15 p-2.5 text-red-400 shrink-0"><RotateCcw className="h-5 w-5" /></div>
                                <div>
                                    <p className="text-sm font-semibold">Reset Warnings</p>
                                    <p className="text-xs text-[var(--text-muted)]">Restore "Don't ask again" popups.</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => { localStorage.removeItem(SKIP_BLOCK_CONFIRM_KEY); localStorage.removeItem("profile_skip_unblock_confirm"); localStorage.removeItem("chat_skip_delete_confirm"); localStorage.removeItem("fg-reply-warning-seen"); toast.success("Warnings restored!"); }} className="h-9 px-4 rounded-lg bg-red-500/10 text-red-400 font-semibold text-sm hover:bg-red-500/20 transition">Reset</button>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
}