import { ChevronLeft, ChevronRight, X, ScanSearch, Search, ShieldAlert, Focus, ExternalLink } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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

function getMediaInfo(photo: string | PhotoViewerMedia) {
    if (typeof photo === "string") return { url: photo, type: "image" as const, alt: "" };
    return { url: photo.url, type: photo.type, alt: photo.alt ?? "" };
}

export function PhotoViewer({
    isOpen,
    onClose,
    photos,
    initialIndex = 0,
    onIndexChange,
    renderExtraInfo,
}: PhotoViewerProps) {
    const { t } = useTranslation();
    const N = photos.length;

    const [centerIdx, setCenterIdx] = useState(initialIndex);
    const [trackPos, setTrackPos] = useState(1);
    const [noTransition, setNoTransition] = useState(true);
    const [dragOffset, setDragOffset] = useState(0);
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });

    // --- SCANNER HUB STATE ---
    const scannerEnabled = window.localStorage.getItem("fg-image-scanner-enabled") === "true";
    const [isScannerHubOpen, setIsScannerHubOpen] = useState(false);

    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
    const lastDistRef = useRef<number | null>(null);
    const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
    const decidedAxisRef = useRef<"h" | "v" | null>(null);
    const isDraggingRef = useRef(false);
    const gestureMovedRef = useRef(false);
    const onIndexChangeRef = useRef(onIndexChange);
    onIndexChangeRef.current = onIndexChange;

    const zoomScaleRef = useRef(zoomScale);
    const zoomOffsetRef = useRef(zoomOffset);
    useEffect(() => { zoomScaleRef.current = zoomScale; }, [zoomScale]);
    useEffect(() => { zoomOffsetRef.current = zoomOffset; }, [zoomOffset]);

    const prevIdx = N > 1 ? (centerIdx - 1 + N) % N : centerIdx;
    const nextIdx = N > 1 ? (centerIdx + 1) % N : centerIdx;

    useLayoutEffect(() => {
        if (!isOpen) return;
        setCenterIdx(initialIndex);
        setTrackPos(1);
        setNoTransition(true);
        setDragOffset(0);
        setZoomScale(1);
        setZoomOffset({ x: 0, y: 0 });
        setIsScannerHubOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const id = requestAnimationFrame(() =>
            requestAnimationFrame(() => setNoTransition(false)),
        );
        return () => cancelAnimationFrame(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        onIndexChangeRef.current?.(centerIdx);
    }, [centerIdx]);

    const teleportToCenter = useCallback((newCenter: number) => {
        setCenterIdx(newCenter);
        setNoTransition(true);
        setTrackPos(1);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => setNoTransition(false)),
        );
    }, []);

    const handleTransitionEnd = useCallback(() => {
        if (trackPos === 2) teleportToCenter((centerIdx + 1) % N);
        else if (trackPos === 0) teleportToCenter((centerIdx - 1 + N) % N);
    }, [trackPos, centerIdx, N, teleportToCenter]);

    const showNext = useCallback(() => {
        if (N < 2) return;
        setTrackPos(2);
        setDragOffset(0);
        setZoomScale(1);
        setZoomOffset({ x: 0, y: 0 });
        setIsScannerHubOpen(false);
    }, [N]);

    const showPrev = useCallback(() => {
        if (N < 2) return;
        setTrackPos(0);
        setDragOffset(0);
        setZoomScale(1);
        setZoomOffset({ x: 0, y: 0 });
        setIsScannerHubOpen(false);
    }, [N]);

    const clampOffset = useCallback((offset: { x: number; y: number }, scale: number) => {
        const el = mediaRef.current;
        const renderedW = el ? el.clientWidth : window.innerWidth;
        const renderedH = el ? el.clientHeight : window.innerHeight;
        const maxX = (renderedW * (scale - 1)) / 2;
        const maxY = (renderedH * (scale - 1)) / 2;
        return {
            x: Math.min(maxX, Math.max(-maxX, offset.x)),
            y: Math.min(maxY, Math.max(-maxY, offset.y)),
        };
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        gestureMovedRef.current = false;
        if (e.touches.length === 1) {
            const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            touchStartRef.current = pt;
            lastTouchRef.current = pt;
            decidedAxisRef.current = null;
            isDraggingRef.current = false;
            lastDistRef.current = null;
            pinchCenterRef.current = null;
        } else if (e.touches.length === 2) {
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            lastDistRef.current = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            pinchCenterRef.current = { x: midX, y: midY };
            decidedAxisRef.current = null;
            isDraggingRef.current = false;
            setDragOffset(0);
        }
    }, []);

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            // ── 2-finger pinch ──────────────────────────────────────────────────
            if (e.touches.length === 2 && lastDistRef.current !== null) {
                gestureMovedRef.current = true;
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
                const ratio = lastDistRef.current > 0 ? dist / lastDistRef.current : 1;
                lastDistRef.current = dist;

                setZoomScale((prev) => {
                    const next = Math.min(Math.max(1, prev * ratio), 4);
                    if (pinchCenterRef.current && next !== prev) {
                        const cx = pinchCenterRef.current.x - window.innerWidth / 2;
                        const cy = pinchCenterRef.current.y - window.innerHeight / 2;
                        setZoomOffset((prevOffset) =>
                            clampOffset(
                                {
                                    x: prevOffset.x - cx * (ratio - 1),
                                    y: prevOffset.y - cy * (ratio - 1),
                                },
                                next,
                            ),
                        );
                    }
                    return next;
                });
                return;
            }

            // ── 1-finger pan ─────────────────────────────────────────────────
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];

            if (!touchStartRef.current) {
                const pt = { x: touch.clientX, y: touch.clientY };
                touchStartRef.current = pt;
                lastTouchRef.current = pt;
                decidedAxisRef.current = null;
                isDraggingRef.current = false;
                return;
            }

            const dx = touch.clientX - touchStartRef.current.x;
            const dy = touch.clientY - touchStartRef.current.y;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                gestureMovedRef.current = true;
            }

            // When zoomed: always pan in both axes, ignore axis lock entirely
            if (zoomScaleRef.current > 1) {
                const last = lastTouchRef.current ?? { x: touch.clientX, y: touch.clientY };
                const moveDx = touch.clientX - last.x;
                const moveDy = touch.clientY - last.y;
                lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
                setZoomOffset((prev) =>
                    clampOffset(
                        { x: prev.x + moveDx, y: prev.y + moveDy },
                        zoomScaleRef.current,
                    ),
                );
                return;
            }

            // Not zoomed: lock axis, swipe left/right to navigate (only when multiple photos)
            if (N < 2) return;
            if (!decidedAxisRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
                decidedAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
            }

            if (decidedAxisRef.current === "h") {
                isDraggingRef.current = true;
                setDragOffset(dx);
            }

            lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
        },
        [clampOffset, N],
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1) {
                const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                touchStartRef.current = pt;
                lastTouchRef.current = pt;
                decidedAxisRef.current = null;
                isDraggingRef.current = false;
                lastDistRef.current = null;
                pinchCenterRef.current = null;
                return;
            }

            if (N >= 2 && decidedAxisRef.current === "h" && zoomScaleRef.current === 1 && isDraggingRef.current) {
                const threshold = Math.min(70, window.innerWidth * 0.22);
                if (dragOffset < -threshold) showNext();
                else if (dragOffset > threshold) showPrev();
                else setDragOffset(0);
            } else {
                setDragOffset(0);
            }

            touchStartRef.current = null;
            lastTouchRef.current = null;
            lastDistRef.current = null;
            pinchCenterRef.current = null;
            decidedAxisRef.current = null;
            isDraggingRef.current = false;

            if (zoomScaleRef.current <= 1.05) {
                setZoomScale(1);
                setZoomOffset({ x: 0, y: 0 });
            }
        },
        [dragOffset, showNext, showPrev, N],
    );

    const handleButtonTouchEnd = useCallback(
        (e: React.TouchEvent, action: () => void) => {
            e.stopPropagation();
            e.preventDefault(); // prevent ghost click after touch
            if (!gestureMovedRef.current) {
                action();
            }
        },
        [],
    );

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { 
                e.stopPropagation(); 
                if (isScannerHubOpen) {
                    setIsScannerHubOpen(false);
                } else {
                    onClose(); 
                }
                return; 
            }
            if (e.key === "ArrowLeft") showPrev();
            if (e.key === "ArrowRight") showNext();
        };
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true });
    }, [isOpen, onClose, showPrev, showNext, isScannerHubOpen]);

    // --- SCANNER HUB ACTIONS ---
    const openExternalTool = async (targetUrl: string) => {
        try {
            await openUrl(targetUrl);
        } catch (error) {
            window.open(targetUrl, "_blank");
        }
    };

    if (!isOpen || N === 0) return null;

    const slots: Array<{ photoIndex: number; slotIndex: number }> =
        N <= 1
            ? [{ photoIndex: centerIdx, slotIndex: 0 }]
            : [
                    { photoIndex: prevIdx, slotIndex: 0 },
                    { photoIndex: centerIdx, slotIndex: 1 },
                    { photoIndex: nextIdx, slotIndex: 2 },
                ];

    const activeSlot = N <= 1 ? 0 : trackPos;
    const canAnimate = dragOffset === 0 && !noTransition;
	
    const currentPhoto = photos[centerIdx];
    const currentMediaInfo = currentPhoto ? getMediaInfo(currentPhoto) : null;

    return createPortal(
        <div className="fixed inset-0 z-[80] bg-black" onClick={onClose}>
			
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
                onTouchEnd={(e) => handleButtonTouchEnd(e, onClose)}
                className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5 transition hover:bg-black/70"
                aria-label={t("profile_details.close_photo_viewer")}
            >
                <X className="h-5 w-5" />
            </button>

            {currentMediaInfo?.type === "image" && scannerEnabled && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsScannerHubOpen(true);
                    }}
                    onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
                    onTouchEnd={(e) => handleButtonTouchEnd(e, () => setIsScannerHubOpen(true))}
                    className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 px-4 items-center justify-center gap-2 rounded-full border border-blue-500/50 bg-blue-500/20 text-white backdrop-blur-md sm:left-5 sm:top-5 transition hover:bg-blue-500/40"
                >
                    <ScanSearch className="h-4 w-4" />
                    <span className="text-sm font-semibold tracking-wide">Scanner Hub</span>
                </button>
            )}

            {N > 1 && (
                <>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); showPrev(); }}
                        onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
                        onTouchEnd={(e) => handleButtonTouchEnd(e, showPrev)}
                        className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11 transition hover:bg-black/70"
                        aria-label={t("profile_details.previous_photo")}
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); showNext(); }}
                        onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
                        onTouchEnd={(e) => handleButtonTouchEnd(e, showNext)}
                        className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11 transition hover:bg-black/70"
                        aria-label={t("profile_details.next_photo")}
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </>
            )}

            {N > 1 && (
                <p className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] left-1/2 z-[83] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                    {centerIdx + 1} / {N}
                </p>
            )}

            <div
                className="h-full w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div
                    className="flex h-full"
                    style={{
                        transform: `translateX(calc(${-activeSlot} * 100vw + ${dragOffset}px))`,
                        transition: canAnimate
                            ? "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"
                            : "none",
                        willChange: "transform",
                    }}
                    onTransitionEnd={handleTransitionEnd}
                >
                    {slots.map(({ photoIndex, slotIndex }) => {
                        const photo = photos[photoIndex];
                        if (!photo) return null;
                        const { url, type, alt } = getMediaInfo(photo);
                        const isCurrent = slotIndex === activeSlot;

                        const zoomStyle =
                            isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0)
                                ? {
                                        transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
                                        touchAction: "none" as const,
                                    }
                                : { touchAction: "none" as const };

                        return (
                            <div
                                key={slotIndex}
                                className="flex h-full w-screen flex-shrink-0 items-center justify-center p-3 sm:p-8"
                                onClick={onClose}
                            >
                                <div
                                    className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {type === "video" ? (
                                        <video
                                            ref={isCurrent ? (mediaRef as React.RefObject<HTMLVideoElement>) : undefined}
                                            src={url}
                                            controls
                                            autoPlay={isCurrent}
                                            className="max-h-[88vh] w-auto max-w-full object-contain"
                                            style={zoomStyle}
                                        />
                                    ) : (
                                        <img
                                            ref={isCurrent ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
                                            src={url}
                                            alt={alt}
                                            loading="eager"
                                            draggable={false}
                                            className="max-h-[88vh] w-auto max-w-full select-none object-contain"
                                            style={zoomStyle}
                                        />
                                    )}
                                    {isCurrent && renderExtraInfo && (
                                        <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                            {renderExtraInfo(centerIdx)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- SCANNER HUB OVERLAY --- */}
            {isScannerHubOpen && currentMediaInfo && (
                <div 
                    className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 rounded-xl transition-all" 
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsScannerHubOpen(false);
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
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
                                onClick={() => openExternalTool(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(currentMediaInfo.url)}`)}
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
                                onClick={() => openExternalTool(`https://tineye.com/search?url=${encodeURIComponent(currentMediaInfo.url)}`)}
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
        </div>,
        document.body,
    );
}