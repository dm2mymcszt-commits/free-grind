import { Loader2, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    isProcessing?: boolean;
    confirmTone?: "default" | "danger";
    dontAskAgainLabel?: string;
    dontAskAgainChecked?: boolean;
    onDontAskAgainChange?: (checked: boolean) => void;
};

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    isProcessing = false,
    dontAskAgainLabel,
    dontAskAgainChecked = false,
    onDontAskAgainChange,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    // Intercept isOpen changes to play exit animations before closing
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            setIsClosing(false);
            if (!dialog.open) {
                try {
                    dialog.showModal();
                } catch {
                    // Fallback avoids leaving the UI inert if showModal cannot transition state.
                    dialog.show();
                }
            }
        } else if (dialog.open) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                dialog.close();
                setIsClosing(false);
            }, 250); // Matches the exit animation duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    useEffect(() => {
        return () => {
            const dialog = dialogRef.current;
            if (dialog?.open) {
                dialog.close();
            }
        };
    }, []);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleCancel = (event: Event) => {
            event.preventDefault();
            if (!isProcessing) {
                onCancel();
            }
        };

        dialog.addEventListener("cancel", handleCancel);
        return () => {
            dialog.removeEventListener("cancel", handleCancel);
        };
    }, [isProcessing, onCancel]);

    // Premium Spotlight Hover Button (Neutral Idle -> Glowing Accent Hover)
    const confirmButtonClassName =
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-6 text-sm font-bold text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-[var(--surface-2)] disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text)] disabled:hover:shadow-none";

    if (typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <>
            <style>{`
                /* Entrance Animation */
                dialog[open]:not(.dialog-closing) {
                    animation: dialog-spring-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards;
                }
                dialog[open]:not(.dialog-closing)::backdrop {
                    animation: backdrop-fade-in 0.3s ease-out forwards;
                    backdrop-filter: blur(12px);
                }
				
                /* Exit Animation */
                dialog[open].dialog-closing {
                    animation: dialog-spring-out 0.25s ease-in forwards;
                }
                dialog[open].dialog-closing::backdrop {
                    animation: backdrop-fade-out 0.25s ease-in forwards;
                    backdrop-filter: blur(12px);
                }

                @keyframes dialog-spring-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes dialog-spring-out {
                    from { opacity: 1; transform: scale(1); }
                    to { opacity: 0; transform: scale(0.95); }
                }
                @keyframes backdrop-fade-in {
                    from { background-color: rgba(0, 0, 0, 0); }
                    to { background-color: rgba(0, 0, 0, 0.55); }
                }
                @keyframes backdrop-fade-out {
                    from { background-color: rgba(0, 0, 0, 0.55); }
                    to { background-color: rgba(0, 0, 0, 0); }
                }
            `}</style>
			
            {isOpen && (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) && (
                <div 
                    className="fixed inset-0 bg-black/55 backdrop-blur-[12px] pointer-events-none"
                    style={{
                        zIndex: 9990,
                        animation: isClosing 
                             ? "backdrop-fade-out 0.25s ease-in forwards" 
                             : "backdrop-fade-in 0.3s ease-out forwards"
                    }}
                />
            )}
            <dialog
                ref={dialogRef}
                className={`fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-0 text-[var(--text)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] ${isClosing ? "dialog-closing" : ""}`}
                onClick={(event) => {
                    if (event.target === dialogRef.current && !isProcessing) {
                        onCancel();
                    }
                }}
                style={{ zIndex: 9995 }}
            >
                <div className="p-5 sm:p-6">
                    <p className="text-lg font-bold text-[var(--text)] drop-shadow-sm">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{message}</p>

                    {dontAskAgainLabel && onDontAskAgainChange ? (
                        <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]">
                            <div className="relative flex h-5 w-5 items-center justify-center">
                                {/* Custom Animated Checkbox */}
                                <input
                                    type="checkbox"
                                    checked={dontAskAgainChecked}
                                    onChange={(event) => onDontAskAgainChange(event.target.checked)}
                                    disabled={isProcessing}
                                    className="peer h-5 w-5 appearance-none rounded-[0.4rem] border border-[var(--border)] bg-[var(--surface)] transition-all duration-300 checked:border-[var(--accent)] checked:bg-[var(--accent)] checked:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] disabled:cursor-not-allowed"
                                />
                                <Check 
                                    className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity duration-300 peer-checked:opacity-100" 
                                    strokeWidth={3.5} 
                                />
                            </div>
                            <span className="select-none">{dontAskAgainLabel}</span>
                        </label>
                    ) : null}

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isProcessing}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-transparent px-4 text-sm font-semibold text-[var(--text-muted)] transition-all duration-300 hover:text-[var(--text)] active:scale-95 disabled:opacity-60"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="button"
                            onClick={() => void onConfirm()}
                            disabled={isProcessing}
                            className={confirmButtonClassName}
                        >
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            <span>{confirmLabel}</span>
                        </button>
                    </div>
                </div>
            </dialog>
        </>,
        document.getElementById("app") ?? document.body
    );
}