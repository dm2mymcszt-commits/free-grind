import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { getSetting, setSetting } from "../services/chatDb";
import { appLog } from "./logger";

const notificationCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export async function notifyAutoBlock(profileName: string, reason: string) {
    console.log(`[AutoBlock] Banned: ${profileName} | Reason: ${reason}`);

    const now = Date.now();
    const cacheKey = `${profileName}::${reason}`;
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

    if (!isTauriRuntime()) return;

    if (window.localStorage.getItem("fg-notify-autoblock") === "false") {
        console.log("[AutoBlock] Notification suppressed: auto-block notifications disabled by user settings");
        return;
    }

    try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === "granted";
        }

        if (permissionGranted) {
            sendNotification({
                title: "Free Grind Auto-Blocker",
                body: `Blocked: ${profileName}\n${reason}`,
            });
        }
    } catch (e) {
        console.error("Failed to send notification", e);
    }
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
    }
    await setAutomationSettings({ forbiddenWords: value });
}

export function getAutoRefreshSettings(): { enabled: boolean; intervalMinutes: string } {
    return { enabled: automationCache.refreshEnabled, intervalMinutes: automationCache.refreshInterval };
}
