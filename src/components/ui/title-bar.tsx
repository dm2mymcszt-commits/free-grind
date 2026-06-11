import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import freegrindLogo from "../../../images/freegrind-logo.webp";

export function TitleBar() {
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		// Check if we are running in a Tauri environment
		const checkTauri = async () => {
			try {
				const { getCurrentWindow } = await import("@tauri-apps/api/window");
				const appWindow = getCurrentWindow();
				if (appWindow) {
					setIsDesktop(true);
				}
			} catch (e) {
				// Not running in Tauri
				setIsDesktop(false);
			}
		};
		void checkTauri();
	}, []);

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
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().minimize();
		} catch (e) {
			console.error("Failed to minimize", e);
		}
	};

	const handleMaximize = async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().toggleMaximize();
		} catch (e) {
			console.error("Failed to toggle maximize", e);
		}
	};

	const handleClose = async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().close();
		} catch (e) {
			console.error("Failed to close", e);
		}
	};

	return (
		<div
			data-tauri-drag-region
			className="fixed top-0 left-0 right-0 h-8 z-[9999] flex justify-between items-center px-1 select-none"
			// Completely transparent by default.
			style={{ WebkitAppRegion: "drag" } as any}
		>
            <div className="flex items-center gap-2 px-2 pointer-events-none text-[var(--text-muted)]">
                <img src={freegrindLogo} alt="Free Grind" className="h-4 w-4 drop-shadow-md" />
                <span className="text-xs font-semibold tracking-wide drop-shadow-md">Free Grind</span>
            </div>
            
            <div className="flex h-full">
                <button
                    onClick={handleMinimize}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors rounded-md mr-1"
                    style={{ WebkitAppRegion: "no-drag" } as any}
                    title="Minimize"
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors rounded-md mr-1"
                    style={{ WebkitAppRegion: "no-drag" } as any}
                    title="Maximize"
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleClose}
                    className="h-full px-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-red-500 transition-colors rounded-md"
                    style={{ WebkitAppRegion: "no-drag" } as any}
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
		</div>
	);
}
