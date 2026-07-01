import { useEffect, useRef } from "react";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useAuth } from "../contexts/useAuth";
import { 
    isOutsideAgeLimits, 
    isOutsideDistanceLimits, 
    shouldAutoBlock, 
    isForbiddenLookingFor,
    notifyAutoBlock 
} from "../utils/autoblock";
import { getOtherParticipant } from "../pages/app/chat/chatUtils";

export function BackgroundInboxScanner() {
    const api = useApiFunctions();
    const { userId } = useAuth();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scannedProfilesRef = useRef<Map<string, { lastActivityTimestamp: number; unreadCount: number }>>(new Map());
    const isScanningRef = useRef(false);
    const pendingMediaBlocksRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        if (!api || userId == null) return;

        let isCancelled = false;

        const scanInbox = async () => {
            if (isCancelled || isScanningRef.current) return;
            
            const isScannerEnabled = window.localStorage.getItem("fg-inbox-scanner-enabled") === "true";
            const isBotEvasionEnabled = window.localStorage.getItem("fg-block-first-media") === "true";
            if (!isScannerEnabled && !isBotEvasionEnabled) {
                // Check again in 30 seconds
                if (!isCancelled) {
                    timeoutRef.current = setTimeout(scanInbox, 30000);
                }
                return;
            }

            try {
                isScanningRef.current = true;
                const response = await api.listConversations({ page: 1 });
                const conversations = response?.entries || [];
                
                const toScan = conversations
                    .filter((c: any) => {
                        const otherId = getOtherParticipant(c, userId)?.profileId?.toString();
                        if (!otherId) return false;
                        
                        const unreadCount = c.data?.unreadCount ?? 0;
                        const lastSenderId = c.data?.preview?.senderId;
                        const isLastMessageFromThem = lastSenderId != null && Number(lastSenderId) !== Number(userId);
                        
                        const previewType = c.data?.preview?.type?.toLowerCase() || "";
                        const previewChat1 = c.data?.preview?.chat1Type?.toLowerCase() || "";
                        const isPreviewMedia =
                            previewType === "image" ||
                            previewType === "expiringimage" ||
                            previewType === "video" ||
                            previewType === "nonexpiringvideo" ||
                            previewType.includes("album") ||
                            previewChat1 === "image" ||
                            previewChat1 === "expiring_image" ||
                            previewChat1 === "video" ||
                            previewChat1 === "private_video" ||
                            previewChat1 === "expiring_video";

                        const shouldScan = (isScannerEnabled && unreadCount > 0) || (isBotEvasionEnabled && (unreadCount > 0 || (isLastMessageFromThem && isPreviewMedia)));
                        if (!shouldScan) return false;
                        
                        const cached = scannedProfilesRef.current.get(otherId);
                        if (!cached) return true; // Not scanned yet
                        
                        const lastTs = c.data?.lastActivityTimestamp ?? 0;
                        if (cached.lastActivityTimestamp !== lastTs || cached.unreadCount !== unreadCount) {
                            return true; // Info changed, need to re-scan
                        }
                        
                        return false;
                    })
                    .map((c: any) => ({
                        profileId: getOtherParticipant(c, userId)!.profileId!.toString(),
                        unreadCount: c.data?.unreadCount ?? 0,
                        lastActivityTimestamp: c.data?.lastActivityTimestamp ?? 0,
                        conversationId: c.data?.conversationId
                    }));

                if (toScan.length > 0) {
                    console.log(`[BackgroundInboxScanner] Found ${toScan.length} unscanned/updated profiles in inbox:`, toScan);
                    for (const item of toScan) {
                        if (isCancelled) break;
                        const { profileId, unreadCount, lastActivityTimestamp, conversationId } = item;
                        scannedProfilesRef.current.set(profileId, { unreadCount, lastActivityTimestamp });

                        try {
                            const profileDetail = await api.getProfileDetail(profileId);
                            const p = profileDetail as any;

                            const age = p.age;
                            const distance = p.distanceMeters ?? p.distance;
                            const name = p.name || p.displayName || "Unknown";
                            const bio = p.aboutMe;
                            const lookingForTags = p.lookingFor || [];

                            let blockReason = "";

                            if (isScannerEnabled) {
                                if (isOutsideAgeLimits(age)) {
                                    blockReason = age == null ? "No Age Set" : `Age limit (${age})`;
                                } else if (isOutsideDistanceLimits(distance)) {
                                    blockReason = "Distance limit";
                                } else if (isForbiddenLookingFor(lookingForTags)) {
                                    blockReason = "Forbidden 'Looking For' tag";
                                } else if (shouldAutoBlock(name, "name")) {
                                    blockReason = "Name keyword";
                                } else if (shouldAutoBlock(bio, "bio")) {
                                    blockReason = "Bio keyword";
                                }
                            }

                            if (!blockReason && window.localStorage.getItem("fg-block-first-media") === "true") {
                                try {
                                    const msgRes = await api.listMessages({ conversationId });
                                    const messages = msgRes.messages || [];
                                    
                                    let hasOutgoing = false;
                                    let hasIncomingText = false;
                                    let firstMsgIsMedia = false;
                                    let firstMsgTimestamp = 0;
                                    
                                    for (let i = 0; i < messages.length; i++) {
                                        const msg = messages[i];
                                        const msgIsMine = userId != null && Number(msg.senderId) === Number(userId);
                                        if (msgIsMine) {
                                            hasOutgoing = true;
                                        } else {
                                            const msgBody: any = msg.body;
                                            const text = msgBody && typeof msgBody.text === "string" ? msgBody.text : "";
                                            if (text && text.trim() !== "") {
                                                hasIncomingText = true;
                                            }
                                            
                                            const typeLower = msg.type?.toLowerCase() || "";
                                            const chat1Lower = msg.chat1Type?.toLowerCase() || "";
                                            const isMedia =
                                                typeLower === "image" ||
                                                typeLower === "expiringimage" ||
                                                typeLower === "video" ||
                                                typeLower === "nonexpiringvideo" ||
                                                typeLower.includes("album") ||
                                                chat1Lower === "image" ||
                                                chat1Lower === "expiring_image" ||
                                                chat1Lower === "video" ||
                                                chat1Lower === "private_video" ||
                                                chat1Lower === "expiring_video";
                                                
                                            if (isMedia && (!text || text.trim() === "")) {
                                                if (i === 0) {
                                                    firstMsgIsMedia = true;
                                                    firstMsgTimestamp = msg.timestamp || Date.now();
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (firstMsgIsMedia && !hasOutgoing && !hasIncomingText) {
                                        const delayEnabled = window.localStorage.getItem("fg-block-media-delay-enabled") === "true";
                                        if (delayEnabled) {
                                            const elapsedMs = Date.now() - firstMsgTimestamp;
                                            const delayMin = parseInt(window.localStorage.getItem("fg-block-media-delay-minutes") || "2", 10);
                                            const delayMs = Math.max(1, Math.min(5, delayMin)) * 60000;
                                            
                                            if (elapsedMs >= delayMs) {
                                                blockReason = "First message was media (Bot evasion)";
                                            } else {
                                                if (!pendingMediaBlocksRef.current.has(conversationId)) {
                                                    const remainingMs = delayMs - elapsedMs;
                                                    console.log(`[BackgroundInboxScanner] Scheduling delayed block for ${conversationId} in ${Math.round(remainingMs / 1000)}s`);
                                                    const timer = setTimeout(async () => {
                                                        try {
                                                            const msgRes2 = await api.listMessages({ conversationId });
                                                            const messages2 = msgRes2.messages || [];
                                                            let hasOutgoingNow = false;
                                                            let hasIncomingTextNow = false;
                                                            for (const msg of messages2) {
                                                                const msgIsMine = userId != null && Number(msg.senderId) === Number(userId);
                                                                if (msgIsMine) {
                                                                    hasOutgoingNow = true;
                                                                } else {
                                                                    const msgBody: any = msg.body;
                                                                    const text = msgBody && typeof msgBody.text === "string" ? msgBody.text : "";
                                                                    if (text && text.trim() !== "") {
                                                                        hasIncomingTextNow = true;
                                                                    }
                                                                }
                                                            }
                                                            if (!hasOutgoingNow && !hasIncomingTextNow) {
                                                                console.log(`[BackgroundInboxScanner] Delayed block: Blocking ${profileId} (${name})`);
                                                                await api.blockProfile(profileId);
                                                                void notifyAutoBlock(name, `Scanner: First message was media (Bot evasion)`);
                                                                window.dispatchEvent(new Event("fg-refresh-inbox"));
                                                            }
                                                        } catch (err) {
                                                            console.warn("[BackgroundInboxScanner] Delayed block error:", err);
                                                        } finally {
                                                            pendingMediaBlocksRef.current.delete(conversationId);
                                                        }
                                                    }, remainingMs);
                                                    pendingMediaBlocksRef.current.set(conversationId, timer);
                                                }
                                            }
                                        } else {
                                            blockReason = "First message was media (Bot evasion)";
                                        }
                                    }
                                } catch (msgErr) {
                                    console.warn(`[BackgroundInboxScanner] Failed to fetch/analyze messages for conversation ${conversationId}:`, msgErr);
                                }
                            }

                            if (blockReason) {
                                console.log(`[BackgroundInboxScanner] Blocking ${profileId} (${name}) for: ${blockReason}`);
                                await api.blockProfile(profileId);
                                void notifyAutoBlock(name, `Scanner: ${blockReason}`);
                                
                                // Dispatch event to refresh the inbox if currently viewing it
                                window.dispatchEvent(new Event("fg-refresh-inbox"));
                            }
                        } catch (err) {
                            console.warn(`[BackgroundInboxScanner] Failed to scan profile ${profileId}:`, err);
                        }

                        // Throttle between fetches
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                    }
                }
            } catch (error) {
                console.error("[BackgroundInboxScanner] Scan failed:", error);
            } finally {
                isScanningRef.current = false;
            }

            if (!isCancelled) {
                // Run scanner every 60 seconds
                timeoutRef.current = setTimeout(scanInbox, 60000);
            }
        };

        const handleTriggerScan = () => {
            console.log("[BackgroundInboxScanner] Instant scan triggered by setting change");
            scannedProfilesRef.current.clear();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            void scanInbox();
        };

        window.addEventListener("fg-trigger-inbox-scan", handleTriggerScan);

        // Delay the first check slightly to let other assets load
        timeoutRef.current = setTimeout(scanInbox, 5000);

        return () => {
            isCancelled = true;
            window.removeEventListener("fg-trigger-inbox-scan", handleTriggerScan);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (pendingMediaBlocksRef.current) {
                for (const timer of pendingMediaBlocksRef.current.values()) {
                    clearTimeout(timer);
                }
                pendingMediaBlocksRef.current.clear();
            }
        };
    }, [api, userId]);

    return null;
}
