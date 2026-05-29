import { Album, Ellipsis, Hourglass, Lock, MapPin, Reply, Loader2, Languages } from "lucide-react";
import { Fragment, useEffect, useState, useMemo, useCallback, useRef } from "react";

import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { appLog } from "../../../utils/logger";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { UiMessage } from "../../../types/chat-page";
import { Avatar } from "../../../components/ui/avatar";
import blankProfileImage from "../../../images/blank-profile.png";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";
import {
    formatDateHeader,
    formatDateTime24,
    formatMessageTime,
    getMessageAlbumCoverUrl,
    getMessageAlbumId,
    getMessageAudioUrl,
    getMessageImageCreatedAt,
    getMessageImageUrl,
    getMessageLocation,
    getMessageTakenOnGrindr,
    getMessageText,
    getMessageVideoUrl,
    isLocalClientMessageId,
    getMessagePreviewLabel
} from "./chatUtils";

type ChatThreadMessagesProps = {
    isDesktop: boolean;
    selectedConversation: ConversationEntry;
    userId: number | null;
    nowTimestamp: number;
    messagePageKey: string | null;
    isLoadingOlderMessages: boolean;
    loadThread: (args: { conversationId: string; older: boolean }) => void | Promise<void>;
    threadScrollContainerRef: { current: HTMLDivElement | null };
    handleThreadScroll: (event: React.UIEvent<HTMLDivElement>) => void;
    threadMessages: UiMessage[];
    threadLastReadTimestamp: number | null;
    messageElementRefs: { current: Map<string, HTMLDivElement> };
    startMessageLongPress: (messageId: string) => void;
    endMessageLongPress: () => void;
    messageLongPressTriggeredRef: { current: boolean };
    openFullScreenImage: (imageUrl: string) => void;
    openAlbumViewerById: (albumId: number) => void | Promise<void>;
    selectedThreadMessageMatches: Array<{ messageId: string }>;
    activeThreadSearchIndex: number;
    openMessageActionId: string | null;
    setOpenMessageActionId: (value: ((current: string | null) => string | null) | string | null) => void;
    isMutatingMessageId: string | null;
    reactionBurstMessageId: string | null;
    handleReact: (message: Message) => void | Promise<void>;
    handleUnsend: (message: Message) => void | Promise<void>;
    handleDelete: (message: Message) => void | Promise<void>;
    handleRetry: (message: Message) => void;
    handleReply: (message: Message) => void | Promise<void>;
    threadBottomRef: { current: HTMLDivElement | null };
};

function AlbumExpirationCountdown({ expiresAt, isOnce, t }: { expiresAt: number; isOnce?: boolean; t: any }) {
    const [timeLeft, setTimeLeft] = useState<number>(expiresAt - Date.now());

    useEffect(() => {
        if (isOnce) return;
        const timer = setInterval(() => {
            const next = expiresAt - Date.now();
            setTimeLeft(next);
            if (next <= 0) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [expiresAt, isOnce]);

    if (!isOnce && timeLeft <= 0) return null;

    const seconds = Math.floor((timeLeft / 1000) % 60);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(t("right_now.days_short", { count: days }));
    if (hours > 0 || days > 0) parts.push(t("right_now.hours_short", { count: hours }));
    if (minutes > 0 || hours > 0 || days > 0) parts.push(t("right_now.minutes_short", { count: minutes }));
    if (days === 0 && hours === 0) parts.push(t("right_now.seconds_short", { count: seconds }));

    return (
        <>
            <style>
                {`
                    @keyframes hourglass-rotate {
                        0% { transform: rotate(0deg); }
                        40% { transform: rotate(180deg); }
                        60% { transform: rotate(180deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .animate-hourglass-rotate {
                        animation: hourglass-rotate 2.5s infinite ease-in-out;
                    }
                `}
            </style>
            <div className="mt-1 flex items-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold tracking-wide text-[var(--accent)] shadow-lg backdrop-blur-sm sm:text-[11px] uppercase">
                    <Hourglass className="h-3 w-3 animate-hourglass-rotate" />
                    <span>
                        {isOnce ? t("chat.expiration.once") : `${parts.join(" ")} ${t("chat.expiration.remaining")}`}
                    </span>
                </span>
            </div>
        </>
    );
}

export function ChatThreadMessages({
    isDesktop,
    selectedConversation,
    userId,
    nowTimestamp,
    messagePageKey,
    isLoadingOlderMessages,
    loadThread,
    threadScrollContainerRef,
    handleThreadScroll,
    threadMessages,
    threadLastReadTimestamp,
    messageElementRefs,
    startMessageLongPress,
    endMessageLongPress,
    messageLongPressTriggeredRef,
    openFullScreenImage,
    openAlbumViewerById,
    selectedThreadMessageMatches,
    activeThreadSearchIndex,
    openMessageActionId,
    setOpenMessageActionId,
    isMutatingMessageId,
    reactionBurstMessageId,
    handleReact,
    handleUnsend,
    handleDelete,
    handleRetry,
    handleReply,
    threadBottomRef,
}: ChatThreadMessagesProps) {
    const { t, i18n } = useTranslation();
    const { blurIncomingMedia } = usePreferences();
    
    // --- OUTGOING BLUR STATE ---
    const isBlurOutgoingEnabled = window.localStorage.getItem("fg-blur-outgoing-media") === "true";

    const [revealedMediaMessageIds, setRevealedMediaMessageIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [hoveredMediaMessageId, setHoveredMediaMessageId] = useState<string | null>(null);
	
    // --- IN-CHAT TRANSLATION STATE ---
    const [translations, setTranslations] = useState<Record<string, { text?: string; loading?: boolean; service?: "Google" | "DeepL" | "OpenAI" | "Gemini" }>>({});
	
    const isTranslateEnabled = window.localStorage.getItem("fg-translate-enabled") !== "false";
    const isAutoTranslate = window.localStorage.getItem("fg-translate-auto") === "true";
    const translateTargetLanguage = window.localStorage.getItem("fg-translate-language") || (i18n.language ? i18n.language.split("-")[0] : "en");
    const translateEngine = window.localStorage.getItem("fg-translate-engine") || "google";

    const handleTranslate = async (messageId: string, text: string, isAuto = false) => {
        if (!text || !isTranslateEnabled) return;
        setTranslations((prev) => ({ ...prev, [messageId]: { loading: true } }));
        setOpenMessageActionId(null); 

        try {
            let translatedText = "";
            let usedService: "Google" | "DeepL" | "OpenAI" | "Gemini" = "Google";

            // 1. OpenAI ChatGPT Engine (Updated to 2026 gpt-5.4-mini)
            if (translateEngine === "openai") {
                try {
                    const key = window.localStorage.getItem("fg-openai-key") || "";
                    if (!key) throw new Error("Missing OpenAI Key");
                    
                    const response = await fetch("https://api.openai.com/v1/chat/completions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key.trim()}` },
                        body: JSON.stringify({
                            model: "gpt-5.4-mini",
                            messages: [
                                { role: "system", content: `You are a translator for a dating app. Translate the casual slang message to ${translateTargetLanguage}. Respond ONLY with the translated text, no quotes or filler.` },
                                { role: "user", content: text }
                            ]
                        })
                    });
                    const data = (await response.json()) as any;
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        translatedText = data.choices[0].message.content.trim();
                        usedService = "OpenAI";
                    } else throw new Error("Invalid OpenAI response");
                } catch (e) {
                    appLog.warn("OpenAI failed, falling back to Google...", e);
                }
            }

            // 2. Google Gemini Engine (Updated to 2026 gemini-3.5-flash)
            if (translateEngine === "gemini" && !translatedText) {
                try {
                    const key = window.localStorage.getItem("fg-gemini-key") || "";
                    if (!key) throw new Error("Missing Gemini Key");
                    
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key.trim()}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `Translate the following casual dating app message to ${translateTargetLanguage}. Respond ONLY with the translated text, no quotes or filler. Text: "${text}"` }] }]
                        })
                    });
                    const data = (await response.json()) as any;
                    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                        translatedText = data.candidates[0].content.parts[0].text.trim();
                        usedService = "Gemini";
                    } else throw new Error("Invalid Gemini response");
                } catch (e) {
                    appLog.warn("Gemini failed, falling back to Google...", e);
                }
            }

            // 3. DeepLX Free Engine
            if (translateEngine === "deeplx" && !translatedText) {
                try {
                    const rawUrl = window.localStorage.getItem("fg-deeplx-url") || "";
                    if (!rawUrl) throw new Error("Missing DeepLX URL");

                    let dlTarget = translateTargetLanguage.toUpperCase() || "EN";
                    if (dlTarget === "EN-US" || dlTarget === "EN-GB") dlTarget = "EN";
                    if (dlTarget === "PT-BR" || dlTarget === "PT-PT") dlTarget = "PT";

                    let finalUrl = rawUrl.trim();
                    if (!finalUrl.startsWith("http")) finalUrl = `https://${finalUrl}`;

                    const response = await fetch(finalUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            text: text,
                            source_lang: "auto",
                            target_lang: dlTarget
                        })
                    });
                    const data = (await response.json()) as any;
                    
                    if (data && data.data) {
                        if (typeof data.data === "string" && data.data.includes("linux.do")) throw new Error("DeepLX URL Hijacked by Linux.do");
                        translatedText = data.data;
                        usedService = "DeepL";
                    } else if (data && data.translations && data.translations[0]) {
                        translatedText = data.translations[0].text;
                        usedService = "DeepL";
                    } else throw new Error("Invalid DeepLX response");
                } catch (e) {
                    appLog.warn("DeepLX URL failed or was hijacked, falling back to Google Translate...", e);
                }
            }

            // 4. Default Fallback to Google Free
            if (!translatedText) {
                const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translateTargetLanguage}&dt=t&q=${encodeURIComponent(text)}`);
                const data = (await response.json()) as any[];

                if (Array.isArray(data) && Array.isArray(data[0])) {
                    data[0].forEach((item: any) => {
                        if (Array.isArray(item) && item[0]) {
                            translatedText += String(item[0]);
                        }
                    });
                    usedService = "Google";
                }
            }

            if (!translatedText) throw new Error("All translation engines failed.");

            setTranslations((prev) => ({
                ...prev,
                [messageId]: { text: translatedText, loading: false, service: usedService },
            }));
        } catch (error) {
            appLog.error("Translation failed", error);
            if (!isAuto) {
                toast.error(t("chat.toasts.translation_failed", { defaultValue: "Translation failed completely." }));
            }
            setTranslations((prev) => ({
                ...prev,
                [messageId]: { loading: false },
            }));
        }
    };

    useEffect(() => {
        if (!isTranslateEnabled || !isAutoTranslate) return;

        threadMessages.forEach((message) => {
            const mine = userId != null && Number(message.senderId) === Number(userId);
            if (mine) return; 
            if (translations[message.messageId]) return; 
            if (isLocalClientMessageId(message.messageId)) return; 

            let text = typeof getMessageText(message, t) === "string" ? getMessageText(message, t) as string : "";
            if (!text) return;

            if (text.startsWith("> ")) {
                const splitIndex = text.indexOf("\n");
                if (splitIndex !== -1) text = text.substring(splitIndex + 1).trim();
            }

            if (text.trim().length > 0) {
                void handleTranslate(message.messageId, text.trim(), true);
            }
        });
    }, [threadMessages, isTranslateEnabled, isAutoTranslate, translations, userId, t]);
    // ----------------------------------

    const handleCopy = useCallback(async (message: UiMessage) => {
        const location = getMessageLocation(message);
        const body = message.body as any;
        const hasRealText = body && typeof body.text === "string" && body.text.trim().length > 0;

        let content = "";
        if (location) {
            content = `${location.lat}, ${location.lon}`;
        } else if (hasRealText) {
            content = body.text;
        }

        if (!content) {
            setOpenMessageActionId(null);
            return;
        }

        try {
            await navigator.clipboard.writeText(content);
            toast.success(t("chat.toasts.copied", { defaultValue: "Copied to clipboard" }));
        } catch (error) {
            appLog.error("Copy failed", error);
        }
        setOpenMessageActionId(null);
    }, [t, setOpenMessageActionId]);

    useEffect(() => {
        setRevealedMediaMessageIds(new Set());
        setHoveredMediaMessageId(null);
    }, [selectedConversation.data.conversationId]);

    const revealMediaMessage = useCallback((messageId: string) => {
        setRevealedMediaMessageIds((previous) => {
            if (previous.has(messageId)) {
                return previous;
            }
            const next = new Set(previous);
            next.add(messageId);
            return next;
        });
    }, []);

    const handleMediaMouseEnter = useCallback(
        (messageId: string) => {
            if (!isDesktop) {
                return;
            }
            setHoveredMediaMessageId(messageId);
        },
        [isDesktop],
    );

    const handleMediaMouseLeave = useCallback(
        (messageId: string) => {
            if (!isDesktop) {
                return;
            }
            setHoveredMediaMessageId((current) => (current === messageId ? null : current));
        },
        [isDesktop],
    );

    const lastMyMessageId = [...threadMessages]
        .reverse()
        .find((m) => userId != null && Number(m.senderId) === Number(userId))?.messageId;

    const lastMessageId = threadMessages[threadMessages.length - 1]?.messageId;

    const latestMessageIdByAlbum = useMemo(() => {
        const map = new Map<number, string>();
        for (const m of threadMessages) {
            const aid = getMessageAlbumId(m);
            if (aid) map.set(aid, m.messageId);
        }
        return map;
    }, [threadMessages]);

    const swipeStateRef = useRef<{
        messageId: string;
        startX: number;
        startY: number;
        triggered: boolean;
    } | null>(null);

    const lastTapTimeRef = useRef<Record<string, number>>({});

    const handleMobileTouchStart = useCallback(
        (event: React.TouchEvent<HTMLDivElement>, message: UiMessage) => {
            if (isDesktop || event.touches.length !== 1 || isLocalClientMessageId(message.messageId)) {
                swipeStateRef.current = null;
                return;
            }

            const now = Date.now();
            const lastTap = lastTapTimeRef.current[message.messageId] || 0;

            if (now - lastTap > 0 && now - lastTap < 350) {
                endMessageLongPress();
                lastTapTimeRef.current[message.messageId] = 0; 
                void handleReact(message);
                return;
            }

            lastTapTimeRef.current[message.messageId] = now;

            startMessageLongPress(message.messageId);
            const touch = event.touches[0];
            swipeStateRef.current = {
                messageId: message.messageId,
                startX: touch.clientX,
                startY: touch.clientY,
                triggered: false,
            };
        },
        [isDesktop, startMessageLongPress, endMessageLongPress, handleReact],
    );

    const handleMobileTouchMove = useCallback(
        (event: React.TouchEvent<HTMLDivElement>, message: UiMessage) => {
            endMessageLongPress();
            if (isDesktop || event.touches.length !== 1) {
                return;
            }
            const state = swipeStateRef.current;
            if (!state || state.messageId !== message.messageId || state.triggered) {
                return;
            }
            const touch = event.touches[0];
            const dx = touch.clientX - state.startX;
            const dy = Math.abs(touch.clientY - state.startY);
            if (dx > 72 && dy < 40) {
                state.triggered = true;
                void handleReply(message);
            }
        },
        [endMessageLongPress, handleReply, isDesktop],
    );

    const handleMobileTouchEnd = useCallback(() => {
        swipeStateRef.current = null;
        endMessageLongPress();
    }, [endMessageLongPress]);

    return (
        <div
            ref={threadScrollContainerRef}
                onScroll={handleThreadScroll}
                                        className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto ${!isDesktop ? "pb-[160px] pt-[140px]" : ""}`}
                        >
                        {messagePageKey ? (
                            <button
                                type="button"
                                onClick={() =>
                                    void loadThread({
                                        conversationId: selectedConversation.data.conversationId,
                                        older: true,
                                    })
                                }
                                disabled={isLoadingOlderMessages}
                                className="mx-auto mb-3 rounded-xl border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] disabled:opacity-60"
                            >
                                {isLoadingOlderMessages ? t("chat.loading") : t("chat.load_older_messages")}
                            </button>
                        ) : null}

                        <div className={`flex flex-col gap-2 ${!isDesktop ? "px-[var(--app-px)] pt-4" : ""}`}>
                        {(() => {
                            let lastHeader = "";
                            return threadMessages.map((message) => {
                                const currentHeader = formatDateHeader(
                                    message.timestamp,
                                    nowTimestamp,
                                    t,
                                );
                                const isNewDay = currentHeader !== lastHeader;
                                lastHeader = currentHeader;
                                const mine =
                                    userId != null && Number(message.senderId) === Number(userId);
                                const failed = message.clientState === "failed";
                                const pending = message.clientState === "pending";
                                const localOnly = message._localOnly === true;
                                const imageUrl = getMessageImageUrl(message);
                                const messageTakenOnGrindr = getMessageTakenOnGrindr(message);
                                const imageCreatedAt = getMessageImageCreatedAt(message);
                                const imageCreatedAtLabel =
                                    imageCreatedAt != null
                                        ? formatDateTime24(imageCreatedAt)
                                        : null;
                                const videoUrl = getMessageVideoUrl(message);
                                const audioUrl = getMessageAudioUrl(message);
                                const location = getMessageLocation(message);
                                const albumId = getMessageAlbumId(message);
                                const albumCover = getMessageAlbumCoverUrl(message);
                                const messageText = getMessageText(message, t);

                                let displayMessageText = messageText;
                                let localReplyText = "";
                                let isLocalReply = false;

                                if (typeof displayMessageText === "string" && displayMessageText.startsWith("> ")) {
                                    const splitIndex = displayMessageText.indexOf("\n");
                                    if (splitIndex !== -1) {
                                        isLocalReply = true;
                                        localReplyText = displayMessageText.substring(2, splitIndex).trim();
                                        displayMessageText = displayMessageText.substring(splitIndex + 1).trim();
                                    }
                                }

                                const isNativeReply = 
                                    message.type === "Reply" || 
                                    message.type === "ProfilePhotoReply" || 
                                    message.type === "AlbumReply" || 
                                    !!(message.body as any)?.reply || 
                                    !!message.replyToMessage || 
                                    !!message.replyPreview;

                                const replyTargetId = (message as any).replyToMessage?.messageId || (message.body as any)?.reply?.messageId || (message.body as any)?.replyMessageId;
                                const originalMessage = replyTargetId ? threadMessages.find(m => m.messageId === replyTargetId) : null;
								
                                let resolvedReplyText = localReplyText || (message as any).replyPreview?.text || (message.body as any)?.reply?.text;
                                let resolvedThumb = (message.body as any)?.imageHash || (message.body as any)?.reply?.thumbUrl;

                                if (originalMessage) {
                                    if (!resolvedReplyText) {
                                        resolvedReplyText = getMessagePreviewLabel(originalMessage, t);
                                    }
                                    if (!resolvedThumb) {
                                        resolvedThumb = getMessageImageUrl(originalMessage) || getMessageAlbumCoverUrl(originalMessage);
                                    }
                                }
                                if (!resolvedReplyText) resolvedReplyText = "Message";

                                const isExpiringImage = message.type === "ExpiringImage";
                                const isAlbumMessage =
                                    message.type === "Album" ||
                                    message.type === "ExpiringAlbum" ||
                                    message.type === "ExpiringAlbumV2";
                                const isImageOnlyBubble =
                                    Boolean(imageUrl) && messageText === t("chat.thread.shared_image");
                                const isAlbumOnlyBubble =
                                    isAlbumMessage && messageText === t("chat.preview.shared_album");
                                const isLocationOnlyBubble =
                                    Boolean(location) && messageText === t("chat.preview.sent_location");
                                const isMediaOnlyBubble =
                                    isImageOnlyBubble || isAlbumOnlyBubble || isLocationOnlyBubble;
                                
                                // --- BRAND NEW MEDIA BLUR CHECK ---
                                const shouldBlurMedia =
                                    ((blurIncomingMedia && !mine) || (isBlurOutgoingEnabled && mine)) &&
                                    !revealedMediaMessageIds.has(message.messageId) &&
                                    (!isDesktop || hoveredMediaMessageId !== message.messageId);

                                const mediaBlurClassName = shouldBlurMedia
                                    ? "blur-xl transition"
                                    : "";
                                // ----------------------------------

                                const senderParticipant =
                                    selectedConversation.data.participants.find(
                                        (participant) =>
                                            Number(participant.profileId) === Number(message.senderId),
                                    ) ?? null;
                                const senderAvatarUrl =
                                    senderParticipant?.primaryMediaHash &&
                                    validateMediaHash(senderParticipant.primaryMediaHash)
                                        ? getThumbImageUrl(senderParticipant.primaryMediaHash, "320x320")
                                        : blankProfileImage;
                                const senderLabel = mine
                                    ? t("chat.you")
                                    : selectedConversation.data.name?.trim() || t("chat.unknown");
                                const isActiveSearchMatch =
                                    selectedThreadMessageMatches[activeThreadSearchIndex]
                                        ?.messageId === message.messageId;
                                const fireButtonClass = mine
                                    ? "absolute -left-3 -top-2"
                                    : "absolute -right-3 -top-2";

                                const msgBody = message.body as any;
                                const expirationType = msgBody?.expirationType;

                                const albumViewableUntil = isAlbumMessage ? msgBody?.viewableUntil : null;
                                const mediaExpiresAt = !isAlbumMessage ? (msgBody?.expiresAt || msgBody?.expiresat) : null;

                                const rawExpiresAt = albumViewableUntil || mediaExpiresAt;
                                let expiresAt = Number(rawExpiresAt || 0);
                                if (expiresAt > 0 && expiresAt < 100_000_000_000) expiresAt *= 1000;
                                const totalLifetimeSec = expiresAt > 0 ? Math.round((expiresAt - message.timestamp) / 1000) : 0;

                                const isIndefinite =
                                    expirationType === "INDEFINITE" ||
                                    expirationType === 0 ||
                                    (typeof expirationType === "string" && expirationType.toUpperCase() === "INDEFINITE");

                                const isLastMessage = message.messageId === lastMessageId;
                                const isLatestShare = albumId ? latestMessageIdByAlbum.get(albumId) === message.messageId : true;

                                const isOnce = !isIndefinite && (
                                    expirationType === "ONCE" ||
                                    expirationType === 1 ||
                                    message.type === "ExpiringAlbumV2" ||
                                    (totalLifetimeSec > 1700 && totalLifetimeSec < 1900)
                                );

                                const isExpiringMedia = isAlbumMessage && !isIndefinite && isLatestShare && (expiresAt > 0 || isOnce);

                                const isLocked = isAlbumMessage && (!isLatestShare || !msgBody?.isViewable) && message.senderId !== userId;

                                return (
                                <Fragment key={message.messageId}>
                                    {isNewDay && (
                                        <div className={`my-6 flex items-center gap-4 ${!isDesktop ? "" : "px-4"} opacity-80`}>
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                {currentHeader}
                                            </span>
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                        </div>
                                    )}
                                    <div
                                        data-message-id={message.messageId}
                                        ref={(element) => {
                                            if (element) {
                                                messageElementRefs.current.set(
                                                    message.messageId,
                                                    element,
                                                );
                                            } else {
                                                messageElementRefs.current.delete(message.messageId);
                                            }
                                        }}
                                        className={`flex w-full ${mine ? "justify-end" : "justify-start"} ${isLastMessage && !mine ? "pb-6" : ""}`}
                                    >
                                        <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[85%]`}>
                                            <div
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    void handleReact(message);
                                                }}
                                                onTouchStart={(event) => handleMobileTouchStart(event, message)}
                                                onTouchEnd={handleMobileTouchEnd}
                                                onTouchCancel={handleMobileTouchEnd}
                                                onTouchMove={(event) => handleMobileTouchMove(event, message)}
                                                onContextMenu={(event) => event.preventDefault()}
                                                className={`relative group/bubble w-full rounded-2xl text-base no-touch-callout ${
                                                    isMediaOnlyBubble
                                                        ? "bg-transparent p-0"
                                                        : `px-3 py-2 ${
                                                            mine
                                                                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                                                : "bg-[var(--surface-2)] text-[var(--text)]"
                                                        }`
                                                } ${isActiveSearchMatch ? "ring-2 ring-[var(--accent)]" : ""} ${localOnly ? "opacity-60 ring-1 ring-dashed ring-[var(--text-muted)]" : ""}`}
                                            >
                                                {localOnly ? (
                                                    <p className="mb-1 text-xs opacity-60">
                                                        {t("chat.thread.from_local_history")}
                                                    </p>
                                                ) : null}
                                                {imageUrl ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (messageLongPressTriggeredRef.current) {
                                                                messageLongPressTriggeredRef.current = false;
                                                                return;
                                                            }
                                                            if (shouldBlurMedia && !isDesktop) {
                                                                revealMediaMessage(message.messageId);
                                                                return;
                                                            }
                                                            openFullScreenImage(imageUrl);
                                                        }}
                                                        className={`group/media ${isImageOnlyBubble ? "block w-full overflow-hidden rounded-2xl" : "mb-2 block overflow-hidden rounded-xl border border-black/10"}`}
                                                        onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
                                                        onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
                                                    >
                                                        <div className="relative">
                                                        <img
                                                            src={imageUrl}
                                                            alt={t("chat.thread.shared_alt")}
                                                            className={`${isImageOnlyBubble ? "max-h-80 w-full object-cover" : "max-h-64 w-full object-cover"} ${mediaBlurClassName}`}
                                                        />
                                                        {isExpiringImage ? (
                                                            <div className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-semibold text-white ring-1 ring-white/25">
                                                                1
                                                            </div>
                                                        ) : null}
                                                        {!mine && (messageTakenOnGrindr || imageCreatedAtLabel) ? (
                                                            <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
                                                                {messageTakenOnGrindr ? (
                                                                    <img
                                                                        src={freegrindLogo}
                                                                        alt={t("chat.thread.taken_on_grindr")}
                                                                        className="h-3.5 w-3.5 rounded-full"
                                                                    />
                                                                ) : null}

                                                                {imageCreatedAtLabel ? (
                                                                    <span>
                                                                        {` ${imageCreatedAtLabel}`}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        ) : null}

                                                            {isImageOnlyBubble ? (
                                                                <div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-white">
                                                                    {(expiresAt > Date.now() || isOnce) && isExpiringMedia && (
                                                                        <AlbumExpirationCountdown
                                                                            expiresAt={expiresAt}
                                                                            isOnce={isOnce}
                                                                            t={t}
                                                                        />
                                                                    )}

                                                                    <div className="flex items-center justify-between gap-2 text-[10px]">
                                                                        <div className="flex items-center gap-2">
                                                                            {pending ? <span>{t("chat.sending")}</span> : null}
                                                                            {failed ? <span>{t("chat.thread.failed")}</span> : null}
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span>
                                                                                {formatMessageTime(message.timestamp, nowTimestamp, t)}
                                                                            </span>
                                                                            {isDesktop &&
                                                                            !pending &&
                                                                            !isLocalClientMessageId(message.messageId) ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(event) => {
                                                                                        event.stopPropagation();
                                                                                        void handleReply(message);
                                                                                    }}
                                                                                    className="rounded-md p-1 hover:bg-white/10"
                                                                                >
                                                                                    <Reply className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            ) : null}
                                                                            {isDesktop &&
                                                                            !pending &&
                                                                            !isLocalClientMessageId(message.messageId) ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(event) => {
                                                                                        event.stopPropagation();
                                                                                        setOpenMessageActionId((current) =>
                                                                                            current === message.messageId ? null : message.messageId,
                                                                                        );
                                                                                    }}
                                                                                    className="rounded-md p-1 hover:bg-white/10"
                                                                                >
                                                                                    <Ellipsis className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </button>
                                                ) : null}

                                                {isAlbumOnlyBubble ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (shouldBlurMedia && !isDesktop) {
                                                                revealMediaMessage(message.messageId);
                                                                return;
                                                            }
                                                            if (messageLongPressTriggeredRef.current) {
                                                                messageLongPressTriggeredRef.current = false;
                                                                return;
                                                            }
                                                            if (albumId) {
                                                                void openAlbumViewerById(albumId);
                                                            }
                                                        }}
                                                        className="group/media block w-full overflow-hidden rounded-2xl"
                                                        onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
                                                        onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
                                                        disabled={!albumId || isLocked}
                                                    >
                                                        <div className="relative h-56 w-64 max-w-full overflow-hidden bg-[var(--surface-2)] sm:w-72">
                                                            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)]">
                                                                <Album className="h-8 w-8" />
                                                            </div>
                                                            {albumCover ? (
                                                                <img
                                                                    src={albumCover}
                                                                alt={t("chat.thread.album_cover")}
                                                                    className={`h-full w-full object-cover ${isLocked ? "scale-110 blur-sm opacity-50" : ""} ${mediaBlurClassName}`}
                                                                    onError={(event) => {
                                                                        event.currentTarget.style.display = "none";
                                                                    }}
                                                                />
                                                            ) : null}

                                                            {isLocked && (
                                                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[15px]">
                                                                    <Lock className="h-10 w-10 text-white/90 drop-shadow-lg" />
                                                                    <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/90 drop-shadow">
                                                                        {t("chat.expiration.expired")}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-white">
                                                                <Avatar
                                                                    src={senderAvatarUrl}
                                                                    alt={senderLabel}
                                                                    fallback={senderLabel}
                                                                    className="h-16 w-16 border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-sm"
                                                                />
                                                                <p className="max-w-full truncate text-sm font-semibold leading-tight text-white drop-shadow">
                                                                    {senderLabel}
                                                                </p>
                                                            </div>
                                                            <div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-white">
                                                                {!isLocked && isExpiringMedia && (expiresAt > Date.now() || isOnce) && (
                                                                    <AlbumExpirationCountdown
                                                                        expiresAt={expiresAt}
                                                                        isOnce={isOnce}
                                                                        t={t}
                                                                    />
                                                                )}
                                                                <div className="flex items-center justify-between gap-2 text-[10px]">
                                                                    <div className="flex items-center gap-2">
                                                                        {pending ? <span>{t("chat.sending")}</span> : null}
                                                                        {failed ? <span>{t("chat.thread.failed")}</span> : null}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span>
                                                                            {formatMessageTime(message.timestamp, nowTimestamp, t)}
                                                                        </span>
                                                                        {isDesktop &&
                                                                        !pending &&
                                                                        !isLocalClientMessageId(message.messageId) ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(event) => {
                                                                                    event.stopPropagation();
                                                                                    setOpenMessageActionId((current) =>
                                                                                        current === message.messageId ? null : message.messageId,
                                                                                    );
                                                                                }}
                                                                                className="rounded-md p-1 hover:bg-white/10"
                                                                            >
                                                                                <Ellipsis className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ) : null}

                                                {videoUrl ? (
                                                        <div
                                                            className="group/media mb-2 overflow-hidden rounded-xl border border-black/10 bg-black"
                                                            onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
                                                            onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
                                                            onClick={() => {
                                                                if (shouldBlurMedia && !isDesktop) {
                                                                    revealMediaMessage(message.messageId);
                                                                }
                                                            }}
                                                        >
                                                        <video
                                                            controls
                                                            preload="metadata"
                                                            src={videoUrl}
                                                                className={`max-h-72 w-full ${mediaBlurClassName} ${shouldBlurMedia ? "cursor-pointer" : ""}`}
                                                        />
                                                    </div>
                                                ) : null}

                                                {audioUrl ? (
                                                    <div className="mb-2 rounded-xl border border-black/10 bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-2">
                                                        <audio
                                                            controls
                                                            preload="none"
                                                            src={audioUrl}
                                                            className="w-full"
                                                        />
                                                    </div>
                                                ) : null}

                                                {location ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const url = isDesktop
                                                                ? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lon}`
                                                                : `geo:${location.lat},${location.lon}?q=${location.lat},${location.lon}`;
                                                            window.open(url, "_blank");
                                                        }}
                                                        className={`mb-2 flex w-full flex-col gap-2 rounded-xl border border-black/10 p-3 text-left transition hover:brightness-110 ${
                                                            mine
                                                                ? "bg-white/10 text-white"
                                                                : "bg-[var(--surface)] text-[var(--text)]"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm">
                                                                <MapPin className="h-5 w-5" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                                                                    {t("chat.thread.location_shared")}
                                                                </p>
                                                                <p className="truncate text-sm font-semibold opacity-90">
                                                                    {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {isLocationOnlyBubble && (
                                                            <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[10px] opacity-80">
                                                                <span>
                                                                    {formatMessageTime(message.timestamp, nowTimestamp, t)}
                                                                </span>
                                                                {isDesktop &&
                                                                !pending &&
                                                                !isLocalClientMessageId(message.messageId) ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                void handleReply(message);
                                                                            }}
                                                                            className={`rounded-md p-1 ${mine ? "hover:bg-white/10" : "hover:bg-black/10"}`}
                                                                        >
                                                                            <Reply className="h-3.5 w-3.5" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                setOpenMessageActionId((current) =>
                                                                                    current === message.messageId
                                                                                        ? null
                                                                                        : message.messageId,
                                                                                );
                                                                            }}
                                                                            className={`rounded-md p-1 ${mine ? "hover:bg-white/10" : "hover:bg-black/10"}`}
                                                                        >
                                                                            <Ellipsis className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </button>
                                                ) : null}

                                                {isAlbumMessage && !isAlbumOnlyBubble ? (
                                                    <div className={`mb-2 rounded-xl border border-black/10 p-2 ${isLocked ? "bg-[var(--surface-2)] opacity-60" : "bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]"}`}>
                                                        {albumCover ? (
                                                            <img
                                                                src={albumCover}
                                                                alt={t("chat.thread.album_cover")}
                                                                className={`mb-2 h-36 w-full rounded-lg object-cover ${isLocked ? "blur-[2px] opacity-50" : ""}`}
                                                            />
                                                        ) : null}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-medium">
                                                                {isLocked ? (
                                                                    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                                                                        <Lock className="h-3.5 w-3.5" />
                                                                        {t("chat.expiration.expired")}
                                                                    </div>
                                                                ) : t("chat.thread.album_share")}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (albumId) {
                                                                        void openAlbumViewerById(albumId);
                                                                    }
                                                                }}
                                                                className="rounded-md border border-black/20 px-2 py-1 text-[11px]"
                                                                disabled={!albumId || isLocked}
                                                            >
                                                                {t("chat.open")}
                                                            </button>
                                                        </div>
                                                        {!isLocked && isExpiringMedia && (expiresAt > Date.now() || isOnce) && (
                                                            <AlbumExpirationCountdown
                                                                expiresAt={expiresAt}
                                                                isOnce={isOnce}
                                                                t={t}
                                                            />
                                                        )}
                                                    </div>
                                                ) : null}

                                                {!isMediaOnlyBubble ? (
                                                    <div className="flex flex-col gap-1">
                                                        {isNativeReply || isLocalReply ? (
                                                            <div className={`mb-1 overflow-hidden rounded-lg border border-[var(--border)] p-2 text-xs opacity-90 shadow-sm ${mine ? "bg-white/10" : "bg-black/10"}`}>
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <p className="font-semibold">{t("chat.actions.reply", { defaultValue: "Reply" })}</p>
                                                                        <p className="opacity-80 line-clamp-2">
                                                                            {message.type === "ProfilePhotoReply" ? "Profile Photo" : 
                                                                             message.type === "AlbumReply" ? "Album Photo" : 
                                                                             localReplyText || (message as any).replyPreview?.text || (message.body as any)?.reply?.text || "Message"}
                                                                        </p>
                                                                    </div>
                                                                    {((message.body as any)?.imageHash || (message.body as any)?.reply?.thumbUrl) ? (
                                                                        <img 
                                                                            src={getThumbImageUrl((message.body as any).imageHash || (message.body as any).reply?.thumbUrl, "320x320")} 
                                                                            className="h-10 w-10 rounded-md object-cover border border-white/10" 
                                                                            alt="Thumbnail"
                                                                        />
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ) : null}
														
                                                        <p className="whitespace-pre-wrap break-words">
                                                            {displayMessageText}
                                                        </p>

                                                        {translations[message.messageId]?.loading && (
                                                            <div className="mt-1.5 flex items-center gap-1.5 text-xs italic opacity-70">
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                <span>{t("chat.translating", { defaultValue: "Translating..." })}</span>
                                                            </div>
                                                        )}
                                                        {translations[message.messageId]?.text && (
                                                            <div className="mt-1.5 flex flex-col border-t border-black/10 dark:border-white/10 pt-1.5">
                                                                <span className="mb-0.5 flex items-center text-[9px] font-bold uppercase tracking-wider opacity-60">
                                                                    <Languages className="mr-1 h-3 w-3" />
                                                                    {t("chat.translated", { defaultValue: "Translated" })} {translations[message.messageId].service ? `(${translations[message.messageId].service})` : ""}
                                                                </span>
                                                                <p className="whitespace-pre-wrap break-words text-[13px] opacity-90">
                                                                    {translations[message.messageId].text}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}

                                                {!isLocalClientMessageId(message.messageId) ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void handleReact(message);
                                                        }}
                                                        disabled={isMutatingMessageId === message.messageId}
                                                        className={`${fireButtonClass} z-10 cursor-pointer transition-all ${
                                                            message.reactions?.some(r => Number(r.reactionType) === 1)
                                                                ? "opacity-100 pointer-events-auto"
                                                                : "opacity-0 pointer-events-none group-hover/bubble:opacity-60 group-hover/bubble:pointer-events-auto"
                                                        } hover:opacity-80`}
                                                    >
                                                        <span className={`chat-reaction-flame text-2xl inline-flex ${
                                                            reactionBurstMessageId === message.messageId ? "chat-reaction-flame--burst" : ""
                                                        }`}>
                                                            🔥
                                                        </span>
														
                                                        {message.reactions && message.reactions.filter(r => Number(r.reactionType) === 1).length > 1 ? (
                                                            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-2)] text-[9px] font-bold text-[var(--text)] shadow-sm">
                                                                {message.reactions.filter(r => Number(r.reactionType) === 1).length}
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                ) : null}

                                                {!isMediaOnlyBubble ? (
                                                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                                                    <div className="flex items-center gap-2">
                                                        {pending ? <span>{t("chat.sending")}</span> : null}
                                                        {failed ? <span>{t("chat.thread.failed")}</span> : null}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span>
                                                            {formatMessageTime(message.timestamp, nowTimestamp, t)}
                                                        </span>

                                                        {isTranslateEnabled && !mine && displayMessageText && !translations[message.messageId]?.text && !translations[message.messageId]?.loading ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleTranslate(message.messageId, typeof displayMessageText === "string" ? displayMessageText : "");
                                                                }}
                                                                className="rounded-md p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100"
                                                                title={t("chat.actions.translate", { defaultValue: "Translate" })}
                                                            >
                                                                <Languages className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}

                                                        {isDesktop &&
                                                        !pending &&
                                                        !isLocalClientMessageId(message.messageId) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleReply(message)}
                                                                className="rounded-md p-1 hover:bg-black/10"
                                                            >
                                                                <Reply className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                        {isDesktop &&
                                                        !pending &&
                                                        !isLocalClientMessageId(message.messageId) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setOpenMessageActionId((current) =>
                                                                        current === message.messageId
                                                                            ? null
                                                                            : message.messageId,
                                                                    )
                                                                }
                                                                className="rounded-md p-1 hover:bg-black/10"
                                                            >
                                                                <Ellipsis className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                ) : null}

                                                {isDesktop && openMessageActionId === message.messageId ? (
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-black/10 p-2 text-[11px]">
                                                        {(() => {
                                                            const loc = getMessageLocation(message);
                                                            const body = message.body as any;
                                                            const hasText = body && typeof body.text === "string" && body.text.trim().length > 0;
                                                            if (!loc && !hasText) return null;

                                                            return (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleCopy(message)}
                                                                        className="rounded-md border border-black/20 px-2 py-1 transition hover:bg-black/10"
                                                                    >
                                                                        {t("chat.actions.copy", { defaultValue: "Copy" })}
                                                                    </button>

                                                                    {isTranslateEnabled && hasText && !mine && !translations[message.messageId]?.text ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleTranslate(message.messageId, typeof displayMessageText === "string" ? displayMessageText : "")}
                                                                            className="rounded-md border border-black/20 px-2 py-1 transition hover:bg-black/10"
                                                                        >
                                                                            <Languages className="mr-1 inline-block h-3 w-3 align-text-bottom" />
                                                                            {t("chat.actions.translate", { defaultValue: "Translate" })}
                                                                        </button>
                                                                    ) : null}
																	
                                                                    {!mine ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const wordToBan = window.prompt(
                                                                                    t("chat.actions.ban_word_prompt", {
                                                                                        defaultValue:
                                                                                            "Trim this message down to the specific keyword you want to ban:",
                                                                                    }),
                                                                                    hasText ? body.text : "",
                                                                                );
                                                                                if (wordToBan && wordToBan.trim()) {
                                                                                    const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
                                                                                    const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
                                                                                    window.localStorage.setItem("fg-forbidden-words", newList);
                                                                                    toast.success(
                                                                                        t("chat.actions.ban_word_added", {
                                                                                            defaultValue:
                                                                                                "Added \"{{word}}\" to forbidden keywords!",
                                                                                            word: wordToBan.trim(),
                                                                                        }),
                                                                                    );
                                                                                    setOpenMessageActionId(null);
                                                                                }
                                                                            }}
                                                                            className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-500 transition hover:bg-red-500/20"
                                                                        >
                                                                            {t("chat.actions.ban_word", { defaultValue: "Ban word" })}
                                                                        </button>
                                                                    ) : null}
                                                                </>
                                                            );
                                                        })()}
                                                        
                                                                    {imageUrl || videoUrl || audioUrl ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const url = imageUrl || videoUrl || audioUrl;
                                                                                if (!url) return;
                                                                                toast.success("Opening media...");
                                                                                const a = document.createElement("a");
                                                                                a.href = url;
                                                                                a.target = "_blank";
                                                                                a.rel = "noopener noreferrer";
                                                                                a.download = `free-grind-media-${Date.now()}`;
                                                                                document.body.appendChild(a);
                                                                                a.click();
                                                                                document.body.removeChild(a);
                                                                                setOpenMessageActionId(null);
                                                                            }}
                                                                            className="rounded-md border border-black/20 px-2 py-1 transition hover:bg-black/10"
                                                                        >
                                                                            {t("chat.actions.download", { defaultValue: "Download" })}
                                                                        </button>
                                                                    ) : null}

                                                        {mine && !message.unsent ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleUnsend(message)}
                                                                disabled={
                                                                    isMutatingMessageId === message.messageId
                                                                }
                                                                className="rounded-md border border-black/20 px-2 py-1"
                                                            >
                                                                {t("chat.actions.unsend")}
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleDelete(message)}
                                                            disabled={isMutatingMessageId === message.messageId}
                                                            className="rounded-md border border-black/20 px-2 py-1"
                                                        >
                                                            {t("chat.actions.delete")}
                                                        </button>
                                                    </div>
                                                ) : null}

                                                {failed ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRetry(message)}
                                                        className="mt-1 rounded-lg bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] px-2 py-1 text-[11px] font-semibold"
                                                    >
                                                        {t("chat.retry")}
                                                    </button>
                                                ) : null}
                                            </div>

                                            {mine && !pending && !failed && lastMyMessageId === message.messageId && (
                                                <div className="-mt-1 px-1">
                                                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] opacity-80">
                                                        {threadLastReadTimestamp != null && message.timestamp <= threadLastReadTimestamp
                                                            ? t("chat.read")
                                                            : t("chat.unread")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </Fragment>
                                );
                            });
                        })()}
                        </div>
                        <div ref={threadBottomRef} className="h-24 shrink-0" />
        </div>
    );
}