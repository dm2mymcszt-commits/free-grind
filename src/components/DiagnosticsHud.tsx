import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCacheStats } from "../utils/boundedCache";
import { DIAGNOSTICS_HUD_EVENT, isDiagnosticsHudEnabled } from "../utils/diagnostics";
import { getNativeKeyboardHeight } from "../utils/nativeKeyboard";

// TEMPORARY — see utils/diagnostics.ts. Live measurements for layout bugs on a
// device only the user can see: how tall the screen, the visible viewport and
// the chat thread are, and where the keyboard pushed things.

function describeRect(element: Element | null): string {
	if (!element) return "—";
	const rect = element.getBoundingClientRect();
	return `${Math.round(rect.top)}→${Math.round(rect.bottom)} h${Math.round(rect.height)}`;
}

function readSafeAreas(probe: HTMLElement): string {
	const style = window.getComputedStyle(probe);
	return `top ${parseFloat(style.paddingTop) || 0} bottom ${parseFloat(style.paddingBottom) || 0}`;
}

export function DiagnosticsHud() {
	const [enabled, setEnabled] = useState(() => isDiagnosticsHudEnabled());
	const [lines, setLines] = useState<string[]>([]);

	useEffect(() => {
		const sync = () => setEnabled(isDiagnosticsHudEnabled());
		window.addEventListener(DIAGNOSTICS_HUD_EVENT, sync);
		return () => window.removeEventListener(DIAGNOSTICS_HUD_EVENT, sync);
	}, []);

	useEffect(() => {
		if (!enabled) return;

		const probe = document.createElement("div");
		probe.style.cssText =
			"position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
		document.body.appendChild(probe);
		const unitProbes = (["lvh", "svh", "dvh"] as const).map((unit) => {
			const element = document.createElement("div");
			element.style.cssText = `position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:100${unit}`;
			document.body.appendChild(element);
			return { unit, element };
		});

		const update = () => {
			const viewport = window.visualViewport;
			const thread = document.querySelector<HTMLElement>("[data-diag='chat-thread']");
			const input = thread?.querySelector("textarea, input[type='text']") ?? null;
			const cacheMb =
				Math.round((getCacheStats().reduce((sum, cache) => sum + cache.chars, 0) / (1024 * 1024)) * 10) / 10;
			setLines([
				`inner ${window.innerWidth}×${window.innerHeight} · screen ${window.screen.height}`,
				`visual ${viewport ? `${Math.round(viewport.height)} @${Math.round(viewport.offsetTop)}` : "n/a"} · scrollY ${Math.round(window.scrollY)}`,
				`safe ${readSafeAreas(probe)}`,
				unitProbes
					.map(({ unit, element }) => `${unit} ${Math.round(element.getBoundingClientRect().height)}`)
					.join(" · "),
				`html ${window.getComputedStyle(document.documentElement).overflow} · body ${window.getComputedStyle(document.body).position}`,
				`thread ${describeRect(thread)} · inset ${thread?.dataset.keyboardInset ?? "—"} · native kb ${getNativeKeyboardHeight() ?? "—"}`,
				`input ${describeRect(input)}`,
				`focus ${document.activeElement?.tagName.toLowerCase() ?? "none"}`,
				`media in memory ${cacheMb} MB`,
			]);
		};

		update();
		const timer = window.setInterval(update, 500);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			window.clearInterval(timer);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
			probe.remove();
			for (const { element } of unitProbes) element.remove();
		};
	}, [enabled]);

	if (!enabled) return null;

	return createPortal(
		<div
			aria-hidden="true"
			style={{
				position: "fixed",
				left: 8,
				top: "calc(env(safe-area-inset-top, 0px) + 64px)",
				zIndex: 2147483646,
				pointerEvents: "none",
			}}
			className="rounded-lg bg-black/80 px-2 py-1.5 font-mono text-[10px] leading-tight text-lime-300"
		>
			{lines.map((line) => (
				<div key={line}>{line}</div>
			))}
		</div>,
		document.body,
	);
}
