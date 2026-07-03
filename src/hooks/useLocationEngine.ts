import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { encodeGeohash } from "../utils/geohash";
import { usePreferences } from "../contexts/PreferencesContext";
import type { SavedLocation } from "../pages/app/BrowseLocationPage";

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function interpolateCoord(lat1: number, lon1: number, lat2: number, lon2: number, fraction: number) {
    return { lat: lat1 + (lat2 - lat1) * fraction, lon: lon1 + (lon2 - lon1) * fraction };
}

let globalEngineTicker: number | null = null;

function shuffleQueue(array: SavedLocation[], avoidFirstId?: string): SavedLocation[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (avoidFirstId && shuffled.length > 1 && shuffled[0].id === avoidFirstId) {
        const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }
    return shuffled;
}

export function useLocationEngine() {
    const { setPreferences } = usePreferences();
    const setPrefRef = useRef(setPreferences);
    
    useEffect(() => { setPrefRef.current = setPreferences; }, [setPreferences]);

    useEffect(() => {
        if (globalEngineTicker) {
            window.clearInterval(globalEngineTicker);
            globalEngineTicker = null;
        }

        const checkEngine = () => {
            try {
                const mode = window.localStorage.getItem("fg-location-mode");

                // ============================================
                // ENGINE 1: DYNAMIC QUEUE (Teleports)
                // ============================================
                if (mode === "dynamic") {
                    const storedQueue = window.localStorage.getItem("fg-location-queue");
                    if (!storedQueue) return;
                    const queue = JSON.parse(storedQueue) as SavedLocation[];
                    if (!queue || queue.length <= 1) return;

                    const currentIndex = Number(window.localStorage.getItem("fg-location-queue-index") || "0");
                    const currentLoc = queue[currentIndex];

                    // Check for tiered dwell times
                    const isTiered = window.localStorage.getItem("fg-location-use-tiered-dwell") === "true";
                    let intervalMinutes = Number(window.localStorage.getItem("fg-location-queue-interval") || "10");

                    if (isTiered && currentLoc && currentLoc.tier) {
                        if (currentLoc.tier === "metropolis") {
                            intervalMinutes = Number(window.localStorage.getItem("fg-location-dwell-metropolis") || "1440");
                        } else if (currentLoc.tier === "medium") {
                            intervalMinutes = Number(window.localStorage.getItem("fg-location-dwell-medium") || "180");
                        } else if (currentLoc.tier === "small") {
                            intervalMinutes = Number(window.localStorage.getItem("fg-location-dwell-small") || "60");
                        }
                    }

                    const timestampStr = window.localStorage.getItem("fg-location-queue-timestamp");
                    
                    if (!timestampStr) {
                        window.localStorage.setItem("fg-location-queue-timestamp", String(Date.now()));
                        return;
                    }

                    const timePassed = Date.now() - Number(timestampStr);
                    const timeRequired = intervalMinutes * 60 * 1000;

                    if (timePassed >= timeRequired) {
                        let nextIndex = (currentIndex + 1) % queue.length;
                        let updatedQueue = queue;

                        const dynamicMode = window.localStorage.getItem("fg-location-dynamic-mode") || "manual";
                        const dynamicStrategy = window.localStorage.getItem("fg-location-dynamic-strategy") || "random";

                        // Shuffling on wrap-around if in randomized country travel mode
                        if (nextIndex === 0 && dynamicMode === "country" && dynamicStrategy === "random") {
                            const lastLocId = queue[currentIndex]?.id;
                            updatedQueue = shuffleQueue(queue, lastLocId);
                            window.localStorage.setItem("fg-location-queue", JSON.stringify(updatedQueue));
                        }

                        const nextLoc = updatedQueue[nextIndex];
                        const nextGeohash = encodeGeohash(nextLoc.lat, nextLoc.lon);

                        void setPrefRef.current({ geohash: nextGeohash, locationName: nextLoc.label });
                        window.localStorage.setItem("fg-location-queue-index", String(nextIndex));
                        window.localStorage.setItem("fg-location-queue-timestamp", String(Date.now()));

                        toast(`Dynamic Spoof: Teleported to ${nextLoc.label}`, {
                            icon: "🌍",
                            style: { borderRadius: '16px', background: 'rgba(15, 17, 21, 0.95)', color: '#fff', backdropFilter: 'blur(20px)', border: '1px solid var(--accent)' },
                        });

                        window.dispatchEvent(new CustomEvent("fg-engine-tick", { detail: { lat: nextLoc.lat, lon: nextLoc.lon, label: nextLoc.label } }));
                    }
                }

                // ============================================
                // ENGINE 2: ROUTE SIMULATION (Movement)
                // ============================================
                if (mode === "route") {
                    const isActive = window.localStorage.getItem("fg-route-active") === "true";
                    if (!isActive) return;

                    const polylineStr = window.localStorage.getItem("fg-route-polyline");
                    if (!polylineStr) return;
                    const polyline = JSON.parse(polylineStr) as {lat: number, lon: number}[];
                    if (polyline.length < 2) return;

                    const speedKmh = Number(window.localStorage.getItem("fg-route-speed") || "60");
                    const speedMs = speedKmh * (1000 / 3600);
                    
                    const lastTick = Number(window.localStorage.getItem("fg-route-last-tick") || Date.now());
                    const currentProgressMeters = Number(window.localStorage.getItem("fg-route-progress") || "0");
                    
                    const now = Date.now();
                    const deltaSeconds = (now - lastTick) / 1000;
                    if (deltaSeconds <= 0) return; 
                    
                    const newProgressMeters = currentProgressMeters + (speedMs * deltaSeconds);
                    
                    // Pre-calculate exact distance of the entire road
                    let totalDistance = 0;
                    const segments: number[] = [];
                    for (let i = 0; i < polyline.length - 1; i++) {
                        const d = getDistanceMeters(polyline[i].lat, polyline[i].lon, polyline[i+1].lat, polyline[i+1].lon);
                        totalDistance += d;
                        segments.push(d);
                    }

                    let currentPos = polyline[0];
                    let reachedDestination = false;

                    // If we drove past the end of the road, we arrived!
                    if (newProgressMeters >= totalDistance) {
                        reachedDestination = true;
                    } else {
                        let distanceAccumulator = 0;
                        for (let i = 0; i < polyline.length - 1; i++) {
                            if (distanceAccumulator + segments[i] >= newProgressMeters) {
                                const remainingDist = newProgressMeters - distanceAccumulator;
                                const fraction = segments[i] === 0 ? 0 : remainingDist / segments[i];
                                currentPos = interpolateCoord(polyline[i].lat, polyline[i].lon, polyline[i+1].lat, polyline[i+1].lon, fraction);
                                break;
                            }
                            distanceAccumulator += segments[i];
                        }
                    }

                    if (reachedDestination) {
                        // WE ARRIVED! Pull the exact Red Waypoint data
                        const waypointsStr = window.localStorage.getItem("fg-route-waypoints");
                        let finalLabel = "Destination Reached";
                        let finalLat = currentPos.lat;
                        let finalLon = currentPos.lon;

                        if (waypointsStr) {
                            const waypoints = JSON.parse(waypointsStr) as SavedLocation[];
                            if (waypoints.length > 0) {
                                const finalWp = waypoints[waypoints.length - 1];
                                finalLabel = finalWp.label;
                                finalLat = finalWp.lat;
                                finalLon = finalWp.lon;
                            }
                        }

                        // Teleport exactly to the red dot
                        const finalGeohash = encodeGeohash(finalLat, finalLon);
                        void setPrefRef.current({ geohash: finalGeohash, locationName: finalLabel });
                        
                        // Clean up the engine and stop the simulation
                        window.localStorage.setItem("fg-route-active", "false");
                        window.localStorage.setItem("fg-route-progress", "0");
                        window.localStorage.removeItem("fg-route-polyline");
                        window.localStorage.setItem("fg-location-mode", "static");
                        
                        toast.success(`Arrived at ${finalLabel}!`, {
                            icon: "🏁",
                            style: { borderRadius: '16px', background: 'rgba(15, 17, 21, 0.95)', color: '#fff', backdropFilter: 'blur(20px)', border: '1px solid var(--accent)' },
                        });

                        // Tell the UI to teleport the dot, update the label, and switch the tab to Static
                        window.dispatchEvent(new CustomEvent("fg-engine-tick", { 
                            detail: { lat: finalLat, lon: finalLon, label: finalLabel, modeSwitch: "static" } 
                        }));
                    } else {
                        // Still driving...
                        const nextGeohash = encodeGeohash(currentPos.lat, currentPos.lon);
                        const currentLabel = `Simulating Route... (${speedKmh} km/h)`; // NO MORE FRENCH!
                        
                        void setPrefRef.current({ geohash: nextGeohash, locationName: currentLabel });
                        window.localStorage.setItem("fg-route-progress", String(newProgressMeters));
                        window.localStorage.setItem("fg-route-last-tick", String(now));

                        window.dispatchEvent(new CustomEvent("fg-engine-tick", { 
                            detail: { lat: currentPos.lat, lon: currentPos.lon, label: currentLabel } 
                        }));
                    }
                }
            } catch (e) { console.error("Location engine check failed", e); }
        };

        globalEngineTicker = window.setInterval(checkEngine, 1000);
        return () => {
            if (globalEngineTicker) {
                window.clearInterval(globalEngineTicker);
                globalEngineTicker = null;
            }
        };
    }, []);
}