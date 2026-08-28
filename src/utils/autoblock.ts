import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { getSetting, setSetting } from "../services/chatDb";
import { appLog } from "./logger";

const notificationCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export const INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY = "fg-block-interest-views";
export const INTEREST_VIEW_SCAN_EVENT = "fg-trigger-view-scan";
export const INBOX_AUTOBLOCK_NOTIFICATIONS_STORAGE_KEY = "fg-notify-autoblock";
export const INTEREST_VIEW_AUTOBLOCK_NOTIFICATIONS_STORAGE_KEY = "fg-notify-autoblock-interest-views";

export type AutoBlockNotificationSource = "inbox" | "interest_views";

export function isInterestViewAutoBlockEnabled(): boolean {
    return typeof window !== "undefined"
        && window.localStorage.getItem(INTEREST_VIEW_AUTOBLOCK_STORAGE_KEY) === "true";
}

export function isInboxAutoBlockNotificationsEnabled(): boolean {
    return typeof window === "undefined"
        || window.localStorage.getItem(INBOX_AUTOBLOCK_NOTIFICATIONS_STORAGE_KEY) !== "false";
}

export function isInterestViewAutoBlockNotificationsEnabled(): boolean {
    return typeof window === "undefined"
        || window.localStorage.getItem(INTEREST_VIEW_AUTOBLOCK_NOTIFICATIONS_STORAGE_KEY) !== "false";
}

function notificationTitle(source: AutoBlockNotificationSource): string {
    return source === "interest_views"
        ? "Free Grind Interest Auto-Blocker"
        : "Free Grind Inbox Auto-Blocker";
}

/**
 * The delivery half of an auto-block notification: the per-source user toggle,
 * the permission dance, and the send itself. Shared by the single-profile and
 * aggregated paths so the two can never drift on which preference gates which
 * source — the Interest and Inbox toggles stay strictly independent, and
 * neither one has any say over whether the block itself happens.
 */
async function sendAutoBlockNotification(
    source: AutoBlockNotificationSource,
    body: string,
): Promise<void> {
    if (!isTauriRuntime()) return;

    const notificationsEnabled = source === "interest_views"
        ? isInterestViewAutoBlockNotificationsEnabled()
        : isInboxAutoBlockNotificationsEnabled();
    if (!notificationsEnabled) {
        console.log(`[AutoBlock:${source}] Notification suppressed by user settings`);
        return;
    }

    try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === "granted";
        }

        if (permissionGranted) {
            sendNotification({ title: notificationTitle(source), body });
        }
    } catch (e) {
        console.error("Failed to send notification", e);
    }
}

export async function notifyAutoBlock(
    profileName: string,
    reason: string,
    source: AutoBlockNotificationSource = "inbox",
) {
    console.log(`[AutoBlock:${source}] Banned: ${profileName} | Reason: ${reason}`);

    const now = Date.now();
    const cacheKey = `${source}::${profileName}::${reason}`;
    const lastSentTime = notificationCache.get(cacheKey);

    if (lastSentTime && (now - lastSentTime < DEDUPLICATION_WINDOW_MS)) {
        console.log(`[AutoBlock] Duplicate notification suppressed for: ${profileName} | Reason: ${reason}`);
        return;
    }

    notificationCache.set(cacheKey, now);

    // Clean up old entries from cache
    for (const [key, timestamp] of notificationCache.entries()) {
        if (now - timestamp > DEDUPLICATION_WINDOW_MS) {
            notificationCache.delete(key);
        }
    }

    await sendAutoBlockNotification(
        source,
        source === "interest_views"
            ? `Blocked from Interest Views: ${profileName}\n${reason}`
            : `Blocked from Inbox: ${profileName}\n${reason}`,
    );
}

/** How many names an aggregated notification spells out before "+N more". */
const MAX_SUMMARY_NAMES = 3;

/**
 * Reports a group of blocks made in one pass as a single notification.
 *
 * A catch-up sweep can legitimately block several profiles at once (views that
 * arrived while the app was closed), and one OS notification per profile is
 * the notification storm this exists to prevent. One profile still gets the
 * ordinary per-profile notification, wording and dedup unchanged, so a single
 * live view reads exactly as it did before.
 */
export async function notifyAutoBlockBatch(
    blocked: { profileName: string; reason: string }[],
    source: AutoBlockNotificationSource = "inbox",
): Promise<void> {
    if (blocked.length === 0) return;
    if (blocked.length === 1) {
        await notifyAutoBlock(blocked[0].profileName, blocked[0].reason, source);
        return;
    }

    for (const entry of blocked) {
        console.log(`[AutoBlock:${source}] Banned: ${entry.profileName} | Reason: ${entry.reason}`);
    }

    const names = blocked.map((entry) => entry.profileName);
    const now = Date.now();
    // Keyed by the batch's own membership, so re-running an identical sweep
    // within the dedup window stays quiet while a genuinely different group
    // still gets its summary.
    const cacheKey = `${source}::batch::${[...names].sort().join("|")}`;
    const lastSentTime = notificationCache.get(cacheKey);
    if (lastSentTime && (now - lastSentTime < DEDUPLICATION_WINDOW_MS)) {
        console.log(`[AutoBlock:${source}] Duplicate summary notification suppressed`);
        return;
    }
    notificationCache.set(cacheKey, now);

    const shownNames = names.slice(0, MAX_SUMMARY_NAMES).join(", ");
    const remaining = names.length - Math.min(names.length, MAX_SUMMARY_NAMES);
    const label = source === "interest_views" ? "matching Interest viewers" : "matching profiles";

    await sendAutoBlockNotification(
        source,
        `Blocked ${blocked.length} ${label}.\n${shownNames}${remaining > 0 ? ` +${remaining} more` : ""}`,
    );
}

// --- JAY'S PERFORMANCE CACHE + YOUR EXACT MATCH REGEX ---
let lastSavedWords: string | null = null;
let cachedRegexes: { keyword: string, regex: RegExp }[] = [];

// Target can be: "name", "bio", or "message"
export function getMatchedForbiddenWord(text: string | null | undefined, target: "name" | "bio" | "message"): string | null {
    if (!text) return null;

    // Check specific toggles
    if (target === "name" && window.localStorage.getItem("fg-block-name") === "false") return null;
    if (target === "bio" && window.localStorage.getItem("fg-block-bio") === "false") return null;
    if (target === "message" && window.localStorage.getItem("fg-block-message") === "false") return null;

    const savedWords = getForbiddenWords();
    if (!savedWords || savedWords.trim() === "") return null;

    // Jay's Cache Logic: Only re-compile the Regexes if you changed your settings!
    if (savedWords !== lastSavedWords) {
        lastSavedWords = savedWords;
        cachedRegexes = savedWords.split(',')
            .map(word => word.trim().toLowerCase())
            .filter(word => word.length > 0)
            .map(keyword => {
                const cleanKeyword = keyword.replace(/\s+/g, ' ');
                const escaped = cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return {
                    keyword: cleanKeyword,
                    // Unicode-aware word boundaries (\p{L} = Any Unicode Letter, \p{N} = Number)
                    // Prevents accidental partial matches (e.g. "sub" matching "submit") while matching
                    // French words with accents (é, è, à, ç) and multi-word phrases cleanly.
                    regex: new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, 'ui')
                };
            });
    }

    if (cachedRegexes.length === 0) return null;

    const normalizedText = text.replace(/\s+/g, ' ').trim();

    for (const item of cachedRegexes) {
        if (item.regex.test(text) || item.regex.test(normalizedText)) {
            return item.keyword; // Boom. Caught safely without false positives.
        }
    }
    return null;
}
// --------------------------------------------------------

export function shouldAutoBlock(text: string | null | undefined, target: "name" | "bio" | "message"): boolean {
    return getMatchedForbiddenWord(text, target) !== null;
}

export function hasRightNowStatus(profile: { rightNow?: string | null; rightNowText?: string | null; rightNowPosted?: number | null } | null | undefined): boolean {
    if (!profile) return false;
    if (window.localStorage.getItem("fg-block-right-now") !== "true") return false;

    const hasHosting = profile.rightNow === "HOSTING" || profile.rightNow === "NOT_HOSTING";
    const hasText = Boolean(profile.rightNowText && profile.rightNowText.trim().length > 0);
    const hasPosted = typeof profile.rightNowPosted === "number" && Number.isFinite(profile.rightNowPosted) && profile.rightNowPosted > 0;

    return hasHosting || hasText || hasPosted;
}

// --- Grindr Tag Blocker ---
export function isForbiddenLookingFor(profileLookingFor: number[] | null | undefined): boolean {
    if (!profileLookingFor || profileLookingFor.length === 0) return false;
    
    const savedTags = window.localStorage.getItem("fg-block-looking-for");
    if (!savedTags) return false;
    
    const mode = window.localStorage.getItem("fg-block-looking-for-mode") || "any"; // "any" or "only"

    try {
        const blockedIds = JSON.parse(savedTags) as number[];
        if (!Array.isArray(blockedIds) || blockedIds.length === 0) return false;
        
        if (mode === "only") {
            // Block ONLY if every single tag they have is in our blocked list
            return profileLookingFor.every(id => blockedIds.includes(id));
        } else {
            // Block if ANY tag they have is in our blocked list
            return profileLookingFor.some(id => blockedIds.includes(id));
        }
    } catch {
        return false;
    }
}
// --------------------------------------------------------

export function isOutsideAgeLimits(age: number | null | undefined): boolean {
    if (age == null) {
        return window.localStorage.getItem("fg-block-no-age") === "true";
    }

    const rawMin = window.localStorage.getItem("fg-block-min-age");
    const rawMax = window.localStorage.getItem("fg-block-max-age");

    if (rawMin && rawMin.trim() !== "") {
        const minAge = parseInt(rawMin.trim(), 10);
        if (!isNaN(minAge) && age < minAge) return true;
    }
    if (rawMax && rawMax.trim() !== "") {
        const maxAge = parseInt(rawMax.trim(), 10);
        if (!isNaN(maxAge) && age > maxAge) return true;
    }

    return false;
}

// Distance Blocker
export function isOutsideDistanceLimits(distanceMeters: number | null | undefined): boolean {
    if (distanceMeters == null || isNaN(distanceMeters)) return false; 
    
    const rawMax = window.localStorage.getItem("fg-block-max-distance");
    if (rawMax && rawMax.trim() !== "") {
        const maxKm = parseFloat(rawMax.trim());
        // Convert meters to km and check
        if (!isNaN(maxKm) && (distanceMeters / 1000) > maxKm) return true;
    }
    
    return false;
}

// --- PER-CHAT GHOST MODE LOGIC ---
export function isChatGhosted(conversationId: string): boolean {
    const globalGhost = window.localStorage.getItem("fg-ghost-mode") === "true";
    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
    
    try {
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;
        if (typeof exceptions[conversationId] === "boolean") {
            return exceptions[conversationId];
        }
    } catch {}
    
    return globalGhost;
}

export function toggleChatGhost(conversationId: string): boolean {
    const currentState = isChatGhosted(conversationId);
    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
    
    try {
        const exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>;
        exceptions[conversationId] = !currentState;
        window.localStorage.setItem("fg-ghost-exceptions", JSON.stringify(exceptions));
    } catch {
        window.localStorage.setItem("fg-ghost-exceptions", JSON.stringify({ [conversationId]: !currentState }));
    }
    return !currentState;
}

// ---------------------------------------------------------------------------
// Automation settings — backed by the active profile's db (chatDb), kept in
// an in-memory cache. The forbidden-words list here is now the shared
// keyword source for custom automation rules (see automationRules.ts's
// useForbiddenList conditions) — the keyword *matching* itself (auto-block
// on chat/grid) moved into the automation rule engine.
// ---------------------------------------------------------------------------

export interface AutomationSettings {
    forbiddenWords: string;
    refreshEnabled: boolean;
    refreshInterval: string;
}

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
    forbiddenWords: "",
    refreshEnabled: false,
    refreshInterval: "5",
};

const AUTOMATION_SETTINGS_KEY = "automation";

let automationCache: AutomationSettings = DEFAULT_AUTOMATION_SETTINGS;

/**
 * Populates the in-memory automation cache from the active profile's db.
 * Awaited by AuthContext before it flips settingsReady, so by the time any
 * consumer observes settingsReady=true the cache already reflects the
 * active profile.
 */
export async function loadAutomationCache(): Promise<void> {
    try {
        const stored = await getSetting<Partial<AutomationSettings>>(AUTOMATION_SETTINGS_KEY);
        const localWords = typeof window !== "undefined" ? window.localStorage.getItem("fg-forbidden-words") || "" : "";
        automationCache = { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
        if (!automationCache.forbiddenWords && localWords) {
            automationCache.forbiddenWords = localWords;
            await setSetting(AUTOMATION_SETTINGS_KEY, automationCache).catch(() => {});
        }
    } catch (error) {
        appLog.error("[AutoBlock] failed to load automation settings", error);
        automationCache = DEFAULT_AUTOMATION_SETTINGS;
    }
}

export function getAutomationSettings(): AutomationSettings {
    return automationCache;
}

export async function setAutomationSettings(
    patch: Partial<AutomationSettings>,
): Promise<AutomationSettings> {
    automationCache = { ...automationCache, ...patch };
    await setSetting(AUTOMATION_SETTINGS_KEY, automationCache);
    return automationCache;
}

export function getForbiddenWords(): string {
    const fromCache = automationCache.forbiddenWords;
    if (fromCache && fromCache.trim()) return fromCache;
    if (typeof window !== "undefined") {
        return window.localStorage.getItem("fg-forbidden-words") || "";
    }
    return "";
}

export async function setForbiddenWords(value: string): Promise<void> {
    if (typeof window !== "undefined") {
        window.localStorage.setItem("fg-forbidden-words", value);
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
        window.dispatchEvent(new CustomEvent("fg-forbidden-words-updated", { detail: value }));
    }
    await setAutomationSettings({ forbiddenWords: value });
}

export function getAutoRefreshSettings(): { enabled: boolean; intervalMinutes: string } {
    return { enabled: automationCache.refreshEnabled, intervalMinutes: automationCache.refreshInterval };
}
