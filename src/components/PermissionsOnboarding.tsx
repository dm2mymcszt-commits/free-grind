import { Bell, Check, ChevronRight, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import {
	checkPermissions as checkGeoPermissions,
	requestPermissions as requestGeoPermissions,
} from "@tauri-apps/plugin-geolocation";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { appLog } from "../utils/logger";
import { markOnboardingComplete } from "../utils/onboardingStorage";
import { Button } from "./ui/button";
import { LoadingScreen } from "./LoadingScreen";
import logo from "../images/freegrind-logo.webp";

type PermissionStatus = "idle" | "granted" | "denied";

const MIN_LOADING_MS = 1100;

function PermissionRow({
	icon: Icon,
	title,
	description,
	status,
	onRequest,
}: {
	icon: typeof Bell;
	title: string;
	description: string;
	status: PermissionStatus;
	onRequest: () => void;
}) {
	return (
		<div className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
			<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--accent)]">
				<Icon className="h-5 w-5" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-semibold text-[var(--text)]">{title}</p>
				<p className="mt-0.5 text-sm leading-relaxed text-[var(--text-muted)]">
					{description}
				</p>
			</div>
			{status === "granted" ? (
				<div className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-green-500 px-3 text-sm font-semibold text-white">
					<Check className="h-4 w-4" />
					Granted
				</div>
			) : status === "denied" ? (
				<div className="flex h-9 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-muted)]">
					Blocked
				</div>
			) : (
				<button
					type="button"
					onClick={onRequest}
					className="h-9 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
				>
					Allow
				</button>
			)}
		</div>
	);
}

export function PermissionsOnboarding({ onComplete }: { onComplete: () => void }) {
	const [step, setStep] = useState<"loading" | "permissions">("loading");
	const [notificationStatus, setNotificationStatus] =
		useState<PermissionStatus>("idle");
	const [locationStatus, setLocationStatus] = useState<PermissionStatus>("idle");
	// the geolocation plugin has no real desktop backend (Linux/Windows/macOS) —
	// it always reports a non-granted permission state there, so only mobile
	// platforms get a usable Location row
	const [isLocationSupported, setIsLocationSupported] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setStep("permissions"), MIN_LOADING_MS);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (step !== "permissions" || !isTauriRuntime()) {
			return;
		}

		(async () => {
			try {
				const granted = await isPermissionGranted();
				setNotificationStatus(granted ? "granted" : "idle");
			} catch (error) {
				appLog.warn("[Onboarding] Failed to read notification permission", error);
			}

			let mobile = false;
			try {
				mobile = platform() === "ios" || platform() === "android";
			} catch (error) {
				appLog.warn("[Onboarding] Failed to read platform", error);
			}
			setIsLocationSupported(mobile);

			if (!mobile) {
				return;
			}

			try {
				const perms = await checkGeoPermissions();
				setLocationStatus(perms.location === "granted" ? "granted" : "idle");
			} catch (error) {
				appLog.warn("[Onboarding] Failed to read location permission", error);
			}
		})();
	}, [step]);

	const requestNotifications = async () => {
		if (!isTauriRuntime()) {
			setNotificationStatus("granted");
			return;
		}

		try {
			const result = await requestPermission();
			setNotificationStatus(result === "granted" ? "granted" : "denied");
		} catch (error) {
			appLog.warn("[Onboarding] Failed to request notification permission", error);
			setNotificationStatus("denied");
		}
	};

	const requestLocation = async () => {
		if (!isTauriRuntime()) {
			setLocationStatus("granted");
			return;
		}

		try {
			const perms = await requestGeoPermissions(["location"]);
			setLocationStatus(perms.location === "granted" ? "granted" : "denied");
		} catch (error) {
			appLog.warn("[Onboarding] Failed to request location permission", error);
			setLocationStatus("denied");
		}
	};

	const handleContinue = () => {
		markOnboardingComplete();
		onComplete();
	};

	if (step === "loading") {
		return <LoadingScreen />;
	}

	return (
		<div
			className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[var(--bg)] p-4 no-touch-callout"
			style={{
				paddingTop: "max(16px, env(safe-area-inset-top))",
				paddingBottom: "max(16px, env(safe-area-inset-bottom))",
			}}
		>
			<div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl animate-modal-in">
				<div className="bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent)_80%,black)] p-8 text-center text-white">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] shadow-xl">
						<img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain" />
					</div>
					<h2 className="text-2xl font-bold tracking-tight">Welcome to Free Grind</h2>
					<p className="mt-1 text-sm text-white/80">
						A couple of permissions help everything run smoothly.
					</p>
				</div>

				<div className="space-y-3 p-8 pb-10">
					<PermissionRow
						icon={Bell}
						title="Notifications"
						description="Get push notifications for new messages and activity."
						status={notificationStatus}
						onRequest={requestNotifications}
					/>
					{isLocationSupported && (
						<PermissionRow
							icon={MapPin}
							title="Location"
							description="Find profiles near you and see yourself on the map."
							status={locationStatus}
							onRequest={requestLocation}
						/>
					)}

					<div className="pt-3">
						<Button
							variant="primary"
							className="w-full py-4 text-base font-bold rounded-2xl shadow-lg shadow-[var(--accent)]/20 !text-white"
							onClick={handleContinue}
							rightIcon={<ChevronRight className="h-4 w-4" />}
						>
							Get Started
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
