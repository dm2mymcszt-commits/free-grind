import { Bell, Check, ChevronRight, Loader2, MapPin, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "../services/tauriWebSocket";
import { getCurrentLocation } from "../services/currentLocation";
import { appLog } from "../utils/logger";
import { markOnboardingComplete } from "../utils/onboardingStorage";
import { Button } from "./ui/button";
import { LoadingScreen } from "./LoadingScreen";
import logo from "../images/freegrind-logo.webp";

type PermissionStatus = "idle" | "granted" | "denied" | "unavailable";

const MIN_LOADING_MS = 1100;

// DOMException names getUserMedia/geolocation actually throw — distinguishes
// "the user/OS said no" from "there's no device to ask about" so the UI
// doesn't tell someone without a microphone that access was "Blocked".
//
// WebKitGTK doesn't follow the spec names here: with zero audio devices it
// can't satisfy even the trivial `audio: true` constraint, so it throws a
// constraint error ("invalid constraint") instead of NotFoundError — the
// message is matched as a fallback to still classify that as "no device".
function classifyMediaError(error: unknown): { status: PermissionStatus; detail: string } {
	const name = error instanceof DOMException ? error.name : null;
	const message = error instanceof Error ? error.message : String(error);
	const lowerMessage = message.toLowerCase();

	if (
		name === "NotFoundError" ||
		name === "OverconstrainedError" ||
		name === "ConstraintNotSatisfiedError" ||
		lowerMessage.includes("constraint") ||
		lowerMessage.includes("no device")
	) {
		return { status: "unavailable", detail: "No microphone found on this device." };
	}
	if (name === "NotReadableError") {
		return { status: "unavailable", detail: "Microphone is in use by another app." };
	}
	if (name === "NotAllowedError" || name === "SecurityError") {
		return { status: "denied", detail: "Permission denied." };
	}

	return { status: "denied", detail: message || "Couldn't access the microphone." };
}

function PermissionRow({
	icon: Icon,
	title,
	description,
	status,
	detail,
	isRequesting,
	onRequest,
}: {
	icon: typeof Bell;
	title: string;
	description: string;
	status: PermissionStatus;
	detail?: string | null;
	isRequesting?: boolean;
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
				{detail && (status === "denied" || status === "unavailable") && (
					<p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{detail}</p>
				)}
			</div>
			{isRequesting ? (
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
					<Loader2 className="h-4 w-4 animate-spin text-[var(--accent-contrast)]" />
				</div>
			) : status === "granted" ? (
				<div className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-green-500 px-3 text-sm font-semibold text-white">
					<Check className="h-4 w-4" />
					Granted
				</div>
			) : status === "denied" ? (
				<div className="flex h-9 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-muted)]">
					Blocked
				</div>
			) : status === "unavailable" ? (
				<div className="flex h-9 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-muted)]">
					Unavailable
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
	const [microphoneStatus, setMicrophoneStatus] = useState<PermissionStatus>("idle");
	const [microphoneDetail, setMicrophoneDetail] = useState<string | null>(null);
	const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
	const [isRequestingLocation, setIsRequestingLocation] = useState(false);
	const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);

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

			// Permissions.query() reads the current state without prompting —
			// supported by both WebKitGTK and WebView2's embedded geolocation.
			try {
				const status = await navigator.permissions?.query({ name: "geolocation" });
				if (status?.state === "granted") {
					setLocationStatus("granted");
				}
			} catch (error) {
				appLog.warn("[Onboarding] Failed to read location permission", error);
			}

			try {
				const status = await navigator.permissions?.query({ name: "microphone" });
				if (status?.state === "granted") {
					setMicrophoneStatus("granted");
				}
			} catch (error) {
				appLog.warn("[Onboarding] Failed to read microphone permission", error);
			}
		})();
	}, [step]);

	const requestNotifications = async () => {
		if (!isTauriRuntime()) {
			setNotificationStatus("granted");
			return;
		}

		setIsRequestingNotifications(true);
		try {
			const result = await requestPermission();
			setNotificationStatus(result === "granted" ? "granted" : "denied");
		} catch (error) {
			appLog.warn("[Onboarding] Failed to request notification permission", error);
			setNotificationStatus("denied");
		} finally {
			setIsRequestingNotifications(false);
		}
	};

	const requestLocation = async () => {
		setIsRequestingLocation(true);
		try {
			await getCurrentLocation();
			setLocationStatus("granted");
		} catch (error) {
			appLog.warn("[Onboarding] Failed to request location permission", error);
			setLocationStatus("denied");
		} finally {
			setIsRequestingLocation(false);
		}
	};

	const requestMicrophone = async () => {
		setIsRequestingMicrophone(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach((track) => track.stop());
			setMicrophoneStatus("granted");
			setMicrophoneDetail(null);
		} catch (error) {
			appLog.warn("[Onboarding] Failed to request microphone permission", error);
			const { status, detail } = classifyMediaError(error);
			setMicrophoneStatus(status);
			setMicrophoneDetail(detail);
		} finally {
			setIsRequestingMicrophone(false);
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
				<div className="bg-[var(--surface-2)] p-8 text-center">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] shadow-sm">
						<img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain" />
					</div>
					<h2 className="text-2xl font-bold tracking-tight text-[var(--text)]">Welcome to Free Grind</h2>
					<p className="mt-1 text-sm text-[var(--text-muted)]">
						A couple of permissions help everything run smoothly.
					</p>
				</div>

				<div className="space-y-3 p-8 pb-10">
					<PermissionRow
						icon={Bell}
						title="Notifications"
						description="Get push notifications for new messages and activity."
						status={notificationStatus}
						isRequesting={isRequestingNotifications}
						onRequest={requestNotifications}
					/>
					<PermissionRow
						icon={MapPin}
						title="Location"
						description="Find profiles near you and see yourself on the map."
						status={locationStatus}
						isRequesting={isRequestingLocation}
						onRequest={requestLocation}
					/>
					<PermissionRow
						icon={Mic}
						title="Microphone"
						description="Record and send voice messages in chat."
						status={microphoneStatus}
						detail={microphoneDetail}
						isRequesting={isRequestingMicrophone}
						onRequest={requestMicrophone}
					/>

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
