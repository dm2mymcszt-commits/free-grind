// --- PER-CHAT GHOST MODE LOGIC ---
export function isChatGhosted(conversationId: string): boolean {
    const globalGhost = window.localStorage.getItem("fg-ghost-mode") === "true";
    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
    
    try {
        // Tell TypeScript exactly what shape this object is
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

export function getAutoBlockWhitelist(): { profileId: string; displayName: string }[] {
    try {
        const json = window.localStorage.getItem("fg-auto-block-whitelist") || "[]";
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function addToAutoBlockWhitelist(profileId: string, displayName: string) {
    const list = getAutoBlockWhitelist();
    if (!list.some(x => String(x.profileId) === String(profileId))) {
        list.push({ profileId: String(profileId), displayName });
        window.localStorage.setItem("fg-auto-block-whitelist", JSON.stringify(list));
    }
}

export function removeFromAutoBlockWhitelist(profileId: string) {
    const list = getAutoBlockWhitelist();
    const filtered = list.filter(x => String(x.profileId) !== String(profileId));
    window.localStorage.setItem("fg-auto-block-whitelist", JSON.stringify(filtered));
}

export function isProfileAutoblockWhitelisted(profileId: string): boolean {
    const list = getAutoBlockWhitelist();
    return list.some(x => String(x.profileId) === String(profileId));
}