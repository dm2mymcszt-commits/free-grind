import { useEffect, useRef, useState, ReactNode } from "react";
import Lenis from "lenis";
import { useLocation } from "react-router-dom";
import { SMOOTH_SCROLL_CONFIG } from "../config/scroll-config";

type SmoothScrollProps = {
	children: ReactNode;
	enabled?: boolean;
	smoothTouch?: boolean;
	duration?: number;
	wheelMultiplier?: number;
	touchMultiplier?: number;
	lerp?: number;
};

/**
 * SmoothScroll component using Lenis.
 */
export function SmoothScroll({
	children,
	enabled = SMOOTH_SCROLL_CONFIG.enabled,
	smoothTouch = SMOOTH_SCROLL_CONFIG.smoothTouch,
	duration = SMOOTH_SCROLL_CONFIG.duration,
	wheelMultiplier = SMOOTH_SCROLL_CONFIG.wheelMultiplier,
	touchMultiplier = SMOOTH_SCROLL_CONFIG.touchMultiplier,
	lerp = SMOOTH_SCROLL_CONFIG.lerp,
}: SmoothScrollProps) {
	const lenisRef = useRef<Lenis | null>(null);
	const location = useLocation();
	const [isTauri, setIsTauri] = useState(() => {
		if (typeof window === "undefined") return false;
		return "__TAURI_INTERNALS__" in window;
	});

	// Check for Tauri asynchronously to handle race conditions during setup
	useEffect(() => {
		const checkTauri = () => {
			const detected = typeof window !== "undefined" && (
				"__TAURI_INTERNALS__" in window ||
				document.body?.classList.contains("has-titlebar") ||
				document.documentElement?.classList.contains("has-titlebar")
			);
			if (detected && !isTauri) {
				setIsTauri(true);
			}
		};

		checkTauri();

		const timer1 = setTimeout(checkTauri, 100);
		const timer2 = setTimeout(checkTauri, 300);
		const timer3 = setTimeout(checkTauri, 800);

		const observer = new MutationObserver(checkTauri);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		if (document.body) {
			observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
		}

		return () => {
			clearTimeout(timer1);
			clearTimeout(timer2);
			clearTimeout(timer3);
			observer.disconnect();
		};
	}, [isTauri]);

	useEffect(() => {
		if (!enabled || isTauri) {
			if (lenisRef.current) {
				lenisRef.current.destroy();
				lenisRef.current = null;
				document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
			}
			return;
		}

		// Helper to detect if event target or any ancestor is a scrollable container
		const isScrollable = (el: HTMLElement | null): boolean => {
			if (!el || el === document.body || el === document.documentElement) return false;
			if (el.hasAttribute("data-lenis-prevent")) return true;
			try {
				const style = window.getComputedStyle(el);
				const overflowY = style.overflowY;
				const isScrollableType = overflowY === "auto" || overflowY === "scroll";
				const canScroll = el.scrollHeight > el.clientHeight;
				if (isScrollableType && canScroll) {
					return true;
				}
			} catch (e) {
				// Ignore computed style errors
			}
			return el.parentElement ? isScrollable(el.parentElement as HTMLElement) : false;
		};

		// Initialize Lenis
		const lenis = new Lenis({
			duration: duration,
			lerp: lerp,
			easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			orientation: "vertical",
			gestureOrientation: "vertical",
			smoothWheel: true,
			wheelMultiplier: wheelMultiplier,
			touchMultiplier: touchMultiplier,
			autoResize: true,
			prevent: (node) => isScrollable(node),
		});

		lenisRef.current = lenis;
		(window as any).lenis = lenis;

		// Add Lenis classes to HTML element
		document.documentElement.classList.add("lenis");
		document.documentElement.classList.add("lenis-smooth");

		// High-performance RAF loop
		let rafId: number;
		function raf(time: number) {
			lenis.raf(time);
			rafId = requestAnimationFrame(raf);
		}
		rafId = requestAnimationFrame(raf);

		console.log("[Lenis] Initialized on window", {
			smoothTouch,
			duration,
			lerp,
			isTouchDevice: "ontouchstart" in window,
		});

		// Ensure initial size is correct
		setTimeout(() => {
			lenis.resize();
		}, 100);

		return () => {
			lenis.destroy();
			cancelAnimationFrame(rafId);
			delete (window as any).lenis;
			document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
		};
	}, [enabled, smoothTouch, duration, wheelMultiplier, touchMultiplier, lerp, isTauri]);

	// Global scroll-to-top on route change
	useEffect(() => {
		if (lenisRef.current && enabled) {
			const pagesWithoutTopReset = ["/", "/chat"];
			if (!pagesWithoutTopReset.includes(location.pathname)) {
				lenisRef.current.scrollTo(0, { immediate: true });
			}

			// Small delay to ensure DOM is rendered before resizing
			const timer = setTimeout(() => {
				lenisRef.current?.resize();
			}, 150);
			return () => clearTimeout(timer);
		}
	}, [location.pathname, enabled]);

	return (
		<>
			{enabled && (
				<style dangerouslySetInnerHTML={{ __html: `
					html.lenis, html.lenis body {
						height: auto;
					}
					.lenis.lenis-smooth {
						scroll-behavior: auto !important;
					}
					.lenis.lenis-smooth [data-lenis-prevent] {
						overscroll-behavior: contain;
					}
					.lenis.lenis-stopped {
						overflow: hidden;
					}
					.lenis.lenis-scrolling iframe {
						pointer-events: none;
					}
				`}} />
			)}
			{children}
		</>
	);
}
