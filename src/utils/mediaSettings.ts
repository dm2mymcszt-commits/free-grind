// Read directly via localStorage (rather than PreferencesContext) so it can
// be checked from plain service modules (mediaStore.ts, albumStore.ts) that
// aren't part of the React tree.
export const AUTO_DOWNLOAD_MEDIA_KEY = "fg-auto-download-media";

export function isAutoDownloadMediaEnabled(): boolean {
	return window.localStorage.getItem(AUTO_DOWNLOAD_MEDIA_KEY) === "true";
}
