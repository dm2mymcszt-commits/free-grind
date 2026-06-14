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
    isDrawing?: boolean;
    onDrawingComplete?: (points: {lat: number, lon: number}[]) => void;
    isQueueEmpty?: boolean;
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
    isDrawing = false,
    onDrawingComplete,
    isQueueEmpty = false,
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
    const isDrawingRef = useRef(isDrawing);
    const onDrawingCompleteRef = useRef(onDrawingComplete);
    const drawingPolylineRef = useRef<any>(null);
    const activePolylinesRef = useRef<any[]>([]);

    useEffect(() => {
        isDrawingRef.current = isDrawing;
    }, [isDrawing]);

    useEffect(() => {
        onDrawingCompleteRef.current = onDrawingComplete;
    }, [onDrawingComplete]);

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
                    if (isDrawingRef.current) return;
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
        isDrawingRef.current = isDrawing;
        const map = mapRef.current;
        if (!map) return;

        if (isDrawing) {
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();
            map.boxZoom.disable();
            map.keyboard.disable();
            if (map.tap) map.tap.disable();
        } else {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
            map.boxZoom.enable();
            map.keyboard.enable();
            if (map.tap) map.tap.enable();

            // Clean up any remaining drawing polyline if drawing mode is cancelled/disabled
            if (drawingPolylineRef.current) {
                drawingPolylineRef.current.remove();
                drawingPolylineRef.current = null;
            }
            activePolylinesRef.current.forEach(p => p.remove());
            activePolylinesRef.current = [];
        }
    }, [isDrawing, isMapReady]);

    useEffect(() => {
        if (isQueueEmpty) {
            if (drawingPolylineRef.current) {
                drawingPolylineRef.current.remove();
                drawingPolylineRef.current = null;
            }
            activePolylinesRef.current.forEach(p => p.remove());
            activePolylinesRef.current = [];
        }
    }, [isQueueEmpty]);

    useEffect(() => {
        const container = mapContainerRef.current;
        const map = mapRef.current;
        if (!container || !map || !isMapReady) return;

        let isPainting = false;
        let isPanning = false;
        let startX = 0;
        let startY = 0;
        let cumulativePoints: { lat: number; lon: number }[] = [];
        let polyline: any = null;

        const handlePointerDown = (e: PointerEvent) => {
            if (!isDrawingRef.current) return;

            if (e.button === 2) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                container.setPointerCapture(e.pointerId);
                e.preventDefault();
                return;
            }

            if (e.button !== 0) return; // Only allow LMB to paint lines

            isPainting = true;
            container.setPointerCapture(e.pointerId);
            
            const latlng = map.mouseEventToLatLng(e);
            cumulativePoints.push({ lat: latlng.lat, lon: latlng.lng });
            
            const L = leafletRef.current;
            if (!polyline) {
                polyline = L.polyline(cumulativePoints.map(p => [p.lat, p.lon]), { 
                    color: '#8b5cf6', 
                    weight: 4, 
                    dashArray: '5, 10',
                    lineCap: 'round',
                    lineJoin: 'round'
                }).addTo(map);
                drawingPolylineRef.current = polyline;
                activePolylinesRef.current.push(polyline);
            } else {
                polyline.setLatLngs(cumulativePoints.map(p => [p.lat, p.lon]));
            }
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!isDrawingRef.current) return;

            if (isPainting && polyline) {
                const latlng = map.mouseEventToLatLng(e);
                cumulativePoints.push({ lat: latlng.lat, lon: latlng.lng });
                polyline.setLatLngs(cumulativePoints.map(p => [p.lat, p.lon]));
            } else if (isPanning && e.buttons === 2) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                map.panBy([-dx, -dy], { animate: false });
                startX = e.clientX;
                startY = e.clientY;
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (!isDrawingRef.current) return;

            if (isPainting) {
                isPainting = false;
                container.releasePointerCapture(e.pointerId);

                if (cumulativePoints.length > 0 && onDrawingCompleteRef.current) {
                    onDrawingCompleteRef.current(cumulativePoints);
                }
            } else if (isPanning) {
                isPanning = false;
                container.releasePointerCapture(e.pointerId);
            }
        };

        const handleContextMenu = (e: MouseEvent) => {
            if (isDrawingRef.current) {
                e.preventDefault();
            }
        };

        container.addEventListener("pointerdown", handlePointerDown);
        container.addEventListener("pointermove", handlePointerMove);
        container.addEventListener("pointerup", handlePointerUp);
        container.addEventListener("pointercancel", handlePointerUp);
        container.addEventListener("contextmenu", handleContextMenu);

        return () => {
            container.removeEventListener("pointerdown", handlePointerDown);
            container.removeEventListener("pointermove", handlePointerMove);
            container.removeEventListener("pointerup", handlePointerUp);
            container.removeEventListener("pointercancel", handlePointerUp);
            container.removeEventListener("contextmenu", handleContextMenu);
            if (polyline) {
                polyline.remove();
                polyline = null;
                drawingPolylineRef.current = null;
            }
            activePolylinesRef.current.forEach(p => p.remove());
            activePolylinesRef.current = [];
        };
    }, [isMapReady, isDrawing, isQueueEmpty]);

    useEffect(() => {
        const container = mapContainerRef.current;
        if (!container) return;
        if (isDrawing) {
            container.classList.add("drawing-map-active");
        } else {
            container.classList.remove("drawing-map-active");
        }
    }, [isDrawing]);

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
                .drawing-map-active.leaflet-container { 
                    cursor: crosshair !important; 
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    touch-action: none !important;
                }
                .drawing-map-active .leaflet-control-container,
                .drawing-map-active .leaflet-control-container * {
                    pointer-events: none !important;
                }
            `}</style>
            <div ref={mapContainerRef} className={className} />
        </>
    );
}