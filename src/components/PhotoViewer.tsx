import { ChevronLeft, ChevronRight, X, ScanSearch, Search, ShieldAlert, Focus, ExternalLink } from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";

export type PhotoViewerMedia = {
    url: string;
    type: "image" | "video";
    alt?: string;
};

export type PhotoViewerProps = {
    isOpen: boolean;
    onClose: () => void;
    photos: (string | PhotoViewerMedia)[];
    initialIndex?: number;
    onIndexChange?: (index: number) => void;
    renderExtraInfo?: (index: number) => React.ReactNode;
};

export function PhotoViewer({
    isOpen,
    onClose,
    photos,
    initialIndex = 0,
    onIndexChange,
    renderExtraInfo,
}: PhotoViewerProps) {
    const { t } = useTranslation();
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
    const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
    const lastDistRef = useRef<number | null>(null);
    const swipeStartXRef = useRef<number | null>(null);

    // --- SCANNER HUB STATE ---
    const scannerEnabled = window.localStorage.getItem("fg-image-scanner-enabled") === "true";
    const [isScannerHubOpen, setIsScannerHubOpen] = useState(false);

    useEffect(() => {
        if (initialIndex !== currentIndex) {
            setCurrentIndex(initialIndex);
            setZoomScale(1);
            setZoomOffset({ x: 0, y: 0 });
            setIsScannerHubOpen(false);
        }
    }, [initialIndex]);

    const handleIndexChangeInternal = useCallback(
        (nextIndex: number) => {
            if (nextIndex === currentIndex) return;
            setCurrentIndex(nextIndex);
            setZoomScale(1);
            setZoomOffset({ x: 0, y: 0 });
            setIsScannerHubOpen(false);
            onIndexChange?.(nextIndex);
        },
        [currentIndex, onIndexChange],
    );

    const showPreviousPhoto = useCallback(() => {
        if (!photos.length) return;
        const nextIndex = (currentIndex - 1 + photos.length) % photos.length;
        handleIndexChangeInternal(nextIndex);
    }, [currentIndex, photos.length, handleIndexChangeInternal]);

    const showNextPhoto = useCallback(() => {
        if (!photos.length) return;
        const nextIndex = (currentIndex + 1) % photos.length;
        handleIndexChangeInternal(nextIndex);
    }, [currentIndex, photos.length, handleIndexChangeInternal]);

    const handlePhotoTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            swipeStartXRef.current = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            lastDistRef.current = dist;
        }
    };

    const handlePhotoTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1 && zoomScale > 1 && lastTouchRef.current) {
            const dx = e.touches[0].clientX - lastTouchRef.current.x;
            const dy = e.touches[0].clientY - lastTouchRef.current.y;
            setZoomOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2 && lastDistRef.current) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            const delta = dist / lastDistRef.current;
            setZoomScale((prev) => Math.min(Math.max(1, prev * delta), 4));
            lastDistRef.current = dist;
        }
    };

    const handlePhotoTouchEnd = (e: React.TouchEvent) => {
        if (zoomScale === 1 && swipeStartXRef.current !== null) {
            const endX = e.changedTouches[0].clientX;
            const deltaX = endX - swipeStartXRef.current;
            if (Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    showPreviousPhoto();
                } else {
                    showNextPhoto();
                }
            }
        }

        lastTouchRef.current = null;
        lastDistRef.current = null;
        swipeStartXRef.current = null;

        if (zoomScale <= 1.05) {
            setZoomScale(1);
            setZoomOffset({ x: 0, y: 0 });
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                if (isScannerHubOpen) {
                    setIsScannerHubOpen(false);
                } else {
                    onClose();
                }
                return;
            }
            if (event.key === "ArrowLeft") {
                showPreviousPhoto();
                return;
            }
            if (event.key === "ArrowRight") {
                showNextPhoto();
            }
        };

        window.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [isOpen, onClose, showPreviousPhoto, showNextPhoto, isScannerHubOpen]);

    if (!isOpen || photos.length === 0) return null;

    const safeIndex = Math.min(Math.max(0, currentIndex), photos.length - 1);
    const currentMedia = photos[safeIndex];
    if (!currentMedia) return null;

    const isString = typeof currentMedia === "string";
    const url = isString ? currentMedia : currentMedia.url;
    const type = isString ? "image" : currentMedia.type;
    const alt = isString ? "" : currentMedia.alt;

    // --- SCANNER HUB ACTIONS ---
    const openExternalTool = async (targetUrl: string) => {
        try {
            await openUrl(targetUrl);
        } catch (error) {
            window.open(targetUrl, "_blank");
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6"
            onClick={onClose}
        >
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
                className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5 transition hover:bg-black/70"
            >
                <X className="h-5 w-5" />
            </button>

            {type === "image" && scannerEnabled && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsScannerHubOpen(true);
                    }}
                    className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 px-4 items-center justify-center gap-2 rounded-full border border-blue-500/50 bg-blue-500/20 text-white backdrop-blur-md sm:left-5 sm:top-5 transition hover:bg-blue-500/40"
                >
                    <ScanSearch className="h-4 w-4" />
                    <span className="text-sm font-semibold tracking-wide">Scanner Hub</span>
                </button>
            )}

            <div
                className="relative z-[82] flex max-h-full w-full max-w-5xl flex-col items-center justify-center gap-3"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={handlePhotoTouchStart}
                onTouchMove={handlePhotoTouchMove}
                onTouchEnd={handlePhotoTouchEnd}
            >
                {photos.length > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                showPreviousPhoto();
                            }}
                            className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11 transition hover:bg-black/70"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                showNextPhoto();
                            }}
                            className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11 transition hover:bg-black/70"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </>
                )}

                <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                    <div className="relative overflow-hidden rounded-xl">
                        {type === "video" ? (
                            <video
                                src={url}
                                controls
                                autoPlay
                                className="max-h-[82vh] w-auto max-w-full object-contain transition-transform duration-200 ease-out will-change-transform"
                                style={{
                                    transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
                                    transition: lastDistRef.current || lastTouchRef.current ? "none" : undefined,
                                    touchAction: "none",
                                }}
                            />
                        ) : (
                            <img
                                src={url}
                                alt={alt}
                                className="max-h-[82vh] w-auto max-w-full object-contain transition-transform duration-200 ease-out will-change-transform"
                                style={{
                                    transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
                                    transition: lastDistRef.current || lastTouchRef.current ? "none" : undefined,
                                    touchAction: "none",
                                }}
                            />
                        )}
                        
                        {/* THE OTHER DEV'S MERGED FEATURE: Floating Metadata */}
                        {renderExtraInfo && (
                            <div className="absolute bottom-3 left-3 flex items-center gap-2 z-[85]">
                                {renderExtraInfo(safeIndex)}
                            </div>
                        )}
                    </div>

                    {/* --- SCANNER HUB OVERLAY --- */}
                    {isScannerHubOpen && (
                        <div 
                            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 rounded-xl transition-all" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsScannerHubOpen(false);
                            }}
                        >
                            <div 
                                className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="p-5 border-b border-[#333] bg-[#222]">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <ShieldAlert className="h-5 w-5 text-blue-400" />
                                        Scanner Hub
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Select a tool below to reverse search this image. It will open securely in your default browser.
                                    </p>
                                </div>
								
                                <div className="p-4 flex flex-col gap-3">
									
                                    {/* Google Lens */}
                                    <button 
                                        onClick={() => openExternalTool(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`)}
                                        className="w-full flex items-center justify-between bg-[#2a2a2a] border border-[#444] p-3 rounded-xl transition hover:bg-[#333] hover:border-blue-500/50"
                                    >
                                        <div className="flex items-center gap-3 text-left">
                                            <div className="bg-blue-500/20 p-2 rounded-lg">
                                                <Search className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">Google Lens</p>
                                                <p className="text-[10px] text-gray-400">Reverse search & expose SynthID watermarks</p>
                                            </div>
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-gray-500" />
                                    </button>

                                    {/* TinEye */}
                                    <button 
                                        onClick={() => openExternalTool(`https://tineye.com/search?url=${encodeURIComponent(url)}`)}
                                        className="w-full flex items-center justify-between bg-[#2a2a2a] border border-[#444] p-3 rounded-xl transition hover:bg-[#333] hover:border-emerald-500/50"
                                    >
                                        <div className="flex items-center gap-3 text-left">
                                            <div className="bg-emerald-500/20 p-2 rounded-lg">
                                                <Focus className="h-5 w-5 text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">TinEye</p>
                                                <p className="text-[10px] text-gray-400">Best for catching stolen dating/social photos</p>
                                            </div>
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-gray-500" />
                                    </button>

                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {photos.length > 1 && (
                    <p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                        {safeIndex + 1} / {photos.length}
                    </p>
                )}
            </div>
        </div>
    );
}