import { Heart, Loader2, MessageCircle, Pin, PinOff, Search, SlidersHorizontal, User, Trash2, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject, type TouchEventHandler } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { usePreferences } from "../../../contexts/PreferencesContext";
import type { ConversationEntry, InboxFilters } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { InboxAlbumsTabs } from "../components/InboxAlbumsTabs";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import {
    buildChatFiltersDraft,
    formatConversationTime,
    getOtherParticipant,
    getParticipantAvatarUrl,
    getParticipantOnlineMeta,
    getPreviewText,
} from "../chat/chatUtils";
import { isChatGhosted } from "../../../utils/privacy";

// --- NEW IMPORTS FOR AUTO-BLOCK SCANNER ---
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { 
    isOutsideAgeLimits, 
    isOutsideDistanceLimits, 
    shouldAutoBlock, 
    isForbiddenLookingFor,
    notifyAutoBlock 
} from "../../../utils/autoblock";

// --- MULTI-SELECT IMPORT ---
import { SelectableItem } from "../../../components/multi-select/SelectableItem";
import { useMultiSelect } from "../../../contexts/MultiSelectContext";

type RealtimeStatusMeta = {
    className: string;
    symbol: string;
    label: string;
};

type ChatInboxPanelProps = {
    isDesktop: boolean;
    isLoadingInbox: boolean;
    isLoadingMoreInbox: boolean;
    inboxError: string | null;
    inboxFilters: InboxFilters;
    hidePinned: boolean;
    hasActiveInboxFilters: boolean;
    filteredConversations: ConversationEntry[];
    nextPage: number | null;
    realtimeStatusMeta: RealtimeStatusMeta;
    selectedConversationId: string | null;
    userId: number | null;
    localNicknamesByProfileId: Record<string, string>;
    chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
    nowTimestamp: number;
    presenceResults: Record<string, boolean>;
    inboxListRef: RefObject<HTMLDivElement | null>;
    onRefreshInbox: () => void;
    onLoadMoreInbox: () => void;
    onInboxTouchStart: TouchEventHandler<HTMLDivElement>;
    onInboxTouchEnd: TouchEventHandler<HTMLDivElement>;
    onSelectConversation: (conversation: ConversationEntry) => void;
    onViewProfile: (profileId: number) => void;
    onClearInboxFilters: () => void;
    onToggleHidePinned: () => void;
    onToggleFavoritesOnly: () => void;
    onOpenFilters: (filtersDraft: ReturnType<typeof buildChatFiltersDraft>) => void;
    onOpenSearch: () => void;
    onOpenInbox: () => void;
    onOpenAlbums: () => void;
};

export function ChatInboxPanel({
    isDesktop,
    isLoadingInbox,
    isLoadingMoreInbox,
    inboxError,
    inboxFilters,
    hidePinned,
    hasActiveInboxFilters,
    filteredConversations,
    nextPage,
    realtimeStatusMeta,
    selectedConversationId,
    userId,
    localNicknamesByProfileId,
    chatContactIndexByProfileId,
    nowTimestamp,
    presenceResults,
    inboxListRef,
    onRefreshInbox,
    onLoadMoreInbox,
    onInboxTouchStart,
    onInboxTouchEnd,
    onSelectConversation,
    onViewProfile,
    onToggleHidePinned,
    onToggleFavoritesOnly,
    onOpenFilters,
    onOpenSearch,
    onOpenInbox,
    onOpenAlbums,
}: ChatInboxPanelProps) {
    const { t } = useTranslation();
    const { showDebugInfo } = usePreferences();
    const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
    const lastScrollAtRef = useRef(0);
    const lastRequestedPageRef = useRef<number | null>(null);
    const { isActive } = useMultiSelect(); // <-- MULTI-SELECT AWARENESS

    // MAGIC UI REDRAW TRIGGER
    const [, forceRender] = useState(0);
    useEffect(() => {
        const triggerUpdate = () => forceRender(Date.now());
        window.addEventListener("fg-ghost-update", triggerUpdate);
        return () => window.removeEventListener("fg-ghost-update", triggerUpdate);
    }, []);
    
    // --- BACKGROUND SCANNER SETUP ---
    const api = useApiFunctions();
    const scannedProfilesRef = useRef<Set<string>>(new Set());
    const activeQueueRef = useRef<string[]>([]);
    const isProcessingQueueRef = useRef(false);

    // --- NATIVE CONFIRM DIALOG STATE ---
    const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; complete: () => void; revert: () => void } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false);

    const handleDeleteConversation = (conversationId: string, completeSwipe: () => void, revertSwipe: () => void) => {
        const skipConfirm = localStorage.getItem("chat_skip_delete_confirm") === "true";
        
        if (skipConfirm) {
            completeSwipe(); // Instantly animate out
            api.deleteConversation(conversationId).then(() => {
                toast.success(t("chat.toasts.conversation_deleted", { defaultValue: "Conversation deleted" }));
                setTimeout(onRefreshInbox, 300); // Give the swoosh animation time to finish before unmounting
            }).catch((error) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t("chat.errors.delete_conversation", { defaultValue: "Failed to delete conversation" }),
                );
                revertSwipe(); // Snap the row back if the API request fails
            });
            return;
        }

        setDontAskDeleteAgain(false);
        setDeleteCandidate({ id: conversationId, complete: completeSwipe, revert: revertSwipe });
    };

    // Background Profile Scanner Effect
    useEffect(() => {
        const isScannerEnabled = window.localStorage.getItem("fg-inbox-scanner-enabled") === "true";
        if (!isScannerEnabled) return;
        
        const toScan = filteredConversations
            .map((c) => getOtherParticipant(c, userId)?.profileId?.toString())
            .filter((id): id is string => Boolean(id) && !scannedProfilesRef.current.has(id));

        if (toScan.length === 0) return;

        // Queue all unscanned items and flag them to prevent re-queueing
        for (const profileId of toScan) {
            scannedProfilesRef.current.add(profileId);
            if (!activeQueueRef.current.includes(profileId)) {
                activeQueueRef.current.push(profileId);
            }
        }

        // If the background queue processor is already active, let it run
        if (isProcessingQueueRef.current) return;

        let isCancelled = false;

        const processQueue = async () => {
            isProcessingQueueRef.current = true;

            while (activeQueueRef.current.length > 0 && !isCancelled) {
                const profileId = activeQueueRef.current.shift();
                if (!profileId) continue;

                try {
                    const profileDetail = await api.getProfileDetail(profileId);
                    const p = profileDetail as any;

                    const age = p.age;
                    const distance = p.distanceMeters ?? p.distance;
                    const name = p.name || p.displayName || "Unknown";
                    const bio = p.aboutMe;
                    const lookingForTags = p.lookingFor || [];

                    let blockReason = "";

                    if (isOutsideAgeLimits(age)) {
                        blockReason = `Age limit (${age})`;
                    } else if (isOutsideDistanceLimits(distance)) {
                        blockReason = "Distance limit";
                    } else if (isForbiddenLookingFor(lookingForTags)) {
                        blockReason = "Forbidden 'Looking For' tag";
                    } else if (shouldAutoBlock(name, "name")) {
                        blockReason = "Name keyword";
                    } else if (shouldAutoBlock(bio, "bio")) {
                        blockReason = "Bio keyword";
                    }

                    if (blockReason) {
                        console.log(`[BackgroundScanner] Blocking ${profileId} for ${blockReason}`);
                        await api.blockProfile(profileId);
                        notifyAutoBlock(name, `Scanner: ${blockReason}`);
                        
                        onRefreshInbox();
                    }
                } catch (err) {
                    // Ignore minor errors
                }

                // THROTTLE: Wait 1.5 seconds between fetches to prevent Grindr ban hammer!
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
            isProcessingQueueRef.current = false;
        };

        void processQueue();

        return () => {
            isCancelled = true;
            isProcessingQueueRef.current = false; // Safely release lock on unmount so next render can proceed immediately
        };
    }, [filteredConversations, userId, api, onRefreshInbox]);
    // --------------------------------

    const markUserScroll = () => {
        lastScrollAtRef.current = Date.now();
    };

    useEffect(() => {
        const handleWindowScroll = () => {
            lastScrollAtRef.current = Date.now();
        };

        window.addEventListener("scroll", handleWindowScroll, { passive: true });
        window.addEventListener("touchmove", handleWindowScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleWindowScroll);
            window.removeEventListener("touchmove", handleWindowScroll);
        };
    }, []);

    useEffect(() => {
        const sentinel = loadMoreSentinelRef.current;
        if (!sentinel || !nextPage) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) {
                    return;
                }

                if (isLoadingMoreInbox) {
                    return;
                }

                if (lastRequestedPageRef.current === nextPage) {
                    return;
                }

                lastRequestedPageRef.current = nextPage;
                onLoadMoreInbox();
            },
            { root: null, rootMargin: "0px 0px 400px 0px", threshold: 0 },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredConversations.length, isLoadingMoreInbox, nextPage, onLoadMoreInbox]);

    const activeFilterCount = [
        inboxFilters.unreadOnly,
        inboxFilters.chemistryOnly,
        inboxFilters.favoritesOnly,
        inboxFilters.rightNowOnly,
        inboxFilters.onlineNowOnly,
        inboxFilters.distanceMeters !== null && inboxFilters.distanceMeters !== undefined,
        (inboxFilters.positions?.length ?? 0) > 0,
    ].filter(Boolean).length;

    return (
        <PullToRefreshContainer
            className={`flex h-full min-h-0 flex-col overflow-hidden ${
                isDesktop ? "bg-transparent" : "p-0"
            }`}
            contentClassName="flex flex-1 flex-col min-h-0"
            style={
                !isDesktop
                    ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))" }
                    : undefined
            }
            onRefresh={onRefreshInbox}
            isDisabled={isLoadingInbox || isLoadingMoreInbox}
            isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
            refreshingLabel={t("chat.refreshing_inbox")}
            onTouchStartExtra={onInboxTouchStart}
            onTouchEndExtra={onInboxTouchEnd}
        >
            <div
                className={`relative flex shrink-0 flex-col ${isDesktop ? "p-4 border-b border-[var(--border)]" : "px-[var(--app-px)] pb-3"}`}
            >
                {!isDesktop && <PageHeaderBackground color="var(--accent)" />}
                <div className="flex items-center justify-between gap-2">
                    <InboxAlbumsTabs
                        activeTab="inbox"
                        onInboxClick={onOpenInbox}
                        onAlbumsClick={onOpenAlbums}
                        inboxDotColor={
                            realtimeStatusMeta.symbol === "✓"
                                ? "oklch(0.72 0.18 142)"
                                : realtimeStatusMeta.className.includes("red")
                                    ? "oklch(0.65 0.22 25)"
                                    : "oklch(0.75 0.17 75)"
                        }
                    />
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={onToggleFavoritesOnly}
                            className={`rounded-xl border p-2 transition ${inboxFilters.favoritesOnly ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"}`}
                            aria-label={t("browse_filters.options.favorites")}
                            title={t("browse_filters.options.favorites")}
                        >
                            <Heart className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={onToggleHidePinned}
                            className={`rounded-xl border border-[var(--border)] p-2 transition hover:border-[var(--accent)] ${
                                hidePinned
                                    ? "bg-[var(--surface-2)] text-[var(--text)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                            }`}
                            aria-label={hidePinned ? t("chat.show_pinned") : t("chat.hide_pinned")}
                        >
                            {hidePinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenFilters(buildChatFiltersDraft(inboxFilters))}
                            className="relative rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                            aria-label={t("chat.open_filters")}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            {hasActiveInboxFilters && activeFilterCount > 0 ? (
                                <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-contrast)] shadow-sm ring-2 ring-[var(--surface)]">
                                    {activeFilterCount}
                                </span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={onOpenSearch}
                            className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                            aria-label={t("chat.open_search")}
                        >
                            <Search className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {isLoadingInbox ? (
                <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat.loading_inbox")}
                </div>
            ) : inboxError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-[var(--text-muted)]">{inboxError}</p>
                    <button
                        type="button"
                        onClick={onRefreshInbox}
                        className="btn-accent px-4 py-2 text-sm"
                    >
                        {t("chat.retry")}
                    </button>
                </div>
            ) : filteredConversations.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[var(--text-muted)]">
                    <MessageCircle className="h-8 w-8" />
                    <p className="text-sm">
                        {hasActiveInboxFilters
                            ? t("chat.no_conversations_match")
                            : t("chat.no_conversations")}
                    </p>
                </div>
            ) : (
                <div
                    ref={inboxListRef}
                    onScroll={markUserScroll}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-4 gap-3 px-3"
                >
                    {filteredConversations.map((conversation) => {
                        const otherParticipant = getOtherParticipant(conversation, userId);
                        const otherProfileId = otherParticipant?.profileId
                            ? String(otherParticipant.profileId)
                            : null;
                        const localNickname = otherProfileId
                            ? localNicknamesByProfileId[otherProfileId]
                            : null;
                        const displayName =
                            localNickname || conversation.data.name || t("chat.unknown");
                        const otherParticipantOnlineMeta = getParticipantOnlineMeta(
                            otherParticipant?.lastOnline,
                            otherParticipant?.onlineUntil,
                            nowTimestamp,
                            t,
                        );
                        const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
                        const isSelected =
                            conversation.data.conversationId === selectedConversationId;
                        const showActiveHighlight = isSelected && !isActive;

                        const databaseUnread = otherProfileId ? chatContactIndexByProfileId[otherProfileId]?.unreadCount ?? 0 : 0;
                        const apiUnread = conversation.data.unreadCount;

                        return (
                            <SwipeableRow
                                key={conversation.data.conversationId}
                                onDelete={(complete, revert) => handleDeleteConversation(conversation.data.conversationId, complete, revert)}
                                isDisabled={isActive} // Disable individual swipes when bulk multi-selection is active
                            >
                                <SelectableItem
                                    id={conversation.data.conversationId}
                                    profileId={otherProfileId ?? undefined}
                                    name={displayName}
                                    viewType="inbox"
                                    onNormalClick={() => onSelectConversation(conversation)}
                                >
                                    <div
                                        className={`relative flex h-24 w-full shrink-0 items-stretch overflow-hidden text-left transition-all duration-300 ease-out ${
                                            showActiveHighlight
                                                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                                : "bg-transparent hover:bg-white/5"
                                        }`}
                                    >
                                        {/* Glowing Vertical Selection Indicator (remains visible to show active thread layout) */}
                                        {isSelected && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)] shadow-[0_0_12px_var(--accent)] z-10" />
                                        )}
                                    <button
                                        type="button"
                                        title={displayName}
                                        aria-label={displayName}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (otherParticipant?.profileId) {
                                                onViewProfile(otherParticipant.profileId);
                                            }
                                        }}
                                        className={`relative w-24 shrink-0 transition-all ${
                                            showActiveHighlight
                                                ? "bg-transparent"
                                                : "bg-gradient-to-r from-[#101216] via-[#101216]/75 to-transparent"
                                        }`}
                                    >
                                        
                                        {/* --- NEW AVATAR FALLBACK LOGIC --- */}
                                        {getParticipantAvatarUrl(otherParticipant?.primaryMediaHash) ? (
                                            <img
                                                src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash) || undefined}
                                                alt={displayName}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className={`h-full w-full flex items-center justify-center transition-colors duration-300 ${
                                                showActiveHighlight ? "bg-[var(--accent-contrast)]/10" : "bg-[var(--surface-2)]"
                                            }`}>
                                                <User className={`h-1/2 w-1/2 opacity-50 transition-colors duration-300 ${
                                                    showActiveHighlight ? "text-[var(--accent-contrast)]" : "text-[var(--text-muted)]"
                                                }`} />
                                            </div>
                                        )}
                                        {/* --------------------------------- */}

                                        {/* Dynamic Pulsing Green Dot (Online Status) */}
                                        {isOtherParticipantOnline && (
                                            <span className="absolute bottom-1.5 right-1.5 flex h-3 w-3 z-20">
                                                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-[#101216] dark:border-[#101216] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                            </span>
                                        )}

                                        {conversation.data.pinned ? (
                                            <div className="absolute right-0.5 top-1 rounded-full bg-black/40 p-1 text-white backdrop-blur-sm">
                                                <Pin className="h-3 w-3 fill-current" />
                                            </div>
                                        ) : null}
                                    </button>

                                    <div className="min-w-0 flex-1 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-1">
                                                <p className="truncate font-semibold">{displayName}</p>
                                                {otherParticipant?.profileId &&
                                                presenceResults[otherParticipant.profileId] ? (
                                                    <img
                                                        src={freegrindLogo}
                                                        alt="Free Grind user"
                                                        title={t("profile_details.uses_free_grind")}
                                                        className={`h-4 w-4 shrink-0 rounded-full border ${
                                                            showActiveHighlight
                                                                ? "border-[var(--accent-contrast)]/20"
                                                                : "border-[var(--border)]"
                                                        }`}
                                                    />
                                                ) : null}
                                            </div>
                                            <span
                                                className={`text-xs ${
                                                    showActiveHighlight
                                                        ? "text-[var(--accent-contrast)]/70"
                                                        : "text-[var(--text-muted)]"
                                                }`}
                                            >
                                                {formatConversationTime(conversation.data.lastActivityTimestamp)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p
                                                className={`mt-0.5 truncate ${
                                                    conversation.data.unreadCount > 0
                                                        ? showActiveHighlight
                                                            ? "font-bold text-[var(--accent-contrast)]"
                                                            : "font-bold text-[var(--text)]"
                                                        : showActiveHighlight
                                                            ? "text-[var(--accent-contrast)]/80"
                                                            : "text-[var(--text-muted)]"
                                                }`}
                                            >
                                                {getPreviewText(conversation, t)}
                                            </p>
                                            {conversation.data.unreadCount > 0 ? (
                                                <span
                                                    className={`flex min-w-[20px] flex-col items-center justify-center rounded-full px-1 py-0.5 font-bold shadow-sm ${
                                                        showActiveHighlight
                                                            ? "bg-[var(--accent-contrast)] text-[var(--accent)]"
                                                            : "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                                    } ${showDebugInfo ? "min-h-[28px]" : "h-5"}`}
                                                >
                                                    <span className={showDebugInfo ? "text-[12px] leading-tight" : "text-[12px]"}>
                                                        {conversation.data.unreadCount}
                                                    </span>
                                                    {showDebugInfo && (
                                                        <span className="text-[7px] leading-tight opacity-80">
                                                            db:{databaseUnread} a:{apiUnread}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            {conversation.data.muted ? (
                                                <span
                                                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                                        showActiveHighlight
                                                            ? "bg-black/20 text-white backdrop-blur-sm shadow-sm"
                                                            : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                                                    }`}
                                                >
                                                    {t("chat.muted")}
                                                </span>
                                            ) : null}
                                            {isChatGhosted(conversation.data.conversationId) ? (
                                                <span
                                                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                                        showActiveHighlight
                                                            ? "bg-purple-500/25 text-purple-200 border border-purple-500/35"
                                                            : "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                                                    }`}
                                                >
                                                    <EyeOff className="h-2.5 w-2.5" /> {t("chat.ghosting", { defaultValue: "Ghosting" })}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </SelectableItem>
                        </SwipeableRow>
                        );
                    })}

                    {nextPage ? (
                        <div className="px-3 py-2">
                            <div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden="true" />
                            {isLoadingMoreInbox ? (
                                <p className="text-center text-xs text-[var(--text-muted)]">
                                    {t("chat.loading")}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}

            {/* Native Confirm Dialog to safely intercept the delete swipe */}
            <ConfirmDialog
                isOpen={deleteCandidate !== null}
                title={t("chat.delete_conversation", { defaultValue: "Delete conversation" })}
                message={t("chat.delete_conversation_confirm", { defaultValue: "Delete this conversation? This cannot be undone." })}
                confirmLabel={t("chat.delete_conversation", { defaultValue: "Delete conversation" })}
                cancelLabel={t("chat.actions.cancel", { defaultValue: "Cancel" })}
                onConfirm={async () => {
                    if (!deleteCandidate) return;
                    setIsDeleting(true);
                    if (dontAskDeleteAgain) {
                        localStorage.setItem("chat_skip_delete_confirm", "true");
                    }
                    try {
                        deleteCandidate.complete(); // Animate out
                        await api.deleteConversation(deleteCandidate.id);
                        toast.success(t("chat.toasts.conversation_deleted", { defaultValue: "Conversation deleted" }));
                        setTimeout(onRefreshInbox, 300);
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : t("chat.errors.delete_conversation", { defaultValue: "Failed to delete conversation" }));
                        deleteCandidate.revert(); // Snap back on error
                    } finally {
                        setIsDeleting(false);
                        setDeleteCandidate(null);
                    }
                }}
                onCancel={() => {
                    deleteCandidate?.revert(); // Snap back
                    setDeleteCandidate(null);
                }}
                isProcessing={isDeleting}
                confirmTone="danger"
                dontAskAgainLabel={t("profile_details.dont_ask_again", { defaultValue: "Don't ask again" })}
                dontAskAgainChecked={dontAskDeleteAgain}
                onDontAskAgainChange={setDontAskDeleteAgain}
            />

        </PullToRefreshContainer>
    );
}

function SwipeableRow({
    children,
    onDelete,
    isDisabled,
}: {
    children: React.ReactNode;
    onDelete: (complete: () => void, revert: () => void) => void;
    isDisabled?: boolean;
}) {
    const [startX, setStartX] = useState<number | null>(null);
    const [currentX, setCurrentX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (isDisabled) return;
        if (e.button !== 0) return;
        setStartX(e.clientX);
        setIsSwiping(true);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isSwiping || startX === null) return;
        const deltaX = e.clientX - startX;
        
        if (deltaX < 0) {
            if (deltaX < -140) {
                setCurrentX(-140 + (deltaX + 140) * 0.2);
            } else {
                setCurrentX(deltaX);
            }
        } else {
            setCurrentX(0);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isSwiping) return;
        setIsSwiping(false);
        setStartX(null);

        if (currentX < -90) {
            triggerDelete();
        } else {
            setCurrentX(0);
        }

        if (Math.abs(currentX) > 10) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    const triggerDelete = () => {
        onDelete(
            () => {
                setIsAnimatingOut(true);
                setCurrentX(-500);
            },
            () => {
                setIsAnimatingOut(false);
                setCurrentX(0);
            }
        );
    };

    return (
        <div
            className="relative overflow-hidden shrink-0 rounded-2xl border border-white/5 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] select-none touch-pan-y"
            style={{
                height: isAnimatingOut ? "0px" : "96px",
                opacity: isAnimatingOut ? 0 : 1,
                transform: isAnimatingOut ? "scaleY(0.8)" : "none",
                transformOrigin: "center top",
            }}
        >
            {/* Crimson Liquid Glass Underlay Background (revealed on drag) */}
            {currentX < 0 && (
                <div 
                    className="absolute inset-y-0 right-0 bg-gradient-to-r from-red-600/15 to-red-600/80 backdrop-blur-md z-0 cursor-pointer"
                    style={{ width: `${Math.abs(currentX)}px` }}
                    onClick={triggerDelete}
                />
            )}

            {/* Crimson Sharp Foreground Label (Z-20: Always crisp, floats on top of the blurred card, never blurred) */}
            {currentX < -60 && (
                <div 
                    className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white z-20 pointer-events-none transition-opacity duration-200"
                    style={{ width: `${Math.abs(currentX)}px` }}
                >
                    <div className="flex flex-col items-center gap-1">
                        <Trash2 className="h-5 w-5 text-red-100 drop-shadow-[0_2px_8px_rgba(239,68,68,0.6)] animate-pulse" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-100">Delete</span>
                    </div>
                </div>
            )}

            {/* Foreground Content Card with dynamic liquid glass blur & dissolve effect proportional to drag progress */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
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