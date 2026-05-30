import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AlbumViewer } from "../../../types/shared-albums";

type AlbumContent = AlbumViewer["content"][number];

type AlbumFullscreenOverlayProps = {
    viewer: AlbumViewer;
    fullScreenIndex: number | null;
    fullScreenItem: AlbumContent;
    canViewPrevious: boolean;
    canViewNext: boolean;
    closeFullScreen: () => void;
    showPreviousFullScreenItem: () => void;
    showNextFullScreenItem: () => void;
    onViewerTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
    onViewerTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
};

export function AlbumFullscreenOverlay({
    viewer,
    fullScreenIndex,
    fullScreenItem,
    canViewPrevious,
    canViewNext,
    closeFullScreen,
    showPreviousFullScreenItem,
    showNextFullScreenItem,
    onViewerTouchStart,
    onViewerTouchEnd,
}: AlbumFullscreenOverlayProps) {
    const { t } = useTranslation();

    const mediaUrl =
        fullScreenItem.url ||
        fullScreenItem.thumbUrl ||
        fullScreenItem.coverUrl;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-md" onClick={closeFullScreen}>
            
            {/* --- CINEMATIC HEADER --- */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
                <div className="rounded-full bg-black/40 px-4 py-1.5 text-xs font-bold tracking-widest text-white/80 backdrop-blur-md">
                    {(fullScreenIndex ?? 0) + 1} / {viewer.content.length}
                </div>
                <button
                    type="button"
                    onClick={closeFullScreen}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25 hover:scale-105"
                    aria-label={t("shared_albums.close_fullscreen")}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* --- MEDIA CONTAINER --- */}
            <div
                className="relative flex flex-1 items-center justify-center overflow-hidden"
                onTouchStart={onViewerTouchStart}
                onTouchEnd={onViewerTouchEnd}
            >
                {(() => {
                    if (!mediaUrl) {
                        return (
                            <div className="rounded-2xl bg-white/10 px-8 py-6 text-center text-sm font-medium text-white backdrop-blur-md">
                                {t("shared_albums.media_unavailable")}
                            </div>
                        );
                    }

                    if (fullScreenItem.contentType?.startsWith("video/")) {
                        return (
                            <video
                                src={mediaUrl}
                                controls
                                autoPlay
                                onClick={(event) => event.stopPropagation()}
                                className="h-full w-full max-h-full max-w-full object-contain drop-shadow-2xl"
                            />
                        );
                    }

                    return (
                        <img
                            src={mediaUrl}
                            alt={t("shared_albums.content_alt", { index: (fullScreenIndex ?? 0) + 1 })}
                            onClick={(event) => event.stopPropagation()}
                            className="h-full w-full max-h-full max-w-full object-contain drop-shadow-2xl select-none"
                            draggable={false}
                        />
                    );
                })()}

                {/* --- DESKTOP GLASSMORPHISM ARROWS --- */}
                {viewer.content.length > 1 ? (
                    <>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                showPreviousFullScreenItem();
                            }}
                            disabled={!canViewPrevious}
                            aria-label={t("shared_albums.previous")}
                            className="absolute left-6 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition disabled:opacity-0 sm:flex hover:bg-white/20 hover:scale-110"
                        >
                            <ChevronLeft className="h-8 w-8" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                showNextFullScreenItem();
                            }}
                            disabled={!canViewNext}
                            aria-label={t("shared_albums.next")}
                            className="absolute right-6 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition disabled:opacity-0 sm:flex hover:bg-white/20 hover:scale-110"
                        >
                            <ChevronRight className="h-8 w-8" />
                        </button>
                    </>
                ) : null}
            </div>

            {/* --- MOBILE NAVIGATION BAR --- */}
            {viewer.content.length > 1 ? (
                <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-6 sm:hidden" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={showPreviousFullScreenItem}
                        disabled={!canViewPrevious}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl bg-white/10 font-semibold text-white backdrop-blur-md disabled:opacity-30 active:bg-white/20 mr-2"
                    >
                        <ChevronLeft className="mr-1 h-5 w-5" />
                        {t("shared_albums.previous", { defaultValue: "Prev" })}
                    </button>
                    <button
                        type="button"
                        onClick={showNextFullScreenItem}
                        disabled={!canViewNext}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl bg-white/10 font-semibold text-white backdrop-blur-md disabled:opacity-30 active:bg-white/20 ml-2"
                    >
                        {t("shared_albums.next", { defaultValue: "Next" })}
                        <ChevronRight className="ml-1 h-5 w-5" />
                    </button>
                </div>
            ) : null}
        </div>
    );
}