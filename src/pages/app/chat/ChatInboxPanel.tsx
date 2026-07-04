import { Archive, EyeOff, MessageCircle, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatInboxHeader, type ChatInboxHeaderProps } from "./ChatInboxHeader";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { ProfileImage } from "../../../components/ui/profile-image";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import type { ConversationEntry } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import {
	formatConversationTime,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getPreviewText,
} from "../chat/chatUtils";
import { isReadReceiptsHidden, useReadReceiptsChanged } from "../../../utils/privacy";
import { SKIP_DELETE_CONVERSATION_CONFIRM_KEY } from "../../../utils/blockConfirm";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { useAvatarCache } from "../../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../../config/design-config";
import { SelectableItem } from "../../../components/multi-select/SelectableItem";
import { useMultiSelect } from "../../../contexts/MultiSelectContext";

type ChatInboxPanelProps = ChatInboxHeaderProps & {
	isLoadingInbox: boolean;
	isLoadingMoreInbox: boolean;
	inboxError: string | null;
	filteredConversations: ConversationEntry[];
	archivedConversationIds: Set<string>;
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
	onSelectConversation: (conversation: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
	onClearInboxFilters: () => void;
	typingConversationIds?: Set<string>;
	onTogglePinConversation: (conversationId: string, isPinned: boolean) => void | Promise<void>;
	onDeleteConversation: (conversationId: string) => void | Promise<void>;
	onDeleteConversationLocal: (conversationId: string) => void | Promise<void>;
	isDeletingConversationId: string | null;
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
	isArchived: boolean;
	onViewProfile: (profileId: number) => void;
};

// Pinning is a server-side flag on a live conversation — it doesn't make
// sense (and the API has nothing to target) once we've locally archived a
// conversation the server can no longer produce.
function ConversationContextMenu({
	conversation,
	isArchived,
	x,
	y,
	onClose,
	onTogglePin,
	onDelete,
}: {
	conversation: ConversationEntry;
	isArchived: boolean;
	x: number;
	y: number;
	onClose: () => void;
	onTogglePin: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ top: y, left: x });

	useLayoutEffect(() => {
		const menu = menuRef.current;
		if (!menu) return;
		const rect = menu.getBoundingClientRect();
		const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
		const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
		setPosition({ left: Math.min(x, maxLeft), top: Math.min(y, maxTop) });
	}, [x, y]);

	useEffect(() => {
		const handlePointerDown = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("mousedown", handlePointerDown, true);
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", onClose, true);
		window.addEventListener("resize", onClose);
		return () => {
			window.removeEventListener("mousedown", handlePointerDown, true);
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("scroll", onClose, true);
			window.removeEventListener("resize", onClose);
		};
	}, [onClose]);

	const isPinned = conversation.data.pinned;

	// Portal to <body> — the list sits inside PullToRefreshContainer, which
	// applies a `transform` to its content wrapper (even at rest, translateY(0)
	// counts). That establishes a new containing block for `position: fixed`
	// descendants, so without the portal this menu would be positioned and
	// clipped relative to that wrapper instead of the viewport.
	return createPortal(
		<div
			ref={menuRef}
			style={{ top: position.top, left: position.left }}
			className="fixed z-[70] min-w-[190px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-2xl"
		>
			{!isArchived && (
				<button
					type="button"
					onClick={onTogglePin}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
				>
					{isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
					{isPinned ? t("chat.unpin") : t("chat.pin")}
				</button>
			)}
			<button
				type="button"
				onClick={onDelete}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition hover:bg-[var(--surface-2)]"
			>
				<Trash2 className="h-4 w-4" />
				{t("chat.delete_conversation")}
			</button>
		</div>,
		document.body,
	);
}

function ChatConversationRow({
	conversation,
	userId,
	localNicknamesByProfileId,
	chatContactIndexByProfileId,
	nowTimestamp,
	presenceResults,
	isSelected,
	isTyping,
	isArchived,
	onViewProfile,
}: ChatConversationRowProps) {
	const { t } = useTranslation();
	const { showDebugInfo } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();
	const { isActive, viewType: activeViewType } = useMultiSelect();
	const isMultiSelectActive = isActive && activeViewType === "inbox";
	useAvatarCache();

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
	const readReceiptsHidden = isReadReceiptsHidden(conversation.data.conversationId);

	return (
		<div
			ref={ref}
			className={`relative flex items-center gap-4 py-3 px-4 h-full text-left transition-all duration-300 rounded-2xl ${
				isSelected 
					? "border backdrop-blur-md" 
					: "border border-transparent hover:bg-white/5"
			} ${revealClass}`}
			style={{
				borderColor: isSelected 
					? "color-mix(in srgb, var(--accent) 35%, transparent)" 
					: undefined,
				backgroundImage: isSelected
					? "linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, transparent) 0%, color-mix(in srgb, var(--accent) 3%, transparent) 100%)"
					: undefined,
				boxShadow: isSelected
					? "0 8px 24px -4px rgba(0, 0, 0, 0.3), 0 0 12px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)"
					: undefined
			}}
		>
			<button
				type="button"
				title={displayName}
				aria-label={displayName}
				onClick={(e) => {
					e.stopPropagation();
					if (isArchived) return;
					if (otherParticipant?.profileId) onViewProfile(otherParticipant.profileId);
				}}
				disabled={isArchived}
				className="relative shrink-0 disabled:cursor-default disabled:opacity-80"
			>
				<div className="h-14 w-14 squircle bg-[var(--surface-2)] drop-shadow-sm">
					<ProfileImage
						src={resolveAvatarSrc(
							otherParticipant?.primaryMediaHash,
							getParticipantAvatarUrl(otherParticipant?.primaryMediaHash),
						)}
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
						{isArchived && (
							<span title={t("chat.archived.badge", { defaultValue: "Archived" })}>
								<Archive className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
							</span>
						)}
						{readReceiptsHidden && (
							<span title={t("privacy.read_receipts_hidden_badge")}>
								<EyeOff className="h-3.5 w-3.5 shrink-0 text-purple-400" />
							</span>
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
					{conversation.data.unreadCount > 0 && !isMultiSelectActive ? (
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
	archivedConversationIds,
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
	onSelectConversation,
	onViewProfile,
	onClearInboxFilters: _onClearInboxFilters,
	onToggleHidePinned,
	onToggleFavoritesOnly,
	showArchivedOnly,
	archivedCount,
	onToggleShowArchivedOnly,
	typingConversationIds,
	onTogglePinConversation,
	onDeleteConversation,
	onDeleteConversationLocal,
	isDeletingConversationId,
}: ChatInboxPanelProps) {
	const { t } = useTranslation();
	useReadReceiptsChanged();
	const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
	const lastScrollAtRef = useRef(0);
	const lastRequestedPageRef = useRef<number | null>(null);
	const [contextMenuState, setContextMenuState] = useState<{
		conversation: ConversationEntry;
		isArchived: boolean;
		x: number;
		y: number;
	} | null>(null);
	const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false);
	const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY) === "true";
	});

	const { isActive, viewType: activeViewType, setSelectableItems } = useMultiSelect();
	const isMultiSelectActive = isActive && activeViewType === "inbox";

	useEffect(() => {
		if (isActive && activeViewType === "inbox") {
			const items = filteredConversations.map((conversation) => {
				const otherParticipant = getOtherParticipant(conversation, userId);
				const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : undefined;
				const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
				const displayName = localNickname || conversation.data.name || t("chat.unknown");
				return {
					id: conversation.data.conversationId,
					name: displayName,
					profileId: otherProfileId,
				};
			});
			setSelectableItems(items);
		}
	}, [isActive, activeViewType, filteredConversations, userId, localNicknamesByProfileId, setSelectableItems, t]);

	const [deleteCandidate, setDeleteCandidate] = useState<{
		conversation: ConversationEntry;
		isArchived: boolean;
		complete: () => void;
		revert: () => void;
	} | null>(null);

	const handleDeleteConversation = (
		conversation: ConversationEntry,
		isArchived: boolean,
		completeSwipe: () => void,
		revertSwipe: () => void
	) => {
		if (skipDeleteConfirm) {
			completeSwipe();
			if (isArchived) {
				void onDeleteConversationLocal(conversation.data.conversationId).catch(() => {
					revertSwipe();
				});
			} else {
				void onDeleteConversation(conversation.data.conversationId).catch(() => {
					revertSwipe();
				});
			}
			return;
		}
		setDontAskDeleteAgain(false);
		setDeleteCandidate({ conversation, isArchived, complete: completeSwipe, revert: revertSwipe });
	};

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
		// Archived conversations are sourced from chatDb, not live inbox
		// pagination — paging further through /v4/inbox can never surface
		// more of them, so don't auto-load while that filter is active (the
		// short filtered list would otherwise keep the sentinel in view and
		// trigger an endless fetch-everything cascade).
		if (!sentinel || !nextPage || showArchivedOnly) {
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
	}, [
		filteredConversations.length,
		isLoadingMoreInbox,
		nextPage,
		onLoadMoreInbox,
		showArchivedOnly,
	]);

	return (
		<PullToRefreshContainer
			className={`flex min-h-0 flex-col overflow-hidden ${
				isDesktop ? "surface-card h-full" : "h-dvh p-0"
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
					showArchivedOnly={showArchivedOnly}
					archivedCount={archivedCount}
					onToggleShowArchivedOnly={onToggleShowArchivedOnly}
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
						<div className={!isDesktop ? "pb-[calc(env(safe-area-inset-bottom,0px)+clamp(92px,10vw,114px)+16px)]" : ""}>
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
							) : (
								<>
									<div className="flex flex-col pt-3 gap-3 px-[var(--app-px)]">
									{filteredConversations.map((conversation) => {
										const otherParticipant = getOtherParticipant(conversation, userId);
										const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : null;
										const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
										const displayName = localNickname || conversation.data.name || t("chat.unknown");

										return (
											<SwipeableRow
												key={conversation.data.conversationId}
												onDelete={(complete, revert) => handleDeleteConversation(conversation, archivedConversationIds.has(conversation.data.conversationId), complete, revert)}
												isDisabled={isActive}
												isSelected={conversation.data.conversationId === selectedConversationId}
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
														isArchived={archivedConversationIds.has(conversation.data.conversationId)}
														onViewProfile={onViewProfile}
													/>
												</SelectableItem>
											</SwipeableRow>
										);
									})}
								</div>

									{nextPage && !showArchivedOnly ? (
										<div className="px-3 py-2">
											<div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden="true" />
											{isLoadingMoreInbox ? (
												<p className="text-center text-xs text-[var(--text-muted)]">
													{t("chat.loading")}
												</p>
											) : null}
										</div>
									) : null}
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{contextMenuState ? (
				<ConversationContextMenu
					conversation={contextMenuState.conversation}
					isArchived={contextMenuState.isArchived}
					x={contextMenuState.x}
					y={contextMenuState.y}
					onClose={() => setContextMenuState(null)}
					onTogglePin={() => {
						const { conversation } = contextMenuState;
						setContextMenuState(null);
						void onTogglePinConversation(conversation.data.conversationId, conversation.data.pinned);
					}}
					onDelete={() => {
						const { conversation } = contextMenuState;
						setContextMenuState(null);
						handleDeleteConversation(conversation, contextMenuState.isArchived, () => {}, () => {});
					}}
				/>
			) : null}

			<ConfirmDialog
				isOpen={deleteCandidate !== null}
				title={t("chat.delete_conversation")}
				message={t("chat.delete_conversation_confirm")}
				confirmLabel={t("chat.delete_conversation")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={async () => {
					if (!deleteCandidate) return;
					const { conversation, isArchived, complete, revert } = deleteCandidate;
					if (dontAskDeleteAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY, "true");
						setSkipDeleteConfirm(true);
					}
					setDeleteCandidate(null);
					try {
						complete(); // Instantly animate out
						if (isArchived) {
							await onDeleteConversationLocal(conversation.data.conversationId);
						} else {
							await onDeleteConversation(conversation.data.conversationId);
						}
					} catch (e) {
						revert(); // Snap back on error
					}
				}}
				onCancel={() => {
					deleteCandidate?.revert(); // Snap back
					setDeleteCandidate(null);
				}}
				isProcessing={
					deleteCandidate != null &&
					isDeletingConversationId === deleteCandidate.conversation.data.conversationId
				}
				confirmTone="danger"
				dontAskAgainLabel={t("profile_details.dont_ask_again")}
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
    isSelected,
}: {
    children: React.ReactNode;
    onDelete: (complete: () => void, revert: () => void) => void;
    isDisabled?: boolean;
    isSelected?: boolean;
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
            className={`relative overflow-hidden shrink-0 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] select-none touch-pan-y ${
                isSelected ? "border border-white/5" : "border border-transparent"
            }`}
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
