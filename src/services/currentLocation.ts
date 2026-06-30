import z from "zod";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

export class LocationAccessError extends Error {}

export type CurrentLocationResult = {
	lat: number;
	lon: number;
	// false when resolved via IP-based approximation rather than a real GPS/network fix
	isPrecise: boolean;
};

const ipGeolocationSchema = z.object({
	latitude: z.number(),
	longitude: z.number(),
});

async function getIpBasedLocation(): Promise<CurrentLocationResult> {
	const response = await fetch("https://ipapi.co/json/");
	if (!response.ok) {
		throw new LocationAccessError("IP-based location lookup failed");
	}

	const data = ipGeolocationSchema.parse(await response.json());
	return { lat: data.latitude, lon: data.longitude, isPrecise: false };
}

async function isMobilePlatform(): Promise<boolean> {
	try {
		const current = platform();
		return current === "ios" || current === "android";
	} catch (error) {
		appLog.warn("[current-location] Failed to read platform", error);
		return false;
	}
}

/**
 * The Tauri geolocation plugin only has a real backend on iOS/Android — on
 * desktop (Linux/Windows/macOS) it's a stub that always reports a
 * non-granted permission and a (0, 0) position, so "use current location"
 * would otherwise fail there every time. Desktop builds fall back to an
 * IP-based approximate location instead, the same approach most desktop
 * apps use since there's no GPS to query.
 */
export async function getCurrentLocation(): Promise<CurrentLocationResult> {
	if (isTauriRuntime()) {
		if (!(await isMobilePlatform())) {
			return getIpBasedLocation();
		}

		const tauriGeo = await import("@tauri-apps/plugin-geolocation");
		let permissions = await tauriGeo.checkPermissions();
		if (permissions.location !== "granted" && permissions.location !== "denied") {
			permissions = await tauriGeo.requestPermissions(["location"]);
		}
		if (permissions.location !== "granted") {
			throw new LocationAccessError("Location permission denied");
		}

		const position = await tauriGeo.getCurrentPosition({
			enableHighAccuracy: true,
			timeout: 12000,
			maximumAge: 20000,
		});
		return { lat: position.coords.latitude, lon: position.coords.longitude, isPrecise: true };
	}

	if ("geolocation" in navigator) {
		const position = await new Promise<GeolocationPosition>((resolve, reject) =>
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 12000,
				maximumAge: 20000,
			}),
		);
		return { lat: position.coords.latitude, lon: position.coords.longitude, isPrecise: true };
	}

	return getIpBasedLocation();
}
