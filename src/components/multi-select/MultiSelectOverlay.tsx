import { useState, useEffect } from "react";
import { X, Trash2, CheckSquare, Ban, Loader2 } from "lucide-react";
import { useMultiSelect } from "../../contexts/MultiSelectContext";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { deleteConversationOnly } from "../../services/chatDb";

export function MultiSelectOverlay() {
    const { isActive, selectedItems, viewType, deactivateMode, selectableItems, setSelectedItems } = useMultiSelect();
    const [confirmAction, setConfirmAction] = useState<"delete" | "block" | null>(null);
    const [progressCount, setProgressCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = useNavigate();
    const api = useApiFunctions();

    // Reset confirmation state when selection changes or deactivates
    useEffect(() => {
        setConfirmAction(null);
    }, [selectedItems.length, isActive]);

    // 1. ESC Key Global Listener (Instant Deactivation & Navigation)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isActive) {
                e.preventDefault();
                deactivateMode();
                navigate(-1); // Go back one level
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, deactivateMode, navigate]);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const handleAction = async (action: string) => {
        if (!api) {
            toast.error("API not ready.");
            return;
        }

        setIsProcessing(true);
        setProgressCount(0);
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
                        setProgressCount(prev => prev + 1);
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
                            await deleteConversationOnly(item.id);
                            successCount++;
                        } catch (e) {
                            console.error(`Failed to delete conversation ${item.id}`, e);
                        }
                        setProgressCount(prev => prev + 1);
                        await delay(100);
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
                        setProgressCount(prev => prev + 1);
                        await delay(500); 
                    }
                    toast.success(`Blocked ${successCount} profiles.`);
                    break;
            }
        } catch (error) {
            toast.error("An error occurred during bulk processing.");
        } finally {
            setIsProcessing(false);
            setConfirmAction(null);
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
                    isActive ? "translate-y-0 opacity-100 scale-100" : "translate-y-[150%] opacity-0 scale-90 pointer-events-none"
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
                        <div className="flex items-center gap-2">
                            {viewType === "inbox" && (
                                <button
                                    onClick={() => {
                                        if (selectedItems.length === selectableItems.length) {
                                            setSelectedItems([]);
                                        } else {
                                            setSelectedItems(selectableItems);
                                        }
                                    }}
                                    disabled={isProcessing || selectableItems.length === 0}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition disabled:opacity-50"
                                >
                                    {selectedItems.length === selectableItems.length && selectableItems.length > 0 ? "Deselect All" : "Select All"}
                                </button>
                            )}
                            <button 
                                onClick={deactivateMode}
                                disabled={isProcessing}
                                className="bg-white/10 hover:bg-white/20 transition-colors rounded-full p-1.5 text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {confirmAction ? (
                        <div className="flex items-center justify-between gap-3 px-1 pb-1 w-full animate-in slide-in-from-bottom-2 duration-300">
                            <span className="text-xs font-semibold text-gray-200">
                                {confirmAction === "delete" 
                                    ? `Delete ${selectedItems.length} chats?` 
                                    : `Block ${selectedItems.length} profiles?`}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    disabled={isProcessing}
                                    className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleAction(confirmAction)}
                                    disabled={isProcessing}
                                    className="text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shadow-md"
                                    style={{ 
                                        backgroundColor: confirmAction === "delete" ? "#EF4444" : "var(--accent)", 
                                        color: confirmAction === "delete" ? "#FFFFFF" : "#1A202C" 
                                    }}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            {confirmAction === "delete" 
                                                ? `Deleting (${progressCount}/${selectedItems.length})` 
                                                : `Blocking (${progressCount}/${selectedItems.length})`}
                                        </>
                                    ) : (
                                        confirmAction === "delete" ? "Confirm Delete" : "Confirm Block"
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex sm:flex-wrap items-center justify-start gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x w-full">

                            {/* DELETE (Only for inbox, white style) */}
                            {viewType === "inbox" && (
                                <button 
                                    onClick={() => setConfirmAction("delete")} 
                                    disabled={selectedItems.length === 0 || isProcessing} 
                                    className="snap-start shrink-0 flex items-center gap-2 border border-white/20 bg-white/10 hover:bg-white/25 px-4 py-2.5 rounded-2xl transition disabled:opacity-50 text-sm font-semibold text-white"
                                >
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            )}

                            {/* READ (Only for inbox, default outline style) */}
                            {viewType === "inbox" && (
                                <button 
                                    onClick={() => handleAction("read")} 
                                    disabled={selectedItems.length === 0 || isProcessing} 
                                    className={secondaryBtnClass}
                                >
                                    <CheckSquare className="h-4 w-4" /> Read
                                </button>
                            )}

                            {/* BLOCK (For both grid & inbox, red style) */}
                            <button 
                                onClick={() => setConfirmAction("block")} 
                                disabled={selectedItems.length === 0 || isProcessing} 
                                className="snap-start shrink-0 flex items-center gap-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-4 py-2.5 rounded-2xl transition disabled:opacity-50 text-sm font-semibold text-red-400"
                            >
                                <Ban className="h-4 w-4" /> Block
                            </button>

                        </div>
                    )}

                </div>
            </div>
        </>
    );
}