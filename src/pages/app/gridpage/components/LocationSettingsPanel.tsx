import { Crosshair, Loader2, Bookmark, MapPin, Search, Trash2, ListPlus, Play, Navigation, ChevronDown, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import type { GeocodeResult, SelectedLocation } from "../../GridPage.types";
import { LeafletLocationPicker } from "./LeafletLocationPicker";
import type { SavedLocation } from "../../BrowseLocationPage";

// GHOST BUTTONS: Transparent by default, solid accent ONLY on hover
const GLASS_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 px-4 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-black/20 disabled:hover:border-white/20 disabled:hover:text-white disabled:hover:shadow-none";
const PRIMARY_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-transparent px-4 text-sm font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all duration-300 hover:scale-[1.02] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_50%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:bg-transparent disabled:hover:text-[var(--accent)]";

// Custom Liquid Glass Modal for naming Bookmarks
function BookmarkPromptDialog({ location, onClose, onSave }: { location: SelectedLocation | null; onClose: () => void; onSave: (name: string) => void; }) {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [name, setName] = useState("");

    useEffect(() => {
        if (location) {
            setName(location.label);
            setIsClosing(false);
            if (!dialogRef.current?.open) {
                try { dialogRef.current?.showModal(); } catch { dialogRef.current?.show(); }
            }
        } else if (dialogRef.current?.open) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                dialogRef.current?.close();
                setIsClosing(false);
            }, 250);
            return () => clearTimeout(timer);
        }
    }, [location]);

    return (
        <dialog
            ref={dialogRef}
            className={`fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-0 text-[var(--text)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] ${isClosing ? "dialog-closing" : ""}`}
            onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
        >
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
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Home, Work, Paris..."
                    className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all"
                    autoFocus
                />
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
        <div
            className="relative overflow-hidden shrink-0 rounded-2xl border border-white/5 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] select-none touch-pan-y"
            style={{
                height: isAnimatingOut ? "0px" : "auto", minHeight: isAnimatingOut ? "0px" : "64px",
                opacity: isAnimatingOut ? 0 : 1, transform: isAnimatingOut ? "scaleY(0.8)" : "none", transformOrigin: "center top",
            }}
        >
            {currentX < 0 && (
                <div className="absolute inset-y-0 right-0 bg-gradient-to-r from-red-600/15 to-red-600/80 backdrop-blur-md z-0 cursor-pointer" style={{ width: `${Math.abs(currentX)}px` }} onClick={triggerDelete} />
            )}
            {currentX < -60 && (
                <div className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white z-20 pointer-events-none transition-opacity duration-200" style={{ width: `${Math.abs(currentX)}px` }}>
                    <div className="flex flex-col items-center gap-1">
                        <Trash2 className="h-5 w-5 text-red-100 drop-shadow-[0_2px_8px_rgba(239,68,68,0.6)] animate-pulse" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-100">Delete</span>
                    </div>
                </div>
            )}
            <div
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
                className="relative bg-transparent w-full h-full z-10 shrink-0 select-none cursor-grab active:cursor-grabbing"
                style={{
                    transform: `translateX(${currentX}px)`,
                    filter: currentX < 0 ? `blur(${Math.min(6, Math.abs(currentX) / 25)}px)` : "none",
                    opacity: currentX < 0 ? Math.max(0.3, 1 - Math.abs(currentX) / 250) : 1,
                    transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), filter 0.25s ease, opacity 0.25s ease",
                }}
            >
                {children}
            </div>
        </div>
    );
}

type LocationSettingsPanelProps = {
    mode: "static" | "dynamic";
    onModeChange: (m: "static" | "dynamic") => void;

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
};

export function LocationSettingsPanel({
    mode,
    onModeChange,
    isDetectingLocation,
    onUseCurrentLocation,
    locationQuery,
    onLocationQueryChange,
    isSearchingLocation,
    locationResults,
    onStageLocation,
    selectedLocation,
    isMapPickerOpen,
    mapPickerError,
    onToggleMapPicker,
    onMapPick,
    onMapPickerError,
    onTeleport,
    initialCenter,
    bookmarks,
    queue,
    queueInterval,
    queueIndex = 0,
    queueTimestamp = Date.now(),
    onAddBookmark,
    onDeleteBookmark,
    onAddQueue,
    onDeleteQueue,
    onClearQueue,
    onChangeInterval,
}: LocationSettingsPanelProps) {
    const { t } = useTranslation();
    const [now, setNow] = useState(Date.now());
    const [bookmarkPromptLocation, setBookmarkPromptLocation] = useState<SelectedLocation | null>(null);
    const [confirmClearQueue, setConfirmClearQueue] = useState(false);

    // Reset the "Are you sure?" button after 3 seconds if not clicked
    useEffect(() => {
        if (confirmClearQueue) {
            const timer = setTimeout(() => setConfirmClearQueue(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmClearQueue]);

    // Live UI timer (Only updates visually if mode is dynamic)
    useEffect(() => {
        if (mode !== "dynamic" || queue.length <= 1) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [mode, queue.length]);

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const getRemainingTime = () => {
        if (mode === "static") return "PAUSED";

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

    return (
        <div className="flex flex-col gap-6">
            
            {/* EXPLICIT MODE TOGGLE WITH ACTIVE BADGES */}
            <div className="mx-auto flex w-full max-w-[420px] items-center rounded-[1.2rem] bg-black/40 p-1.5 backdrop-blur-xl shadow-inner border border-white/5">
                <button
                    type="button"
                    onClick={() => onModeChange("static")}
                    className={`relative flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "static" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}
                >
                    <span className="relative z-20 flex items-center justify-center gap-2">
                        <MapPin className="h-4 w-4" /> Static
                    </span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">
                        {mode === "static" ? <span className="text-[var(--accent)] bg-[var(--accent-contrast)] shadow-sm px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}
                    </span>
                    {mode === "static" && (
                        <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onModeChange("dynamic")}
                    className={`relative flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "dynamic" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}
                >
                    <span className="relative z-20 flex items-center justify-center gap-2">
                        <Play className="h-4 w-4" fill={mode === "dynamic" ? "currentColor" : "none"} /> Dynamic
                    </span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">
                        {mode === "dynamic" ? <span className="text-[var(--accent)] bg-[var(--accent-contrast)] shadow-sm px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}
                    </span>
                    {mode === "dynamic" && (
                        <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />
                    )}
                </button>
            </div>

            {/* Deep Liquid Glass Master Container */}
            <div className="rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] overflow-hidden p-5 sm:p-6">
                
                {/* Search & Map Section (Shared) */}
                <div className="mb-8 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[var(--text)] drop-shadow-sm">
                            {mode === "static" ? "Find Location" : "Add to Queue"}
                        </h2>
                        <button
                            type="button"
                            onClick={onUseCurrentLocation}
                            disabled={isDetectingLocation}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-contrast)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                        >
                            {isDetectingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                            GPS
                        </button>
                    </div>

                    <div className="relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                            {isSearchingLocation ? <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> : <Search className="h-5 w-5" />}
                        </div>
                        <input
                            type="text"
                            value={locationQuery}
                            onChange={(event) => onLocationQueryChange(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                            placeholder="Search city, area, or zip code..."
                            className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 py-3.5 pl-12 pr-4 text-sm font-semibold text-[var(--text)] transition-all outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] placeholder:font-medium"
                        />
                    </div>

                    {locationResults.length > 0 && (
                        <div className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2 shadow-inner">
                            {locationResults.map((result) => (
                                <button
                                    key={`${result.lat}:${result.lon}:${result.display_name}`}
                                    type="button"
                                    onClick={() => onStageLocation(Number(result.lat), Number(result.lon), result.display_name)}
                                    className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/20 hover:text-white"
                                >
                                    {result.display_name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-inner">
                        <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-black/30 p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                Manual Pin Drop
                            </p>
                            <button
                                type="button"
                                onClick={onToggleMapPicker}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold transition hover:bg-white/10 hover:text-white"
                            >
                                {isMapPickerOpen ? "Close Map" : "Open Map"}
                            </button>
                        </div>
                        {isMapPickerOpen ? (
                            mapPickerError ? (
                                <div className="p-4 text-center text-sm font-semibold text-red-400 bg-red-500/10">
                                    {mapPickerError}
                                </div>
                            ) : (
                                <LeafletLocationPicker
                                    selectedLocation={selectedLocation}
                                    onPick={onMapPick}
                                    onError={onMapPickerError}
                                    defaultZoom={11}
                                    initialCenter={initialCenter}
                                />
                            )
                        ) : null}
                    </div>

                    {/* STAGED LOCATION BAR: Now matches the frosted glass look, ghost hover buttons */}
                    {selectedLocation && (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 shadow-inner p-4 animate-in fade-in zoom-in-95 duration-300">
                            <p className="mb-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                Selected Location
                            </p>
                            <p className="mb-4 text-sm font-semibold text-white">
                                {selectedLocation.label}
                            </p>
                            <div className="flex gap-2">
                                {mode === "static" ? (
                                    <>
                                        <button type="button" onClick={() => setBookmarkPromptLocation(selectedLocation)} className={GLASS_BTN_GHOST} title="Save to Bookmarks">
                                            <Bookmark className="h-5 w-5" /> Save
                                        </button>
                                        <button type="button" onClick={() => onTeleport(selectedLocation.lat, selectedLocation.lon, selectedLocation.label)} className={PRIMARY_BTN_GHOST}>
                                            <Navigation className="h-5 w-5 fill-current" /> Teleport Here
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" onClick={handleSaveStagedToQueue} className={PRIMARY_BTN_GHOST}>
                                        <ListPlus className="h-5 w-5" /> Add to Queue
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="my-6 border-t border-white/10" />

                {/* --- CONTEXTUAL BOTTOM HALF --- */}

                {mode === "static" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                                <Bookmark className="h-4 w-4" /> Saved Bookmarks
                            </h3>
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
                                    <SwipeableRow key={bookmark.id} onDelete={(comp, rev) => { comp(); onDeleteBookmark(bookmark.id); }}>
                                        <div className="flex h-full w-full items-center justify-between rounded-2xl border border-white/5 bg-black/20 p-4 transition-all hover:bg-black/40">
                                            <div className="min-w-0 pr-4">
                                                <p className="truncate text-sm font-bold text-white mb-0.5">{bookmark.label}</p>
                                                <p className="text-xs font-medium text-[var(--text-muted)]">{bookmark.lat.toFixed(4)}, {bookmark.lon.toFixed(4)}</p>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => onTeleport(bookmark.lat, bookmark.lon, bookmark.label)}
                                                className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-contrast)] shadow-lg transition-all hover:scale-105 active:scale-95"
                                            >
                                                Teleport
                                            </button>
                                        </div>
                                    </SwipeableRow>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {mode === "dynamic" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        
                        {/* CYCLE INTERVAL: Now frosted glass, matching "Manual Pin Drop" */}
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[var(--accent)] shadow-inner">
                                    <Timer className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white drop-shadow-sm">Cycle Interval</h3>
                                    <p className="text-xs font-medium text-[var(--text-muted)]">Time spent at each location</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center rounded-xl border border-[var(--accent)]/40 bg-black/40 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all overflow-hidden">
                                    <input
                                        type="number"
                                        min={1}
                                        value={
                                            queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 :
                                            queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : 
                                            queueInterval
                                        }
                                        onChange={(e) => {
                                            const val = Math.max(1, Number(e.target.value) || 1);
                                            // Keep current multiplier
                                            if (queueInterval >= 1440 && queueInterval % 1440 === 0) onChangeInterval(val * 1440);
                                            else if (queueInterval >= 60 && queueInterval % 60 === 0) onChangeInterval(val * 60);
                                            else onChangeInterval(val);
                                        }}
                                        className="w-16 bg-transparent py-2.5 pl-3 text-center text-sm font-bold text-white outline-none appearance-none m-0"
                                    />
                                    <div className="relative flex h-full items-center border-l border-white/10 bg-[var(--surface)]/50">
                                        <select
                                            value={
                                                queueInterval >= 1440 && queueInterval % 1440 === 0 ? "days" :
                                                queueInterval >= 60 && queueInterval % 60 === 0 ? "hours" : 
                                                "mins"
                                            }
                                            onChange={(e) => {
                                                const currentNumeric = 
                                                    queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 :
                                                    queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : 
                                                    queueInterval;
                                                
                                                if (e.target.value === "days") onChangeInterval(currentNumeric * 1440);
                                                else if (e.target.value === "hours") onChangeInterval(currentNumeric * 60);
                                                else onChangeInterval(currentNumeric);
                                            }}
                                            className="h-full w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-3 pr-8 text-sm font-bold text-[var(--accent)] outline-none"
                                        >
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
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                                <ListPlus className="h-4 w-4" /> Active Queue
                            </h3>
                            <div className="flex items-center gap-2">
                                {queue.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (confirmClearQueue) {
                                                onClearQueue();
                                                setConfirmClearQueue(false);
                                            } else {
                                                setConfirmClearQueue(true);
                                            }
                                        }}
                                        className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                                            confirmClearQueue 
                                                ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" 
                                                : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white border border-white/5"
                                        }`}
                                    >
                                        {confirmClearQueue ? "Are you sure?" : "Clear"}
                                    </button>
                                )}
                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                                    {queue.length} Stops
                                </span>
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
                                    const isActive = idx === queueIndex && queue.length > 1;
                                    const isNext = idx === (queueIndex + 1) % queue.length;
                                    
                                    // NO SOLID COLORS: Frosted dark background with glowing accent border
                                    const cardStyle = isActive 
                                        ? "border-[var(--accent)] bg-black/40 shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]" 
                                        : "border-white/5 bg-black/20 hover:bg-black/40";
                                    
                                    return (
                                        <SwipeableRow key={qItem.id} onDelete={(comp, rev) => { comp(); onDeleteQueue(qItem.id); }}>
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
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]">
                                                            Active
                                                        </span>
                                                        <span className="text-xs font-bold tabular-nums tracking-wider text-white">
                                                            {getRemainingTime()}
                                                        </span>
                                                    </div>
                                                )}

                                                {!isActive && isNext && queue.length > 1 && (
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
            </div>

            {/* Custom Premium Prompt for Naming Bookmarks */}
            <BookmarkPromptDialog 
                location={bookmarkPromptLocation}
                onClose={() => setBookmarkPromptLocation(null)}
                onSave={(name) => {
                    if (bookmarkPromptLocation) {
                        onAddBookmark({ id: generateId(), lat: bookmarkPromptLocation.lat, lon: bookmarkPromptLocation.lon, label: name });
                    }
                    setBookmarkPromptLocation(null);
                }}
            />
        </div>
    );
}