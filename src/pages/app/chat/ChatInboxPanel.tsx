import { MessageCircle, Pin, Trash2, Ghost } from "lucide-react";
import { useEffect, useRef, useState, type RefObject, type TouchEventHandler } from "react";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatInboxHeader, type ChatInboxHeaderProps } from "./ChatInboxHeader";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { ProfileImage } from "../../../components/ui/profile-image";
import type { ConversationEntry } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";

import {
    buildChatFiltersDraft,
    formatConversationTime,
    getOtherParticipant,
    getParticipantAvatarUrl,
    getParticipantOnlineMeta,
    getPreviewText,
} from "../chat/chatUtils";
import { isChatGhosted } from "../../../utils/privacy";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../../config/design-config";

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



type ChatInboxPanelProps = ChatInboxHeaderProps & {
	isLoadingInbox: boolean;
	isLoadingMoreInbox: boolean;
	inboxError: string | null;
	filteredConversations: ConversationEntry[];
	nextPage: number | null;
	selectedConversationId: string | null;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	inboxListRef: RefObject<HTMLDivElement | null>;
	showHeader: boolean;
	onRefreshInbox: () => Promise<void>;
	onLoadMoreInbox: () => void;
	onInboxTouchStart?: TouchEventHandler<HTMLDivElement>;
	onInboxTouchEnd?: TouchEventHandler<HTMLDivElement>;
	onSelectConversation: (conversation: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
	onClearInboxFilters: () => void;
	onOpenFilters?: (filtersDraft: ReturnType<typeof buildChatFiltersDraft>) => void;
	onOpenSearch?: () => void;
	onOpenInbox?: () => void;
	onOpenAlbums?: () => void;
	typingConversationIds?: Set<string>;
};

type ChatConversationRowProps = {
	conversation: ConversationEntry;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	isSelected: boolean;
	isTyping: boolean;
	onSelectConversation: (c: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
};

function ChatConversationRow({
	conversation,
	userId,
	localNicknamesByProfileId,
	chatContactIndexByProfileId,
	nowTimestamp,
	presenceResults,
	isSelected,
	isTyping,
	onSelectConversation,
	onViewProfile,
}: ChatConversationRowProps) {
	const { t } = useTranslation();
	const { showDebugInfo } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();

	const otherParticipant = getOtherParticipant(conversation, userId);
	const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : null;
	const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
	const displayName = localNickname || conversation.data.name || t("chat.unknown");
	const otherParticipantOnlineMeta = getParticipantOnlineMeta(
		otherParticipant?.lastOnline,
		otherParticipant?.onlineUntil,
		nowTimestamp,
		t,
	);
	const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
	const databaseUnread = otherProfileId ? chatContactIndexByProfileId[otherProfileId]?.unreadCount ?? 0 : 0;
	const apiUnread = conversation.data.unreadCount;
	const isGhosted = isChatGhosted(conversation.data.conversationId);

	return (
		<div
			ref={ref}
			onClick={() => onSelectConversation(conversation)}
			className={`flex cursor-pointer items-center gap-4 py-3 px-4 mx-2 my-1 text-left transition border rounded-xl ${
				isSelected 
					? "backdrop-blur-md shadow-[0_2px_12px_rgba(255,204,1,0.08)]" 
					: "bg-transparent border-transparent hover:bg-white/5"
			} ${revealClass}`}
			style={isSelected ? { 
				backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)", 
				borderColor: "color-mix(in srgb, var(--accent) 20%, transparent)" 
			} : undefined}
		>
			<button
				type="button"
				title={displayName}
				aria-label={displayName}
				onClick={(e) => {
					e.stopPropagation();
					if (otherParticipant?.profileId) onViewProfile(otherParticipant.profileId);
				}}
				className="relative shrink-0"
			>
				<div className="h-14 w-14 squircle bg-[var(--surface-2)] drop-shadow-sm">
					<ProfileImage
						src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
						alt={displayName}
					/>
				</div>
				{isOtherParticipantOnline && (
					<span className="absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-[1.5px] border-[var(--bg)] bg-green-500 shadow-sm" />
				)}
				{conversation.data.pinned ? (
					<div className="absolute -top-1 -right-1 rounded-full bg-black/40 p-0.5 text-white backdrop-blur-sm">
						<Pin className="h-2.5 w-2.5 fill-current" />
					</div>
				) : null}
			</button>

			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<p className="truncate text-sm font-semibold text-[var(--text)]">
							{displayName}
						</p>
						{isGhosted && (
							<Ghost className="h-3.5 w-3.5 shrink-0 text-purple-400" />
						)}
						{otherParticipant?.profileId && presenceResults[otherParticipant.profileId] ? (
							<img
								src={freegrindLogo}
								alt="Free Grind user"
								title={t("profile_details.uses_free_grind")}
								className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border)]"
							/>
						) : null}
					</div>
					<span className="shrink-0 text-xs text-[var(--text-muted)]">
						{formatConversationTime(conversation.data.lastActivityTimestamp)}
					</span>
				</div>

				<div className="mt-0.5 flex items-center justify-between gap-2">
					<p className={`truncate text-sm ${
						conversation.data.unreadCount > 0 ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"
					}`}>
						{isTyping ? (
							<span className="italic text-[var(--accent)]">{t("chat.typing")}</span>
						) : (
							getPreviewText(conversation, t)
						)}
					</p>
					{conversation.data.unreadCount > 0 ? (
						<span className={`flex min-w-[20px] shrink-0 flex-col items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent-contrast)] shadow-sm ${showDebugInfo ? "min-h-[28px]" : ""}`}>
							<span>{conversation.data.unreadCount}</span>
							{showDebugInfo && (
								<span className="text-[7px] leading-tight opacity-80">
									db:{databaseUnread} a:{apiUnread}
								</span>
							)}
						</span>
					) : null}
				</div>

				{conversation.data.muted ? (
					<span className="mt-1 inline-block rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
						{t("chat.muted")}
					</span>
				) : null}
			</div>
		</div>
	);
}

export function ChatInboxPanel({
	isDesktop,
	isLoadingInbox,
	isLoadingMoreInbox,
	inboxError,
	inboxFilters,
	hidePinned,
	hasActiveInboxFilters,
	activeFilterCount,
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
	showHeader,
	isSearchOpen,
	searchQuery,
	searchMode,
	onSetIsSearchOpen,
	onSetSearchQuery,
	onSetSearchMode,
	onSetIsFiltersOpen,
	onSetFiltersDraft,
	onRefreshInbox,
	onLoadMoreInbox,
	onInboxTouchStart,
	onInboxTouchEnd,
	onSelectConversation,
	onViewProfile,
	onClearInboxFilters: _onClearInboxFilters,
	onToggleHidePinned,
	onToggleFavoritesOnly,
	typingConversationIds,
}: ChatInboxPanelProps) {
	const { t } = useTranslation();
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

	return (
		<PullToRefreshContainer
			className={`flex min-h-0 flex-col overflow-hidden ${
				isDesktop ? "bg-black/10 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-[0_16px_34px_rgba(0,0,0,0.17)] h-full" : "h-dvh p-0"
			}`}
			contentClassName="flex flex-1 flex-col min-h-0"
			style={
				!isDesktop
					? { paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))" }
					: undefined
			}
			onRefresh={onRefreshInbox}
			isDisabled={isLoadingInbox || isLoadingMoreInbox || isSearchOpen}
			isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("chat.refreshing_inbox")}
			onTouchStartExtra={onInboxTouchStart}
			onTouchEndExtra={onInboxTouchEnd}
		>
			{showHeader && (
				<ChatInboxHeader
					isDesktop={isDesktop}
					realtimeStatusMeta={realtimeStatusMeta}
					inboxFilters={inboxFilters}
					hidePinned={hidePinned}
					hasActiveInboxFilters={hasActiveInboxFilters}
					activeFilterCount={activeFilterCount}
					isSearchOpen={isSearchOpen}
					searchQuery={searchQuery}
					searchMode={searchMode}
					onSetIsSearchOpen={onSetIsSearchOpen}
					onSetSearchQuery={onSetSearchQuery}
					onSetSearchMode={onSetSearchMode}
					onSetIsFiltersOpen={onSetIsFiltersOpen}
					onSetFiltersDraft={onSetFiltersDraft}
					onToggleFavoritesOnly={onToggleFavoritesOnly}
					onToggleHidePinned={onToggleHidePinned}
				/>
			)}

			{isSearchOpen ? (
				<ChatSearchPanel
					isDesktop={isDesktop}
					searchQuery={searchQuery}
					searchMode={searchMode}
					onClose={() => { onSetIsSearchOpen(false); onSetSearchQuery(""); }}
					onViewProfile={onViewProfile}
				/>
			) : (
				<div
					className="relative flex-1 min-h-0"
					style={!isDesktop ? { marginTop: `-${FEED_HEADER_OFFSET}` } : undefined}
				>
					<div
						ref={inboxListRef}
						onScroll={markUserScroll}
						data-lenis-prevent
						className="h-full overflow-y-auto"
						style={!isDesktop ? {
							paddingTop: FEED_HEADER_OFFSET,
							maskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
							WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
						} : undefined}
					>
						<div className={!isDesktop ? "pb-[calc(env(safe-area-inset-bottom,0px)+clamp(92px,10vw,114px)+16px)]" : "pb-4"}>
							{isLoadingInbox ? (
								<div className="flex flex-col">
									{Array.from({ length: 12 }).map((_, i) => (
										<div key={i} className="flex items-center gap-4 border-b border-[var(--surface-2)] py-3 px-4">
											<div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
											<div className="flex flex-1 flex-col gap-2">
												<div className="flex items-center justify-between gap-3">
													<div className="h-3 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
													<div className="h-2.5 w-10 animate-pulse rounded-full bg-[var(--border)]" />
												</div>
												<div className="h-2.5 w-40 animate-pulse rounded-full bg-[var(--border)]" />
											</div>
										</div>
									))}
								</div>
							) : inboxError ? (
								<div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
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
								<div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-[var(--text-muted)]">
									<MessageCircle className="h-8 w-8" />
									<p className="text-sm">
										{hasActiveInboxFilters
											? t("chat.no_conversations_match")
											: t("chat.no_conversations")}
									</p>
								</div>
								<div className="flex flex-col pt-3 gap-3 px-3">
									{filteredConversations.map((conversation) => {
										const otherParticipant = getOtherParticipant(conversation, userId);
										const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : null;
										const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
										const displayName = localNickname || conversation.data.name || t("chat.unknown");

										return (
											<SwipeableRow
												key={conversation.data.conversationId}
												onDelete={(complete, revert) => handleDeleteConversation(conversation.data.conversationId, complete, revert)}
												isDisabled={isActive}
											>
												<SelectableItem
													id={conversation.data.conversationId}
													profileId={otherProfileId ?? undefined}
													name={displayName}
													viewType="inbox"
													onNormalClick={() => onSelectConversation(conversation)}
													roundedClassName="rounded-2xl"
												>
													<ChatConversationRow
														conversation={conversation}
														userId={userId}
														localNicknamesByProfileId={localNicknamesByProfileId}
														chatContactIndexByProfileId={chatContactIndexByProfileId}
														nowTimestamp={nowTimestamp}
														presenceResults={presenceResults}
														isSelected={conversation.data.conversationId === selectedConversationId}
														isTyping={typingConversationIds?.has(conversation.data.conversationId) ?? false}
														onSelectConversation={isActive ? () => {} : onSelectConversation}
														onViewProfile={onViewProfile}
													/>
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
						</div>
					</div>
				</div>
			)}

			<ConfirmDialog
				isOpen={deleteCandidate !== null}
				title={t("chat.dialogs.delete_conversation_title", { defaultValue: "Delete Conversation?" })}
				message={t("chat.dialogs.delete_conversation_desc", { defaultValue: "This will delete all messages in this conversation. This action cannot be undone." })}
				confirmLabel={t("common.delete", { defaultValue: "Delete" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
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