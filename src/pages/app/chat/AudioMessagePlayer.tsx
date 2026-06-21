import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "../../../services/tauriWebSocket";
import { getAudioFileMetadata } from "../../../utils/audioUtils";

function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function resample(bars: number[], n: number): number[] {
	if (bars.length === 0 || n === 0) return [];
	if (bars.length === n) return bars;
	return Array.from({ length: n }, (_, i) => {
		const pos = (i / Math.max(1, n - 1)) * (bars.length - 1);
		const lo = Math.floor(pos), hi = Math.min(lo + 1, bars.length - 1);
		return bars[lo] + (bars[hi] - bars[lo]) * (pos - lo);
	});
}

export function seededWaveform(seed: string, bars: number): number[] {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
	}
	return Array.from({ length: bars }, () => {
		h = Math.imul(1664525, h) + 1013904223 | 0;
		return 0.25 + (Math.abs(h) / 0x7fffffff) * 0.75;
	});
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

const SPEEDS = [1, 1.5, 2] as const;
const BARS = 36;

type Props = {
	src: string | Blob;
	messageId: string;
	mine: boolean;
	className?: string;
	/** Fallback duration in seconds when audio metadata is unavailable (e.g. fresh MediaRecorder blobs). */
	durationHint?: number;
	hideSpeed?: boolean;
	compact?: boolean;
	initialBars?: number[];
	recordedFraction?: number;
};

export function AudioMessagePlayer({ src, messageId, mine, className, durationHint, hideSpeed, compact, initialBars, recordedFraction: _recordedFraction }: Props) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const trackRef = useRef<HTMLDivElement | null>(null);
	const isDraggingRef = useRef(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(durationHint ?? 0);
	const [speedIdx, setSpeedIdx] = useState(0);

	const [audioSrc, setAudioSrc] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);
	const [decodedWaveform, setDecodedWaveform] = useState<number[] | null>(null);

	const trackBarsRef = useRef(BARS);
	const [trackBars, setTrackBars] = useState(BARS);
	const waveform = initialBars && initialBars.length > 0
		? resample(initialBars, trackBars)
		: (decodedWaveform && decodedWaveform.length > 0
			? resample(decodedWaveform, trackBars)
			: seededWaveform(messageId, trackBars));

	const rafRef = useRef<number | null>(null);
	const clipRef = useRef<HTMLDivElement | null>(null);
	const durationRef = useRef(durationHint ?? 0);



	const updateProgress = useCallback((t: number) => {
		const d = durationRef.current;
		if (clipRef.current && d > 0) {
			clipRef.current.style.clipPath = `inset(0 ${(1 - t / d) * 100}% 0 0)`;
		}
	}, []);

	useEffect(() => {
		if (!src) return;

		// For data: URLs, use directly
		if (typeof src === "string" && src.startsWith("data:")) {
			setAudioSrc(src);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		let active = true;

		const loadAudio = async () => {
			try {
				let blob: Blob;
				if (src instanceof Blob) {
					blob = src;
				} else if (src.startsWith("blob:")) {
					const res = await fetch(src);
					blob = await res.blob();
				} else {
					const lowerSrc = src.toLowerCase();
					let mimeType = "audio/mpeg";
					if (lowerSrc.includes(".m4a")) mimeType = "audio/mp4";
					else if (lowerSrc.includes(".aac")) mimeType = "audio/aac";
					else if (lowerSrc.includes(".webm")) mimeType = "audio/webm";
					else if (lowerSrc.includes(".ogg")) mimeType = "audio/ogg";
					else if (lowerSrc.includes(".wav")) mimeType = "audio/wav";

					const fetchFn = isTauriRuntime() ? tauriFetch : fetch;
					const res = await fetchFn(src);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					
					if (typeof res.blob === "function") {
						const tempBlob = await res.blob();
						if (tempBlob.type === "" || tempBlob.type === "application/octet-stream") {
							blob = new Blob([tempBlob], { type: mimeType });
						} else {
							blob = tempBlob;
						}
					} else {
						const buf = await res.arrayBuffer();
						blob = new Blob([buf], { type: mimeType });
					}
				}

				if (!active) return;
				const dataUrl = await blobToDataUrl(blob);
				if (!active) return;
				setAudioSrc(dataUrl);

				if (!initialBars || initialBars.length === 0) {
					try {
						const meta = await getAudioFileMetadata(blob);
						if (active && meta.waveform && meta.waveform.length > 0) {
							setDecodedWaveform(meta.waveform);
						}
					} catch (decErr) {
						console.warn("[AudioMessagePlayer] Failed to decode waveform from blob:", decErr);
					}
				}

				setIsLoading(false);
			} catch (err) {
				console.error("[AudioMessagePlayer] Failed to fetch and convert audio:", err);
				if (active) {
					if (typeof src === "string") {
						setAudioSrc(src);
					}
					setIsLoading(false);
				}
			}
		};

		void loadAudio();

		return () => {
			active = false;
		};
	}, [src]);

	useEffect(() => {
		setIsPlaying(false);
		setCurrentTime(0);
		updateProgress(0);
		if (audioRef.current) {
			audioRef.current.load();
		}
	}, [audioSrc, updateProgress]);

	useEffect(() => {
		const el = trackRef.current;
		if (!el) return;
		const update = (w: number) => {
			const n = Math.max(4, Math.floor(w / 5));
			trackBarsRef.current = n;
			setTrackBars(n);
		};
		update(el.offsetWidth);
		const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const tick = () => {
			if (!isDraggingRef.current) {
				updateProgress(audio.currentTime);
				setCurrentTime(audio.currentTime);
			}
			rafRef.current = requestAnimationFrame(tick);
		};

		const onPlay = () => { rafRef.current = requestAnimationFrame(tick); };
		const onPause = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
		const onMeta = () => {
			const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (durationHint ?? 0);
			durationRef.current = d;
			setDuration(d);
		};
		const onEnded = () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			setIsPlaying(false);
			setCurrentTime(0);
			updateProgress(0);
		};
		// iOS often doesn't fire loadedmetadata for blob URLs; canplaythrough is more reliable
		const onCanPlay = () => {
			if (durationRef.current <= 0) onMeta();
		};
		const onError = () => {
			console.error("[AudioMessagePlayer] audio error:", audio.error?.message, audio.error?.code);
		};

		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("loadedmetadata", onMeta);
		audio.addEventListener("durationchange", onMeta);
		audio.addEventListener("canplaythrough", onCanPlay);
		audio.addEventListener("ended", onEnded);
		audio.addEventListener("error", onError);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("durationchange", onMeta);
			audio.removeEventListener("canplaythrough", onCanPlay);
			audio.removeEventListener("ended", onEnded);
			audio.removeEventListener("error", onError);
		};
	}, [updateProgress, durationHint, audioSrc]);

	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (isPlaying) {
			audio.pause();
			setIsPlaying(false);
		} else {
			audio.play().then(() => {
				setIsPlaying(true);
			}).catch((err: unknown) => {
				console.error("[AudioMessagePlayer] play failed:", err);
				setIsPlaying(false);
			});
		}
	};

	const cycleSpeed = () => {
		const next = (speedIdx + 1) % SPEEDS.length;
		setSpeedIdx(next);
		if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
	};

	const seekFromEvent = useCallback((clientX: number) => {
		const track = trackRef.current;
		const audio = audioRef.current;
		const d = durationRef.current;
		if (!track || !audio || d === 0) return;
		const rect = track.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		audio.currentTime = ratio * d;
		setCurrentTime(ratio * d);
		updateProgress(ratio * d);
	}, [updateProgress]);

	const onPointerDown = (e: React.PointerEvent) => {
		isDraggingRef.current = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		seekFromEvent(e.clientX);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (isDraggingRef.current) seekFromEvent(e.clientX);
	};
	const onPointerUp = () => { isDraggingRef.current = false; };

	const displayWaveform = waveform;
	const barColor = mine ? "bg-[var(--accent-contrast)]" : "bg-[var(--accent)]";
	const btnColor = mine ? "bg-[var(--accent-contrast)] text-[var(--accent)]" : "bg-[var(--accent)] text-[var(--accent-contrast)]";
	const pillColor = mine
		? "bg-black/20 text-[var(--accent-contrast)]"
		: "bg-black/8 text-[var(--text)]";
	const timeColor = mine ? "text-[var(--accent-contrast)]/60" : "text-[var(--text-muted)]";

	return (
		<div className={`flex items-center gap-2.5 ${compact ? "py-0" : "py-1"} ${className ?? "w-64"}`}>
			<audio ref={audioRef} src={audioSrc} preload="auto" className="absolute w-0 h-0 opacity-0 pointer-events-none overflow-hidden" />

			<button
				type="button"
				onClick={togglePlay}
				disabled={isLoading}
				className={`flex ${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0 items-center justify-center rounded-full ${btnColor} shadow-sm transition active:scale-95 ${isLoading ? "opacity-75 cursor-not-allowed" : ""}`}
			>
				{isLoading ? (
					<Loader2 className="h-4 w-4 animate-spin text-current" />
				) : isPlaying ? (
					<Pause className="h-4 w-4 fill-current" />
				) : (
					<Play className="h-4 w-4 fill-current translate-x-[1px]" />
				)}
			</button>

			<div
				ref={trackRef}
				className={`relative flex flex-1 ${compact ? "h-6" : "h-8"} cursor-pointer items-center touch-none min-w-0 overflow-hidden`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onTouchStart={(e) => e.stopPropagation()}
				onTouchMove={(e) => e.stopPropagation()}
			>
				{/* inactive bars */}
				<div className="flex h-full w-full items-center gap-[2px]">
					{displayWaveform.map((h, i) => (
						<div key={i} className={`w-[3px] flex-none rounded-full opacity-25 ${barColor}`} style={{ height: `${Math.max(12, Math.round(h * 100))}%` }} />
					))}
					<div className={`flex-1 h-[2px] rounded-full opacity-25 ${barColor}`} />
				</div>
				{/* active bars — clipped via direct DOM style update */}
				<div ref={clipRef} className="absolute inset-0 flex items-center gap-[2px]" style={{ clipPath: "inset(0 100% 0 0)" }}>
					{displayWaveform.map((h, i) => (
						<div key={i} className={`w-[3px] flex-none rounded-full ${barColor}`} style={{ height: `${Math.max(12, Math.round(h * 100))}%` }} />
					))}
					<div className={`flex-1 h-[2px] rounded-full ${barColor}`} />
				</div>
			</div>

			<div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
				{!hideSpeed && (
					<button
						type="button"
						onClick={cycleSpeed}
						className={`w-9 rounded-full py-0.5 text-center text-[11px] font-bold tabular-nums transition active:scale-95 ${pillColor}`}
					>
						{SPEEDS[speedIdx]}×
					</button>
				)}
				<span className={`text-[10px] tabular-nums ${timeColor}`}>
					{duration > 0
						? formatDuration(currentTime > 0 || isPlaying ? currentTime : duration)
						: "—"}
				</span>
			</div>
		</div>
	);
}
