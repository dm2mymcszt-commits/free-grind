import { useState, useEffect } from "react";
import { Info, X } from "lucide-react";
import { Button } from "./ui/button";

const REPLY_WARNING_KEY = "fg-reply-warning-seen";

type ReplyWarningModalProps = {
    isOpen: boolean;
    onProceed: () => void;
    onCancel: () => void;
};

export function ReplyWarningModal({ isOpen, onProceed, onCancel }: ReplyWarningModalProps) {
    const [dontShowAgain, setDontAskAgain] = useState(false);

    // If they already dismissed this forever, automatically proceed without showing the modal
    useEffect(() => {
        if (isOpen && window.localStorage.getItem(REPLY_WARNING_KEY) === "true") {
            onProceed();
        }
    }, [isOpen, onProceed]);

    if (!isOpen || window.localStorage.getItem(REPLY_WARNING_KEY) === "true") return null;

    const handleConfirm = () => {
        if (dontShowAgain) {
            window.localStorage.setItem(REPLY_WARNING_KEY, "true");
        }
        onProceed();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-center gap-2 text-[var(--text)]">
                        <Info className="h-5 w-5 text-blue-400" />
                        <h2 className="text-sm font-semibold">How Replies Work</h2>
                    </div>
                    <button type="button" onClick={onCancel} className="rounded-md p-1 hover:bg-black/10">
                        <X className="h-5 w-5 text-[var(--text-muted)]" />
                    </button>
                </div>
                
                <div className="p-5">
                    <p className="mb-4 text-sm text-[var(--text-muted)] leading-relaxed">
                        Due to strict API limitations, Free Grind cannot send native reply boxes to official users.
                    </p>
                    <p className="mb-4 text-sm text-[var(--text-muted)] leading-relaxed">
                        To bypass this, your reply will be sent as a text quote (like <strong className="text-[var(--text)]">&gt; this</strong>). It will still look like a native box on <i>your</i> screen.
                    </p>

                    <label className="mb-5 flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontAskAgain(e.target.checked)}
                            className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="text-sm text-[var(--text)]">Got it, don't show this again</span>
                    </label>

                    <div className="flex gap-3">
                        <Button type="button" onClick={onCancel} className="flex-1 bg-[var(--surface-2)] text-[var(--text)] hover:brightness-110">
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleConfirm} className="flex-1 font-bold">
                            Reply
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}