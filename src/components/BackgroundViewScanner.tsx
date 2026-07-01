import { useEffect, useRef } from "react";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { interestViewsStore } from "../services/interestViewsStore";
import { normalizeViews, fromStoredView, toStoredView, PREVIEW_ID_PREFIX } from "../pages/app/interest/interestUtils";

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
                    const cachedRows = await interestViewsStore.getAll();
                    const cachedViews = cachedRows.map(fromStoredView);
                    const normalizedViews = normalizeViews(response, cachedViews, (key: string) => key);

                    // 1. Save all active views (both profiles and active previews)
                    await interestViewsStore.upsertMany(normalizedViews.map(toStoredView));

                    // 2. Find and delete stale previews
                    const activePreviewIds = new Set(
                        normalizedViews
                            .filter((item) => item.profileId.startsWith(PREVIEW_ID_PREFIX))
                            .map((item) => item.profileId)
                    );
                    const stalePreviewIds = cachedRows
                        .map((r) => r.profileId)
                        .filter((id) => id.startsWith(PREVIEW_ID_PREFIX) && !activePreviewIds.has(id));

                    if (stalePreviewIds.length > 0) {
                        await interestViewsStore.deleteMany(stalePreviewIds);
                    }
                    window.localStorage.setItem("fg-view-scanner-last-run", Date.now().toString());
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