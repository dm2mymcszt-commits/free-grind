import { useEffect, useState, useCallback } from "react";
import { Minus, Square, X } from "lucide-react";
import freegrindLogo from "../../images/freegrind-logo.webp";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauri =
	typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function TitleBar() {
	const [isDesktop] = useState(isTauri);

	useEffect(() => {
		if (isDesktop) {
			document.body.classList.add("has-titlebar");
			document.documentElement.classList.add("has-titlebar");

			return () => {
				document.body.classList.remove("has-titlebar");
				document.documentElement.classList.remove("has-titlebar");
			};
		}
	}, [isDesktop]);

	const handleMinimize = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		getCurrentWindow().minimize().catch((err) => {
			console.error("Failed to minimize", err);
		});
	}, []);

	const handleMaximize = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		getCurrentWindow().toggleMaximize().catch((err) => {
			console.error("Failed to toggle maximize", err);
		});
	}, []);

	const handleClose = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		getCurrentWindow().close().catch((err) => {
			console.error("Failed to close", err);
		});
	}, []);

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		// Only start dragging from the background area, not from buttons
		if ((e.target as HTMLElement).closest("button")) return;
		e.preventDefault();
		getCurrentWindow().startDragging().catch(() => {});
	}, []);

	if (!isDesktop) return null;

	return (
		<div
			className="fixed top-0 left-0 right-0 h-8 z-[9999] flex justify-between items-center select-none"
			onMouseDown={handleDragStart}
		>
			{/* Logo + App Name */}
			<div className="flex items-center gap-2 px-3 text-[var(--text-muted)]">
				<img
					src={freegrindLogo}
					alt="Free Grind"
					className="h-4 w-4 drop-shadow-md pointer-events-none"
				/>
				<span className="text-xs font-semibold tracking-wide drop-shadow-md pointer-events-none">
					Free Grind
				</span>
			</div>

			{/* Window Controls */}
			<div className="flex h-full">
				<button
					onMouseDown={(e) => e.stopPropagation()}
					onClick={handleMinimize}
					className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/10 transition-colors"
					title="Minimize"
				>
					<Minus className="w-4 h-4" />
				</button>
				<button
					onMouseDown={(e) => e.stopPropagation()}
					onClick={handleMaximize}
					className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/10 transition-colors"
					title="Maximize"
				>
					<Square className="w-3.5 h-3.5" />
				</button>
				<button
					onMouseDown={(e) => e.stopPropagation()}
					onClick={handleClose}
					className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-red-500/80 transition-colors rounded-tr-[20px]"
					title="Close"
				>
					<X className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
