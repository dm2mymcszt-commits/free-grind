import { useCallback, useRef } from "react";

export function useLongPress(onLongPress: () => void, delay = 500) {
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef<{ x: number; y: number } | null>(null);

    const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        timeout.current = setTimeout(() => {
            onLongPress();
            timeout.current = null;
        }, delay);
    }, [onLongPress, delay]);

    const clear = useCallback(() => {
        if (timeout.current) {
            clearTimeout(timeout.current);
            timeout.current = null;
        }
    }, []);

    const move = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!timeout.current || !startPos.current) return;
        
        const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const dx = Math.abs(currentX - startPos.current.x);
        const dy = Math.abs(currentY - startPos.current.y);

        // If finger/mouse moves more than 10px, it's a scroll. Cancel the long press!
        if (dx > 10 || dy > 10) {
            clear();
        }
    }, [clear]);

    return {
        onMouseDown: start,
        onTouchStart: start,
        onMouseMove: move,
        onTouchMove: move,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchEnd: clear,
        onTouchCancel: clear,
    };
}