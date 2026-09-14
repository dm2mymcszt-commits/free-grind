import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, ScanSearch, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { saveMediaToDevice } from "../services/saveMedia";
import { openExternal, reverseSearchImage, type ReverseSearchLinks } from "../services/reverseImageSearch";
import { appLog } from "../utils/logger";

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
	/** Full-width bar anchored to the bottom (e.g. a reply/react bar) — pushes the page-count pill and renderExtraInfo up out of its way when present. */
	renderFooter?: (index: number) => React.ReactNode;
	/** Chat conversation this media belongs to, if any — saved media is filed under a matching device subfolder instead of a flat Downloads folder. */
	conversationId?: string | null;
};

function getMediaInfo(photo?: string | PhotoViewerMedia | null) {
	if (!photo) return { url: "", type: "image" as const, alt: "" };
	if (typeof photo === "string") return { url: photo, type: "image" as const, alt: "" };
	return { url: photo.url || "", type: photo.type || "image", alt: photo.alt ?? "" };
}

const GLASS_BUTTON =
	"inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 backdrop-blur-xl transition hover:bg-white/20 active:scale-95 disabled:opacity-50";

/**
 * A viewer control. Touches are handled on touchend so a swipe that starts on
 * a button does not also press it, and the synthetic click that follows a
 * touch is swallowed.
 */
function ViewerButton({
	label,
	onPress,
	disabled,
	className = "",
	children,
	gestureMovedRef,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	className?: string;
	children: React.ReactNode;
	gestureMovedRef: React.MutableRefObject<boolean>;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				onPress();
			}}
			onTouchStart={(event) => {
				event.stopPropagation();
				gestureMovedRef.current = false;
			}}
			onTouchEnd={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (!gestureMovedRef.current && !disabled) onPress();
			}}
			className={`${GLASS_BUTTON} ${className}`}
		>
			{children}
		</button>
	);
}

export function PhotoViewer({
	isOpen,
	onClose,
	photos,
	initialIndex = 0,
	onIndexChange,
	renderExtraInfo,
	renderFooter,
	conversationId,
}: PhotoViewerProps) {
	const { t } = useTranslation();
	const N = photos.length;

	const [centerIdx, setCenterIdx] = useState(initialIndex);
	const [trackPos, setTrackPos] = useState(1);
	const [noTransition, setNoTransition] = useState(true);
	const [dragOffset, setDragOffset] = useState(0);
	const [zoomScale, setZoomScale] = useState(1);
	const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
	const [isSaving, setIsSaving] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	// The links the last search opened, offered again in case a browser only took one.
	const [searchLinks, setSearchLinks] = useState<ReverseSearchLinks | null>(null);
	const [isPointerDragging, setIsPointerDragging] = useState(false);

	const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const lastDistRef = useRef<number | null>(null);
	const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
	const decidedAxisRef = useRef<"h" | "v" | null>(null);
	const isDraggingRef = useRef(false);
	const gestureMovedRef = useRef(false);
	const pointerDragRef = useRef<{ isDragging: boolean; startX: number; startY: number; initialOffsetX: number; initialOffsetY: number }>({
		isDragging: false,
		startX: 0,
		startY: 0,
		initialOffsetX: 0,
		initialOffsetY: 0,
	});
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const id = requestAnimationFrame(() =>
			requestAnimationFrame(() => setNoTransition(false)),
		);
		return () => cancelAnimationFrame(id);
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
	}, [N]);

	const showPrev = useCallback(() => {
		if (N < 2) return;
		setTrackPos(0);
		setDragOffset(0);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
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

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			e.stopPropagation();
			const delta = -e.deltaY;
			const factor = delta > 0 ? 1.15 : 0.85;

			setZoomScale((prevScale) => {
				const nextScale = Math.min(Math.max(1, prevScale * factor), 5);
				if (nextScale === 1) {
					setZoomOffset({ x: 0, y: 0 });
				} else if (nextScale !== prevScale) {
					const rect = mediaRef.current?.getBoundingClientRect();
					if (rect) {
						const mouseX = e.clientX - (rect.left + rect.width / 2);
						const mouseY = e.clientY - (rect.top + rect.height / 2);
						const ratio = nextScale / prevScale - 1;
						setZoomOffset((prevOffset) =>
							clampOffset(
								{
									x: prevOffset.x - mouseX * ratio,
									y: prevOffset.y - mouseY * ratio,
								},
								nextScale,
							),
						);
					}
				}
				return nextScale;
			});
		},
		[clampOffset],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setZoomScale((prev) => {
				if (prev > 1.2) {
					setZoomOffset({ x: 0, y: 0 });
					return 1;
				}
				const rect = mediaRef.current?.getBoundingClientRect();
				if (rect) {
					const mouseX = e.clientX - (rect.left + rect.width / 2);
					const mouseY = e.clientY - (rect.top + rect.height / 2);
					setZoomOffset(clampOffset({ x: -mouseX * 1.5, y: -mouseY * 1.5 }, 2.5));
				}
				return 2.5;
			});
		},
		[clampOffset],
	);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		if (zoomScaleRef.current > 1 && e.button === 0) {
			e.stopPropagation();
			pointerDragRef.current = {
				isDragging: true,
				startX: e.clientX,
				startY: e.clientY,
				initialOffsetX: zoomOffsetRef.current.x,
				initialOffsetY: zoomOffsetRef.current.y,
			};
			setIsPointerDragging(true);
			try {
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			} catch {}
		}
	}, []);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (pointerDragRef.current.isDragging && zoomScaleRef.current > 1) {
				e.stopPropagation();
				const dx = e.clientX - pointerDragRef.current.startX;
				const dy = e.clientY - pointerDragRef.current.startY;
				setZoomOffset(
					clampOffset(
						{
							x: pointerDragRef.current.initialOffsetX + dx,
							y: pointerDragRef.current.initialOffsetY + dy,
						},
						zoomScaleRef.current,
					),
				);
			}
		},
		[clampOffset],
	);

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		if (pointerDragRef.current.isDragging) {
			e.stopPropagation();
			pointerDragRef.current.isDragging = false;
			setIsPointerDragging(false);
			try {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
			} catch {}
		}
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

	useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
			if (e.key === "ArrowLeft") showPrev();
			if (e.key === "ArrowRight") showNext();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [isOpen, onClose, showPrev, showNext]);

	const handleSave = async () => {
		const photo = photos[centerIdx];
		if (!photo || isSaving) return;
		const { url, type } = getMediaInfo(photo);

		setIsSaving(true);
		try {
			const saved = await saveMediaToDevice(url, type, conversationId);
			if (saved) {
				toast.success(t("profile_details.save_to_gallery_success"));
			} else {
				toast.error(t("profile_details.save_to_gallery_unsupported"));
			}
		} catch (e) {
			appLog.error("Failed to save media to gallery", e);
			toast.error(t("profile_details.save_to_gallery_error"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleReverseSearch = async () => {
		const photo = photos[centerIdx];
		if (!photo || isSearching) return;
		setIsSearching(true);
		setSearchLinks(null);
		try {
			setSearchLinks(await reverseSearchImage(getMediaInfo(photo).url));
		} catch (error) {
			appLog.error("Reverse image search failed", error);
			toast.error(t("photo_viewer.reverse_search_failed", { defaultValue: "Couldn't start the image search." }));
		} finally {
			setIsSearching(false);
		}
	};

	// A search belongs to the photo it was made for.
	useEffect(() => {
		setSearchLinks(null);
	}, [centerIdx]);

	useEffect(() => {
		if (!searchLinks) return;
		const timer = window.setTimeout(() => setSearchLinks(null), 12000);
		return () => window.clearTimeout(timer);
	}, [searchLinks]);

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

	return createPortal(
		<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black overflow-hidden" onClick={onClose}>
			{/* Top bar: close, what this is, and what can be done with it. */}
			<div
				className="pointer-events-none absolute inset-x-0 top-0 z-[83] bg-gradient-to-b from-black/75 via-black/35 to-transparent pb-10 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4"
			>
				<div className="flex items-start justify-between gap-3 px-3 sm:px-5">
					<div className="pointer-events-auto">
						<ViewerButton
							label={t("profile_details.close_photo_viewer")}
							onPress={onClose}
							gestureMovedRef={gestureMovedRef}
						>
							<X className="h-5 w-5" />
						</ViewerButton>
					</div>

					{renderExtraInfo || N > 1 ? (
						<div
							className="pointer-events-auto flex min-w-0 flex-col items-center gap-1.5 pt-1.5"
							onClick={(e) => e.stopPropagation()}
						>
							{renderExtraInfo ? renderExtraInfo(centerIdx) : null}
							{N > 1 ? (
								<p className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums tracking-wide text-white/85 ring-1 ring-inset ring-white/10 backdrop-blur-xl">
									{centerIdx + 1} / {N}
								</p>
							) : null}
						</div>
					) : null}

					<div className="pointer-events-auto relative flex items-center gap-2">
						{getMediaInfo(photos[centerIdx]).type === "image" ? (
							<ViewerButton
								label={t("photo_viewer.reverse_search", { defaultValue: "Search this image on Google Lens and Yandex" })}
								onPress={() => void handleReverseSearch()}
								disabled={isSearching}
								gestureMovedRef={gestureMovedRef}
							>
								{isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanSearch className="h-5 w-5" />}
							</ViewerButton>
						) : null}
						<ViewerButton
							label={t("profile_details.save_to_gallery")}
							onPress={() => void handleSave()}
							disabled={isSaving}
							gestureMovedRef={gestureMovedRef}
						>
							{isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
						</ViewerButton>

						{searchLinks ? (
							<div
								className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl bg-neutral-900/85 p-1.5 text-white shadow-2xl ring-1 ring-inset ring-white/15 backdrop-blur-xl"
								onClick={(e) => e.stopPropagation()}
							>
								<p className="px-2.5 pb-1 pt-1.5 text-[11px] text-white/60">
									{t("photo_viewer.reverse_search_opened", { defaultValue: "Opened in your browser" })}
								</p>
								{([
									["Google Lens", searchLinks.googleLens],
									["Yandex", searchLinks.yandex],
								] as const).map(([name, url]) => (
									<button
										key={name}
										type="button"
										onClick={() => void openExternal(url)}
										className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm font-medium transition hover:bg-white/10"
									>
										{name}
										<ExternalLink className="h-3.5 w-3.5 text-white/60" />
									</button>
								))}
							</div>
						) : null}
					</div>
				</div>
			</div>

			{N > 1 && (
				<>
					<ViewerButton
						label={t("profile_details.previous_photo")}
						onPress={showPrev}
						gestureMovedRef={gestureMovedRef}
						className="absolute left-4 top-1/2 z-[83] hidden h-11 w-11 -translate-y-1/2 sm:inline-flex"
					>
						<ChevronLeft className="h-5 w-5" />
					</ViewerButton>
					<ViewerButton
						label={t("profile_details.next_photo")}
						onPress={showNext}
						gestureMovedRef={gestureMovedRef}
						className="absolute right-4 top-1/2 z-[83] hidden h-11 w-11 -translate-y-1/2 sm:inline-flex"
					>
						<ChevronRight className="h-5 w-5" />
					</ViewerButton>
				</>
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
								className="flex h-full w-screen flex-shrink-0 items-center justify-center px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+3.75rem)] sm:px-20 sm:py-16"
								onClick={onClose}
							>
								<div
									className={`relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl sm:rounded-2xl ${
										zoomScale > 1
											? isPointerDragging
												? "cursor-grabbing"
												: "cursor-grab"
											: "cursor-zoom-in"
									}`}
									onClick={(e) => e.stopPropagation()}
									onWheel={isCurrent ? handleWheel : undefined}
									onDoubleClick={isCurrent ? handleDoubleClick : undefined}
									onPointerDown={isCurrent ? handlePointerDown : undefined}
									onPointerMove={isCurrent ? handlePointerMove : undefined}
									onPointerUp={isCurrent ? handlePointerUp : undefined}
									onPointerCancel={isCurrent ? handlePointerUp : undefined}
								>
									{type === "video" ? (
										<video
											ref={isCurrent ? (mediaRef as React.RefObject<HTMLVideoElement>) : undefined}
											src={url}
											controls
											autoPlay={isCurrent}
											className="max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-4.75rem)] sm:max-h-[calc(100dvh-8rem)] w-auto max-w-full object-contain"
											style={zoomStyle}
										/>
									) : (
										<img
											ref={isCurrent ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
											src={url}
											alt={alt}
											loading="eager"
											draggable={false}
											className="max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-4.75rem)] sm:max-h-[calc(100dvh-8rem)] w-auto max-w-full select-none object-contain"
											style={zoomStyle}
										/>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{zoomScale > 1 && (
				<div
					className={`absolute left-1/2 z-[84] flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-1.5 py-1 shadow-2xl ring-1 ring-inset ring-white/15 backdrop-blur-xl transition-all ${
						renderFooter
							? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
							: "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						onClick={() =>
							setZoomScale((prev) => {
								const next = Math.max(1, prev - 0.5);
								if (next === 1) setZoomOffset({ x: 0, y: 0 });
								return next;
							})
						}
						className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/20 active:scale-95"
						title="Zoom Out"
					>
						<ZoomOut className="h-4 w-4" />
					</button>

					<span className="min-w-[3.5rem] text-center text-xs font-semibold tracking-wider text-white">
						{Math.round(zoomScale * 100)}%
					</span>

					<button
						type="button"
						onClick={() => setZoomScale((prev) => Math.min(5, prev + 0.5))}
						className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/20 active:scale-95"
						title="Zoom In"
					>
						<ZoomIn className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={() => {
							setZoomScale(1);
							setZoomOffset({ x: 0, y: 0 });
						}}
						className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/20 active:scale-95"
						title="Reset Zoom"
					>
						<RotateCcw className="h-3.5 w-3.5" />
					</button>
				</div>
			)}

			{renderFooter && (
				<div
					className="absolute inset-x-0 bottom-0 z-[83]"
					onClick={(e) => e.stopPropagation()}
				>
					{renderFooter(centerIdx)}
				</div>
			)}
		</div>,
		document.getElementById("app") ?? document.body,
	);
}