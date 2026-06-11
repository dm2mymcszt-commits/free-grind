import { Images, MessageCircle, Play, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/states";
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

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-[20px] sm:p-6 md:p-12 transition-all duration-300"
            onClick={closeViewer}
        >
            <div
                className="relative mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] backdrop-blur-[30px] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] sm:h-full sm:rounded-[2.5rem] border border-white/10 dark:border-white/5"
                onClick={(event) => event.stopPropagation()}
            >

                {/* --- MODERN HEADER --- */}
                <div 
                    className="relative z-10 flex flex-col gap-3 border-b border-white/10 dark:border-white/5 bg-transparent px-4 pb-4 sm:px-6 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
                    style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-purple-600 shadow-[0_0_20px_var(--accent)]/30 overflow-hidden p-[1px]">
                                <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[var(--surface)]/80 backdrop-blur-md">
                                    <span className="text-lg font-black text-white drop-shadow-md">
                                        {viewer.content.length}
                                    </span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-xl font-bold tracking-tight text-[var(--text)] drop-shadow-sm">
                                    {viewer.albumName?.trim() || `Album #${viewer.albumId}`}
                                </h2>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                        <UserRound className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{viewer.profileName}</span>
                                    </span>
                                    <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
                                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                        {t("shared_albums.items_count", { count: viewer.content.length })}
                                        {selectedViewerItem ? ` · ${viewerIndex + 1}/${viewer.content.length}` : ""}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeViewer}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--text-muted)] shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:text-[var(--text)] active:scale-95"
                            aria-label={t("shared_albums.close_viewer")}
                        >
                            <X className="h-5 w-5" />
                        </button>
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
                    <div className="relative flex-1 overflow-y-auto bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-6">
                        <div 
                            className="content-start grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5"
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
                                        className={`group relative aspect-square w-full overflow-hidden bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] ring-1 ring-white/10 transition-all duration-500 hover:z-10 hover:scale-[1.03] hover:ring-[var(--accent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:rounded-2xl ${
                                            isActive
                                                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] scale-[0.95]"
                                                : "hover:scale-[1.03] hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] active:scale-[0.95]"
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