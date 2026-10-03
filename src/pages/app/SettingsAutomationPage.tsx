import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    AtSign, Ban, Crosshair, Eye, EyeOff, Image as ImageIcon, MessageSquare, Radar, Save,
    ShieldAlert, ShieldCheck, SlidersHorizontal, Tag, TextCursorInput, Trash2, Users, UserX, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { CollapsibleSection } from "../../components/ui/collapsible-section";
import { KeywordEditor } from "../../components/ui/KeywordEditor";
import { RangeSlider, Slider } from "../../components/ui/range-slider";
import { interestViewsStore } from "../../services/interestViewsStore";
import { getLookingForOptions } from "./profile-option-builders";
import { getThumbImageUrl } from "../../utils/media";
import { getAutoBlockWhitelist, removeFromAutoBlockWhitelist, AUTO_BLOCK_WHITELIST_UPDATED_EVENT } from "../../utils/privacy";
import { useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import {
    FIRST_MESSAGE_WORDS_UPDATED_EVENT,
    FORBIDDEN_WORDS_UPDATED_EVENT,
    flagKeywordsForReview,
    getForbiddenKeywordEntries,
    getKeywordsToReview,
    getOpenerEntries,
    INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY,
    INTEREST_VIEW_SCAN_EVENT,
    isBanOnSelectEnabled,
    markKeywordsReviewed,
    setBanOnSelectEnabled,
    setForbiddenKeywordEntries as saveForbiddenEntries,
    setOpenerEntries as saveOpenerEntries,
} from "../../utils/autoblock";
import { parseKeywordList, type KeywordEntry } from "../../utils/keywordList";
import { useAuth } from "../../contexts/useAuth";
import {
    isExplicitBlockEnabled,
    isExplicitFilterEnabled,
    isExplicitProfileBlockEnabled,
    setExplicitBlockEnabled,
    setExplicitFilterEnabled,
    setExplicitProfileBlockEnabled,
    testDetector,
} from "../../services/contentCheck";
import {
    clearDetectorLog,
    DETECTOR_LOG_UPDATED_EVENT,
    getDetectorLog,
    type DetectorLogEntry,
} from "../../services/detectorLog";
import {
    clampNoFacePhotoDelayMinutes,
    getNoFacePhotoDelayMinutes,
    isNeedFaceEnabled,
    isNoFacePhotoRuleEnabled,
    saveFacelessSettings,
} from "../../utils/facelessSettings";
import { isTauriRuntime } from "../../services/tauriWebSocket";
import * as chatDb from "../../services/chatDb";
import {
    GOOGLE_DRIVE_SYNC_DATA_APPLIED_EVENT,
    type GoogleDriveSyncDataAppliedDetail,
} from "../../services/googleDriveSyncRuntime";

/**
 * Whole days, never a calendar date: the point is comparing how far back the
 * saved profiles reach against the 30-day expiry, which formatRelativeTime
 * hides by switching to a date after a week.
 */
function formatDaysAgo(timestamp: number, now: number = Date.now()): string {
    const days = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));
    if (days < 1) return "under a day ago";
    return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function SettingsAutomationPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const apiFunctions = useApiFunctions();
    const { userId, settingsReady } = useAuth();

    // --- AUTO-BLOCK STATE ---
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    const [blockOnInterestViews, setBlockOnInterestViews] = useState(
        () => window.localStorage.getItem(INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY) === "true",
    );
    // Keyword lists save as they are edited; the rules below them wait for Save.
    const [forbiddenEntries, setForbiddenEntries] = useState<KeywordEntry[]>(() => getForbiddenKeywordEntries());
    const [openerEntries, setOpenerEntries] = useState<KeywordEntry[]>(() => getOpenerEntries());
    const [keywordsToReview, setKeywordsToReview] = useState<string[]>(() => getKeywordsToReview());
    const [banOnSelect, setBanOnSelect] = useState(() => isBanOnSelectEnabled());
    const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") ?? "18");
    const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") ?? "99");
    const [blockNoAge, setBlockNoAge] = useState(() => window.localStorage.getItem("fg-block-no-age") === "true");
    const [maxDistance, setMaxDistance] = useState(() => window.localStorage.getItem("fg-block-max-distance") ?? "50");
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
    const [counterBlockEnabled, setCounterBlockEnabled] = useState(() => window.localStorage.getItem("fg-autoblock-counter-block") === "true");

    // Seen/Read Auto-Block
    const [blockSeenEnabled, setBlockSeenEnabled] = useState(() => window.localStorage.getItem("fg-block-seen-enabled") === "true");
    const [blockSeenMinutes, setBlockSeenMinutes] = useState(() => window.localStorage.getItem("fg-block-seen-time") || "5");

    const [blockRightNow, setBlockRightNow] = useState(() => window.localStorage.getItem("fg-block-right-now") === "true");

    const [blockTwitter, setBlockTwitter] = useState(() => window.localStorage.getItem("fg-block-twitter") === "true");

    // Explicit photo filter. Saved the moment it is switched, not with the rules below.
    const [explicitFilter, setExplicitFilter] = useState(() => isExplicitFilterEnabled());
    const [explicitBlock, setExplicitBlock] = useState(() => isExplicitBlockEnabled());
    const [explicitProfileBlock, setExplicitProfileBlock] = useState(() => isExplicitProfileBlockEnabled());
    const [detectorStatus, setDetectorStatus] = useState<string | null>(null);
    const [detectorLog, setDetectorLog] = useState<DetectorLogEntry[]>(() => getDetectorLog());
    useEffect(() => {
        const refresh = () => setDetectorLog(getDetectorLog());
        window.addEventListener(DETECTOR_LOG_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(DETECTOR_LOG_UPDATED_EVENT, refresh);
    }, []);

    const [blockFacelessNoMedia, setBlockFacelessNoMedia] = useState(() => window.localStorage.getItem("fg-block-faceless-no-media") === "true");
    const [blockFacelessDelay, setBlockFacelessDelay] = useState(() => window.localStorage.getItem("fg-block-faceless-delay") || "5");
    const [blockFacelessPhotos, setBlockFacelessPhotos] = useState(() => isNoFacePhotoRuleEnabled());
    const [facelessNeedFace, setFacelessNeedFace] = useState(() => isNeedFaceEnabled());
    // The wait for the no-face-photo rule, typed in whole minutes or hours.
    const [noFacePhotoWait, setNoFacePhotoWait] = useState(() => {
        const minutes = getNoFacePhotoDelayMinutes();
        return minutes >= 60 && minutes % 60 === 0
            ? { amount: String(minutes / 60), unit: "hours" as const }
            : { amount: String(minutes), unit: "minutes" as const };
    });
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

    // Keywords added from elsewhere (the Ban keyword dialog, the chat header
    // menu) arrive here, as do this page's own saves.
    useEffect(() => {
        const handleForbiddenUpdated = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail;
            setForbiddenEntries(typeof detail === "string" ? parseKeywordList(detail) : getForbiddenKeywordEntries());
            setKeywordsToReview(getKeywordsToReview());
        };
        const handleOpenersUpdated = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail;
            setOpenerEntries(typeof detail === "string" ? parseKeywordList(detail) : getOpenerEntries());
        };
        window.addEventListener(FORBIDDEN_WORDS_UPDATED_EVENT, handleForbiddenUpdated);
        window.addEventListener(FIRST_MESSAGE_WORDS_UPDATED_EVENT, handleOpenersUpdated);
        return () => {
            window.removeEventListener(FORBIDDEN_WORDS_UPDATED_EVENT, handleForbiddenUpdated);
            window.removeEventListener(FIRST_MESSAGE_WORDS_UPDATED_EVENT, handleOpenersUpdated);
        };
    }, []);

    useEffect(() => {
        const handleCloudDataApplied = (event: Event) => {
            const detail = (event as CustomEvent<GoogleDriveSyncDataAppliedDetail>).detail;
            if (!settingsReady || userId == null || detail?.profileId !== userId) {
                return;
            }

            // These controls persist immediately, so refreshing them cannot
            // discard an unsaved rules draft.
            setBlockOnChat(window.localStorage.getItem("fg-block-chat") === "true");
            setBlockOnInterestViews(
                window.localStorage.getItem(INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY) === "true",
            );
            setWhitelist(getAutoBlockWhitelist());
            setBanOnSelect(isBanOnSelectEnabled());
            setForbiddenEntries(getForbiddenKeywordEntries());
            setOpenerEntries(getOpenerEntries());
            setKeywordsToReview(getKeywordsToReview());
        };

        window.addEventListener(
            GOOGLE_DRIVE_SYNC_DATA_APPLIED_EVENT,
            handleCloudDataApplied,
        );
        return () => {
            window.removeEventListener(
                GOOGLE_DRIVE_SYNC_DATA_APPLIED_EVENT,
                handleCloudDataApplied,
            );
        };
    }, [settingsReady, userId]);

    // --- VIEWS RECOVERY STATE ---
    const [viewScannerEnabled, setViewScannerEnabled] = useState(() => window.localStorage.getItem("fg-view-scanner") !== "false");
    const [viewScannerInterval, setViewScannerInterval] = useState(() => window.localStorage.getItem("fg-view-scanner-interval") || "30");
    const [savedViews, setSavedViews] = useState<{
        count: number;
        capacity: number;
        oldestKeptAt: number | null;
    } | null>(null);
    const [lastViewScanTime, setLastViewScanTime] = useState(() => window.localStorage.getItem("fg-view-scanner-last-run"));

    // Live update the Views Recovery Stats every 5 seconds
    useEffect(() => {
        const fetchStats = () => {
            // summarizeStored(), not count(): the raw row count included locked
            // preview placeholders and rows past the age window that cleanup
            // hadn't collected yet, so the figure shown here never matched the
            // profiles actually recoverable in the Interest list.
            void interestViewsStore.summarizeStored().then(setSavedViews);
            setLastViewScanTime(window.localStorage.getItem("fg-view-scanner-last-run"));
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleClearViewsCache = () => {
        setSavedViews((current) => current && { ...current, count: 0, oldestKeptAt: null });
        setIsClearViewsConfirmOpen(false);
        toast.success("Unlocked views cache has been cleared!");

        void interestViewsStore.clear().finally(() => {
            queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
            queryClient.removeQueries({ queryKey: ["interest", "list"] });
        });
    };

    // --- KEYWORD HANDLERS ---
    const handleForbiddenChange = (entries: KeywordEntry[]) => {
        setForbiddenEntries(entries);
        saveForbiddenEntries(entries).catch((error) => {
            console.error("Failed to save forbidden keywords", error);
            toast.error("Couldn't save your keywords.", { id: "keywords-save-failed" });
        });
    };

    const handleOpenersChange = (entries: KeywordEntry[]) => {
        setOpenerEntries(entries);
        saveOpenerEntries(entries).catch((error) => {
            console.error("Failed to save opening messages", error);
            toast.error("Couldn't save your opening messages.", { id: "openers-save-failed" });
        });
    };

    // Both update the settings cache before their first await, so the list
    // read straight after already reflects the change.
    const handleMarkReviewed = (identities: string[]) => {
        markKeywordsReviewed(identities).catch((error) => console.error("Failed to save reviewed keywords", error));
        setKeywordsToReview(getKeywordsToReview());
    };

    const handleFlagForReview = (identities: string[]) => {
        flagKeywordsForReview(identities).catch((error) => console.error("Failed to flag keywords for review", error));
        setKeywordsToReview(getKeywordsToReview());
    };

    const handleTargetChange = (storageKey: string, setter: (value: boolean) => void) => (checked: boolean) => {
        setter(checked);
        window.localStorage.setItem(storageKey, String(checked));
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
    };

    // --- TOGGLE HANDLERS ---
    const handleToggleChatBlock = (val: boolean) => {
        setBlockOnChat(val);
        window.localStorage.setItem("fg-block-chat", String(val));
        toast.success(val ? t("settings_automation.chat_block_enabled", { defaultValue: "Inbox Blocking Enabled" }) : t("settings_automation.chat_block_disabled", { defaultValue: "Inbox Blocking Disabled" }), { id: "chat-block-toggle" });
    };

    const handleToggleInterestViewBlock = (val: boolean) => {
        setBlockOnInterestViews(val);
        window.localStorage.setItem(INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY, String(val));
        window.dispatchEvent(new Event(INTEREST_VIEW_SCAN_EVENT));
        toast.success(
            val
                ? t("settings_automation.interest_view_block_enabled", { defaultValue: "Interest views auto-block enabled" })
                : t("settings_automation.interest_view_block_disabled", { defaultValue: "Interest views auto-block disabled" }),
            { id: "interest-view-block-toggle" },
        );
    };

    // Saves (and tells open chats and profiles) immediately, like the rest of
    // the keyword section — there is nothing here to batch behind Save.
    const handleToggleBanOnSelect = (val: boolean) => {
        setBanOnSelect(val);
        setBanOnSelectEnabled(val);
        toast.success(val ? "Selecting text now opens the ban box" : "Text selection turned back off", {
            id: "ban-on-select-toggle",
        });
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

    const runDetectorTest = async () => {
        setDetectorStatus("Testing…");
        const result = await testDetector();
        setDetectorStatus(
            result.ok
                ? `Detector works on this device (${result.elapsedMs} ms per photo).`
                : `Detector is not working on this device: ${result.error}`,
        );
        return result.ok;
    };

    const handleToggleExplicitFilter = async (val: boolean) => {
        if (!val) {
            setExplicitFilterEnabled(false);
            setExplicitFilter(false);
            setExplicitBlock(false);
            setExplicitProfileBlock(false);
            setDetectorStatus(null);
            toast.success("Explicit photo filter off", { id: "explicit-filter-toggle" });
            return;
        }
        // Switching it on with a detector that does not run would cover every
        // photo for good and never block anyone, so prove it first.
        if (!(await runDetectorTest())) {
            toast.error("The photo detector did not start, so the filter stays off.", { id: "explicit-filter-toggle" });
            return;
        }
        setExplicitFilterEnabled(true);
        setExplicitFilter(true);
        setExplicitBlock(isExplicitBlockEnabled());
        setExplicitProfileBlock(isExplicitProfileBlockEnabled());
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
        toast.success("Explicit photo filter on", { id: "explicit-filter-toggle" });
    };

    const handleToggleExplicitBlock = (val: boolean) => {
        setExplicitBlockEnabled(val);
        setExplicitBlock(val);
        if (val) window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
    };

    const handleToggleExplicitProfileBlock = (val: boolean) => {
        setExplicitProfileBlockEnabled(val);
        setExplicitProfileBlock(val);
        if (val) window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
    };

    // Opens the chat with them, which for someone blocked is the archived
    // copy with their name, photo and messages; their profile would only be
    // the placeholder a block leaves. The profile when no chat was kept.
    const openDetectorLogEntry = async (profileId: string) => {
        const stored = await chatDb.findConversationByProfileId(profileId).catch(() => null);
        if (stored) {
            navigate(`/chat/${encodeURIComponent(stored.conversationId)}`);
        } else {
            navigate(`/profile/${profileId}`, { state: { returnTo: "/settings/automation" } });
        }
    };

    // --- SAVE HANDLERS ---
    const handleSaveViewScanner = () => {
        window.localStorage.setItem("fg-view-scanner-interval", viewScannerInterval);
        toast.success("Views Recovery Settings Updated!");
    };

    const handleSaveAutoBlock = () => {
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
        window.localStorage.setItem("fg-autoblock-skip-after-count", skipBlockCount);
        window.localStorage.setItem("fg-autoblock-counter-block", String(counterBlockEnabled));
        window.localStorage.setItem("fg-block-seen-enabled", String(blockSeenEnabled));
        window.localStorage.setItem("fg-block-seen-time", blockSeenMinutes);
        window.localStorage.setItem("fg-block-right-now", String(blockRightNow));
        window.localStorage.setItem("fg-block-twitter", String(blockTwitter));
        const noFacePhotoMinutes = clampNoFacePhotoDelayMinutes(
            Number(noFacePhotoWait.amount) * (noFacePhotoWait.unit === "hours" ? 60 : 1),
        );
        saveFacelessSettings({
            noPhotoRule: blockFacelessNoMedia,
            noPhotoDelayMinutes: blockFacelessDelay,
            needFace: facelessNeedFace,
            noFacePhotoRule: blockFacelessPhotos,
            noFacePhotoDelayMinutes: noFacePhotoMinutes,
        });

        // Trigger immediate background scan with new rules
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
        window.dispatchEvent(new Event(INTEREST_VIEW_SCAN_EVENT));

        toast.success(t("settings_automation.block_rules_updated", { defaultValue: "Block Rules Updated!" }));
    };

    // Risk Colors for Views Scanner Slider
    const viewIntervalNum = Number(viewScannerInterval);
    const riskColor = viewIntervalNum < 15 ? "text-red-500" : viewIntervalNum < 30 ? "text-amber-500" : "text-emerald-500";
    const riskLabel = viewIntervalNum < 15 ? "Aggressive (High risk of rate limits / soft-bans)" : viewIntervalNum < 30 ? "Balanced (Moderate risk)" : "Safe (Low risk of rate limits)";

    // --- SECTION SUMMARIES ---
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
    const keywordsSummary = `${plural(forbiddenEntries.length, "keyword")} · ${plural(openerEntries.length, "opening message")}${keywordsToReview.length > 0 ? ` · ${keywordsToReview.length} to review` : ""}${banOnSelect ? " · select to ban" : ""}`;
    const messageRulesOn = [blockFirstMedia, skipBlockAfterTwo, blockSeenEnabled, blockFacelessNoMedia || blockFacelessPhotos].filter(Boolean).length;
    const profileFiltersSummary = [
        `Age ${minAge}–${maxAge}`,
        maxDistance === "" || Number(maxDistance) >= 500 ? "no distance limit" : `${maxDistance} km`,
        blockedLookingFor.length > 0 ? plural(blockedLookingFor.length, "tag") : null,
        blockRightNow ? "Right Now" : null,
        blockTwitter ? "X / Twitter" : null,
    ].filter(Boolean).join(" · ");
    const scannersSummary = `Scanner ${inboxScannerEnabled ? "on" : "off"} · Blocking back ${counterBlockEnabled ? "on" : "off"}`;

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
                                        {/* The count can sit a few over the cap until the next
                                            cleanup trims it; show the cap rather than a number
                                            that ticks up and snaps back. */}
                                        <p className="text-lg font-bold text-[var(--accent)]">
                                            {savedViews ? Math.min(savedViews.count, savedViews.capacity).toLocaleString() : "..."}
                                            {savedViews && savedViews.count >= savedViews.capacity && (
                                                <span
                                                    className="ml-1.5 align-middle rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                                                    title="Each new viewer replaces the saved profile whose last view is oldest."
                                                >
                                                    Full
                                                </span>
                                            )}
                                            <span className="text-[10px] font-medium text-[var(--text-muted)] block">
                                                {savedViews?.oldestKeptAt != null
                                                    ? `profiles · oldest ${formatDaysAgo(savedViews.oldestKeptAt)}`
                                                    : "profiles"}
                                            </span>
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

                {/* EXPLICIT PHOTOS */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        Explicit photos
                    </p>
                    <div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
                        <ToggleRow
                            icon={<EyeOff className="h-5 w-5" />}
                            iconClass="bg-rose-500/15 text-rose-400"
                            label="Hide photos until they are checked"
                            description="Every photo and video you receive is checked on this device before it is shown. Explicit ones, ones the detector is unsure about and ones it could not check stay covered. Nothing is uploaded anywhere."
                            checked={explicitFilter}
                            onChange={(val) => void handleToggleExplicitFilter(val)}
                        />

                        {explicitFilter && (
                            <ToggleRow
                                icon={<Ban className="h-5 w-5" />}
                                iconClass="bg-red-500/15 text-red-400"
                                label="Block whoever sends an explicit photo"
                                description="Blocks someone as soon as a photo or video they send shows genitals, anus or bare buttocks, before you are notified. Shirtless photos are left alone. Only blocks when the detector is sure; a photo it is unsure about stays covered and nobody is blocked. People on your whitelist are never blocked by this. Only applies to messages received from now on."
                                checked={explicitBlock}
                                onChange={handleToggleExplicitBlock}
                            />
                        )}

                        {explicitFilter && (
                            <ToggleRow
                                icon={<UserX className="h-5 w-5" />}
                                iconClass="bg-red-500/15 text-red-400"
                                label="Block people with an explicit profile photo"
                                description="When someone messages you, their profile photos are checked too, and an explicit one blocks them the same way, even if all they sent was a hello. Same rules: only when the detector is sure, never your whitelist, only for messages received from now on."
                                checked={explicitProfileBlock}
                                onChange={handleToggleExplicitProfileBlock}
                            />
                        )}

                        {!isTauriRuntime() ? (
                            <p className="px-4 py-3 text-xs text-[var(--text-muted)]">
                                The photo detector only runs inside the app, not in a browser.
                            </p>
                        ) : (
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <p className="min-w-0 text-xs text-[var(--text-muted)]">
                                    {detectorStatus ?? "Each device runs its own detector and has its own switch."}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void runDetectorTest()}
                                    className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
                                >
                                    Test detector
                                </button>
                            </div>
                        )}
                    </div>

                    {detectorLog.length > 0 && (
                        <div className="mt-3">
                            <CollapsibleSection
                                id="automation-detector-log"
                                title="What the detector decided"
                                summary={`${detectorLog.length} recent`}
                                icon={<ShieldCheck className="h-5 w-5" />}
                                iconClass="bg-slate-500/15 text-slate-400"
                            >
                                <div className="grid gap-2 p-4">
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Blocks made on what the detector saw, and the times it could not tell and left someone alone.
                                    </p>
                                    <ul className="grid gap-1.5">
                                        {detectorLog.slice(0, 40).map((entry) => (
                                            <li key={`${entry.at}-${entry.profileId}`} className="text-xs leading-relaxed">
                                                <span className="text-[var(--text-muted)]">
                                                    {new Date(entry.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                </span>{" "}
                                                <button
                                                    type="button"
                                                    onClick={() => void openDetectorLogEntry(entry.profileId)}
                                                    className="font-bold text-[var(--text)] underline decoration-[var(--border)] underline-offset-2 transition hover:decoration-[var(--accent)]"
                                                >
                                                    {entry.name || entry.profileId}
                                                </button>{" "}
                                                <span className={entry.outcome === "blocked" ? "text-red-400" : "text-[var(--text-muted)]"}>
                                                    {entry.detail}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        onClick={clearDetectorLog}
                                        className="justify-self-start rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
                                    >
                                        Clear list
                                    </button>
                                </div>
                            </CollapsibleSection>
                        </div>
                    )}
                </div>

                {/* AUTO BLOCK */}
                <div className="grid gap-3">
                    <p className="-mb-1 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
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

                        <ToggleRow
                            icon={<Eye className="h-5 w-5" />}
                            iconClass="bg-violet-500/15 text-violet-400"
                            label={t("settings_automation.apply_to_interest_views", { defaultValue: "Apply to Interest Views" })}
                            description={t("settings_automation.apply_to_interest_views_desc", { defaultValue: "Checks people who view you against your profile rules and blocks matches before they can start a chat." })}
                            checked={blockOnInterestViews}
                            onChange={handleToggleInterestViewBlock}
                        />
                    </div>

                    {(blockOnChat || blockOnInterestViews) && (
                        <>
                            {/* KEYWORDS */}
                            <CollapsibleSection
                                id="automation-keywords"
                                title="Keywords"
                                summary={keywordsSummary}
                                icon={<Tag className="h-5 w-5" />}
                                iconClass="bg-orange-500/15 text-orange-400"
                                defaultOpen
                            >
                                <div className="grid gap-2 p-4">
                                    <p className="text-xs font-semibold text-[var(--text-muted)]">Check keywords in</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2">
                                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                            <input type="checkbox" checked={blockName} onChange={(e) => handleTargetChange("fg-block-name", setBlockName)(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Names
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                            <input type="checkbox" checked={blockBio} onChange={(e) => handleTargetChange("fg-block-bio", setBlockBio)(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Bios
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                            <input type="checkbox" checked={blockMessage} onChange={(e) => handleTargetChange("fg-block-message", setBlockMessage)(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" /> Messages
                                        </label>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)]">Everything in this section saves as soon as you change it.</p>
                                </div>

                                {/* Select text to ban it */}
                                <div className="flex items-start gap-3 p-4">
                                    <div className="shrink-0 rounded-2xl bg-violet-500/15 p-2.5 text-violet-400">
                                        <TextCursorInput className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={banOnSelect}
                                                onChange={(e) => handleToggleBanOnSelect(e.target.checked)}
                                                className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                            />
                                            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                <strong className="text-[var(--text)]">Select Text to Ban It.</strong> Highlight part of a message, a bio or a Right Now post and the Ban keyword box opens on what you highlighted, ready to trim.
                                            </span>
                                        </label>
                                        <p className="mt-2 ml-6 text-[10px] text-[var(--text-muted)] leading-relaxed">
                                            Text can't normally be selected anywhere in the app — this turns selection back on for those three places only, so dragging still scrolls everywhere else.
                                        </p>
                                    </div>
                                </div>

                                {/* Forbidden keywords */}
                                <div className="grid gap-3 p-4">
                                    <div>
                                        <p className="text-sm font-semibold leading-snug">
                                            {t("settings_automation.forbidden_keywords_title", { defaultValue: "Forbidden Keywords" })}
                                        </p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                                            Blocks people by their name, bio or messages. Every keyword blocks one of two ways — tap the
                                            label on a keyword to switch it.
                                        </p>
                                        <dl className="mt-2 grid gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2.5 text-xs leading-relaxed">
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                <dt className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">Whole</dt>
                                                <dd className="min-w-0 flex-1 text-[var(--text-muted)]">
                                                    Blocks only if the message says nothing else. &quot;hot&quot; blocks a message that just
                                                    says &quot;Hot!&quot;, but not &quot;you look hot&quot;.
                                                </dd>
                                            </div>
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                <dt className="shrink-0 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">Anywhere</dt>
                                                <dd className="min-w-0 flex-1 text-[var(--text-muted)]">
                                                    Blocks as soon as it shows up in the message. &quot;telegram&quot; blocks &quot;add me on
                                                    telegram&quot;.
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>
                                    <KeywordEditor
                                        entries={forbiddenEntries}
                                        onChange={handleForbiddenChange}
                                        toReview={keywordsToReview}
                                        onMarkReviewed={handleMarkReviewed}
                                        onFlagForReview={handleFlagForReview}
                                        placeholder="Add a keyword or phrase"
                                        emptyLabel="No forbidden keywords yet."
                                        exportFileName="grindflop-keywords.txt"
                                    />
                                </div>

                                {/* Opening message blocklist */}
                                <div className="grid gap-3 p-4">
                                    <div>
                                        <p className="text-sm font-semibold leading-snug">Opening Messages</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                                            Only judges the <span className="font-semibold text-[var(--text)]">first message</span> someone
                                            ever sends you. Nothing here can block a word said later in the chat.
                                        </p>
                                        <dl className="mt-2 grid gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2.5 text-xs leading-relaxed">
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                <dt className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">Whole</dt>
                                                <dd className="min-w-0 flex-1 text-[var(--text-muted)]">
                                                    Their first message is exactly this. &quot;hot&quot; catches &quot;Hot!&quot;, but not
                                                    &quot;hey hot&quot;.
                                                </dd>
                                            </div>
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                <dt className="shrink-0 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">Anywhere</dt>
                                                <dd className="min-w-0 flex-1 text-[var(--text-muted)]">
                                                    Their first message contains this. &quot;looking for&quot; catches &quot;ey looking
                                                    for&quot;, and still ignores it later in the chat.
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>
                                    <KeywordEditor
                                        entries={openerEntries}
                                        onChange={handleOpenersChange}
                                        modeHints={{
                                            whole: "Blocks only if their first message is exactly this.",
                                            anywhere: "Blocks if their first message contains this.",
                                        }}
                                        placeholder="Add an opening message"
                                        emptyLabel="No opening messages yet."
                                        exportFileName="grindflop-opening-messages.txt"
                                    />
                                </div>
                            </CollapsibleSection>

                            {/* MESSAGE RULES */}
                            <CollapsibleSection
                                id="automation-message-rules"
                                title="Message rules"
                                summary={`${messageRulesOn} of 4 on`}
                                icon={<MessageSquare className="h-5 w-5" />}
                                iconClass="bg-sky-500/15 text-sky-400"
                            >
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

                                {/* Faceless profiles */}
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

                                        <label className="mt-4 flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={blockFacelessPhotos}
                                                onChange={(e) => setBlockFacelessPhotos(e.target.checked)}
                                                className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                            />
                                            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                <strong className="text-[var(--text)]">Block profiles whose photos show no face.</strong> For people who have a profile picture, but none where their face can be seen: too far away, hidden behind a phone, body only. Same outcome with a longer wait of its own. Only when every one of their photos was checked on this device and none shows a face; if the detector is unsure, they are left alone. Only for chats that start after you switch this on.
                                            </span>
                                        </label>
                                        {blockFacelessPhotos && (
                                            <div className="flex items-center gap-2 mt-3 ml-6">
                                                <span className="text-xs text-[var(--text-muted)]">Block after:</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={noFacePhotoWait.amount}
                                                    onChange={(e) => setNoFacePhotoWait((wait) => ({ ...wait, amount: e.target.value }))}
                                                    className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-center text-xs font-bold text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                                                />
                                                <select
                                                    value={noFacePhotoWait.unit}
                                                    onChange={(e) => setNoFacePhotoWait((wait) => ({ ...wait, unit: e.target.value === "hours" ? "hours" : "minutes" }))}
                                                    className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                                >
                                                    <option value="minutes">minutes</option>
                                                    <option value="hours">hours</option>
                                                </select>
                                            </div>
                                        )}

                                        {(blockFacelessNoMedia || blockFacelessPhotos) && (
                                            <label className="mt-4 flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={facelessNeedFace}
                                                    onChange={(e) => setFacelessNeedFace(e.target.checked)}
                                                    className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                                />
                                                <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                    <strong className="text-[var(--text)]">Only a photo or video of their face saves them.</strong> Applies to both rules above. Without this, any media they send is enough. With it, photos that show no face do not count, in whatever order they come. A shared album, or anything that could not be checked, still counts in their favour. Only for chats that start after you switch this on.
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </CollapsibleSection>

                            {/* PROFILE FILTERS */}
                            <CollapsibleSection
                                id="automation-profile-filters"
                                title="Profile filters"
                                summary={profileFiltersSummary}
                                icon={<SlidersHorizontal className="h-5 w-5" />}
                                iconClass="bg-emerald-500/15 text-emerald-400"
                            >
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

                                {/* X / Twitter Auto-Block */}
                                <div className="flex items-start gap-3 p-4">
                                    <div className="shrink-0 rounded-2xl bg-sky-500/15 p-2.5 text-sky-400">
                                        <AtSign className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={blockTwitter}
                                                onChange={(e) => setBlockTwitter(e.target.checked)}
                                                className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                            />
                                            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                <strong className="text-[var(--text)]">Block Profiles Linking an X / Twitter Account.</strong> An X handle on a profile is almost always an advert for NSFW or paid content (OnlyFans and the like). Instagram and Facebook links are left alone.
                                            </span>
                                        </label>
                                        <p className="mt-2 ml-6 text-[10px] text-[var(--text-muted)] leading-relaxed">
                                            The social links only arrive with the full profile, so this is applied by the inbox and views scanners and by live chats — not by the plain inbox list.
                                        </p>
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
                            </CollapsibleSection>

                            {/* SCANNERS AND BLOCKING BACK */}
                            <CollapsibleSection
                                id="automation-scanners"
                                title="Scanners and blocking back"
                                summary={scannersSummary}
                                icon={<Radar className="h-5 w-5" />}
                                iconClass="bg-yellow-500/15 text-yellow-400"
                            >
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

                                {/* Auto-Block Blockers (Instant Counter-Block) */}
                                <div className="flex items-start gap-3 p-4">
                                    <div className="shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
                                        <UserX className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={counterBlockEnabled}
                                                onChange={(e) => setCounterBlockEnabled(e.target.checked)}
                                                className="h-4 w-4 accent-[var(--accent)] shrink-0"
                                            />
                                            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                <strong className="text-[var(--text)]">Auto-Block Blockers (Instant Counter-Block).</strong> Automatically blocks users back instantly if they block you.
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            {/* EXCEPTIONS */}
                            <CollapsibleSection
                                id="automation-exceptions"
                                title="Exceptions"
                                summary={whitelist.length === 0 ? "No one whitelisted" : `${plural(whitelist.length, "profile")} whitelisted`}
                                icon={<ShieldCheck className="h-5 w-5" />}
                                iconClass="bg-emerald-500/15 text-emerald-400"
                            >
                                <div className="p-4">
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
                            </CollapsibleSection>

                            <div className="grid gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleSaveAutoBlock}
                                    className="btn-accent inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold"
                                >
                                    <Save className="h-4 w-4" />
                                    {t("settings_automation.update_block_rules", { defaultValue: "Save Auto-Block Settings" })}
                                </button>
                                <p className="px-1 text-center text-[11px] text-[var(--text-muted)]">
                                    Saves message rules, profile filters and blocking back. Keywords save on their own.
                                </p>
                            </div>
                        </>
                    )}
                </div>

            </div>

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
