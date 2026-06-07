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

export type SavedLocation = {
    id: string;
    lat: number;
    lon: number;
    label: string;
};

const isAgeRestrictedRegion = (lat: number, lon: number) => {
    const inUK = lat >= 49.8 && lat <= 60.9 && lon >= -8.6 && lon <= 1.8;
    return inUK;
};

export function BrowseLocationPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { setPreferences, geohash, locationName } = usePreferences();
	
    const [isDetectingLocation, setIsDetectingLocation] = useState(false);
    const [locationQuery, setLocationQuery] = useState("");
    const [isSearchingLocation, setIsSearchingLocation] = useState(false);
    const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [mapPickerError, setMapPickerError] = useState<string | null>(null);
    const [lastSearchedQuery, setLastSearchedQuery] = useState("");
    const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    // --- GLOBAL MODE STATE ---
    const [mode, setMode] = useState<"static" | "dynamic">(() => {
        return (window.localStorage.getItem("fg-location-mode") as "static" | "dynamic") || "static";
    });

    // --- LOCATION ENGINE STATE ---
    const [bookmarks, setBookmarks] = useState<SavedLocation[]>(() => {
        const val = window.localStorage.getItem("fg-location-bookmarks");
        return val ? JSON.parse(val) as SavedLocation[] : [];
    });
    const [queue, setQueue] = useState<SavedLocation[]>(() => {
        const val = window.localStorage.getItem("fg-location-queue");
        return val ? JSON.parse(val) as SavedLocation[] : [];
    });
    const [queueInterval, setQueueInterval] = useState(() => {
        return Number(window.localStorage.getItem("fg-location-queue-interval") || "10");
    });
    const [queueIndex, setQueueIndex] = useState(() => {
        return Number(window.localStorage.getItem("fg-location-queue-index") || "0");
    });
    const [queueTimestamp, setQueueTimestamp] = useState(() => {
        const stored = window.localStorage.getItem("fg-location-queue-timestamp");
        if (stored) return Number(stored);
        const now = Date.now();
        window.localStorage.setItem("fg-location-queue-timestamp", String(now));
        return now;
    });

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
            } catch { return undefined; }
        }
        return undefined;
    })();

    // --- ENGINE MUTATORS ---
    const updateMode = (newMode: "static" | "dynamic") => {
        setMode(newMode);
        window.localStorage.setItem("fg-location-mode", newMode);

        if (newMode === "dynamic") {
            const now = Date.now();
            setQueueTimestamp(now);
            window.localStorage.setItem("fg-location-queue-timestamp", String(now));
            window.dispatchEvent(new Event("fg-engine-tick"));
        }
    };

    const updateBookmarks = (newBookmarks: SavedLocation[]) => {
        setBookmarks(newBookmarks);
        window.localStorage.setItem("fg-location-bookmarks", JSON.stringify(newBookmarks));
    };

    const updateQueue = (newQueue: SavedLocation[]) => {
        setQueue(newQueue);
        window.localStorage.setItem("fg-location-queue", JSON.stringify(newQueue));
        if (newQueue.length > 1 && queue.length <= 1) {
            const now = Date.now();
            setQueueIndex(0);
            setQueueTimestamp(now);
            window.localStorage.setItem("fg-location-queue-index", "0");
            window.localStorage.setItem("fg-location-queue-timestamp", String(now));
        }
    };

    const updateInterval = (interval: number) => {
        setQueueInterval(interval);
        window.localStorage.setItem("fg-location-queue-interval", String(interval));
    };

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
            } catch (e) { appLog.error("Failed to decode geohash from preferences", e); }
        }
    }, [geohash, locationName, t]);

    const confirmLocationUpdate = async (
        lat: number,
        lon: number,
        label?: string,
        isAuto?: boolean,
    ) => {
        const nextGeohash = encodeGeohash(lat, lon);
        const finalLabel = label ?? t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		
        await setPreferences({
            geohash: nextGeohash,
            locationName: finalLabel,
            useAutoLocation: isAuto ?? false,
        });
		
        setSelectedLocation({ lat, lon, label: finalLabel });
        setMapPickerError(null);
        setLocationError(null);
        setPendingRestrictedLocation(null);
        navigate("/");
    };

    const requestLocationUpdate = (
        lat: number,
        lon: number,
        label?: string,
        isAuto?: boolean,
    ) => {
        // CRITICAL FIX: If the user manually teleports, ALWAYS FORCE STATIC MODE 
        // to instantly kill the background dynamic queue.
        updateMode("static");

        if (isAgeRestrictedRegion(lat, lon)) {
            setPendingRestrictedLocation({ lat, lon, label, isAuto });
        } else {
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
                        enableHighAccuracy: true, timeout: 12000, maximumAge: 20000,
                    });
                },
            );
            setSelectedLocation({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                label: t("browse_location.current_location_label", { defaultValue: "My GPS Location" })
            });
        } catch (e) {
            appLog.error("Geolocation failed", e);
            setLocationError(t("browse_location.error_access"));
        } finally {
            setIsDetectingLocation(false);
        }
    };

    const performSearch = async (query: string, signal?: AbortSignal) => {
        if (!query || query === lastSearchedQuery) {
            setIsSearchingLocation(false);
            return;
        }
        setLastSearchedQuery(query);
        setIsSearchingLocation(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
                { signal, headers: { "User-Agent": "Mozilla/5.0 FreeGrindLocationEngine/1.0" } },
            );
            if (!response.ok) throw new Error("Failed to search location");
            const parsed = z.array(geocodeResultSchema).parse(await response.json());
            setLocationResults(parsed);
            setLocationError(null);
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return;
            appLog.error("Location search failed", e);
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
        const controller = new AbortController();
        const timer = setTimeout(() => { void performSearch(query, controller.signal); }, 800);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [locationQuery]);

    useEffect(() => {
        const handleEngineUpdate = () => {
            const storedIndex = window.localStorage.getItem("fg-location-queue-index");
            const storedTimestamp = window.localStorage.getItem("fg-location-queue-timestamp");
            if (storedIndex) setQueueIndex(Number(storedIndex));
            if (storedTimestamp) setQueueTimestamp(Number(storedTimestamp));
        };
        window.addEventListener("fg-engine-tick", handleEngineUpdate);
        return () => window.removeEventListener("fg-engine-tick", handleEngineUpdate);
    }, []);

    return (
        <section className="app-screen bg-transparent">
            <div className="mx-auto w-full max-w-4xl pt-[calc(env(safe-area-inset-top,0px)+16px)] px-3 pb-24">
                <header className="mb-6 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-[30px] transition-all hover:scale-105 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95"
                        aria-label={t("browse_location.back_aria")}
                    >
                        <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-[var(--text)] drop-shadow-md">Location Engine</h1>
                        <p className="text-sm font-semibold text-[var(--text-muted)]">Static Teleport & Dynamic Spoofing Queue</p>
                    </div>
                </header>

                {locationError ? (
                    <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 backdrop-blur-md">
                        {locationError}
                    </p>
                ) : null}

                <LocationSettingsPanel
                    mode={mode}
                    onModeChange={updateMode}
					
                    isDetectingLocation={isDetectingLocation}
                    onUseCurrentLocation={() => void handleUseCurrentLocation()}
                    locationQuery={locationQuery}
                    onLocationQueryChange={setLocationQuery}
                    isSearchingLocation={isSearchingLocation}
                    locationResults={locationResults}
					
                    onStageLocation={(lat, lon, label) => setSelectedLocation({ lat, lon, label })}
                    selectedLocation={selectedLocation}
					
                    isMapPickerOpen={isMapPickerOpen}
                    mapPickerError={mapPickerError}
                    onToggleMapPicker={() => {
                        setMapPickerError(null);
                        setIsMapPickerOpen((current) => !current);
                    }}
                    onMapPick={(lat, lon) => {
                        setSelectedLocation({ lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
                    }}
                    onMapPickerError={setMapPickerError}
					
                    onTeleport={(lat, lon, label) => requestLocationUpdate(lat, lon, label)}
					
                    initialCenter={initialCenter}
                    bookmarks={bookmarks}
                    queue={queue}
                    queueInterval={queueInterval}
                    queueIndex={queueIndex}
                    queueTimestamp={queueTimestamp}
					
                    onAddBookmark={(loc) => updateBookmarks([...bookmarks, loc])}
                    onDeleteBookmark={(id) => updateBookmarks(bookmarks.filter(b => b.id !== id))}
                    onAddQueue={(loc) => updateQueue([...queue, loc])}
                    onDeleteQueue={(id) => updateQueue(queue.filter(q => q.id !== id))}
                    onClearQueue={() => updateQueue([])}
                    onChangeInterval={updateInterval}
                />
            </div>

            {pendingRestrictedLocation && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[20px] animate-in fade-in duration-300">
                    <div className="w-full max-w-sm rounded-[2rem] border border-amber-500/30 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-6 shadow-[0_20px_60px_rgba(245,158,11,0.2),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px]">
                        <div className="mb-4 flex items-center gap-3 text-amber-500">
                            <AlertTriangle className="h-8 w-8 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
                            <h2 className="text-lg font-bold">Age Verification Area</h2>
                        </div>
                        <p className="mb-6 text-sm leading-relaxed text-[var(--text-muted)]">
                            You are about to teleport to a region (UK/EU) that strictly requires Grindr Age Verification. If your account is not verified, you may get soft-locked and forced to verify on the official app before you can use Free Grind again.
                        </p>
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setPendingRestrictedLocation(null)}
                                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)] active:scale-95"
                            >
                                Cancel
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
                                className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 text-sm font-bold text-white shadow-[0_0_15px_rgba(245,158,11,0.4)] transition hover:brightness-110 active:scale-95"
                            >
                                Teleport Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}