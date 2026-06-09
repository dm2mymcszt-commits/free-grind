import { Crosshair, Loader2, Bookmark, MapPin, Search, Trash2, ListPlus, Play, Navigation, ChevronDown, Timer, Route, Plane, Car, Bike, Footprints, Train } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import type { GeocodeResult, SelectedLocation } from "../../GridPage.types";
import { LeafletLocationPicker } from "./LeafletLocationPicker";
import type { SavedLocation } from "../../BrowseLocationPage";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";

const GLASS_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 px-4 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-black/20 disabled:hover:border-white/20 disabled:hover:text-white disabled:hover:shadow-none";
const PRIMARY_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-transparent px-4 text-sm font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all duration-300 hover:scale-[1.02] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_50%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:bg-transparent disabled:hover:text-[var(--accent)]";

function BookmarkPromptDialog({ location, onClose, onSave }: { location: SelectedLocation | null; onClose: () => void; onSave: (name: string) => void; }) {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [name, setName] = useState("");

    useEffect(() => {
        if (location) {
            setName(location.label);
            setIsClosing(false);
            if (!dialogRef.current?.open) { try { dialogRef.current?.showModal(); } catch { dialogRef.current?.show(); } }
        } else if (dialogRef.current?.open) {
            setIsClosing(true);
            const timer = setTimeout(() => { dialogRef.current?.close(); setIsClosing(false); }, 250);
            return () => clearTimeout(timer);
        }
    }, [location]);

    return (
        <dialog ref={dialogRef} className={`fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-0 text-[var(--text)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] ${isClosing ? "dialog-closing" : ""}`} onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}>
            <style>{`
                dialog[open]:not(.dialog-closing) { animation: dialog-spring-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards; }
                dialog[open]:not(.dialog-closing)::backdrop { animation: backdrop-fade-in 0.3s ease-out forwards; backdrop-filter: blur(12px); }
                dialog[open].dialog-closing { animation: dialog-spring-out 0.25s ease-in forwards; }
                dialog[open].dialog-closing::backdrop { animation: backdrop-fade-out 0.25s ease-in forwards; backdrop-filter: blur(12px); }
                @keyframes dialog-spring-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @keyframes dialog-spring-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
                @keyframes backdrop-fade-in { from { background-color: rgba(0, 0, 0, 0); } to { background-color: rgba(0, 0, 0, 0.55); } }
                @keyframes backdrop-fade-out { from { background-color: rgba(0, 0, 0, 0.55); } to { background-color: rgba(0, 0, 0, 0); } }
            `}</style>
            <div className="p-5 sm:p-6">
                <p className="text-lg font-bold text-[var(--text)] drop-shadow-sm">Name this Bookmark</p>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="E.g. Home, Work, Paris..." className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all" autoFocus />
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--text-muted)] transition hover:text-white active:scale-95">Cancel</button>
                    <button type="button" onClick={() => onSave(name)} disabled={!name.trim()} className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-contrast)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition hover:brightness-110 active:scale-95 disabled:opacity-50">Save Bookmark</button>
                </div>
            </div>
        </dialog>
    );
}

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: (complete: () => void, revert: () => void) => void; }) {
    const [startX, setStartX] = useState<number | null>(null);
    const [currentX, setCurrentX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    const handlePointerDown = (e: React.PointerEvent) => { if (e.button !== 0) return; setStartX(e.clientX); setIsSwiping(true); };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isSwiping || startX === null) return;
        const deltaX = e.clientX - startX;
        if (deltaX < 0) {
            if (deltaX < -140) setCurrentX(-140 + (deltaX + 140) * 0.2);
            else setCurrentX(deltaX);
        } else setCurrentX(0);
    };
    const triggerDelete = () => onDelete(() => { setIsAnimatingOut(true); setCurrentX(-500); }, () => { setIsAnimatingOut(false); setCurrentX(0); });
    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isSwiping) return;
        setIsSwiping(false); setStartX(null);
        if (currentX < -90) triggerDelete();
        else setCurrentX(0);
        if (Math.abs(currentX) > 10) { e.stopPropagation(); e.preventDefault(); }
    };

    return (
        <div className="relative overflow-hidden shrink-0 rounded-2xl border border-white/5 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] select-none touch-pan-y" style={{ height: isAnimatingOut ? "0px" : "auto", minHeight: isAnimatingOut ? "0px" : "64px", opacity: isAnimatingOut ? 0 : 1, transform: isAnimatingOut ? "scaleY(0.8)" : "none", transformOrigin: "center top" }}>
            {currentX < 0 && <div className="absolute inset-y-0 right-0 bg-gradient-to-r from-red-600/15 to-red-600/80 backdrop-blur-md z-0 cursor-pointer" style={{ width: `${Math.abs(currentX)}px` }} onClick={triggerDelete} />}
            {currentX < -60 && (
                <div className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white z-20 pointer-events-none transition-opacity duration-200" style={{ width: `${Math.abs(currentX)}px` }}>
                    <div className="flex flex-col items-center gap-1">
                        <Trash2 className="h-5 w-5 text-red-100 drop-shadow-[0_2px_8px_rgba(239,68,68,0.6)] animate-pulse" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-100">Delete</span>
                    </div>
                </div>
            )}
            <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} className="relative bg-transparent w-full h-full z-10 shrink-0 select-none cursor-grab active:cursor-grabbing" style={{ transform: `translateX(${currentX}px)`, filter: currentX < 0 ? `blur(${Math.min(6, Math.abs(currentX) / 25)}px)` : "none", opacity: currentX < 0 ? Math.max(0.3, 1 - Math.abs(currentX) / 250) : 1, transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), filter 0.25s ease, opacity 0.25s ease" }}>
                {children}
            </div>
        </div>
    );
}

type LocationSettingsPanelProps = {
    mode: "static" | "dynamic" | "route";
    onModeChange: (m: "static" | "dynamic" | "route") => void;
    isDetectingLocation: boolean;
    onUseCurrentLocation: () => void;
    locationQuery: string;
    onLocationQueryChange: (value: string) => void;
    isSearchingLocation: boolean;
    locationResults: GeocodeResult[];
    onStageLocation: (lat: number, lon: number, label: string) => void;
    selectedLocation: SelectedLocation | null;
    isMapPickerOpen: boolean;
    mapPickerError: string | null;
    onToggleMapPicker: () => void;
    onMapPick: (lat: number, lon: number) => void;
    onMapPickerError: (message: string) => void;
    onTeleport: (lat: number, lon: number, label: string) => void;
    initialCenter?: [number, number];
    bookmarks: SavedLocation[];
    queue: SavedLocation[];
    queueInterval: number;
    queueIndex?: number;
    queueTimestamp?: number;
    onAddBookmark: (loc: SavedLocation) => void;
    onDeleteBookmark: (id: string) => void;
    onAddQueue: (loc: SavedLocation) => void;
    onDeleteQueue: (id: string) => void;
    onClearQueue: () => void;
    onChangeInterval: (interval: number) => void;
    routeWaypoints: SavedLocation[];
    routePolyline: {lat: number, lon: number}[];
    routeSpeed: number;
    routeTransport: string;
    routeActive: boolean;
    routeProgress: number;
    onUpdateRouteWaypoints: (w: SavedLocation[]) => void;
    onUpdateRouteSpeed: (s: number) => void;
    onUpdateRouteTransport: (t: string) => void;
    onStartRoute: () => void;
    onStopRoute: (clearPolyline?: boolean) => void;
};

export function LocationSettingsPanel({
    mode, onModeChange,
    isDetectingLocation, onUseCurrentLocation,
    locationQuery, onLocationQueryChange, isSearchingLocation, locationResults,
    onStageLocation, selectedLocation,
    isMapPickerOpen, mapPickerError, onToggleMapPicker, onMapPick, onMapPickerError,
    onTeleport, initialCenter,
    bookmarks, queue, queueInterval, queueIndex = 0, queueTimestamp = Date.now(),
    onAddBookmark, onDeleteBookmark, onAddQueue, onDeleteQueue, onClearQueue, onChangeInterval,
    routeWaypoints, routePolyline, routeSpeed, routeTransport, routeActive, routeProgress,
    onUpdateRouteWaypoints, onUpdateRouteSpeed, onUpdateRouteTransport, onStartRoute, onStopRoute
}: LocationSettingsPanelProps) {
    const { t } = useTranslation();
        const [now, setNow] = useState(Date.now());
        const [bookmarkPromptLocation, setBookmarkPromptLocation] = useState<SelectedLocation | null>(null);
        const [confirmClearQueue, setConfirmClearQueue] = useState(false);
        const [confirmClearRoute, setConfirmClearRoute] = useState(false);
        const [pendingModeSwitch, setPendingModeSwitch] = useState<"static" | "dynamic" | "route" | null>(null);
        const [pendingOverride, setPendingOverride] = useState<"teleport" | "queue" | null>(null);

        const handleModeSwitch = (newMode: "static" | "dynamic" | "route") => {
        if (newMode === mode) return;
        if (mode === "route" && routeActive) {
            setPendingModeSwitch(newMode);
        } else {
            onModeChange(newMode);
        }
    };

    useEffect(() => {
        if (confirmClearQueue) {
            const timer = setTimeout(() => setConfirmClearQueue(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmClearQueue]);

    useEffect(() => {
        if (confirmClearRoute) {
            const timer = setTimeout(() => setConfirmClearRoute(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmClearRoute]);

    useEffect(() => {
        if (mode === "static") return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [mode]);

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const getRemainingTime = () => {
        if (mode !== "dynamic") return "PAUSED";
        const targetTime = queueTimestamp + (queueInterval * 60 * 1000);
        const diff = Math.max(0, targetTime - now);
        if (diff === 0) return "Switching...";
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };

    const handleSaveStagedToQueue = () => {
        if (!selectedLocation) return;
        onAddQueue({ id: generateId(), lat: selectedLocation.lat, lon: selectedLocation.lon, label: selectedLocation.label });
    };

    const handleAddStagedToRoute = () => {
        if (!selectedLocation) return;
        onUpdateRouteWaypoints([...routeWaypoints, { id: generateId(), lat: selectedLocation.lat, lon: selectedLocation.lon, label: selectedLocation.label }]);
    };

    const presets = [
        { id: "walking", icon: Footprints, speed: 5 },
        { id: "biking", icon: Bike, speed: 20 },
        { id: "driving", icon: Car, speed: 60 },
        { id: "train", icon: Train, speed: 120 },
        { id: "plane", icon: Plane, speed: 800 }
    ];

    return (
        <div className="flex flex-col gap-6">
            
            <div className="mx-auto grid w-full max-w-[500px] grid-cols-3 items-center rounded-[1.2rem] bg-black/40 p-1.5 backdrop-blur-xl shadow-inner border border-white/5">
                <button type="button" onClick={() => handleModeSwitch("static")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "static" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><MapPin className="h-4 w-4" /> Static</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "static" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "static" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
                <button type="button" onClick={() => handleModeSwitch("dynamic")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "dynamic" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><Play className="h-4 w-4" fill={mode === "dynamic" ? "currentColor" : "none"} /> Dynamic</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "dynamic" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "dynamic" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
                <button type="button" onClick={() => handleModeSwitch("route")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "route" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><Route className="h-4 w-4" /> Route</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "route" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "route" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] overflow-hidden p-5 sm:p-6">
                
                <div className="mb-8 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[var(--text)] drop-shadow-sm">
                            {mode === "static" ? "Find Location" : mode === "dynamic" ? "Add to Queue" : "Add to Route"}
                        </h2>
                        <button type="button" onClick={onUseCurrentLocation} disabled={isDetectingLocation} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--surface)_80%,black)] border border-[var(--accent)]/50 px-4 text-xs font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] active:scale-95 disabled:opacity-50">
                            {isDetectingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} GPS
                        </button>
                    </div>

                    <div className="relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                            {isSearchingLocation ? <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> : <Search className="h-5 w-5" />}
                        </div>
                        <input type="text" value={locationQuery} onChange={(e) => onLocationQueryChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder="Search city, area, or zip code..." className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 py-3.5 pl-12 pr-4 text-sm font-semibold text-[var(--text)] transition-all outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] placeholder:font-medium" />
                    </div>

                    {locationResults.length > 0 && (
                        <div className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2 shadow-inner">
                            {locationResults.map((result) => (
                                <button key={`${result.lat}:${result.lon}:${result.display_name}`} type="button" onClick={() => onStageLocation(Number(result.lat), Number(result.lon), result.display_name)} className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/20 hover:text-white">
                                    {result.display_name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-inner">
                        <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-black/30 p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Manual Pin Drop</p>
                            <button type="button" onClick={onToggleMapPicker} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold transition hover:bg-white/10 hover:text-white">{isMapPickerOpen ? "Close Map" : "Open Map"}</button>
                        </div>
                        {isMapPickerOpen ? (
                            mapPickerError ? <div className="p-4 text-center text-sm font-semibold text-red-400 bg-red-500/10">{mapPickerError}</div> : (
                                <LeafletLocationPicker 
                                    selectedLocation={selectedLocation} 
                                    onPick={onMapPick} 
                                    onError={onMapPickerError} 
                                    defaultZoom={11} 
                                    initialCenter={initialCenter} 
                                    // CRITICAL FIX: Only pass the polyline/waypoints if we are actually looking at the Route tab!
                                    routePolyline={mode === "route" ? routePolyline : undefined}
                                    routeWaypoints={mode === "route" ? routeWaypoints : undefined}
                                    autoPan={mode !== "route"}
                                />
                            )
                        ) : null}
                    </div>

                    {selectedLocation && (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 shadow-inner p-4 animate-in fade-in zoom-in-95 duration-300">
                            <p className="mb-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Selected Location</p>
                            <p className="mb-4 text-sm font-semibold text-white">{selectedLocation.label}</p>
                             <div className="flex gap-2">
                                {mode === "static" ? (
                                    <>
                                        <button type="button" onClick={() => setBookmarkPromptLocation(selectedLocation)} className={GLASS_BTN_GHOST} title="Save to Bookmarks"><Bookmark className="h-5 w-5" /> Save</button>
                                        <button type="button" onClick={() => {
                                            if (routeActive) setPendingOverride("teleport");
                                            else onTeleport(selectedLocation.lat, selectedLocation.lon, selectedLocation.label);
                                        }} className={PRIMARY_BTN_GHOST}><Navigation className="h-5 w-5 fill-current" /> Teleport Here</button>
                                    </>
                                ) : mode === "dynamic" ? (
                                    <button type="button" onClick={() => {
                                        if (routeActive) setPendingOverride("queue");
                                        else handleSaveStagedToQueue();
                                    }} className={PRIMARY_BTN_GHOST}><ListPlus className="h-5 w-5" /> Add to Queue</button>
                                ) : (
                                    <button type="button" onClick={handleAddStagedToRoute} className={PRIMARY_BTN_GHOST}><Route className="h-5 w-5" /> Add to Route</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="my-6 border-t border-white/10" />

                {/* -------------------- MODE: STATIC -------------------- */}
                {mode === "static" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><Bookmark className="h-4 w-4" /> Saved Bookmarks</h3>
                        </div>
                        {bookmarks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <Bookmark className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">No bookmarks yet</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage a location above and hit Save.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {bookmarks.map((bookmark) => (
                                    <SwipeableRow key={bookmark.id} onDelete={(comp) => { comp(); onDeleteBookmark(bookmark.id); }}>
                                        <div className="flex h-full w-full items-center justify-between rounded-2xl border border-white/5 bg-black/20 p-4 transition-all hover:bg-black/40">
                                            <div className="min-w-0 pr-4">
                                                <p className="truncate text-sm font-bold text-white mb-0.5">{bookmark.label}</p>
                                                <p className="text-xs font-medium text-[var(--text-muted)]">{bookmark.lat.toFixed(4)}, {bookmark.lon.toFixed(4)}</p>
                                            </div>
                                            <button type="button" onClick={() => onTeleport(bookmark.lat, bookmark.lon, bookmark.label)} className="shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--surface)_80%,black)] border border-[var(--accent)]/50 px-4 py-2 text-xs font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:scale-105 active:scale-95">Teleport</button>
                                        </div>
                                    </SwipeableRow>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- MODE: DYNAMIC -------------------- */}
                {mode === "dynamic" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]">
                                    <Timer className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white drop-shadow-sm">Cycle Interval</h3>
                                    <p className="text-xs font-medium text-[var(--text-muted)]">Time spent at each location</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center rounded-xl border border-[var(--accent)]/40 bg-black/40 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all overflow-hidden">
                                    <input type="number" min={1} value={queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 : queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : queueInterval} onChange={(e) => { const val = Math.max(1, Number(e.target.value) || 1); if (queueInterval >= 1440 && queueInterval % 1440 === 0) onChangeInterval(val * 1440); else if (queueInterval >= 60 && queueInterval % 60 === 0) onChangeInterval(val * 60); else onChangeInterval(val); }} className="w-16 bg-transparent py-2.5 pl-3 text-center text-sm font-bold text-white outline-none appearance-none m-0" />
                                    <div className="relative flex h-full items-center border-l border-white/10 bg-[var(--surface)]/50">
                                        <select value={queueInterval >= 1440 && queueInterval % 1440 === 0 ? "days" : queueInterval >= 60 && queueInterval % 60 === 0 ? "hours" : "mins"} onChange={(e) => { const currentNumeric = queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 : queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : queueInterval; if (e.target.value === "days") onChangeInterval(currentNumeric * 1440); else if (e.target.value === "hours") onChangeInterval(currentNumeric * 60); else onChangeInterval(currentNumeric); }} className="h-full w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-3 pr-8 text-sm font-bold text-[var(--accent)] outline-none">
                                            <option value="mins" className="bg-[#101216]">Mins</option>
                                            <option value="hours" className="bg-[#101216]">Hours</option>
                                            <option value="days" className="bg-[#101216]">Days</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><ListPlus className="h-4 w-4" /> Active Queue</h3>
                            <div className="flex items-center gap-2">
                                {queue.length > 0 && (
                                    <button type="button" onClick={() => { if (confirmClearQueue) { onClearQueue(); setConfirmClearQueue(false); } else { setConfirmClearQueue(true); } }} className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${confirmClearQueue ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white border border-white/5"}`}>
                                        {confirmClearQueue ? "Are you sure?" : "Clear"}
                                    </button>
                                )}
                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white">{queue.length} Stops</span>
                            </div>
                        </div>

                        {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <ListPlus className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">Queue is empty</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage a location above and add it to the cycle.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {queue.map((qItem, idx) => {
                                    const isActive = idx === queueIndex && queue.length > 1 && mode === "dynamic";
                                    const isNext = idx === (queueIndex + 1) % queue.length;
                                    const cardStyle = isActive ? "border-[var(--accent)] bg-black/40 shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 hover:bg-black/40";
                                    return (
                                        <SwipeableRow key={qItem.id} onDelete={(comp) => { comp(); onDeleteQueue(qItem.id); }}>
                                            <div className={`flex h-full w-full items-center gap-4 rounded-2xl border p-4 transition-all ${cardStyle}`}>
                                                <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner border ${isActive ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : "border-white/10 bg-black/20 text-white"}`}>
                                                    {isActive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full border-2 border-[var(--accent)] opacity-60" />}
                                                    <span className="relative z-10">{idx + 1}</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-bold mb-0.5 text-white">{qItem.label}</p>
                                                    <p className="text-xs font-medium text-[var(--text-muted)]">{qItem.lat.toFixed(4)}, {qItem.lon.toFixed(4)}</p>
                                                </div>
                                                {isActive && (
                                                    <div className="shrink-0 flex flex-col items-end">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]">Active</span>
                                                        <span className="text-xs font-bold tabular-nums tracking-wider text-white">{getRemainingTime()}</span>
                                                    </div>
                                                )}
                                                {!isActive && isNext && queue.length > 1 && mode === "dynamic" && (
                                                    <div className="shrink-0 flex flex-col items-end opacity-60">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Up Next</span>
                                                    </div>
                                                )}
                                            </div>
                                        </SwipeableRow>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- MODE: ROUTE SIMULATION -------------------- */}
                {mode === "route" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md">
                            <h3 className="mb-3 text-sm font-bold text-white drop-shadow-sm flex items-center gap-2"><Navigation className="h-4 w-4 text-[var(--accent)]" /> Transport Method</h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {presets.map(p => (
                                    <button 
                                        key={p.id} type="button" 
                                        onClick={() => { onUpdateRouteTransport(p.id); onUpdateRouteSpeed(p.speed); }} 
                                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-all ${routeTransport === p.id ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 text-[var(--text-muted)] hover:bg-black/40 hover:text-white"}`}
                                    >
                                        <p.icon className="h-5 w-5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{p.id}</span>
                                    </button>
                                ))}
                            </div>
                            
                            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                                <div>
                                    <h4 className="text-xs font-bold text-white">Custom Speed</h4>
                                    <p className="text-[10px] text-[var(--text-muted)]">km/h</p>
                                </div>
                                <input type="number" min={1} value={routeSpeed} onChange={(e) => onUpdateRouteSpeed(Math.max(1, Number(e.target.value) || 1))} className="w-20 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-sm font-bold text-white outline-none focus:border-[var(--accent)]" />
                            </div>
                        </div>

                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><Route className="h-4 w-4" /> Waypoints</h3>
                            <div className="flex items-center gap-2">
                                {routeWaypoints.length > 0 && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (confirmClearRoute) {
                                                onUpdateRouteWaypoints([]);
                                                setConfirmClearRoute(false);
                                            } else {
                                                setConfirmClearRoute(true);
                                            }
                                        }} 
                                        className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${confirmClearRoute ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white border border-white/5"}`}
                                    >
                                        {confirmClearRoute ? "Are you sure?" : "Clear"}
                                    </button>
                                )}
                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white">{routeWaypoints.length} Stops</span>
                            </div>
                        </div>

                        {routeWaypoints.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <MapPin className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">No waypoints</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage locations and add them to build a route.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2 relative">
                                {/* Vertical connector line */}
                                {routeWaypoints.length > 1 && <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-white/10 z-0" />}
                                
                                {routeWaypoints.map((wp, idx) => (
                                    <SwipeableRow key={wp.id} onDelete={(comp) => { comp(); onUpdateRouteWaypoints(routeWaypoints.filter(w => w.id !== wp.id)); }}>
                                        <div className="relative z-10 flex h-full w-full items-center gap-4 rounded-2xl border border-white/5 bg-black/40 p-4 transition-all hover:bg-black/60">
                                            <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner border ${idx === 0 ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : idx === routeWaypoints.length - 1 ? "border-red-500 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : "border-white/10 bg-black/20 text-white"}`}>
                                                {idx === 0 ? "A" : idx === routeWaypoints.length - 1 ? "B" : idx}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-white mb-0.5">{wp.label}</p>
                                                <p className="text-xs font-medium text-[var(--text-muted)]">{wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}</p>
                                            </div>
                                        </div>
                                    </SwipeableRow>
                                ))}
                            </div>
                        )}

                        {routeWaypoints.length >= 2 && (
                            <div className="mt-6">
                                {routeActive ? (
                                    <div className="rounded-2xl border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
                                        <div className="mb-4 flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)] animate-pulse">Simulating Route...</p>
                                                <p className="text-xs font-bold text-white mt-0.5">{routeProgress > 1000 ? `${(routeProgress / 1000).toFixed(1)} km traveled` : `${Math.round(routeProgress)} m traveled`}</p>
                                            </div>
                                            <button type="button" onClick={() => onStopRoute(true)} className="rounded-xl bg-red-500/20 border border-red-500/50 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/40 transition">Stop Route</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={onStartRoute} className={PRIMARY_BTN_GHOST}>
                                        <Play className="h-5 w-5 fill-current" /> Fetch & Start Simulation
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <BookmarkPromptDialog 
                location={bookmarkPromptLocation}
                onClose={() => setBookmarkPromptLocation(null)}
                onSave={(name) => {
                    if (bookmarkPromptLocation) onAddBookmark({ id: generateId(), lat: bookmarkPromptLocation.lat, lon: bookmarkPromptLocation.lon, label: name });
                    setBookmarkPromptLocation(null);
                }}
            />

            <ConfirmDialog
                isOpen={pendingModeSwitch !== null}
                title="Stop Route Simulation?"
                message="Switching modes will permanently stop your active route simulation. Your waypoints will be saved."
                confirmLabel="Stop & Switch"
                cancelLabel="Cancel"
                confirmTone="danger"
                onConfirm={() => {
                    if (pendingModeSwitch) {
                        onStopRoute(true);
                        onModeChange(pendingModeSwitch);
                        setPendingModeSwitch(null);
                    }
                }}
                onCancel={() => setPendingModeSwitch(null)}
            />

            <ConfirmDialog
                isOpen={pendingOverride !== null}
                title="Stop Route Simulation?"
                message="Using this feature will permanently stop your active route simulation. Your waypoints will be saved."
                confirmLabel="Stop & Continue"
                cancelLabel="Cancel"
                confirmTone="danger"
                onConfirm={() => {
                    onStopRoute(true); // True = clear the blue line but keep waypoints
                    if (pendingOverride === "teleport" && selectedLocation) {
                        onTeleport(selectedLocation.lat, selectedLocation.lon, selectedLocation.label);
                    } else if (pendingOverride === "queue") {
                        handleSaveStagedToQueue();
                    }
                    setPendingOverride(null);
                }}
                onCancel={() => setPendingOverride(null)}
            />
        </div>
    );
}