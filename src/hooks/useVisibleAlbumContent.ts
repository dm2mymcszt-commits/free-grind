import { useEffect, useMemo, useState } from "react";
import { filterAlbumContent, refreshAlbumChecks } from "../services/albumContentCheck";
import {
	EXPLICIT_FILTER_UPDATED_EVENT,
	isExplicitFilterEnabled,
	subscribeToContentChecks,
} from "../services/contentCheck";

/**
 * The items of an open album that the explicit-photo filter lets through, and
 * how many it holds back. Listens for checks only while an album is open, and
 * asks for the album's items to be checked when it opens.
 *
 * The result is what both the album grid and the full-screen viewer should be
 * given: the viewer swipes through the list, so an item that is not in it
 * cannot be swiped onto.
 */
export function useVisibleAlbumContent<T extends { contentId: number }>(
	albumId: number | null,
	content: readonly T[] | null | undefined,
	isOwn: boolean,
): { content: T[]; hiddenCount: number } {
	const [tick, setTick] = useState(0);
	const watching = albumId != null && !isOwn;

	useEffect(() => {
		if (!watching) return;
		const bump = () => setTick((value) => value + 1);
		const unsubscribe = subscribeToContentChecks(bump);
		window.addEventListener(EXPLICIT_FILTER_UPDATED_EVENT, bump);
		return () => {
			unsubscribe();
			window.removeEventListener(EXPLICIT_FILTER_UPDATED_EVENT, bump);
		};
	}, [watching]);

	const itemCount = content?.length ?? 0;
	useEffect(() => {
		if (watching && albumId != null && isExplicitFilterEnabled()) {
			void refreshAlbumChecks(albumId);
		}
	}, [watching, albumId, itemCount]);

	return useMemo(() => {
		if (albumId == null) return { content: content ? [...content] : [], hiddenCount: 0 };
		return filterAlbumContent(albumId, content ?? [], isOwn);
		// `tick` is the reason to recompute: a check landed or the filter was switched.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [albumId, content, isOwn, tick]);
}
