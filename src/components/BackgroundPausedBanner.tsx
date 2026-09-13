import { useState } from "react";
import { createPortal } from "react-dom";
import { CirclePause, X } from "lucide-react";
import { resumeBackgroundWork, useBackgroundWorkPaused } from "../utils/backgroundWorkGate";

// TEMPORARY — see utils/backgroundWorkGate.ts. Says why the background scans
// and sync are not running, and gives them back.
export function BackgroundPausedBanner() {
	const paused = useBackgroundWorkPaused();
	const [dismissed, setDismissed] = useState(false);

	if (!paused || dismissed) return null;

	return createPortal(
		<div
			role="status"
			style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)", zIndex: 2147483644 }}
			className="fixed inset-x-3 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-[var(--surface)] py-2 pl-3 pr-1.5 shadow-2xl"
		>
			<CirclePause className="h-4 w-4 shrink-0 text-amber-400" />
			<p className="min-w-0 flex-1 text-xs leading-snug">
				<span className="font-semibold">Background scans and sync paused.</span>{" "}
				<span className="text-[var(--text-muted)]">The app kept restarting. Rules on new messages still run.</span>
			</p>
			<button
				type="button"
				onClick={resumeBackgroundWork}
				className="btn-accent inline-flex min-h-8 shrink-0 items-center px-3 text-xs font-semibold"
			>
				Resume
			</button>
			<button
				type="button"
				onClick={() => setDismissed(true)}
				aria-label="Hide"
				className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)]"
			>
				<X className="h-4 w-4" />
			</button>
		</div>,
		document.body,
	);
}
