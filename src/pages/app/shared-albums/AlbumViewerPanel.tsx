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
            className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm sm:p-6 md:p-12"
            onClick={closeViewer}
        >
            <div
                className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[var(--surface)] shadow-2xl sm:h-full sm:rounded-2xl sm:border sm:border-[var(--border)]"
                onClick={(event) => event.stopPropagation()}
            >
                {/* --- MODERN HEADER --- */}
                <div 
                    className="z-10 flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-4 sm:px-6"
                    style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
                                <Images className="h-3 w-3 text-[var(--accent)]" />
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                    {t("shared_albums.album_label", { defaultValue: "Album" })}
                                </span>
                            </div>
                            <h2 className="truncate text-xl font-bold tracking-tight text-[var(--text)]">
                                {viewer.albumName?.trim() || `Album #${viewer.albumId}`}
                            </h2>

                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
                                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{viewer.profileName}</span>
                                </span>
                                <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--border)]" />
                                <span className="text-sm text-[var(--text-muted)]">
                                    {t("shared_albums.items_count", { count: viewer.content.length })}
                                    {selectedViewerItem ? ` · ${viewerIndex + 1}/${viewer.content.length}` : ""}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeViewer}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:bg-[var(--border)] hover:text-[var(--text)]"
                            aria-label={t("shared_albums.close_viewer")}
                        >
                            <X className="h-4 w-4" />
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
                    <div className="flex-1 overflow-y-auto bg-black sm:bg-[var(--surface-2)] sm:p-4">
                        <div 
                            className="content-start grid grid-cols-3 gap-0.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5"
                            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
                        >
                            {viewer.content.map((item, index) => {
                                const isVideo = item.contentType?.startsWith("video/");
                                const mediaUrl = isVideo
                                    ? (item.thumbUrl || item.coverUrl || item.url)
                                    : (item.thumbUrl || item.url || item.coverUrl);
                                const isActive = index === fullScreenIndex;

                                return (
                                    <button
                                        key={item.contentId}
                                        type="button"
                                        onClick={() => openFullScreen(index)}
                                        className={`group relative aspect-square w-full overflow-hidden bg-zinc-900 transition-all duration-150 sm:rounded-xl ${
                                            isActive
                                                ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)] scale-[0.97]"
                                                : "hover:scale-[1.02] hover:shadow-lg active:scale-[0.97]"
                                        }`}
                                    >
                                        {mediaUrl ? (
                                            <>
                                                <img
                                                    src={mediaUrl}
                                                    alt={t("shared_albums.content_alt", { index: index + 1 })}
                                                    loading="lazy"
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                />
                                                {isVideo && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                                                            <Play className="h-4 w-4 fill-white text-white" />
                                                        </div>
                                                    </div>
                                                )}
                                                {!isVideo && (
                                                    <div className={`absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/10 ${isActive ? "bg-black/20" : ""}`} />
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[10px] text-zinc-500">
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