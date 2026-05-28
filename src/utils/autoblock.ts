import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";

export async function notifyAutoBlock(profileName: string, reason: string) {
    console.log(`[AutoBlock] Banned: ${profileName} | Reason: ${reason}`);

    if (!isTauriRuntime()) return;

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

// Target can be: "name", "bio", or "message"
export function getMatchedForbiddenWord(text: string | null | undefined, target: "name" | "bio" | "message"): string | null {
    if (!text) return null;

    // Check our new specific toggles!
    if (target === "name" && window.localStorage.getItem("fg-block-name") === "false") return null;
    if (target === "bio" && window.localStorage.getItem("fg-block-bio") === "false") return null;
    if (target === "message" && window.localStorage.getItem("fg-block-message") === "false") return null;

    const savedWords = window.localStorage.getItem("fg-forbidden-words");
    if (!savedWords || savedWords.trim() === "") return null;

    const keywords = savedWords.split(',').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    if (keywords.length === 0) return null;

    const lowerText = text.toLowerCase();
    
    for (const keyword of keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
        
        if (regex.test(lowerText)) {
            return keyword;
        }
    }
    return null;
}

export function shouldAutoBlock(text: string | null | undefined, target: "name" | "bio" | "message"): boolean {
    return getMatchedForbiddenWord(text, target) !== null;
}

export function isOutsideAgeLimits(age: number | null | undefined): boolean {
    if (age == null) return false; 

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

// NEW: Distance Blocker
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