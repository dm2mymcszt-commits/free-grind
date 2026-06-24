import { useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "./ui/button";

const NOTIFICATION_WARNING_KEY = "fg-notification-warning-seen";

type NotificationLimitationsModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function NotificationLimitationsModal({ isOpen, onClose }: NotificationLimitationsModalProps) {
    const [dontShowAgain, setDontShowAgain] = useState(false);

    if (!isOpen) return null;

    const handleClose = () => {
        if (dontShowAgain) {
            window.localStorage.setItem(NOTIFICATION_WARNING_KEY, "true");
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-center gap-2 text-[var(--text)]">
                        <Info className="h-5 w-5 text-blue-400" />
                        <h2 className="text-sm font-semibold">iOS Notification Info</h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-black/10">
                        <X className="h-5 w-5 text-[var(--text-muted)]" />
                    </button>
                </div>
                
                <div className="p-5">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">How it works</h3>
                    <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed">
                        Notifications are generated locally on your device whenever the active app receives incoming chat events.
                    </p>

                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-red-400">Limitations</h3>
                    <p className="mb-3 text-xs text-[var(--text-muted)] leading-relaxed">
                        On iOS, when you lock your screen or swipe away from the app, the system immediately suspends background network activity. 
                    </p>
                    <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed">
                        As a result, <strong>you will only receive notifications while the app is actively open in the foreground</strong>. Offline or background sync is currently not supported due to iOS operating system restrictions.
                    </p>

                    <label className="mb-5 flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                            className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                        />
                        <span className="text-sm text-[var(--text)]">Do not show this again</span>
                    </label>

                    <div className="flex gap-3">
                        <Button type="button" onClick={handleClose} className="flex-1 font-bold">
                            Got it
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
