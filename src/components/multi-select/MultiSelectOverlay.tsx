import { useState, useEffect } from "react";
import { X, Trash2, MessageSquare, Ghost, CheckSquare, Send, Ban, Loader2 } from "lucide-react";
import { useMultiSelect } from "../../contexts/MultiSelectContext";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";

export function MultiSelectOverlay() {
    const { isActive, selectedItems, viewType, deactivateMode } = useMultiSelect();
    const [activeModal, setActiveModal] = useState<"block" | "message" | null>(null);
    const [messageText, setMessageText] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = useNavigate();
    const api = useApiFunctions();

    // 1. ESC Key Global Listener (Instant Deactivation & Navigation)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isActive) {
                e.preventDefault();
                if (activeModal) {
                    setActiveModal(null);
                } else {
                    deactivateMode();
                    navigate(-1); // Go back one level
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, activeModal, deactivateMode, navigate]);

    // Truncated Recipient List
    const generateRecipientString = () => {
        if (selectedItems.length === 0) return "";
        if (selectedItems.length <= 3) return selectedItems.map(s => s.name).join(", ");
        return `${selectedItems[0].name}, ${selectedItems[1].name}, ${selectedItems[2].name}, +${selectedItems.length - 3} others`;
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const handleAction = async (action: string) => {
        if (!api) {
            toast.error("API not ready.");
            return;
        }

        setIsProcessing(true);
        let successCount = 0;

        try {
            switch (action) {
                case "read":
                    for (const item of selectedItems) {
                        try {
                            const chatData = await api.listMessages({ conversationId: item.id });
                            if (chatData.messages && chatData.messages.length > 0) {
                                const lastMsg = chatData.messages[chatData.messages.length - 1];
                                if (lastMsg && lastMsg.messageId) {
                                    await api.markRead(item.id, lastMsg.messageId);
                                    successCount++;
                                }
                            }
                        } catch (e) {
                            console.error(`Failed to mark read for ${item.id}`, e);
                        }
                        await delay(400); 
                    }
                    toast.success(`Marked ${successCount} chats as read!`);
                    window.dispatchEvent(new Event("fg-ghost-update"));
                    break;
                
                case "ghost":
                    const exceptionsStr = window.localStorage.getItem("fg-ghost-exceptions") || "{}";
                    let exceptions: Record<string, boolean> = {};
                    try { exceptions = JSON.parse(exceptionsStr) as Record<string, boolean>; } catch (e) {}
                    
                    for (const item of selectedItems) {
                        exceptions[item.id] = true;
                    }
                    window.localStorage.setItem("fg-ghost-exceptions", JSON.stringify(exceptions));
                    
                    window.dispatchEvent(new Event("fg-ghost-update"));
                    toast.success(`Ghost mode enabled for ${selectedItems.length} profiles!`);
                    break;

                case "delete":
                    for (const item of selectedItems) {
                        try {
                            await api.deleteConversation(item.id);
                            successCount++;
                        } catch (e) {
                            console.error(`Failed to delete conversation ${item.id}`, e);
                        }
                        await delay(300);
                    }
                    toast.success(`Deleted ${successCount} conversations.`);
                    break;

                case "block":
                    for (const item of selectedItems) {
                        const targetId = item.profileId || item.id;
                        try {
                            await api.blockProfile(targetId);
                            successCount++;
                        } catch (e) {
                            console.error(`Failed to block profile ${targetId}`, e);
                        }
                        await delay(500); 
                    }
                    toast.success(`Blocked ${successCount} profiles.`);
                    break;

                case "message":
                    if (!messageText.trim()) return;
                    for (const item of selectedItems) {
                        const targetId = item.profileId || item.id;
                        try {
                            await api.sendText({ targetProfileId: Number(targetId), text: messageText });
                            successCount++;
                        } catch (e) {
                            console.error(`Failed to send message to ${targetId}`, e);
                        }
                        await delay(1000); 
                    }
                    toast.success(`Message sent to ${successCount} profiles!`);
                    setMessageText("");
                    break;
            }
        } catch (error) {
            toast.error("An error occurred during bulk processing.");
        } finally {
            setIsProcessing(false);
            setActiveModal(null);
            deactivateMode();
            
            if (action === "delete" || action === "block") {
                setTimeout(() => window.location.reload(), 1000);
            }
        }
    };

    // Base secondary button class (Subtle outline/hover)
    const secondaryBtnClass = "snap-start shrink-0 flex items-center gap-2 border border-white/10 px-4 py-2.5 rounded-2xl transition hover:bg-white/5 disabled:opacity-50 text-sm font-semibold text-gray-200";

    return (
        <>
            {/* LIQUID GLASS ACTION BAR */}
            <div 
                className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[96%] max-w-3xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    isActive && !activeModal ? "translate-y-0 opacity-100 scale-100" : "translate-y-[150%] opacity-0 scale-90 pointer-events-none"
                }`}
            >
                {/* 2. iOS 26 Liquid Glass implementation */}
                <div className="bg-[#1A202C]/65 backdrop-blur-[16px] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-[2rem] p-3 flex flex-col gap-3">
                    
                    <div className="flex items-center justify-between px-3 pt-1">
                        <span className="text-white font-bold tracking-wide text-sm flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[#1A202C] text-xs">
                                {selectedItems.length}
                            </span>
                            Selected
                        </span>
                        <button 
                            onClick={deactivateMode}
                            disabled={isProcessing}
                            className="bg-white/10 hover:bg-white/20 transition-colors rounded-full p-1.5 text-gray-300 hover:text-white disabled:opacity-50"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex sm:flex-wrap items-center justify-start gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x">
                        
                        {/* PRIMARY ACTION (Solid Accent) */}
                        <button 
                            onClick={() => setActiveModal("message")} 
                            disabled={selectedItems.length === 0 || isProcessing} 
                            className="snap-start shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl transition disabled:opacity-50 text-sm font-bold shadow-md hover:brightness-110"
                            style={{ backgroundColor: "var(--accent)", color: "#1A202C" }}
                        >
                            <MessageSquare className="h-4 w-4" /> Message
                        </button>

                        <button onClick={() => setActiveModal("block")} disabled={selectedItems.length === 0 || isProcessing} className={secondaryBtnClass}>
                            <Ban className="h-4 w-4" /> Block
                        </button>

                        {/* INBOX SPECIFIC ACTIONS */}
                        {viewType === "inbox" && (
                            <>
                                <button onClick={() => handleAction("read")} disabled={selectedItems.length === 0 || isProcessing} className={secondaryBtnClass}>
                                    <CheckSquare className="h-4 w-4" /> Read
                                </button>
                                <button onClick={() => handleAction("ghost")} disabled={selectedItems.length === 0 || isProcessing} className={secondaryBtnClass}>
                                    <Ghost className="h-4 w-4" /> Ghost
                                </button>
                                
                                {/* DESTRUCTIVE ACTION (Muted Red Outline) */}
                                <button onClick={() => handleAction("delete")} disabled={selectedItems.length === 0 || isProcessing} className="snap-start shrink-0 flex items-center gap-2 border border-red-500/30 px-4 py-2.5 rounded-2xl transition hover:bg-red-500/10 disabled:opacity-50 text-sm font-semibold text-red-400">
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* BLOCK MODAL */}
            {activeModal === "block" && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-[#1A202C] border border-[var(--accent)]/30 rounded-[2rem] w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-300">
                        <Ban className="h-12 w-12 mx-auto mb-4" style={{ color: "var(--accent)" }} />
                        <h2 className="text-xl font-bold text-white mb-2">Block Profiles?</h2>
                        <p className="text-sm text-gray-400 mb-6">
                            Are you sure you want to block the selected <strong style={{ color: "var(--accent)" }}>{selectedItems.length}</strong> profiles? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="secondary" className="flex-1 rounded-xl bg-white/10 text-white border-0 hover:bg-white/20" onClick={() => setActiveModal(null)} disabled={isProcessing}>Cancel</Button>
                            <button 
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50" 
                                style={{ backgroundColor: "var(--accent)", color: "#1A202C" }} 
                                disabled={isProcessing}
                                onClick={() => handleAction("block")}
                            >
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Block All"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MESSAGE MODAL */}
            {activeModal === "message" && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-[#1A202C] border border-[var(--accent)]/30 rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="bg-black/40 p-5 border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" style={{ color: "var(--accent)" }} /> Bulk Message
                            </h2>
                            <button onClick={() => setActiveModal(null)} disabled={isProcessing} className="text-gray-400 hover:text-white transition disabled:opacity-50"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-5">
                            <div className="mb-5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">To:</label>
                                <div 
                                    className="text-sm font-medium px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-gray-200"
                                >
                                    {generateRecipientString()}
                                </div>
                            </div>
                            <div>
                                <textarea 
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    placeholder="Type your message here..."
                                    disabled={isProcessing}
                                    className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-[var(--accent)] resize-none transition disabled:opacity-50"
                                ></textarea>
                            </div>
                            <button 
                                className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition disabled:opacity-50 hover:brightness-110"
                                style={{ backgroundColor: "var(--accent)", color: "#1A202C" }}
                                disabled={!messageText.trim() || isProcessing}
                                onClick={() => handleAction("message")}
                            >
                                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Message</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}