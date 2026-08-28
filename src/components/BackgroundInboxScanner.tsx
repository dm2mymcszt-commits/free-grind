import { useEffect, useRef } from "react";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useAuth } from "../contexts/useAuth";
import { 
    isOutsideAgeLimits, 
    isOutsideDistanceLimits, 
    isForbiddenLookingFor,
    hasRightNowStatus,
    notifyAutoBlock,
    getMatchedForbiddenWord 
} from "../utils/autoblock";
import { getOtherParticipant } from "../pages/app/chat/chatUtils";
import { isProfileAutoblockWhitelisted, checkAndAutoWhitelistActiveChat, getSentMessagesThreshold } from "../utils/privacy";
import type { ConversationEntry, MessagesResponse } from "../types/messages";
import { preserveAndAutoBlockConversation } from "../services/autoBlockConversation";

export function BackgroundInboxScanner() {
    const api = useApiFunctions();
    const { userId } = useAuth();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scannedProfilesRef = useRef<Map<string, { lastActivityTimestamp: number; unreadCount: number }>>(new Map());
    const isScanningRef = useRef(false);
    const pendingMediaBlocksRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    // Seen/Read auto-block: maps conversationId -> timestamp when "seen but not replied" was first detected
    const seenStartTimesRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        if (!api || userId == null) return;

        let isCancelled = false;

        const blockConversation = async ({
            conversation,
            profileId,
            displayName,
            reason,
            messageSnapshot,
        }: {
            conversation: ConversationEntry;
            profileId: string;
            displayName: string;
            reason: string;
            messageSnapshot?: MessagesResponse;
        }): Promise<boolean> => {
            try {
                await preserveAndAutoBlockConversation({
                    conversation,
                    profileId,
                    displayName,
                    messageSnapshot,
                    fetchMessages: () => api.listMessages({
                        conversationId: conversation.data.conversationId,
                    }),
                    userId,
                    getAlbum: (albumId) => api.getAlbum(albumId),
                    blockProfile: () => api.blockProfile(profileId),
                });
                void notifyAutoBlock(displayName, reason);
                window.dispatchEvent(new Event("fg-refresh-inbox"));
                return true;
            } catch (error) {
                console.warn(
                    `[BackgroundInboxScanner] Preserving/blocking ${conversation.data.conversationId} failed; leaving it available for retry:`,
                    error,
                );
                return false;
            }
        };

        const scanInbox = async () => {
            if (isCancelled || isScanningRef.current) return;
            
            const isScannerEnabled = window.localStorage.getItem("fg-inbox-scanner-enabled") === "true";
            const isBotEvasionEnabled = window.localStorage.getItem("fg-block-first-media") === "true";
            const isSeenBlockEnabled = window.localStorage.getItem("fg-block-seen-enabled") === "true";
            const isFacelessBlockEnabled = window.localStorage.getItem("fg-block-faceless-no-media") === "true";
            if (!isScannerEnabled && !isBotEvasionEnabled && !isSeenBlockEnabled && !isFacelessBlockEnabled) {
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

                        const shouldScan = isScannerEnabled || (isBotEvasionEnabled && (unreadCount > 0 || (isLastMessageFromThem && isPreviewMedia)));
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
                        conversationId: c.data?.conversationId,
                        conversation: c,
                    }));

                if (toScan.length > 0) {
                    console.log(`[BackgroundInboxScanner] Found ${toScan.length} unscanned/updated profiles in inbox:`, toScan);
                    for (const item of toScan) {
                        if (isCancelled) break;
                        const { profileId, unreadCount, lastActivityTimestamp, conversationId, conversation } = item;
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
                            let messages: any[] = [];
                            let fetchedMessages = false;
                            let messageSnapshot: MessagesResponse | undefined;
                            let outgoingCount = 0;

                            if (isProfileAutoblockWhitelisted(profileId)) {
                                continue;
                            }

                            const skipActiveChatsEnabled = window.localStorage.getItem("fg-autoblock-skip-after-two") === "true";
                            const thresholdCount = getSentMessagesThreshold();

                            if (skipActiveChatsEnabled) {
                                try {
                                    const msgRes = await api.listMessages({ conversationId });
                                    messages = msgRes.messages || [];
                                    fetchedMessages = true;
                                    messageSnapshot = msgRes;
                                    for (const msg of messages) {
                                        const msgIsMine = userId != null && Number(msg.senderId) === Number(userId);
                                        if (msgIsMine) {
                                            outgoingCount++;
                                        }
                                    }
                                } catch {}

                                if (outgoingCount >= thresholdCount) {
                                    await checkAndAutoWhitelistActiveChat(profileId, conversationId, name, p.primaryMediaHash, userId);
                                    continue;
                                }
                            }

                            if (isScannerEnabled) {
                                    const matchedName = getMatchedForbiddenWord(name, "name");
                                    const matchedBio = getMatchedForbiddenWord(bio, "bio");

                                    if (isOutsideAgeLimits(age)) {
                                        blockReason = age == null ? "No Age Set" : `Age limit (${age})`;
                                    } else if (isOutsideDistanceLimits(distance)) {
                                        blockReason = "Distance limit";
                                    } else if (hasRightNowStatus(p)) {
                                        blockReason = "Has active 'Right Now' status";
                                    } else if (isForbiddenLookingFor(lookingForTags)) {
                                        blockReason = "Forbidden 'Looking For' tag";
                                    } else if (matchedName) {
                                        blockReason = `Name keyword: ${matchedName}`;
                                    } else if (matchedBio) {
                                        blockReason = `Bio keyword: ${matchedBio}`;
                                    }

                                    if (!blockReason) {
                                        if (!fetchedMessages) {
                                            try {
                                                const msgRes = await api.listMessages({ conversationId });
                                                messages = msgRes.messages || [];
                                                fetchedMessages = true;
                                                messageSnapshot = msgRes;
                                            } catch {}
                                        }
                                        for (const msg of messages) {
                                            const msgIsMine = userId != null && Number(msg.senderId) === Number(userId);
                                            if (!msgIsMine) {
                                                const msgBody: any = msg.body;
                                                const text = msgBody && typeof msgBody.text === "string" ? msgBody.text : (typeof msg.body === "string" ? msg.body : "");
                                                const matchedMsg = getMatchedForbiddenWord(text, "message");
                                                if (matchedMsg) {
                                                    blockReason = `Message keyword: ${matchedMsg}`;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }

                                if (!blockReason && window.localStorage.getItem("fg-block-first-media") === "true") {
                                    try {
                                        if (!fetchedMessages) {
                                            const msgRes = await api.listMessages({ conversationId });
                                            messages = msgRes.messages || [];
                                            fetchedMessages = true;
                                            messageSnapshot = msgRes;
                                        }
                                        
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
                                                                const delayedBlocked = await blockConversation({
                                                                    conversation,
                                                                    profileId,
                                                                    displayName: name,
                                                                    reason: "Scanner: First message was media (Bot evasion)",
                                                                    messageSnapshot: msgRes2,
                                                                });
                                                                if (!delayedBlocked) {
                                                                    // Preserving failed (e.g. an album share we couldn't
                                                                    // fully download yet) — forget the scan cache entry so
                                                                    // the next inbox pass re-evaluates and retries.
                                                                    scannedProfilesRef.current.delete(profileId);
                                                                }
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
                                const blocked = await blockConversation({
                                    conversation,
                                    profileId,
                                    displayName: name,
                                    reason: `Scanner: ${blockReason}`,
                                    messageSnapshot,
                                });
                                if (!blocked) {
                                    scannedProfilesRef.current.delete(profileId);
                                }
                            }
                        } catch (err) {
                            console.warn(`[BackgroundInboxScanner] Failed to scan profile ${profileId}:`, err);
                        }

                        // Throttle between fetches
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                    }
                }

                // --- SEEN/READ AUTO-BLOCK PASS ---
                if (isSeenBlockEnabled) {
                    const seenTimeoutMs = parseInt(window.localStorage.getItem("fg-block-seen-time") || "5", 10) * 60 * 1000;
                    const now = Date.now();

                    for (const c of conversations) {
                        if (isCancelled) break;
                        const conversationId = c.data?.conversationId;
                        if (!conversationId) continue;

                        const otherParticipant = getOtherParticipant(c, userId);
                        const profileId = otherParticipant?.profileId?.toString();
                        if (!profileId) continue;

                        // Skip whitelisted profiles
                        if (isProfileAutoblockWhitelisted(profileId)) {
                            seenStartTimesRef.current.delete(conversationId);
                            continue;
                        }

                        const unreadCount = c.data?.unreadCount ?? 0;
                        const lastSenderId = c.data?.preview?.senderId;
                        const isLastMessageFromMe = lastSenderId != null && Number(lastSenderId) === Number(userId);

                        // Only process conversations where:
                        // 1. The last message is from us (we sent it)
                        // 2. There are no unread messages (they haven't sent anything new)
                        if (!isLastMessageFromMe || unreadCount > 0) {
                            // They replied or the last message isn't ours — clear any tracker
                            seenStartTimesRef.current.delete(conversationId);
                            continue;
                        }

                        try {
                            // Fetch messages to get lastReadTimestamp
                            const msgRes = await api.listMessages({ conversationId });
                            const lastReadTs = msgRes.lastReadTimestamp ?? null;
                            const msgs = msgRes.messages || [];

                            // Find our most recent outgoing message
                            let lastOutgoingTs = 0;
                            for (let i = msgs.length - 1; i >= 0; i--) {
                                if (Number(msgs[i].senderId) === Number(userId)) {
                                    lastOutgoingTs = msgs[i].timestamp;
                                    break;
                                }
                            }

                            if (lastOutgoingTs === 0) {
                                // No outgoing message found
                                seenStartTimesRef.current.delete(conversationId);
                                continue;
                            }

                            // Normalize timestamps: API can return seconds or milliseconds
                            const normalizedReadTs = lastReadTs
                                ? (lastReadTs < 100_000_000_000 ? lastReadTs * 1000 : lastReadTs)
                                : null;
                            const normalizedOutTs = lastOutgoingTs < 100_000_000_000 ? lastOutgoingTs * 1000 : lastOutgoingTs;

                            // Check if they have read our last message
                            if (normalizedReadTs != null && normalizedReadTs >= normalizedOutTs) {
                                // They've read it! Start or continue the countdown
                                if (!seenStartTimesRef.current.has(conversationId)) {
                                    seenStartTimesRef.current.set(conversationId, now);
                                    console.log(`[BackgroundInboxScanner] Seen detected for ${conversationId} (${c.data?.name || profileId}), starting countdown (${seenTimeoutMs / 1000}s)`);
                                }

                                const seenSince = seenStartTimesRef.current.get(conversationId)!;
                                const elapsed = now - seenSince;

                                if (elapsed >= seenTimeoutMs) {
                                    // Time's up — block them
                                    const displayName = c.data?.name || profileId;
                                    const minutesElapsed = Math.round(elapsed / 60000);
                                    console.log(`[BackgroundInboxScanner] Blocking ${profileId} (${displayName}) for: Left on seen for ${minutesElapsed}min`);
                                    const blocked = await blockConversation({
                                        conversation: c,
                                        profileId,
                                        displayName,
                                        reason: `Left on seen for ${minutesElapsed}min`,
                                        messageSnapshot: msgRes,
                                    });
                                    if (blocked) {
                                        seenStartTimesRef.current.delete(conversationId);
                                    }
                                }
                            } else {
                                // They haven't read it yet — no countdown
                                seenStartTimesRef.current.delete(conversationId);
                            }
                        } catch (err) {
                            console.warn(`[BackgroundInboxScanner] Seen check failed for ${conversationId}:`, err);
                        }

                        // Throttle between API calls
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }

                // --- FACELESS NO-MEDIA AUTO-BLOCK PASS ---
                const isFacelessBlockEnabled = window.localStorage.getItem("fg-block-faceless-no-media") === "true";
                if (isFacelessBlockEnabled) {
                    const blockDelayMinutes = parseInt(window.localStorage.getItem("fg-block-faceless-delay") || "5", 10);
                    const blockDelayMs = blockDelayMinutes * 60 * 1000;
                    const now = Date.now();

                    for (const c of conversations) {
                        if (isCancelled) break;
                        const conversationId = c.data?.conversationId;
                        if (!conversationId) continue;

                        const otherParticipant = getOtherParticipant(c, userId);
                        const profileId = otherParticipant?.profileId?.toString();
                        if (!profileId) continue;

                        // Skip whitelisted profiles
                        if (isProfileAutoblockWhitelisted(profileId)) {
                            continue;
                        }

                        // Skip active chats protection if enabled and we sent 2+ messages
                        if (window.localStorage.getItem("fg-autoblock-skip-after-two") === "true") {
                            try {
                                const msgRes = await api.listMessages({ conversationId });
                                const msgs = msgRes.messages || [];
                                let outgoingCount = 0;
                                for (const msg of msgs) {
                                    if (userId != null && Number(msg.senderId) === Number(userId)) {
                                        outgoingCount++;
                                    }
                                }
                                if (outgoingCount >= 2) {
                                    continue;
                                }
                            } catch {}
                        }

                        // Check if the profile is faceless
                        if (otherParticipant.primaryMediaHash && otherParticipant.primaryMediaHash.trim().length > 0) {
                            continue;
                        }

                        try {
                            const msgRes = await api.listMessages({ conversationId });
                            const messages = msgRes.messages || [];

                            let firstIncomingMsgTimestamp = 0;
                            let hasSentAnyMedia = false;

                            for (const msg of messages) {
                                const msgIsMine = userId != null && Number(msg.senderId) === Number(userId);
                                if (!msgIsMine) {
                                    // Incoming message from them!
                                    if (firstIncomingMsgTimestamp === 0) {
                                        firstIncomingMsgTimestamp = msg.timestamp || Date.now();
                                    }

                                    // Check if this message is media
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

                                    if (isMedia) {
                                        hasSentAnyMedia = true;
                                        break;
                                    }
                                }
                            }

                            // If they have never sent any incoming message, skip
                            if (firstIncomingMsgTimestamp === 0) {
                                continue;
                            }

                            // If they have sent any media, skip
                            if (hasSentAnyMedia) {
                                continue;
                            }

                            // Calculate elapsed time
                            const normalizedFirstTs = firstIncomingMsgTimestamp < 100_000_000_000
                                ? firstIncomingMsgTimestamp * 1000
                                : firstIncomingMsgTimestamp;

                            const elapsed = now - normalizedFirstTs;

                            if (elapsed >= blockDelayMs) {
                                // Block them!
                                const displayName = c.data?.name || profileId;
                                console.log(`[BackgroundInboxScanner] Blocking faceless profile ${profileId} (${displayName}) - no media sent after 5 minutes`);
                                await blockConversation({
                                    conversation: c,
                                    profileId,
                                    displayName,
                                    reason: "Faceless profile: No media sent 5min after first message",
                                    messageSnapshot: msgRes,
                                });
                            }

                        } catch (err) {
                            console.warn(`[BackgroundInboxScanner] Faceless check failed for ${conversationId}:`, err);
                        }

                        // Throttle between API calls
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }

            } catch (error) {
                console.error("[BackgroundInboxScanner] Scan failed:", error);
            } finally {
                isScanningRef.current = false;
            }

            if (!isCancelled) {
                // Run scanner more frequently when seen-blocker or faceless blocker is active for responsive blocking
                const interval = (isSeenBlockEnabled || isFacelessBlockEnabled) ? 30000 : 60000;
                timeoutRef.current = setTimeout(scanInbox, interval);
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
