import { MessageCircle, UserRound, X } from "lucide-react";
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
                <div className="z-10 flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                                <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                    {t("shared_albums.album_label", { defaultValue: "Album" })}
                                </span>
                                <span className="text-xs font-semibold text-[var(--text-muted)]">
                                    {viewer.content.length} {t("shared_albums.items_count", { count: viewer.content.length, defaultValue: "Items" })}
                                </span>
                            </div>
                            <h2 className="truncate text-xl font-bold tracking-tight">
                                {viewer.albumName?.trim() || `Album #${viewer.albumId}`}
                            </h2>
                            <p className="truncate text-sm font-medium text-[var(--text-muted)]">
                                {t("shared_albums.by_user", { defaultValue: "by" })} {viewer.profileName}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeViewer}
                            className="rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--border)] hover:text-[var(--text)]"
                            aria-label={t("shared_albums.close_viewer")}
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
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
                        <div className="content-start grid grid-cols-3 gap-0.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
                            {viewer.content.map((item, index) => {
                                const mediaUrl = item.thumbUrl || item.url || item.coverUrl;
                                const isActive = index === fullScreenIndex;

                                return (
                                    <button
                                        key={item.contentId}
                                        type="button"
                                        onClick={() => openFullScreen(index)}
                                        className="group relative aspect-square w-full overflow-hidden bg-zinc-900 sm:rounded-xl"
                                    >
                                        {mediaUrl ? (
                                            item.contentType?.startsWith("video/") ? (
                                                <video 
                                                    src={mediaUrl} 
                                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                                    muted 
                                                />
                                            ) : (
                                                <img
                                                    src={mediaUrl}
                                                    alt={t("shared_albums.content_alt", { index: index + 1 })}
                                                    loading="lazy"
                                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                />
                                            )
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[10px] text-zinc-500">
                                                {t("shared_albums.unavailable")}
                                            </div>
                                        )}
										
                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />

                                        {isActive ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
                                                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-md">
                                                    {t("shared_albums.open_action", { defaultValue: "Viewing" })}
                                                </span>
                                            </div>
                                        ) : null}
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