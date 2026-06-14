import { useState } from "react";
import { Download, Images, MessageCircle, Play, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/states";
import { saveMediaBatch } from "../../../services/saveMedia";
import { appLog } from "../../../utils/logger";
import type { AlbumViewer } from "../../../types/shared-albums";

type AlbumContent = AlbumViewer["content"][number];

type AlbumViewerPanelProps = {
    viewer: AlbumViewer;
    viewerIndex: number;
    fullScreenIndex: number | null;
    selectedViewerItem: AlbumContent | null;
    closeViewer: () => void;
    openFullScreen: (index: number) => void;
    onMessageProfile: (profileId: number) => void;
    onViewProfile: (profileId: number) => void;
    hideProfileActions?: boolean;
};

export function AlbumViewerPanel({
    viewer,
    viewerIndex,
    fullScreenIndex,
    selectedViewerItem,
    closeViewer,
    openFullScreen,
    onMessageProfile,
    onViewProfile,
    hideProfileActions = false,
}: AlbumViewerPanelProps) {
    const { t } = useTranslation();
	const [isSavingAll, setIsSavingAll] = useState(false);

	const handleSaveAll = async () => {
		const items = viewer.content
			.map((item) => ({
				url: item.url || item.coverUrl,
				type: (item.contentType?.startsWith("video/") ? "video" : "image") as "image" | "video",
			}))
			.filter((item): item is { url: string; type: "image" | "video" } => !!item.url);

		if (items.length === 0) {
			toast.error(t("profile_details.save_all_empty"));
			return;
		}

		setIsSavingAll(true);
		const toastId = toast.loading(
			t("profile_details.save_all_progress", { done: 0, total: items.length }),
		);
		try {
			const result = await saveMediaBatch(items, (done, total) => {
				toast.loading(t("profile_details.save_all_progress", { done, total }), { id: toastId });
			});

			if (result.failed === 0) {
				toast.success(t("profile_details.save_all_success", { count: result.succeeded }), {
					id: toastId,
				});
			} else {
				toast.error(
					t("profile_details.save_all_partial", {
						succeeded: result.succeeded,
						total: result.total,
						failed: result.failed,
					}),
					{ id: toastId },
				);
			}
		} catch (error) {
			appLog.error("[AlbumViewerPanel] Save all failed", error);
			toast.error(t("profile_details.save_all_error"), { id: toastId });
		} finally {
			setIsSavingAll(false);
		}
	};

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-[20px] p-2 sm:p-6 md:p-12 transition-all duration-300 animate-in fade-in duration-300"
            onClick={closeViewer}
        >
            <div
                className="m-auto flex h-auto max-h-[95dvh] w-[95vw] max-w-5xl flex-col overflow-hidden bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-[40px] shadow-[0_30px_100px_rgba(0,0,0,0.8),_inset_0_1px_0_rgba(255,255,255,0.2)] rounded-3xl sm:rounded-[3rem] border border-white/20 dark:border-white/10 relative animate-in fade-in zoom-in-95 duration-300 ease-out"
                onClick={(event) => event.stopPropagation()}
            >

                {/* --- MODERN HEADER --- */}
                <div 
                    className="relative z-10 flex flex-col gap-3 border-b border-white/10 dark:border-white/5 bg-transparent px-4 pb-4 sm:px-6 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
                    style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1 ring-1 ring-white/10 backdrop-blur-md">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                    {t("shared_albums.album_label", { defaultValue: "Album" })}
                                </span>
                            </div>
                            <h2 className="truncate text-3xl font-black tracking-tight text-[var(--text)] drop-shadow-sm">
                                {viewer.albumName?.trim() || "Album"}
                            </h2>
                            <p className="mt-1.5 text-sm font-medium text-[var(--text-muted)]">
                                {t("shared_albums.items_count", { count: viewer.content.length, defaultValue: `${viewer.content.length} items` })}
                                {selectedViewerItem ? ` · ${viewerIndex + 1}/${viewer.content.length}` : ""}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {viewer.content.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void handleSaveAll()}
                                    disabled={isSavingAll}
                                    aria-label={t("profile_details.save_all")}
                                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-4 text-xs font-semibold text-[var(--text-muted)] ring-1 ring-white/10 transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] disabled:opacity-50"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    {t("profile_details.save_all")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={closeViewer}
                                className="group relative overflow-hidden rounded-full bg-[var(--surface-2)] p-3 text-[var(--text-muted)] ring-1 ring-white/10 transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] hover:scale-[1.02] active:scale-95"
                                aria-label={t("shared_albums.close_viewer")}
                            >
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/0 transition-colors group-hover:from-white/5 group-hover:to-transparent" />
                                <X className="relative z-10 h-6 w-6 transition-transform group-hover:rotate-90 group-hover:scale-110" />
                            </button>
                        </div>
                    </div>

                    {!hideProfileActions && (
                        <div className="mt-2 flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => onMessageProfile(viewer.profileId)}
                                className="flex-1 justify-center gap-2 rounded-xl py-5 sm:flex-none"
                            >
                                <MessageCircle className="h-4 w-4" />
                                <span className="font-semibold">{t("profile_details.message")}</span>
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => onViewProfile(viewer.profileId)}
                                className="flex-1 justify-center gap-2 rounded-xl py-5 sm:flex-none"
                            >
                                <UserRound className="h-4 w-4" />
                                <span className="font-semibold">{t("chat.view_profile")}</span>
                            </Button>
                        </div>
                    )}
                </div>

                {viewer.content.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-6">
                        <EmptyState
                            title={t("shared_albums.empty_album_title")}
                            description={t("shared_albums.empty_album_desc")}
                        />
                    </div>
                ) : (
                    /* --- PERFECTLY CROPPED APPLE-PHOTOS STYLE GRID --- */
                    <div className="relative flex-1 overflow-y-auto bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 sm:p-6">
                        <div 
                            className="content-start grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4 md:gap-5"
                            style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
                        >
                            {viewer.content.map((item, index) => {
                                const isVideo = item.contentType?.startsWith("video/");
                                const mediaUrl = isVideo
                                    ? (item.thumbUrl || item.coverUrl || item.url)
                                    : (item.thumbUrl || item.url || item.coverUrl);
                                const isActive = index === fullScreenIndex;

                                return (
                                    <button
                                        type="button"
                                        key={item.contentId}
                                        onClick={() => openFullScreen(index)}
                                        className={`group relative aspect-square w-full overflow-hidden rounded-2xl sm:rounded-[1.25rem] bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)] backdrop-blur-md border border-white/20 dark:border-white/10 transition-all duration-500 hover:z-10 hover:scale-[1.05] hover:border-white/50 hover:shadow-[0_15px_40px_-10px_rgba(0,0,0,0.6),_0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)] ${
                                            isActive
                                                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] scale-[0.95]"
                                                : "active:scale-[0.95]"
                                        }`}
                                    >
                                        {mediaUrl ? (
                                            <>
                                                <img
                                                    src={mediaUrl}
                                                    alt={t("shared_albums.content_alt", { index: index + 1 })}
                                                    loading="lazy"
                                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                                <div className="absolute inset-0 border border-white/10 dark:border-white/5 mix-blend-overlay pointer-events-none sm:rounded-2xl" />
                                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                                {isVideo && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all duration-300 group-hover:bg-black/40 group-hover:backdrop-blur-[4px]">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-110 group-hover:bg-[var(--accent)] group-hover:border-[var(--accent)] group-hover:shadow-[0_0_20px_var(--accent)]">
                                                            <Play className="h-4 w-4 fill-white" />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-2)]/50 backdrop-blur-sm border border-white/5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)] sm:rounded-2xl">
                                                {t("shared_albums.unavailable")}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}