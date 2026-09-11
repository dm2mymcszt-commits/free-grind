import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { getSetting, setSetting } from "../services/chatDb";
import { appLog } from "./logger";
import {
    addKeywords,
    canMatchAnywhere,
    findKeyword,
    KEYWORD_LIST_FORMAT,
    normalizeWholeText,
    parseKeywordList,
    pruneReviewList,
    serializeKeywordList,
    serializeOpenerList,
    upgradeLegacyKeywordList,
    type KeywordEntry,
    type KeywordMatchMode,
} from "./keywordList";

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
        ? "GrindFlop Interest Auto-Blocker"
        : "GrindFlop Inbox Auto-Blocker";
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
type CompiledKeyword =
    | { keyword: string; whole: true }
    | { keyword: string; whole: false; regex: RegExp };

let lastSavedWords: string | null = null;
let cachedKeywords: CompiledKeyword[] = [];

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
        const compiled: CompiledKeyword[] = [];
        const uncompilable: string[] = [];
        for (const entry of parseKeywordList(savedWords)) {
            if (entry.mode === "whole") {
                // A quoted entry only matches a name, bio or message that is
                // that entry and nothing more. "tu cherches" is worth blocking
                // as someone's whole message and harmless in the middle of one.
                compiled.push({ keyword: normalizeWholeText(entry.text), whole: true });
                continue;
            }
            const cleanKeyword = entry.text.toLowerCase();
            const escaped = cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            try {
                compiled.push({
                    keyword: cleanKeyword,
                    whole: false,
                    // Unicode-aware word boundaries (\p{L} = Any Unicode Letter, \p{N} = Number)
                    // Prevents accidental partial matches (e.g. "sub" matching "submit") while matching
                    // French words with accents (é, è, à, ç) and multi-word phrases cleanly.
                    regex: new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, 'ui')
                });
            } catch {
                // One entry the 'u' flag refuses (a half emoji from a pasted or
                // imported list is the realistic way in) must not take the other
                // 250 with it. Compiling the list in one expression meant the
                // throw escaped *after* lastSavedWords had already been updated,
                // so the cache stayed empty and every keyword silently stopped
                // blocking for the rest of the session.
                uncompilable.push(cleanKeyword);
            }
        }
        if (uncompilable.length > 0) {
            appLog.warn("[AutoBlock] ignoring forbidden keyword(s) that cannot be compiled", uncompilable);
        }
        cachedKeywords = compiled;
        lastSavedWords = savedWords;
    }

    if (cachedKeywords.length === 0) return null;

    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const wholeText = normalizeWholeText(text);

    for (const item of cachedKeywords) {
        if (item.whole) {
            if (item.keyword === wholeText) return item.keyword;
        } else if (item.regex.test(text) || item.regex.test(normalizedText)) {
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
    firstMessageWords: string;
    refreshEnabled: boolean;
    refreshInterval: string;
    /**
     * The KEYWORD_LIST_FORMAT forbiddenWords is written in. Missing on lists
     * saved before whole-message entries existed.
     */
    keywordFormat?: number;
    /** Phrases the format upgrade switched to whole-message matching, until the user reviews them. */
    keywordsToReview?: string[];
}

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
    forbiddenWords: "",
    firstMessageWords: "",
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
        upgradeKeywordFormat();
    } catch (error) {
        appLog.error("[AutoBlock] failed to load automation settings", error);
        automationCache = DEFAULT_AUTOMATION_SETTINGS;
    }
}

/**
 * Reads a list saved before whole-message entries existed in today's format.
 *
 * Deliberately not written back: this runs at startup and after every sync,
 * and a write from a device that has not pulled yet could replace a newer
 * list from another device. The upgrade gives the same result on every
 * device, and the first real edit saves it.
 */
function upgradeKeywordFormat(): void {
    if ((automationCache.keywordFormat ?? 1) >= KEYWORD_LIST_FORMAT) return;
    const upgrade = upgradeLegacyKeywordList(automationCache.forbiddenWords);
    automationCache = {
        ...automationCache,
        forbiddenWords: upgrade.value,
        keywordFormat: KEYWORD_LIST_FORMAT,
        keywordsToReview: [
            ...new Set([...(automationCache.keywordsToReview ?? []), ...upgrade.switchedToWhole]),
        ],
    };
    if (typeof window !== "undefined" && upgrade.value) {
        window.localStorage.setItem("fg-forbidden-words", upgrade.value);
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

export const FORBIDDEN_WORDS_UPDATED_EVENT = "fg-forbidden-words-updated";
export const FIRST_MESSAGE_WORDS_UPDATED_EVENT = "fg-first-message-words-updated";

export async function setForbiddenWords(value: string): Promise<void> {
    // setAutomationSettings updates the cache before its first await, so
    // anything reacting to the events below already reads the new list.
    const saving = setAutomationSettings({
        forbiddenWords: value,
        keywordFormat: KEYWORD_LIST_FORMAT,
        keywordsToReview: pruneReviewList(parseKeywordList(value), automationCache.keywordsToReview ?? []),
    });
    if (typeof window !== "undefined") {
        window.localStorage.setItem("fg-forbidden-words", value);
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
        window.dispatchEvent(new CustomEvent(FORBIDDEN_WORDS_UPDATED_EVENT, { detail: value }));
    }
    await saving;
}

export function getForbiddenKeywordEntries(): KeywordEntry[] {
    return parseKeywordList(getForbiddenWords());
}

export function setForbiddenKeywordEntries(entries: readonly KeywordEntry[]): Promise<void> {
    return setForbiddenWords(serializeKeywordList(entries));
}

/** Phrases still waiting to be reviewed after the format upgrade, by keyword identity. */
export function getKeywordsToReview(): string[] {
    return pruneReviewList(getForbiddenKeywordEntries(), automationCache.keywordsToReview ?? []);
}

export async function markKeywordsReviewed(identities: readonly string[]): Promise<void> {
    const reviewed = new Set(identities);
    await setAutomationSettings({
        keywordsToReview: getKeywordsToReview().filter((identity) => !reviewed.has(identity)),
    });
}

/** Imported phrases that were switched to whole-message matching wait for review too. */
export async function flagKeywordsForReview(identities: readonly string[]): Promise<void> {
    if (identities.length === 0) return;
    await setAutomationSettings({
        keywordsToReview: pruneReviewList(getForbiddenKeywordEntries(), [
            ...(automationCache.keywordsToReview ?? []),
            ...identities,
        ]),
    });
}

export type KeywordListName = "forbidden" | "openers";

function entriesOf(list: KeywordListName): KeywordEntry[] {
    return list === "forbidden" ? getForbiddenKeywordEntries() : getOpenerEntries();
}

export function findKeywordIn(list: KeywordListName, text: string): KeywordEntry | null {
    return findKeyword(entriesOf(list), text);
}

/**
 * Adds one keyword unless the list already has it, in which case nothing is
 * written and the entry that was already there comes back so the caller can
 * say so.
 */
export async function addKeywordTo(
    list: KeywordListName,
    text: string,
    mode: KeywordMatchMode,
): Promise<{ added: KeywordEntry | null; existing: KeywordEntry | null }> {
    // Openers always match the whole message, and an anywhere entry cannot
    // hold a comma without being saved as a whole-message one.
    const effectiveMode = list === "openers" || !canMatchAnywhere(text) ? "whole" : mode;
    const result = addKeywords(entriesOf(list), [{ text, mode: effectiveMode }]);
    const added = result.added[0] ?? null;
    if (!added) {
        return { added: null, existing: result.duplicates[0] ?? null };
    }
    if (list === "forbidden") {
        await setForbiddenKeywordEntries(result.entries);
    } else {
        await setOpenerEntries(result.entries);
    }
    return { added, existing: null };
}

export const FIRST_MESSAGE_WORDS_STORAGE_KEY = "fg-first-message-words";

export function getFirstMessageWords(): string {
    const fromCache = automationCache.firstMessageWords;
    if (fromCache && fromCache.trim()) return fromCache;
    if (typeof window !== "undefined") {
        return window.localStorage.getItem(FIRST_MESSAGE_WORDS_STORAGE_KEY) || "";
    }
    return "";
}

export async function setFirstMessageWords(value: string): Promise<void> {
    const saving = setAutomationSettings({ firstMessageWords: value });
    if (typeof window !== "undefined") {
        window.localStorage.setItem(FIRST_MESSAGE_WORDS_STORAGE_KEY, value);
        window.dispatchEvent(new Event("fg-trigger-inbox-scan"));
        window.dispatchEvent(new CustomEvent(FIRST_MESSAGE_WORDS_UPDATED_EVENT, { detail: value }));
    }
    await saving;
}

export function getOpenerEntries(): KeywordEntry[] {
    return parseKeywordList(getFirstMessageWords());
}

export function setOpenerEntries(entries: readonly KeywordEntry[]): Promise<void> {
    return setFirstMessageWords(serializeOpenerList(entries));
}

/**
 * Matches a conversation's opening message against the openers list — the
 * whole message must *be* the entry, not merely contain it.
 *
 * That is the entire point of the list being separate from the forbidden
 * keywords: a word like "hot" is unremarkable mid-conversation and worth
 * blocking as somebody's entire opening line. Containment would make
 * "hello, hot" a match and turn this back into the keyword rule.
 *
 * The caller decides what counts as an opening message; this only answers
 * whether the text qualifies.
 */
export function getMatchedFirstMessageWord(text: string | null | undefined): string | null {
    if (!text) return null;
    const saved = getFirstMessageWords();
    if (!saved || saved.trim() === "") return null;

    const normalized = normalizeWholeText(text);
    if (!normalized) return null;

    for (const entry of parseKeywordList(saved)) {
        const candidate = normalizeWholeText(entry.text);
        if (candidate === normalized) {
            return candidate;
        }
    }
    return null;
}

export function getAutoRefreshSettings(): { enabled: boolean; intervalMinutes: string } {
    return { enabled: automationCache.refreshEnabled, intervalMinutes: automationCache.refreshInterval };
}
