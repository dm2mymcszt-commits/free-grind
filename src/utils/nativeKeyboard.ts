/**
 * The iOS build makes room for the keyboard by shortening the web view
 * (NativeKeyboardResize.swift). Before it does, it sets
 * window.__FG_NATIVE_KEYBOARD__ and fires NATIVE_KEYBOARD_EVENT, so the page
 * knows its viewport already ends at the keyboard.
 */

export const NATIVE_KEYBOARD_EVENT = "fg:native-keyboard";

type NativeKeyboardWindow = Window & { __FG_NATIVE_KEYBOARD__?: { height: number } };

/** The keyboard height the native side last reported, or null if it never has. */
export function getNativeKeyboardHeight(): number | null {
	if (typeof window === "undefined") return null;
	return (window as NativeKeyboardWindow).__FG_NATIVE_KEYBOARD__?.height ?? null;
}

export function isNativeKeyboardResize(): boolean {
	return getNativeKeyboardHeight() !== null;
}

/**
 * WebKit used to scroll a focused field clear of the keyboard itself; it no
 * longer knows there is one. Once the web view has shrunk, a field left below
 * the new bottom edge is brought back into sight.
 */
export function installNativeKeyboardFocusReveal(): void {
	if (typeof window === "undefined") return;
	window.addEventListener(NATIVE_KEYBOARD_EVENT, (event) => {
		const height = (event as CustomEvent<{ height?: number }>).detail?.height ?? 0;
		if (height <= 0) return;

		let done = false;
		const reveal = () => {
			if (done) return;
			done = true;
			window.removeEventListener("resize", reveal);
			const element = document.activeElement;
			if (!(element instanceof HTMLElement) || !element.matches("input, textarea, [contenteditable='true']")) {
				return;
			}
			const rect = element.getBoundingClientRect();
			if (rect.bottom > window.innerHeight || rect.top < 0) {
				element.scrollIntoView({ block: "nearest" });
			}
		};
		window.addEventListener("resize", reveal);
		// In case the size had already settled and no resize follows.
		window.setTimeout(reveal, 500);
	});
}
