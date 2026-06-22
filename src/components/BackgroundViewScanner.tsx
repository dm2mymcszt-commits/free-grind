import { useEffect, useRef } from "react";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { interestViewsStore } from "../services/interestViewsStore";

export function BackgroundViewScanner() {
    const api = useApiFunctions();
    // FIXED: Uses the native browser timeout type instead of NodeJS
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!api) return;

        let isCancelled = false;

        const scanViews = async () => {
            if (isCancelled) return;

            if (window.localStorage.getItem("fg-view-scanner") !== "false") {
                try {
                    const response = await api.getViews();
                    const rawList = (response as any).items || (response as any).profiles || (response as any).views || [];
					
                    const realViews = rawList.filter((v: any) => v?.profileId && !String(v.profileId).startsWith("preview:"));

                    if (realViews.length > 0) {
                        const rows = realViews.map((v: any) => ({
                            profileId: String(v.profileId),
                            displayName: v.displayName || "", 
                            imageHash: v.profileImageMediaHash || v.imageHash || null,
                            timestamp: v.timestamp || v.lastViewed || Date.now(),
                            viewCount: v.viewCount ?? null,
                        }));

                        await interestViewsStore.upsertMany(rows);
                        window.localStorage.setItem("fg-view-scanner-last-run", Date.now().toString());
                    }
                } catch (error) {
                    console.error("[BackgroundViews] Sweep failed:", error);
                }
            }

            // Schedule the next run using the custom interval from settings
            if (!isCancelled) {
                const intervalSecs = parseInt(window.localStorage.getItem("fg-view-scanner-interval") || "120", 10);
                timeoutRef.current = setTimeout(scanViews, intervalSecs * 1000);
            }
        };

        // Run the first scan immediately
        void scanViews();
		
        return () => {
            isCancelled = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [api]);

    return null;
}