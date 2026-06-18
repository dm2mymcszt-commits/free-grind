import { appLog } from "./logger";

export async function getCurrentLocationPosition(options?: PositionOptions): Promise<{ latitude: number; longitude: number }> {
	try {
		const tauriGeo = await import("@tauri-apps/plugin-geolocation").catch(() => null);
		if (tauriGeo) {
			let perms = await tauriGeo.checkPermissions();
			if (perms.location !== "granted" && perms.location !== "denied") {
				perms = await tauriGeo.requestPermissions(["location"]);
			}
			if (perms.location === "granted") {
				const pos = await tauriGeo.getCurrentPosition({
					enableHighAccuracy: options?.enableHighAccuracy ?? true,
					timeout: options?.timeout ?? 15000,
					maximumAge: options?.maximumAge ?? 10000,
				});
				appLog.info("[geolocation] obtained position via Tauri plugin", {
					lat: pos.coords.latitude,
					lon: pos.coords.longitude
				});
				return {
					latitude: pos.coords.latitude,
					longitude: pos.coords.longitude,
				};
			}
		}
	} catch (err) {
		appLog.error("[geolocation] Tauri plugin geolocation failed", err);
	}

	// Fallback to standard web Geolocation API
	if (typeof navigator !== "undefined" && "geolocation" in navigator) {
		return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					appLog.info("[geolocation] obtained position via navigator fallback", {
						lat: pos.coords.latitude,
						lon: pos.coords.longitude
					});
					resolve({
						latitude: pos.coords.latitude,
						longitude: pos.coords.longitude,
					});
				},
				(err) => {
					appLog.error("[geolocation] navigator fallback failed", err);
					reject(err);
				},
				options
			);
		});
	}

	throw new Error("Geolocation is not supported by this platform.");
}
