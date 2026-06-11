import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import freegrindLogo from "../../images/freegrind-logo.webp";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function TitleBar() {
	const [isDesktop, setIsDesktop] = useState(isTauri);

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

	if (!isDesktop) return null;

	const handleMinimize = async () => {
		try {
			await getCurrentWindow().minimize();
		} catch (e) {
			console.error("Failed to minimize", e);
		}
	};

	const handleMaximize = async () => {
		try {
			await getCurrentWindow().toggleMaximize();
		} catch (e) {
			console.error("Failed to toggle maximize", e);
		}
	};

	const handleClose = async () => {
		try {
			await getCurrentWindow().close();
		} catch (e) {
			console.error("Failed to close", e);
		}
	};

	return (
		<div
			className="fixed top-0 left-0 right-0 h-8 z-[9999] flex justify-between items-center px-1 select-none"
		>
            <div data-tauri-drag-region className="absolute inset-0 z-0" />
            
            <div className="relative z-10 flex items-center gap-2 px-2 pointer-events-none text-[var(--text-muted)]">
                <img src={freegrindLogo} alt="Free Grind" className="h-4 w-4 drop-shadow-md" />
                <span className="text-xs font-semibold tracking-wide drop-shadow-md">Free Grind</span>
            </div>
            
            <div className="relative z-10 flex h-full pointer-events-auto">
                <button
                    onClick={handleMinimize}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors rounded-md mr-1"
                    title="Minimize"
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors rounded-md mr-1"
                    title="Maximize"
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleClose}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-red-500 transition-colors rounded-md"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
		</div>
	);
}
