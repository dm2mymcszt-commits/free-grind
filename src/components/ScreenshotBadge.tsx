import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "../services/tauriWebSocket";
import logo from "../images/freegrind-logo.webp";

function isIos(): boolean {
	if (!isTauriRuntime()) return false;
	try {
		return platform() === "ios";
	} catch {
		return false;
	}
}

/**
 * A small GrindFlop pill drawn where the notch or Dynamic Island sits. On the
 * phone the hardware covers it, so it is invisible in use, but screenshots
 * capture those pixels and show it — the same trick Swiftgram uses.
 *
 * The app switcher shows a picture of the app with no notch over it, so the
 * pill hides as soon as the app stops being the active one. iOS takes that
 * picture as the app resigns; whether the page has repainted by then is up to
 * iOS, so this is best effort.
 */
export function ScreenshotBadge() {
	const [enabled] = useState(isIos);
	const [active, setActive] = useState(() => document.visibilityState === "visible");

	useEffect(() => {
		if (!enabled) return;
		const show = () => setActive(document.visibilityState === "visible");
		const hide = () => setActive(false);
		const onVisibility = () => (document.visibilityState === "visible" ? show() : hide());
		window.addEventListener("focus", show);
		window.addEventListener("blur", hide);
		window.addEventListener("pagehide", hide);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("focus", show);
			window.removeEventListener("blur", hide);
			window.removeEventListener("pagehide", hide);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [enabled]);

	if (!enabled || !active) return null;

	return createPortal(
		<div
			aria-hidden="true"
			style={{
				position: "fixed",
				// Inside the notch (safe area 44–47) or the Dynamic Island (59).
				top: "max(calc(env(safe-area-inset-top, 0px) - 43px), 2px)",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 2147483645,
				pointerEvents: "none",
			}}
			className="flex h-[24px] items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 text-[10px] font-black uppercase tracking-wide text-[var(--accent-contrast)] shadow-lg"
		>
			<img src={logo} alt="" className="h-3.5 w-3.5 rounded-full" />
			GrindFlop
		</div>,
		document.body,
	);
}
