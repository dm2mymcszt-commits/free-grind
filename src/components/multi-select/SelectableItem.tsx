import React, { useRef } from "react";
import { useMultiSelect, type ViewType } from "../../contexts/MultiSelectContext";
import { useLongPress } from "../../hooks/useLongPress";
import { Check } from "lucide-react";

interface SelectableItemProps {
    id: string;
    name: string;
    profileId?: string; // <-- ADDED
    viewType: ViewType;
    children: React.ReactNode;
    onNormalClick: () => void;
    roundedClassName?: string;
}

export function SelectableItem({ id, name, profileId, viewType, children, onNormalClick, roundedClassName = "rounded-xl" }: SelectableItemProps) {
    const { isActive, viewType: activeViewType, activateMode, toggleSelection, isSelected } = useMultiSelect();
    const selected = isSelected(id);
    const wasLongPressedRef = useRef(false);

    const isModeActiveForThisView = isActive && activeViewType === viewType;

    const handleActivate = () => {
        if (!isActive) {
            wasLongPressedRef.current = true;
            activateMode(viewType, { id, name, profileId });
            setTimeout(() => { wasLongPressedRef.current = false; }, 300);
        }
    };

    const longPressGestures = useLongPress(handleActivate, 400);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        handleActivate();
    };

    const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
        if (wasLongPressedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (isModeActiveForThisView) {
            e.preventDefault();
            e.stopPropagation();
            toggleSelection({ id, name, profileId });
        } else {
            onNormalClick();
        }
    };

    return (
        <div 
            role="button"
            className="w-full h-full relative group transition-transform duration-200 select-none cursor-pointer"
            onContextMenu={handleContextMenu}
            onClick={handleClick}
            style={{ WebkitTouchCallout: "none" }}
            {...(!isModeActiveForThisView ? longPressGestures : {})}
        >
            <div className="w-full h-full relative">
                <div className={`w-full h-full ${isModeActiveForThisView ? "pointer-events-none" : ""}`}>
                    {children}
                </div>

                <div 
                    className={`absolute inset-0 z-10 pointer-events-none border-[3px] transition-all duration-300 ${roundedClassName} ${
                        selected ? "border-[var(--accent)]" : "border-transparent"
                    }`}
                    style={{
                        backgroundColor: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent"
                    }}
                >
                    <div 
                        className={`absolute top-3 left-3 h-6 w-6 sm:h-7 sm:w-7 rounded-full border-2 shadow-lg flex items-center justify-center backdrop-blur-md transition-all duration-300 ${
                            selected 
                                ? "border-[var(--accent)] scale-100 opacity-100" 
                                : isModeActiveForThisView 
                                    ? "bg-black/40 border-white/50 scale-100 opacity-100" 
                                    : "scale-50 opacity-0 bg-black/40 border-white/40"
                        }`}
                        style={{
                            backgroundColor: selected ? "var(--accent)" : undefined
                        }}
                    >
                        {selected && <Check className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--accent-contrast, black)" }} strokeWidth={3} />}
                    </div>
                </div>
            </div>
        </div>
    );
}