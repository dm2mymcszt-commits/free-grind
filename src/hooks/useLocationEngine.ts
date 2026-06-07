import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { encodeGeohash } from "../utils/geohash";
import { usePreferences } from "../contexts/PreferencesContext";
import type { SavedLocation } from "../pages/app/BrowseLocationPage";

// Global variable outside the React hook.
// This guarantees that if Vite HMR restarts the hook, the old interval is explicitly killed.
let globalEngineTicker: number | null = null;

export function useLocationEngine() {
    const { setPreferences } = usePreferences();
    
    const setPrefRef = useRef(setPreferences);
    useEffect(() => {
        setPrefRef.current = setPreferences;
    }, [setPreferences]);

    useEffect(() => {
        // KILL ANY GHOST INTERVALS FROM PREVIOUS COMPILES
        if (globalEngineTicker) {
            window.clearInterval(globalEngineTicker);
            globalEngineTicker = null;
        }

        const checkQueue = () => {
            try {
                // NUCLEAR KILL SWITCH: If not dynamic, absolutely halt.
                const mode = window.localStorage.getItem("fg-location-mode");
                if (mode !== "dynamic") return;

                const storedQueue = window.localStorage.getItem("fg-location-queue");
                if (!storedQueue) return;

                const queue = JSON.parse(storedQueue) as SavedLocation[];
                if (!queue || queue.length <= 1) return; // Need at least 2 locations to cycle

                const intervalMinutes = Number(window.localStorage.getItem("fg-location-queue-interval") || "10");
                const currentIndex = Number(window.localStorage.getItem("fg-location-queue-index") || "0");
                const timestampStr = window.localStorage.getItem("fg-location-queue-timestamp");
                
                if (!timestampStr) {
                    window.localStorage.setItem("fg-location-queue-timestamp", String(Date.now()));
                    return;
                }

                const timestamp = Number(timestampStr);
                const timePassed = Date.now() - timestamp;
                const timeRequired = intervalMinutes * 60 * 1000;

                if (timePassed >= timeRequired) {
                    // Time is up! Move to the next location
                    const nextIndex = (currentIndex + 1) % queue.length;
                    const nextLoc = queue[nextIndex];
                    const nextGeohash = encodeGeohash(nextLoc.lat, nextLoc.lon);

                    // Execute Teleport instantly
                    void setPrefRef.current({
                        geohash: nextGeohash,
                        locationName: nextLoc.label,
                    });

                    // Update storage clocks for the next cycle
                    window.localStorage.setItem("fg-location-queue-index", String(nextIndex));
                    window.localStorage.setItem("fg-location-queue-timestamp", String(Date.now()));

                    // Fire premium notification
                    toast(`Teleported to ${nextLoc.label}`, {
                        icon: "🌍",
                        style: {
                            borderRadius: '16px',
                            background: 'rgba(15, 17, 21, 0.95)',
                            color: '#fff',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid var(--accent)',
                        },
                    });

                    // Force the UI to visually update
                    window.dispatchEvent(new Event("fg-engine-tick"));
                }
            } catch (e) {
                console.error("Location engine check failed", e);
            }
        };

        // Tick every 1 second
        globalEngineTicker = window.setInterval(checkQueue, 1000);

        return () => {
            if (globalEngineTicker) {
                window.clearInterval(globalEngineTicker);
                globalEngineTicker = null;
            }
        };
    }, []);
}