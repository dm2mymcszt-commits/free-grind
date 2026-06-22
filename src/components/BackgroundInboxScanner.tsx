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
    const scannedProfilesRef = useRef<Set<string>>(new Set());
    const isScanningRef = useRef(false);

    useEffect(() => {
        if (!api || userId == null) return;

        let isCancelled = false;

        const scanInbox = async () => {
            if (isCancelled || isScanningRef.current) return;
            
            const isScannerEnabled = window.localStorage.getItem("fg-inbox-scanner-enabled") === "true";
            if (!isScannerEnabled) {
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
                    .map((c: any) => getOtherParticipant(c, userId)?.profileId?.toString())
                    .filter((id: any): id is string => Boolean(id) && !scannedProfilesRef.current.has(id));

                if (toScan.length > 0) {
                    console.log(`[BackgroundInboxScanner] Found ${toScan.length} unscanned profiles in inbox:`, toScan);
                    for (const profileId of toScan) {
                        if (isCancelled) break;
                        scannedProfilesRef.current.add(profileId);

                        try {
                            const profileDetail = await api.getProfileDetail(profileId);
                            const p = profileDetail as any;

                            const age = p.age;
                            const distance = p.distanceMeters ?? p.distance;
                            const name = p.name || p.displayName || "Unknown";
                            const bio = p.aboutMe;
                            const lookingForTags = p.lookingFor || [];

                            let blockReason = "";

                            if (isOutsideAgeLimits(age)) {
                                blockReason = `Age limit (${age})`;
                            } else if (isOutsideDistanceLimits(distance)) {
                                blockReason = "Distance limit";
                            } else if (isForbiddenLookingFor(lookingForTags)) {
                                blockReason = "Forbidden 'Looking For' tag";
                            } else if (shouldAutoBlock(name, "name")) {
                                blockReason = "Name keyword";
                            } else if (shouldAutoBlock(bio, "bio")) {
                                blockReason = "Bio keyword";
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
        };
    }, [api, userId]);

    return null;
}
