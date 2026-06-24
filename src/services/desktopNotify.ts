/**
 * desktopNotify.ts — fire native OS notifications when a new chat message
 * arrives while the app is in the background or the conversation isn't open.
 *
 * Supported across both desktop (macOS/Windows/Linux) and mobile (iOS/Android)
 * via the Tauri notification plugin API.
 */

import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

let permissionPromise: Promise<boolean> | null = null;

async function ensurePermission(): Promise<boolean> {
	if (isTauriRuntime()) {
		if (!permissionPromise) {
			permissionPromise = (async () => {
				try {
					const already = await isPermissionGranted();
					appLog.debug("[notify] isPermissionGranted ->", already);
					if (already) return true;
					appLog.debug("[notify] requesting permission");
					const result = await requestPermission();
					appLog.debug("[notify] requestPermission ->", result);
					return result === "granted";
				} catch (error) {
					appLog.warn("[notify] permission check failed", error);
					return false;
				}
			})();
		}
		return permissionPromise;
	} else if (typeof window !== "undefined" && "Notification" in window) {
		if (window.Notification.permission === "granted") {
			return true;
		}
		if (window.Notification.permission === "denied") {
			return false;
		}
		try {
			const permission = await window.Notification.requestPermission();
			return permission === "granted";
		} catch (error) {
			appLog.warn("[notify] browser permission check failed", error);
			return false;
		}
	}
	return false;
}

/**
 * Trigger the OS permission prompt eagerly so the user sees it on app start
 * rather than waiting for the first incoming message. Safe to call repeatedly;
 * only prompts once per app session.
 */
export async function primeNotifications(): Promise<boolean> {
	appLog.debug("[notify] priming permission");
	return ensurePermission();
}

export interface DesktopNotifyOptions {
	title: string;
	body: string;
	/** When true, skip the notification (e.g. user is viewing the conversation). */
	suppress?: boolean;
}

export async function notifyMessage(
	options: DesktopNotifyOptions,
): Promise<void> {
	if (options.suppress) {
		appLog.debug("[notify] suppressed", options.title);
		return;
	}
	const granted = await ensurePermission();
	if (!granted) {
		appLog.debug("[notify] permission not granted, skipping");
		return;
	}
	try {
		appLog.debug("[notify] sending", options.title);
		if (isTauriRuntime()) {
			sendNotification({ title: options.title, body: options.body });
		} else if (typeof window !== "undefined" && "Notification" in window) {
			new window.Notification(options.title, { body: options.body });
		}
	} catch (error) {
		appLog.warn("[notify] sendNotification failed", error);
	}
}

