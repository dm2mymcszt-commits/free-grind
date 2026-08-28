import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useEffect } from "react";
import { TAP_RECEIVED_EVENT, VIEW_RECEIVED_EVENT } from "../../components/ChatRealtimeBridge";
import {
	getActiveInterestViewsAccount,
	interestViewsStore,
} from "../../services/interestViewsStore";
import { fromStoredView, toStoredView, normalizeViews, normalizeTaps, PREVIEW_ID_PREFIX } from "../../pages/app/interest/interestUtils";
import { useTranslation } from "react-i18next";
import { DEFAULT_STALE_TIME_MS } from "../../config/ui-constants";

export function useInterestData() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	const query = useQuery({
		queryKey: ["interest", "list"],
		queryFn: async () => {
			// Snapshot the account before any awaiting, so a switch mid-fetch
			// discards this result rather than filing it under the new account.
			const account = getActiveInterestViewsAccount();

			// 1. Parallel fetch from API
			const [tapsResponse, viewsResponse] = await Promise.all([
				api.getTaps(),
				api.getViews(),
			]);

			// 2. Load cached views from IndexedDB (persistence)
			const cachedRows = await interestViewsStore.getAll();
			const cachedViews = cachedRows.map(fromStoredView);

			// 3. Normalize & Merge
			const normalizedViews = normalizeViews(viewsResponse, cachedViews, t);
			const normalizedTaps = normalizeTaps(tapsResponse, t);

			// 4. Update persistence store with merged views.
			//    Previews are excluded deliberately: they're locked placeholders
			//    with no recoverable profile ID, and an unhashed one keys off its
			//    position in the list, so its synthetic ID changes as the list
			//    reorders. Persisting them minted new rows on every refresh and
			//    inflated the saved-profile count with entries nothing could open.
			await interestViewsStore.upsertMany(
				normalizedViews
					.filter((item) => !item.profileId.startsWith(PREVIEW_ID_PREFIX))
					.map((item) => toStoredView(item)),
				account,
			);

			// What the server itself is still listing this fetch. `normalizedViews`
			// above deliberately keeps viewers the server has dropped — that is
			// the whole point of the recovery store — so telling "Grindr no longer
			// counts them" from "merely merged in from cache" needs the raw
			// response's own ids. Hash matching mirrors the background sweep's: a
			// viewer the server now shows only as a locked preview is still inside
			// totalViewers, and must not be counted a second time.
			const incomingViews = normalizeViews(viewsResponse, [], t);

			return {
				taps: normalizedTaps,
				views: normalizedViews,
				// Extract viewedCount from the raw response for the UI
				viewedCount: (viewsResponse as any)?.totalViewers || (viewsResponse as any)?.data?.totalViewers || 0,
				serverProfileIds: incomingViews
					.filter((item) => !item.profileId.startsWith(PREVIEW_ID_PREFIX))
					.map((item) => item.profileId),
				serverImageHashes: incomingViews.flatMap((item) =>
					item.imageHash ? [item.imageHash] : [],
				),
			};
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true, // Auto-sync when app returns to foreground
	});

	// Handle WebSocket updates
	useEffect(() => {
		const handleUpdate = () => {
			// Invalidate query to trigger a background refetch
			queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
		};

		window.addEventListener(TAP_RECEIVED_EVENT, handleUpdate);
		window.addEventListener(VIEW_RECEIVED_EVENT, handleUpdate);

		return () => {
			window.removeEventListener(TAP_RECEIVED_EVENT, handleUpdate);
			window.removeEventListener(VIEW_RECEIVED_EVENT, handleUpdate);
		};
	}, [queryClient]);

	return query;
}
