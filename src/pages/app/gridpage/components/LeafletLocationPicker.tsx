import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SelectedLocation } from "../../GridPage.types";

type LeafletLocationPickerProps = {
    selectedLocation: Pick<SelectedLocation, "lat" | "lon"> | null;
    onPick: (lat: number, lon: number) => void;
    onError: (message: string) => void;
    className?: string;
    defaultZoom?: number;
    initialCenter?: [number, number];
    routePolyline?: {lat: number, lon: number}[];
    routeWaypoints?: {lat: number, lon: number, label: string}[];
    autoPan?: boolean;
};

export function LeafletLocationPicker({
    selectedLocation,
    onPick,
    onError,
    className = "h-72 w-full",
    defaultZoom = 18,
    initialCenter = [20, 0],
    routePolyline,
    routeWaypoints,
    autoPan = true,
}: LeafletLocationPickerProps) {
    const { t } = useTranslation();
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const polylineLayerRef = useRef<any>(null);
    const waypointLayersRef = useRef<any[]>([]);
    const leafletRef = useRef<any>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    
    const isFollowingRef = useRef(false);

    useEffect(() => {
        let mounted = true;

        const initMap = async () => {
            try {
                const L = await import("leaflet");
                await import("leaflet/dist/leaflet.css");

                if (!mounted || !mapContainerRef.current || mapRef.current) return;

                leafletRef.current = L;

                // Explicitly cast as [number, number] tuple so Leaflet accepts it
                const startCenter = (selectedLocation ? [selectedLocation.lat, selectedLocation.lon] : (initialCenter || [20, 0])) as [number, number];
                const startZoom = selectedLocation ? defaultZoom : (initialCenter ? 11 : 2);

                const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(startCenter, startZoom);

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: '&copy; OpenStreetMap contributors',
                }).addTo(map);

                map.on("click", (event: any) => { 
                    isFollowingRef.current = false;
                    onPick(event.latlng.lat, event.latlng.lng); 
                });

                map.on("dragstart", () => { isFollowingRef.current = false; });

                mapRef.current = map;

                // CRITICAL FIX: Initialize as an HTML divIcon so it ALWAYS sits on top and accepts CSS animations
                const gpsIcon = L.divIcon({
                    className: 'gps-marker-transition',
                    html: '<div style="width: 18px; height: 18px; background: #ffcc01; border: 2px solid #131821; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                });

                if (selectedLocation) {
                    markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lon], { icon: gpsIcon, zIndexOffset: 1000 }).addTo(map);
                    
                    markerRef.current.on('click', () => {
                        isFollowingRef.current = true;
                        map.panTo(markerRef.current.getLatLng(), { animate: true, duration: 0.5 });
                    });
                }
                
                setIsMapReady(true);
            } catch {
                onError(t("browse_location.map_picker_error_load"));
            }
        };

        void initMap();

    return () => {
            mounted = false;
            if (mapRef.current) {
                mapRef.current.off();
                mapRef.current.remove();
                mapRef.current = null;
                markerRef.current = null;
                polylineLayerRef.current = null;
                waypointLayersRef.current = [];
                setIsMapReady(false);
            }
        };
    // CRITICAL FIX: Removed initialCenter to stop the map from deleting itself every second!
    }, [defaultZoom, t]);

    useEffect(() => {
        if (!isMapReady) return;
        const map = mapRef.current;
        const L = leafletRef.current;
        if (!map || !L) return;

        if (polylineLayerRef.current) {
            polylineLayerRef.current.remove();
            polylineLayerRef.current = null;
        }
        waypointLayersRef.current.forEach(layer => layer.remove());
        waypointLayersRef.current = [];

        if (routePolyline && routePolyline.length > 0) {
            const latlngs = routePolyline.map(p => [p.lat, p.lon] as [number, number]);
            polylineLayerRef.current = L.polyline(latlngs, { 
                color: '#3b82f6', weight: 5, opacity: 0.8, lineCap: 'round', lineJoin: 'round', className: 'cursor-pointer'
            }).addTo(map);
            
            polylineLayerRef.current.on('click', () => {
                isFollowingRef.current = true;
                if (markerRef.current) {
                    map.panTo(markerRef.current.getLatLng(), { animate: true, duration: 0.5 });
                }
            });
            
            map.fitBounds(polylineLayerRef.current.getBounds(), { padding: [40, 40] });
        }

        if (routeWaypoints && routeWaypoints.length > 0) {
            routeWaypoints.forEach((wp, idx) => {
                const isStart = idx === 0;
                const isEnd = idx === routeWaypoints.length - 1;
                const color = isStart ? '#3b82f6' : isEnd ? '#ef4444' : '#ffffff';
                const marker = L.circleMarker([wp.lat, wp.lon], {
                    radius: isStart || isEnd ? 7 : 5, color: '#131821', fillColor: color, fillOpacity: 1, weight: 2
                }).addTo(map);
                waypointLayersRef.current.push(marker);
            });
        }
    }, [routePolyline, routeWaypoints, isMapReady]);

    useEffect(() => {
        if (!isMapReady) return;
        const map = mapRef.current;
        const L = leafletRef.current;

        if (!map || !L || !selectedLocation) return;

        const gpsIcon = L.divIcon({
            className: 'gps-marker-transition',
            html: '<div style="width: 18px; height: 18px; background: #ffcc01; border: 2px solid #131821; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });

        if (markerRef.current) {
            markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lon]);
        } else {
            markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lon], { icon: gpsIcon, zIndexOffset: 1000 }).addTo(map);
            markerRef.current.on('click', () => {
                isFollowingRef.current = true;
                map.panTo(markerRef.current.getLatLng(), { animate: true, duration: 0.5 });
            });
        }

        // CRITICAL FIX: Only pan the camera. NEVER touch the zoom level here.
        if (autoPan) {
            map.panTo([selectedLocation.lat, selectedLocation.lon], { animate: true, duration: 0.5 });
        } else if (isFollowingRef.current) {
            map.panTo([selectedLocation.lat, selectedLocation.lon], { animate: true, duration: 1.0, easeLinearity: 1 });
        }

        map.invalidateSize();
    }, [selectedLocation, autoPan, isMapReady]);

    return (
        <>
            <style>{`
                .gps-marker-transition { transition: transform 1s linear !important; }
                .leaflet-zoom-anim .gps-marker-transition { transition: none !important; }
            `}</style>
            <div ref={mapContainerRef} className={className} />
        </>
    );
}