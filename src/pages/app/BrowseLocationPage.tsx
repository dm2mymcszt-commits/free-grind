import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appLog } from "../../utils/logger";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash, decodeGeohash } from "../../utils/geohash";
import {
	geocodeResultSchema,
	type GeocodeResult,
	type SelectedLocation,
} from "./GridPage.types";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";

import { useApi } from "../../hooks/useApi";

// Helper to check if coordinates fall within the UK bounding box
// You can easily add more bounding boxes here later if you find other age-gated countries
// Helper to check if coordinates fall within restricted bounding boxes
const isAgeRestrictedRegion = (lat: number, lon: number) => {
	// UK Bounding Box (Approximate: covers England, Scotland, Wales, Northern Ireland)
	const inUK = lat >= 49.8 && lat <= 60.9 && lon >= -8.6 && lon <= 1.8;

	// Trigger the warning if they teleport to EITHER region
	return inUK
};

export function BrowseLocationPage() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { fetchRest } = useApi();
	const { setPreferences, geohash, locationName } = usePreferences();
	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [selectedLocation, setSelectedLocation] =
		useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

	// State for the Age Verification Warning Modal
	const [pendingRestrictedLocation, setPendingRestrictedLocation] = useState<{
		lat: number;
		lon: number;
		label?: string;
		isAuto?: boolean;
	} | null>(null);

	const initialCenter = (() => {
		if (geohash) {
			try {
				const decoded = decodeGeohash(geohash);
				return [
					(decoded.lat[0] + decoded.lat[1]) / 2,
					(decoded.lon[0] + decoded.lon[1]) / 2,
				] as [number, number];
			} catch {
				return undefined;
			}
		}
		return undefined;
	})();

	useEffect(() => {
		if (geohash && !selectedLocation) {
			try {
				const decoded = decodeGeohash(geohash);
				const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
				const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
				setSelectedLocation({
					lat,
					lon,
					label: locationName ?? t("browse_location.current_location_label"),
				});
			} catch (e) {
				appLog.error("Failed to decode geohash from preferences", e);
			}
		}
	}, [geohash, locationName, t]);

	// This is the ACTUAL function that saves the location
	const confirmLocationUpdate = async (
		lat: number,
		lon: number,
		label?: string,
		isAuto?: boolean,
	) => {
		const nextGeohash = encodeGeohash(lat, lon);
		const finalLabel =
			label ??
			t("browse_location.lat_lon_label", {
				lat: lat.toFixed(4),
				lon: lon.toFixed(4),
			});
		await setPreferences({
			geohash: nextGeohash,
			locationName: finalLabel,
			useAutoLocation: isAuto ?? false,
		});
		setSelectedLocation({
			lat,
			lon,
			label: finalLabel,
		});
		setMapPickerError(null);
		setLocationError(null);
		setPendingRestrictedLocation(null);
		navigate("/");
	};

	// We intercept the location update request here!
	const requestLocationUpdate = (
		lat: number,
		lon: number,
		label?: string,
		isAuto?: boolean,
	) => {
		if (isAgeRestrictedRegion(lat, lon)) {
			// Halt and show warning modal
			setPendingRestrictedLocation({ lat, lon, label, isAuto });
		} else {
			// Proceed normally
			void confirmLocationUpdate(lat, lon, label, isAuto);
		}
	};

	const handleUseCurrentLocation = async () => {
		if (!("geolocation" in navigator)) {
			setLocationError(t("browse_location.error_geolocation"));
			return;
		}

		setIsDetectingLocation(true);

		try {
			const position = await new Promise<GeolocationPosition>(
				(resolve, reject) => {
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						timeout: 12000,
						maximumAge: 20000,
					});
				},
			);

			requestLocationUpdate(
				position.coords.latitude,
				position.coords.longitude,
				t("browse_location.current_location_label"),
				true,
			);
		} catch {
			setLocationError(t("browse_location.error_access"));
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const performSearch = async (query: string) => {
		if (!query || query === lastSearchedQuery) {
			setIsSearchingLocation(false);
			return;
		}

		setLastSearchedQuery(query);
		setIsSearchingLocation(true);

		try {
			const response = await fetchRest(
				`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
					query,
				)}`,
				{
					method: "GET",
				},
			);

			const parsed = z.array(geocodeResultSchema).parse(await response.json());
			setLocationResults(parsed);
			setLocationError(null);
		} catch {
			setLocationError(t("browse_location.error_search_failed"));
		} finally {
			setIsSearchingLocation(false);
		}
	};

	useEffect(() => {
		const query = locationQuery.trim();

		if (query.length < 3) {
			setLocationResults([]);
			setIsSearchingLocation(false);
			setLastSearchedQuery("");
			return;
		}

		const timer = setTimeout(() => {
			void performSearch(query);
		}, 800);

		return () => {
			clearTimeout(timer);
		};
	}, [locationQuery]);

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-4 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate("/")}
						className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
						aria-label={t("browse_location.back_aria")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div>
						<h1 className="app-title">{t("browse_location.title")}</h1>
						<p className="app-subtitle">{t("browse_location.subtitle")}</p>
					</div>
				</header>

				{locationError ? (
					<p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
						{locationError}
					</p>
				) : null}

				<LocationSettingsPanel
					isVisible={true}
					isDetectingLocation={isDetectingLocation}
					onUseCurrentLocation={() => {
						void handleUseCurrentLocation();
					}}
					locationQuery={locationQuery}
					onLocationQueryChange={setLocationQuery}
					isSearchingLocation={isSearchingLocation}
					locationResults={locationResults}
					onChooseLocation={(lat, lon, label) => {
						requestLocationUpdate(lat, lon, label);
					}}
					selectedLocation={selectedLocation}
					isMapPickerOpen={isMapPickerOpen}
					mapPickerError={mapPickerError}
					onToggleMapPicker={() => {
						setMapPickerError(null);
						setIsMapPickerOpen((current) => !current);
					}}
					onMapPick={(lat, lon) => {
						setSelectedLocation({
							lat,
							lon,
							label: t("browse_location.lat_lon_label", {
								lat: lat.toFixed(4),
								lon: lon.toFixed(4),
							}),
						});
					}}
					onMapPickerError={setMapPickerError}
					onUseSelectedLocation={() => {
						if (!selectedLocation) {
							return;
						}
						requestLocationUpdate(
							selectedLocation.lat,
							selectedLocation.lon,
							selectedLocation.label,
						);
					}}
					initialCenter={initialCenter}
				/>
			</div>

			{/* AGE VERIFICATION WARNING MODAL */}
			{pendingRestrictedLocation && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
					<div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
						<div className="mb-4 flex items-center gap-3 text-amber-500">
							<AlertTriangle className="h-8 w-8" />
							<h2 className="text-lg font-bold">
								{t("browse_location.age_verification_title", "Age Verification Area")}
							</h2>
						</div>
						<p className="mb-6 text-sm leading-relaxed text-[var(--text-muted)]">
							{t(
								"browse_location.age_verification_desc",
								"You are about to teleport to a region (UK/EU) that strictly requires Grindr Age Verification. If your account is not verified, you may get soft-locked and forced to verify on the official app before you can use Free Grind again."
							)}
						</p>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setPendingRestrictedLocation(null)}
								className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-3)]"
							>
								{t("browse_location.cancel", "Cancel")}
							</button>
							<button
								type="button"
								onClick={() =>
									confirmLocationUpdate(
										pendingRestrictedLocation.lat,
										pendingRestrictedLocation.lon,
										pendingRestrictedLocation.label,
										pendingRestrictedLocation.isAuto,
									)
								}
								className="btn-accent rounded-xl px-4 py-2 text-sm font-semibold"
							>
								{t("browse_location.teleport_anyway", "Teleport Anyway")}
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}