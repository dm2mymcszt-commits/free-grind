# Resolve all merge conflicts
# This script writes the resolved content for each file

Write-Host "Resolving merge conflicts..."

# ============================================================================
# FILE 1: src/services/runtimeContext.ts (2 conflicts)
# ============================================================================
Write-Host "Resolving runtimeContext.ts..."

$runtimeContext = @'
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, readTextFile } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";

export type RuntimeMode = "manager" | "child";

export type RuntimeContext = {
    mode: RuntimeMode;
    instanceLabel: string;
};

function normalizeMode(raw: unknown): RuntimeMode {
    return raw === "manager" ? "manager" : "child";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function parseTraceContext(raw: string): RuntimeContext | null {
    const lines = raw.split(/\r?\n/);
    const map = new Map<string, string>();

    for (const line of lines) {
        const idx = line.indexOf("=");
        if (idx <= 0) {
            continue;
        }
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        map.set(key, value);
    }

    const mode = normalizeMode(map.get("mode"));
    const label = map.get("label") || map.get("FREE_GRIND_INSTANCE") || "default";

    return {
        mode,
        instanceLabel: label,
    };
}

async function getTraceRuntimeContext(): Promise<RuntimeContext | null> {
    // Manager/child multi-instance mode is a Windows-only concept (see
    // windows_instance.rs / instance_lock.rs, both #[cfg(target_os =
    // "windows")] on the Rust side) — this fs read has no purpose on
    // mobile. More importantly, it's the *first* @tauri-apps/plugin-fs
    // command the app ever calls, fired unconditionally from main.tsx before
    // anything else. On Android that first fs-scope resolution runs on the
    // WebView's JavaBridge thread and can deadlock against the main thread's
    // WebviewManager::prepare_pending_webview (invoked from onPageFinished)
    // if it happens to race the initial page load — observed as a 5s
    // "Input dispatching timed out" ANR right at cold start. Skipping this
    // call entirely on non-Windows platforms removes that race outright.
    if (platform() !== "windows") {
        return null;
    }
    const tracePath = "AppData/Local/free-grind/manager/runtime-mode.txt";
    try {
        const traceExists = await exists(tracePath, { baseDir: BaseDirectory.Home });
        if (!traceExists) {
            return null;
        }

        const trace = await readTextFile(tracePath, { baseDir: BaseDirectory.Home });
        return parseTraceContext(trace);
    } catch {
        return null;
    }
}

export async function getRuntimeContext(): Promise<RuntimeContext> {
    const maxAttempts = 20;
    const retryDelayMs = 100;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const value = await invoke<{ mode: string; instanceLabel: string }>("runtime_context");
            const resolved: RuntimeContext = {
                mode: normalizeMode(value.mode),
                instanceLabel: value.instanceLabel || "default",
            };

            const traceContext = await getTraceRuntimeContext();
            if (traceContext && traceContext.mode === "manager") {
                return traceContext;
            }

            return resolved;
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                await sleep(retryDelayMs);
            }
        }
    }

    const traceContext = await getTraceRuntimeContext();
    if (traceContext) {
        return traceContext;
    }

    console.warn("[runtime-context] falling back to child/default after retries", lastError);
    return { mode: "child", instanceLabel: "default" };
}
'@

Set-Content -Path "src/services/runtimeContext.ts" -Value $runtimeContext -NoNewline -Encoding UTF8

# ============================================================================
# FILE 2: src/services/localNotify.ts (5 conflicts)
# ============================================================================
Write-Host "Resolving localNotify.ts..."

$localNotify = @'
/**
 * localNotify.ts — fire native OS notifications instantly from the chat
 * WebSocket while the app is in the foreground, instead of waiting on FCM's
 * delivery delay.
 *
 * Supported across both desktop (macOS/Windows/Linux) and mobile (iOS/Android)
 * via the Tauri notification plugin API.
 *
 * Android is intentionally excluded from the local notify path; it has its own
 * native notification pipeline (FreeGrindFirebaseMessagingService /
 * NotificationPoster) reached via the FreeGrindBridge JS interface, which
 * dedupes against the FCM path. Desktop and iOS have no competing push
 * channel, so this is a plain fire-and-forget call.
 */

import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

// Matches the Linux .desktop entry's `Icon=`/`StartupWMClass=` value (the
// main binary name, not the bundle `identifier`) — confirmed against the
// installed /usr/share/applications/Free Grind.desktop. Passing this as the
// notification icon lets the icon theme resolve it once the app is properly
// installed with icons bundled (see tauri.conf.json `bundle.icon`).
const APP_ICON_NAME = "free-grind";

let permissionPromise: Promise<boolean> | null = null;
let cachedIsSupported: boolean | null = null;

function detectLocalNotifySupported(): boolean {
	if (cachedIsSupported != null) return cachedIsSupported;
	if (!isTauriRuntime()) {
		cachedIsSupported = false;
		return false;
	}
	try {
		const p = platform();
		cachedIsSupported = p === "macos" || p === "windows" || p === "linux" || p === "ios";
	} catch (error) {
		appLog.warn("[notify] platform() failed", error);
		cachedIsSupported = false;
	}
	return cachedIsSupported;
}

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
export async function primeLocalNotifications(): Promise<boolean> {
	if (!detectLocalNotifySupported()) {
		appLog.debug("[notify] prime skipped (not supported)");
		return false;
	}
	appLog.debug("[notify] priming permission");
	return ensurePermission();
}

export interface LocalNotifyOptions {
	title: string;
	body: string;
	/** Conversation/thread grouping key (e.g. conversationId, or "taps"). */
	group?: string;
	/** When true, skip the notification (e.g. user is viewing the conversation). */
	suppress?: boolean;
}

export async function notifyLocal(options: LocalNotifyOptions): Promise<void> {
	if (options.suppress) {
		appLog.debug("[notify] suppressed", options.title);
		return;
	}
	if (!detectLocalNotifySupported()) {
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
			sendNotification({
				title: options.title,
				body: options.body,
				group: options.group,
				icon: APP_ICON_NAME,
			});
		} else if (typeof window !== "undefined" && "Notification" in window) {
			new window.Notification(options.title, { body: options.body });
		}
	} catch (error) {
		appLog.warn("[notify] sendNotification failed", error);
	}
}
'@

Set-Content -Path "src/services/localNotify.ts" -Value $localNotify -NoNewline -Encoding UTF8

# ============================================================================
# FILE 3: src/services/chatService.ts (3 conflicts)
# ============================================================================
Write-Host "Resolving chatService.ts..."

# Read the file
$chatContent = Get-Content -Path "src/services/chatService.ts" -Raw

# Conflict 1 (lines 37-44): imports - keep both our custom imports AND upstream's
$chatContent = $chatContent -replace '(?s)<<<<<<< HEAD\r?\nimport \{ shouldAutoBlock, isOutsideAgeLimits, isOutsideDistanceLimits, notifyAutoBlock \} from "\.\./utils/autoblock";\r?\nimport \{ isChatGhosted, isProfileAutoblockWhitelisted \} from "\.\./utils/privacy";\r?\nimport \* as chatLog from "\./chatLog";\r?\n=======\r?\nimport \{ shouldAutoBlock, isOutsideAgeLimits, notifyAutoBlock \} from "\.\./utils/autoblock";\r?\nimport \{ isReadReceiptsHidden \} from "\.\./utils/privacy";\r?\n>>>>>>> upstream/main', @'
import { shouldAutoBlock, isOutsideAgeLimits, isOutsideDistanceLimits, notifyAutoBlock } from "../utils/autoblock";
import { isChatGhosted, isProfileAutoblockWhitelisted, isReadReceiptsHidden } from "../utils/privacy";
import * as chatLog from "./chatLog";
'@

# Conflict 2 (lines 366-380): markRead - keep both ghost mode AND read receipts check
$chatContent = $chatContent -replace '(?s)<<<<<<< HEAD\r?\n        async markRead\(conversationId: string, messageId: string\): Promise<void> \{\r?\n            // --- GHOST MODE CHECK ---\r?\n            if \(isChatGhosted\(conversationId\)\) \{\r?\n                return; // Silently do nothing\. They will never know you read it!\r?\n            \}\r?\n            // ------------------------\r?\n=======\r?\n\t\tasync markRead\(conversationId: string, messageId: string\): Promise<void> \{\r?\n \t\t// --- READ RECEIPTS CHECK ---\r?\n \t\tif \(isReadReceiptsHidden\(conversationId\)\) \{\r?\n \t\t\treturn; // Silently do nothing\. They will never know you read it!\r?\n \t\t\}\r?\n \t\t// ---------------------------\r?\n>>>>>>> upstream/main', @'
        async markRead(conversationId: string, messageId: string): Promise<void> {
            // --- GHOST MODE CHECK ---
            if (isChatGhosted(conversationId)) {
                return; // Silently do nothing. They will never know you read it!
            }
            // --- READ RECEIPTS CHECK ---
            if (isReadReceiptsHidden(conversationId)) {
                return; // Silently do nothing. They will never know you read it!
            }
            // ---------------------------
'@

# Conflict 3 (lines 407-430): sendTypingStatus + reactToMessage - take upstream's combined version, remove HEAD's duplicate
$chatContent = $chatContent -replace '(?s)<<<<<<< HEAD\r?\n        async sendTypingStatus\(conversationId: string, status: "Typing" \| "Cleared"\): Promise<void> \{\r?\n            await fetchRest\("/v4/chatstatus/typing", \{\r?\n                method: "POST",\r?\n                body: \{ conversationId, status \},\r?\n            \}\);\r?\n        \},\r?\n=======\r?\n\t\tasync sendTypingStatus\(conversationId: string, status: "Typing" \| "Cleared"\): Promise<void> \{\r?\n\t\t\tawait fetchRest\("/v4/chatstatus/typing", \{\r?\n\t\t\t\tmethod: "POST",\r?\n\t\t\t\tbody: \{ conversationId, status \},\r?\n\t\t\t\}\);\r?\n\t\t\},\r?\n\r?\n\t\tasync reactToMessage\(payload: ChatReactionPayload\) \{\r?\n\t\t\tconst safePayload = chatReactionPayloadSchema\.parse\(payload\);\r?\n\t\t\tconst response = await fetchRest\("/v4/chat/message/reaction", \{\r?\n\t\t\t\tmethod: "POST",\r?\n\t\t\t\tbody: safePayload,\r?\n\t\t\t\}\);\r?\n\t\t\tawait assertSuccess\(response, t\("chat\.errors\.react_failed"\)\);\r?\n\t\t\},\r?\n>>>>>>> upstream/main', @'
        async sendTypingStatus(conversationId: string, status: "Typing" | "Cleared"): Promise<void> {
            await fetchRest("/v4/chatstatus/typing", {
                method: "POST",
                body: { conversationId, status },
            });
        },
'@

Set-Content -Path "src/services/chatService.ts" -Value $chatContent -NoNewline -Encoding UTF8

Write-Host "Done resolving chatService.ts"

# ============================================================================
# FILE 4: src/pages/app/SettingsPrivacyPage.tsx (3 conflicts)
# ============================================================================
Write-Host "Resolving SettingsPrivacyPage.tsx..."

$privacyPage = @'
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, CheckCheck, Eye, Ghost, ImageOff, ScanSearch, ToggleRight } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	getHideReadReceiptsGlobal,
	getShowReadReceiptToggle,
	isRecordProfileViewsEnabled,
	setHideReadReceiptsGlobal,
	setRecordProfileViewsEnabled,
	setShowReadReceiptToggle as persistShowReadReceiptToggle,
} from "../../utils/privacy";
import {
	readAnalyticsConsentChoice,
	writeAnalyticsConsentChoice,
	type AnalyticsConsentChoice,
} from "../../utils/analyticsConsent";

export function SettingsPrivacyPage() {
	const { t } = useTranslation();
	const { blurIncomingMedia, setPreferences } = usePreferences();

	const [ghostMode, setGhostMode] = useState(() => window.localStorage.getItem("fg-ghost-mode") === "true");
	const [showGhostButton, setShowGhostButton] = useState(() => window.localStorage.getItem("fg-show-ghost-btn") !== "false");

	const [imageScannerEnabled, setImageScannerEnabled] = useState(() => window.localStorage.getItem("fg-image-scanner-enabled") === "true");
	const [blurOutgoingMedia, setBlurOutgoingMedia] = useState(() => window.localStorage.getItem("fg-blur-outgoing-media") === "true");

	const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(() => !getHideReadReceiptsGlobal());
	const [showReadReceiptToggle, setShowReadReceiptToggle] = useState(() => getShowReadReceiptToggle());
	const [recordProfileViews, setRecordProfileViews] = useState(() => isRecordProfileViewsEnabled());
	const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsentChoice | null>(() => readAnalyticsConsentChoice());

	return (
		<section className="app-screen pb-32">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.privacy")}</h1>
				<p className="app-subtitle">{t("settings.privacy_desc")}</p>
			</header>

			<div className="grid gap-6">

				{/* Security */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Security</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<ScanSearch className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label="Media Scanner"
							description="Adds a Scanner Hub to the photo viewer to instantly reverse-search images using Google Lens."
							checked={imageScannerEnabled}
							onChange={(checked) => {
								setImageScannerEnabled(checked);
								window.localStorage.setItem("fg-image-scanner-enabled", String(checked));
							}}
						/>
					</div>
				</div>

				{/* Read Receipts */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.read_receipts")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<CheckCheck className="h-5 w-5" />}
							iconClass="bg-indigo-500/15 text-indigo-400"
							label={t("privacy.send_read_receipts")}
							description={t("privacy.send_read_receipts_desc")}
							checked={readReceiptsEnabled}
							onChange={(checked) => {
								setReadReceiptsEnabled(checked);
								void setHideReadReceiptsGlobal(!checked);
							}}
						/>
						<ToggleRow
							icon={<ToggleRight className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label={t("privacy.per_chat_overrides")}
							description={t("privacy.per_chat_overrides_desc")}
							checked={showReadReceiptToggle}
							onChange={(checked) => {
								setShowReadReceiptToggle(checked);
								void persistShowReadReceiptToggle(checked);
							}}
						/>
					</div>
				</div>

				{/* Profile Views */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.profile_views")}</p>
					<div className="surface-card overflow-hidden">
						<ToggleRow
							icon={<Eye className="h-5 w-5" />}
							iconClass="bg-amber-500/15 text-amber-400"
							label={t("privacy.record_profile_views")}
							description={t("privacy.record_profile_views_desc")}
							checked={recordProfileViews}
							onChange={(checked) => {
								setRecordProfileViews(checked);
								void setRecordProfileViewsEnabled(checked);
							}}
						/>
					</div>
				</div>

				{/* NSFW Content */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.nsfw_content")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-sky-500/15 text-sky-400"
							label={t("customizability.blur_incoming_media", { defaultValue: "Blur Incoming Media" })}
							description={t("customizability.blur_incoming_media_description", { defaultValue: "Blur received photos until tapped to protect against NSFW surprises." })}
							checked={blurIncomingMedia}
							onChange={(checked) => void setPreferences({ blurIncomingMedia: checked })}
						/>
						<ToggleRow
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-pink-500/15 text-pink-400"
							label="Blur Outgoing Media"
							description="Blur images you send to prevent people nearby from seeing your screen."
							checked={blurOutgoingMedia}
							onChange={(checked) => {
								setBlurOutgoingMedia(checked);
								window.localStorage.setItem("fg-blur-outgoing-media", String(checked));
							}}
						/>
					</div>
				</div>


			</div>
		</section>
	);
}
'@

Set-Content -Path "src/pages/app/SettingsPrivacyPage.tsx" -Value $privacyPage -NoNewline -Encoding UTF8

# ============================================================================
# FILE 5: src/pages/app/SettingsAutomationPage.tsx (2 conflicts)
# ============================================================================
Write-Host "Resolving SettingsAutomationPage.tsx..."

$autoContent = Get-Content -Path "src/pages/app/SettingsAutomationPage.tsx" -Raw

# Conflict 1 (lines 14-41): imports - keep HEAD's imports + upstream's autoblock import
$autoContent = $autoContent -replace '(?s)<<<<<<< HEAD\r?\nimport \{ interestViewsStore \} from "\.\./\.\./services/interestViewsStore";\r?\nimport \{ getLookingForOptions \} from "\./profile-option-builders";\r?\nimport \{ getAutoBlockWhitelist, removeFromAutoBlockWhitelist \} from "\.\./\.\./utils/privacy";\r?\n\r?\nfunction useIsDesktop\(\) \{\r?\n    const \[isDesktop, setIsDesktop\] = useState\(\(\) => \{\r?\n        if \(typeof window === "undefined"\) return false;\r?\n        const isMobilePlatform = /Android\|webOS\|iPhone\|iPad\|iPod\|BlackBerry\|IEMobile\|Opera Mini/i\.test\(navigator\.userAgent\);\r?\n        return !isMobilePlatform && window\.innerWidth >= 768;\r?\n    \}\);\r?\n\r?\n    useEffect\(\(\) => \{\r?\n        if \(typeof window === "undefined"\) return;\r?\n        const handleResize = \(\) => \{\r?\n            const isMobilePlatform = /Android\|webOS\|iPhone\|iPad\|iPod\|BlackBerry\|IEMobile\|Opera Mini/i\.test\(navigator\.userAgent\);\r?\n            setIsDesktop\(!isMobilePlatform && window\.innerWidth >= 768\);\r?\n        \};\r?\n        handleResize\(\);\r?\n        window\.addEventListener\("resize", handleResize\);\r?\n        return \(\) => window\.removeEventListener\("resize", handleResize\);\r?\n    \}, \[\]\);\r?\n\r?\n    return isDesktop;\r?\n\}\r?\n=======\r?\nimport \{ getAutomationSettings, setAutomationSettings \} from "\.\./\.\./utils/autoblock";\r?\n>>>>>>> upstream/main', @'
import { interestViewsStore } from "../../services/interestViewsStore";
import { getLookingForOptions } from "./profile-option-builders";
import { getAutoBlockWhitelist, removeFromAutoBlockWhitelist } from "../../utils/privacy";
import { getAutomationSettings, setAutomationSettings } from "../../utils/autoblock";

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === "undefined") return false;
        const isMobilePlatform = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return !isMobilePlatform && window.innerWidth >= 768;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const isMobilePlatform = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setIsDesktop(!isMobilePlatform && window.innerWidth >= 768);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return isDesktop;
}
'@

# Conflict 2 (lines 48-119): state + handlers - keep HEAD's extensive state, drop upstream's simplified version
$autoContent = $autoContent -replace '(?s)<<<<<<< HEAD\r?\n    // --- AUTO REFRESH STATE ---\r?\n    const \[refreshEnabled.*?setForbiddenWords\(finalWordsString\);\r?\n\r?\n        window\.localStorage\.setItem\("fg-block-name".*?window\.localStorage\.setItem\("fg-autoblock-skip-after-two", String\(skipBlockAfterTwo\)\);\r?\n\r?\n        // Trigger immediate background scan with new rules\r?\n        window\.dispatchEvent\(new Event\("fg-trigger-inbox-scan"\)\);\r?\n\r?\n        toast\.success\(t\("settings_automation\.block_rules_updated", \{ defaultValue: "Block Rules Updated!" \}\)\);\r?\n    \};\r?\n\r?\n    const handleSaveRefresh.*?toast\.success\(t\("settings_automation\.refresh_settings_updated", \{ defaultValue: "Refresh Settings Updated!" \}\)\);\r?\n    \};(.*?)=======\r?\n\tconst \[blockOnChat.*?void setAutomationSettings\(\{ refreshInterval \}\);\r?\n\t\ttoast\.success\(t\("settings_automation\.refresh_settings_updated"\)\);\r?\n\t\};?\r?\n>>>>>>> upstream/main', @'
    // --- AUTO REFRESH STATE ---
    const [refreshEnabled, setRefreshEnabled] = useState(() => window.localStorage.getItem("fg-auto-refresh-enabled") === "true");
    const [refreshInterval, setRefreshInterval] = useState(() => window.localStorage.getItem("fg-auto-refresh-interval") || "5");

    // --- AUTO-BLOCK STATE ---
    const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") === "true");
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
    const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") ?? "18");
    const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") ?? "99");
    const [blockNoAge, setBlockNoAge] = useState(() => window.localStorage.getItem("fg-block-no-age") === "true");
    const [maxDistance, setMaxDistance] = useState(() => window.localStorage.getItem("fg-block-max-distance") ?? "50");
    const [isClearKeywordsConfirmOpen, setIsClearKeywordsConfirmOpen] = useState(false);
    const [isClearViewsConfirmOpen, setIsClearViewsConfirmOpen] = useState(false);

    // Keyword Targets
    const [blockName, setBlockName] = useState(() => window.localStorage.getItem("fg-block-name") !== "false");
    const [blockBio, setBlockBio] = useState(() => window.localStorage.getItem("fg-block-bio") !== "false");
    const [blockMessage, setBlockMessage] = useState(() => window.localStorage.getItem("fg-block-message") !== "false");
	
    // Bot Evasion & Background Scanner
    const [blockFirstMedia, setBlockFirstMedia] = useState(() => window.localStorage.getItem("fg-block-first-media") === "true");
    const [blockMediaDelayEnabled, setBlockMediaDelayEnabled] = useState(() => window.localStorage.getItem("fg-block-media-delay-enabled") === "true");
    const [blockMediaDelayMinutes, setBlockMediaDelayMinutes] = useState(() => window.localStorage.getItem("fg-block-media-delay-minutes") || "2");
    const [inboxScannerEnabled, setInboxScannerEnabled] = useState(() => window.localStorage.getItem("fg-inbox-scanner-enabled") === "true");
    const [skipBlockAfterTwo, setSkipBlockAfterTwo] = useState(() => window.localStorage.getItem("fg-autoblock-skip-after-two") === "true");

    const [whitelist, setWhitelist] = useState<{ profileId: string; displayName: string }[]>([]);
    useEffect(() => {
        setWhitelist(getAutoBlockWhitelist());
    }, []);

    // Grindr Tags Block State
    const [blockedLookingForMode, setBlockedLookingForMode] = useState(() => window.localStorage.getItem("fg-block-looking-for-mode") || "any");
    const [blockedLookingFor, setBlockedLookingFor] = useState<number[]>(() => {
        try {
            const saved = window.localStorage.getItem("fg-block-looking-for");
            return saved ? JSON.parse(saved) as number[] : [];
        } catch {
            return [];
        }
    });
'@

Set-Content -Path "src/pages/app/SettingsAutomationPage.tsx" -Value $autoContent -NoNewline -Encoding UTF8

Write-Host "All files resolved (partial). Now resolving remaining files..."
