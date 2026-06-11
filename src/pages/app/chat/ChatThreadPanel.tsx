import {
    Album,
    Ban,
    ChevronDown,
    ChevronLeft,
    Ellipsis,
    Eye,
    EyeOff,
    Heart,
    Hourglass,
    ImagePlus,
    Infinity,
    Loader2,
    MapPin,
    MessageCircleOff,
    MessageCircleX,
    PencilLine,
    Pin,
    Reply,
    Share2,
    SquareStack,
    TimerOff,
    Trash2,
    User,
    Volume2,
    X,
    Plus,
    Settings2,
    BookMarked,
    RotateCw,
    SendHorizontal,
    SquareCenterlineDashedHorizontal,
    Smile,
    ImagePlay,
    Clock,
    Search as SearchIcon,
    Images,
    Mic,
    Square,
    Camera,
    Download,
    Image as ImageIcon,
    Link,
    MoreHorizontal,
    ShieldOff,
    FileAudio,
} from "lucide-react";
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { NavigateFunction } from "react-router-dom";
import toast from "react-hot-toast";
import { appLog } from "../../../utils/logger";
import {
    createBackdropCloseHandler,
    useModalClose,
} from "../../../hooks/useModalClose";
import type { AlbumListItem, UiMessage, AlbumViewerState } from "../../../types/chat-page";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { DrawerMedia } from "./ChatDrawerPanel";
import { ChatDrawerPanel } from "./ChatDrawerPanel";
import { decodeGeohash } from "../../../utils/geohash";
import { LeafletLocationPicker } from "../gridpage/components/LeafletLocationPicker";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { usePreferences } from "../../../contexts/PreferencesContext";
import {
    getMessageLocation,
    getMessagePreviewLabel,
    getOtherParticipant,
    getParticipantAvatarUrl,
    getParticipantOnlineMeta,
    getMessageImageUrl,
    getMessageVideoUrl,
    getMessageAudioUrl,
    getMessageAlbumId,
    getMessageAlbumCoverUrl,
} from "./chatUtils";
import { getMessageAlbumId as getMessageAlbumIdHelper, getMessagePhotoContentId } from "../../utils/messages";
import { extractAudioToWav, getAudioDuration } from "../../../utils/audioUtils";
import { cn } from "../../../utils/cn";
import { getThumbImageUrl } from "../../../utils/media";
import { formatDistance } from "../gridpage/utils";
import { ProfileImage } from "../../../components/ui/profile-image";
import { ChatThreadMessages } from "./ChatThreadMessages";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { isChatGhosted, toggleChatGhost } from "../../../utils/privacy";
import { ToggleRow } from "../../../components/ui/toggle-row";
import { BottomDrawer } from "../../../components/ui/bottom-drawer";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";

import {
    loadSavedPhrases,
    saveSavedPhrases,
    SAVED_PHRASES_UPDATED_EVENT,
} from "../../../services/savedPhrases";
import { useMultiSelect } from "../../../contexts/MultiSelectContext";

type ChatThreadPanelProps = {
    navigate: NavigateFunction;
    isDesktop: boolean;
    selectedConversation: ConversationEntry | null;
    targetProfileId: number | null;
    userId: number | null;
    nowTimestamp: number;
    presenceResults: Record<string, boolean>;
    isUpdatingConversationState: boolean;
    isHeaderActionsMenuOpen: boolean;
    setIsHeaderActionsMenuOpen: (value: ((current: boolean) => boolean) | boolean) => void;
    headerActionsMenuRef: { current: HTMLDivElement | null };
    togglePin: () => void | Promise<void>;
    toggleMute: () => void | Promise<void>;
    clearLocalHistory: () => void | Promise<void>;
    onDeleteConversation?: (conversationId: string) => void | Promise<void>;
    isDeletingConversation?: boolean;
    onBlockProfile?: (profileId: number) => void | Promise<void>;
    isBlockingProfile?: boolean;
    onToggleFavorite?: (profileId: number, currentlyFavorite: boolean) => void | Promise<void>;
    isFavorite?: boolean;
    isTogglingFavorite?: boolean;
    localNickname?: string | null;
    onEditLocalNickname?: (profileId: number, defaultName: string) => void | Promise<void>;
    getProfileReturnToChatPath: (profileId: number) => string;
    isLoadingThread: boolean;
    threadConversationId: string | null;
    threadError: string | null;
    loadThread: (args: { conversationId: string; older: boolean }) => void | Promise<void>;
    threadScrollContainerRef: { current: HTMLDivElement | null };
    handleThreadScroll: (event: React.UIEvent<HTMLDivElement>) => void;
    messagePageKey: string | null;
    isLoadingOlderMessages: boolean;
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
    handleMessageTap: (message: Message) => void | Promise<void>;
    handleStopAlbumShare: (albumId: number) => void | Promise<void>;
    threadBottomRef: { current: HTMLDivElement | null };
    handleSend: (event: React.FormEvent<HTMLFormElement>) => void;
    toggleAlbumPicker: () => void;
    toggleDrawer: () => void;
    attachmentInputRef: { current: HTMLInputElement | null };
    onAttachmentInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isUploadingAttachment: boolean;
    pendingAttachmentFile: File | null;
    attachmentLooping: boolean;
    attachmentTakenOnGrindr: boolean;
    setAttachmentLooping: (value: boolean) => void;
    setAttachmentTakenOnGrindr: (value: boolean) => void;
    confirmPendingAttachment: () => void;
    confirmAttachmentFile: (file: File, overrideOptions?: { looping: boolean; takenOnGrindr: boolean }) => void | Promise<void>;
    cancelPendingAttachment: () => void;
    isAlbumPickerOpen: boolean;
    isLoadingAlbums: boolean;
    shareableAlbums: AlbumListItem[];
    isSharingAlbum: boolean;
    pendingAlbumShare: {
        albumId: number;
        albumName: string;
    } | null;
    shareAlbumToCurrentConversation: (
        albumId: number,
        albumName?: string | null,
    ) => void | Promise<void>;
    confirmPendingAlbumShare: (expirationType: string) => void | Promise<void>;
    closePendingAlbumShare: () => void;
    isDrawerOpen: boolean;
    isLoadingDrawer: boolean;
    drawerError: string | null;
    drawerMedia: DrawerMedia[];
    isSendingDrawerMedia: boolean;
    isAddingDrawerMedia: boolean;
    deletingDrawerMediaId: number | null;
    onLoadDrawerMedia: () => void | Promise<void>;
    onSendDrawerMedia: (mediaIds: number[], maxViews?: number) => Promise<void>;
    onAddDrawerMedia: (file: File, takenOnGrindr: boolean) => Promise<void>;
    onDeleteDrawerMedia: (mediaId: number) => Promise<void>;
    onShareAlbumFromDrawer: (albumId: number, expirationType: string) => Promise<void>;
    onStopAlbumShareFromDrawer: (albumId: number) => Promise<void>;
    onSendLocation: (lat: number, lon: number) => void | Promise<void>;
    uploadProgress: number;
    draft: string;
    setDraft: (value: string) => void;
    replyTargetMessage: UiMessage | null;
    clearReplyTarget: () => void;
    isSending: boolean;
    selectedActionMessage: UiMessage | null;
    selectedActionMessageMine: boolean;
    albumViewer: AlbumViewerState | null;
    onCloseAlbumViewer: () => void;
    attachmentMaxViews: number;
    setAttachmentMaxViews: (value: number) => void;
    albumCoverMap?: Map<number, string>;
    ownProfilePhotoUrl?: string | null;
    onAudioRecorded: (blob: Blob, durationMs: number, autoSend?: boolean) => void;
    pendingAudioBlob: Blob | null;
    pendingAudioDuration: number;
    isSendingAudio: boolean;
    confirmAudio: () => void | Promise<void>;
    cancelAudio: () => void;
    isAlbumSheetOpen: boolean;
    onOpenMediaSheet?: () => void;
};

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";

async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
    if (!blob.type.includes("webm")) return blob;
    const buf = await blob.arrayBuffer();
    const data = new Uint8Array(buf);
    for (let i = 0; i < data.length - 10; i++) {
        if (data[i] === 0x44 && data[i + 1] === 0x89 && data[i + 2] === 0x88) {
            new DataView(buf).setFloat64(i + 3, durationMs, false);
            return new Blob([buf], { type: blob.type });
        }
    }
    return blob;
}

function AudioPreviewPlayer({ blob, durationMs, recordedBars, recordedFraction }: { blob: Blob; durationMs: number; recordedBars: number[]; recordedFraction: number }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        const u = URL.createObjectURL(blob);
        setUrl(u);
        return () => { setTimeout(() => URL.revokeObjectURL(u), 3000); };
    }, [blob]);
    if (!url) return null;
    return <AudioMessagePlayer src={url} messageId="preview" mine={false} className="w-full" durationHint={durationMs / 1000} hideSpeed compact initialBars={recordedBars} recordedFraction={recordedFraction} />;
}

export function ChatThreadPanel(props: ChatThreadPanelProps) {
    const { t } = useTranslation();
    const apiFunctions = useApiFunctions();
    const { isActive } = useMultiSelect(); // <-- MULTI-SELECT AWARENESS

    // MAGIC UI REDRAW TRIGGER FOR GHOST MODE
    const [, forceRender] = useState(0);
    useEffect(() => {
        const triggerUpdate = () => forceRender(Date.now());
        window.addEventListener("fg-ghost-update", triggerUpdate);
        return () => window.removeEventListener("fg-ghost-update", triggerUpdate);
    }, []);

    const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false);
    const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("chat_skip_delete_confirm") === "true";
    });
    const { unitsPreset, geohash } = usePreferences();
    const [selectedExpirationType, setSelectedExpirationType] = useState("INDEFINITE");
    const [pendingLocationShare, setPendingLocationShare] = useState<{ lat: number; lon: number } | null>(null);
    const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
    const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
    const [isDeleteConversationConfirmOpen, setIsDeleteConversationConfirmOpen] =
        useState(false);
    const [dontAskBlockAgain, setDontAskBlockAgain] = useState(false);
    const [skipBlockConfirm, setSkipBlockConfirm] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
    });

    const [savedPhrases, setSavedPhrases] = useState<string[]>(() => loadSavedPhrases());

    const handleUsePhrase = (phrase: string) => {
        setDraft(draft ? `${draft} ${phrase}` : phrase);
    };

    useEffect(() => {
        const syncSavedPhrases = (event: Event) => {
            const detail = (event as CustomEvent<string[]>).detail;
            if (Array.isArray(detail)) {
                setSavedPhrases(detail);
                return;
            }
            setSavedPhrases(loadSavedPhrases());
        };

        window.addEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);
        window.addEventListener("storage", syncSavedPhrases);

        return () => {
            window.removeEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);
            window.removeEventListener("storage", syncSavedPhrases);
        };
    }, []);

    const {
        navigate,
        isDesktop,
        selectedConversation,
        targetProfileId,
        userId,
        nowTimestamp,
        handleMessageTap,
        handleStopAlbumShare,
        presenceResults,
        isUpdatingConversationState,
        isHeaderActionsMenuOpen,
        setIsHeaderActionsMenuOpen,
        headerActionsMenuRef,
        togglePin,
        toggleMute,
        clearLocalHistory,
        onDeleteConversation,
        isDeletingConversation = false,
        onBlockProfile,
        isBlockingProfile = false,
        onToggleFavorite,
        isFavorite = false,
        isTogglingFavorite = false,
        localNickname = null,
        onEditLocalNickname,
        getProfileReturnToChatPath,
        isLoadingThread,
        threadConversationId,
        threadError,
        loadThread,
        threadScrollContainerRef,
        handleThreadScroll,
        messagePageKey,
        isLoadingOlderMessages,
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
        handleSend,
        toggleAlbumPicker,
        attachmentInputRef,
        onAttachmentInput,
        isUploadingAttachment,
        pendingAttachmentFile,
        attachmentLooping,
        attachmentTakenOnGrindr,
        setAttachmentLooping,
        setAttachmentTakenOnGrindr,
        confirmPendingAttachment,
        confirmAttachmentFile,
        cancelPendingAttachment,
        isAlbumPickerOpen,
        isLoadingAlbums,
        shareableAlbums,
        isSharingAlbum,
        pendingAlbumShare,
        shareAlbumToCurrentConversation,
        confirmPendingAlbumShare,
        closePendingAlbumShare,
        uploadProgress,
        draft,
        setDraft,
        replyTargetMessage,
        clearReplyTarget,
        isSending,
        selectedActionMessage,
        selectedActionMessageMine,
        albumViewer,
        toggleDrawer,
        isDrawerOpen,
        isLoadingDrawer,
        drawerError,
        drawerMedia,
        isSendingDrawerMedia,
        isAddingDrawerMedia,
        deletingDrawerMediaId,
        onLoadDrawerMedia,
        onSendDrawerMedia,
        onAddDrawerMedia,
        onDeleteDrawerMedia,
        onShareAlbumFromDrawer,
        onStopAlbumShareFromDrawer,
        onSendLocation,
        onCloseAlbumViewer,
        attachmentMaxViews,
        setAttachmentMaxViews,
        albumCoverMap: externalAlbumCoverMap,
        ownProfilePhotoUrl,
        onAudioRecorded,
        pendingAudioBlob,
        pendingAudioDuration,
        isSendingAudio,
        confirmAudio,
        cancelAudio,
        isAlbumSheetOpen,
        onOpenMediaSheet,
    } = props;

    // --- IMAGE CROP & SAVED PHRASES UI STATE ---
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
    const [attachmentCrop, setAttachmentCrop] = useState<Crop | undefined>(undefined);
    const [attachmentCompletedCrop, setAttachmentCompletedCrop] = useState<PixelCrop | undefined>(undefined);
    const [isDraggingAttachmentCrop, setIsDraggingAttachmentCrop] = useState(false);
    const attachmentImgRef = useRef<HTMLImageElement | null>(null);

    // --- AUDIO RECORDING ENGINE ---
    const [isRecording, setIsRecording] = useState(false);
    const [recordingMs, setRecordingMs] = useState(0);
    const [waveformBars, setWaveformBars] = useState<number[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const waveformBarsRef = useRef<number[]>([]);
    const [recordedWaveform, setRecordedWaveform] = useState<number[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recordingStartRef = useRef(0);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordingMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const waveformRafRef = useRef<number | null>(null);
    const swipeStartXRef = useRef(0);
    const isCapturingRef = useRef(false);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasVibratedRef = useRef(false);
    const [recordDragX, setRecordDragX] = useState(0);
    const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
    
    // --- LONG PRESS STATE ---
    const wasLongPressRef = useRef(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerStartPos = useRef({ x: 0, y: 0 });
    
    // --- AUDIO / VIDEO UPLOAD ---
    const [isMicMenuOpen, setIsMicMenuOpen] = useState(false);
    const audioFileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessingAudioFile, setIsProcessingAudioFile] = useState(false);
    const [showRecordCircle, setShowRecordCircle] = useState(false);
    const [trashBounce, setTrashBounce] = useState(false);
    const CANCEL_THRESHOLD = window.innerWidth * 0.35;
    const dragProgress = Math.min(1, Math.abs(Math.min(0, recordDragX)) / CANCEL_THRESHOLD);
    const stopRecordingRef = useRef<(autoSend?: boolean) => void>(() => {});

    const cleanupAnalyser = useCallback(() => {
        if (waveformRafRef.current) { cancelAnimationFrame(waveformRafRef.current); waveformRafRef.current = null; }
        analyserRef.current = null;
        if (audioCtxRef.current) { void audioCtxRef.current.close(); audioCtxRef.current = null; }
        setWaveformBars([]);
    }, []);

    useEffect(() => { waveformBarsRef.current = waveformBars; }, [waveformBars]);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
            mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
            void audioCtxRef.current?.close();
        };
    }, []);

    const startRecording = useCallback(async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"].find(
                (t) => MediaRecorder.isTypeSupported(t),
            ) ?? "";
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.start(100);
            mediaRecorderRef.current = recorder;
            recordingStartRef.current = Date.now();
            setIsRecording(true);
            (window as unknown as { FreeGrindBridge?: { vibrate?: (ms: number) => void } }).FreeGrindBridge?.vibrate?.(30) ?? navigator.vibrate?.(30);
            setRecordingMs(0);
            recordingTimerRef.current = setInterval(() => {
                const elapsed = Date.now() - recordingStartRef.current;
                setRecordingMs(elapsed);
                if (elapsed >= 60_000) stopRecordingRef.current();
            }, 100);
            recordingMaxTimerRef.current = setTimeout(() => stopRecordingRef.current(), 60_000);
            try {
                const audioCtx = new AudioContext();
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 64;
                analyser.smoothingTimeConstant = 0.7;
                audioCtx.createMediaStreamSource(stream).connect(analyser);
                audioCtxRef.current = audioCtx;
                analyserRef.current = analyser;
                const data = new Uint8Array(analyser.frequencyBinCount);
                let lastSample = 0;
                const tick = (t: number) => {
                    if (t - lastSample >= 80) {
                        lastSample = t;
                        analyser.getByteFrequencyData(data);
                        const amp = data.slice(0, 10).reduce((a, b) => a + b, 0) / 10 / 255;
                        setWaveformBars(prev => [...prev, amp]);
                    }
                    waveformRafRef.current = requestAnimationFrame(tick);
                };
                waveformRafRef.current = requestAnimationFrame(tick);
            } catch { /* analyser failure is non-fatal */ }
        } catch (err) {
            toast.error(t("chat.errors.microphone_access", { defaultValue: "Could not access microphone." }));
        }
    }, [isRecording, t]);

    const stopRecording = useCallback((autoSend?: boolean) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
        if (recordingMaxTimerRef.current) { clearTimeout(recordingMaxTimerRef.current); recordingMaxTimerRef.current = null; }
        const durationMs = Date.now() - recordingStartRef.current;
        const capturedBars = [...waveformBarsRef.current];
        cleanupAnalyser();
        recorder.onstop = () => {
            recorder.stream.getTracks().forEach((t) => t.stop());
            const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
            if (rawBlob.size === 0) { mediaRecorderRef.current = null; return; }
            void fixWebmDuration(rawBlob, durationMs).then((blob) => {
                if (durationMs >= 500) {
                    setRecordedWaveform(capturedBars);
                    onAudioRecorded(blob, durationMs, autoSend);
                } else {
                    toast.error(t("chat.errors.recording_too_short", { defaultValue: "Recording too short." }));
                }
                mediaRecorderRef.current = null;
            });
        };
        recorder.stop();
        setIsRecording(false);
        setRecordingMs(0);
    }, [cleanupAnalyser, onAudioRecorded, t]);
    useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

    const cancelRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
        if (recordingMaxTimerRef.current) { clearTimeout(recordingMaxTimerRef.current); recordingMaxTimerRef.current = null; }
        cleanupAnalyser();
        recorder.onstop = () => { recorder.stream.getTracks().forEach((t) => t.stop()); mediaRecorderRef.current = null; };
        recorder.stop();
        setIsRecording(false);
        setRecordingMs(0);
    }, [cleanupAnalyser]);

    const [isSavedPhrasesOpen, setIsSavedPhrasesOpen] = useState(false);
    const [phrasesExpanded, setPhrasesExpanded] = useState(false);
    const [newPhraseInput, setNewPhraseInput] = useState("");

    // --- EMOJI & GIF PICKER STATE ---
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
    const [gifSearchQuery, setGifSearchQuery] = useState("");
    const [gifResults, setGifResults] = useState<any[]>([]);
    const [gifHistory, setGifHistory] = useState<any[]>(() => {
        try { 
            const parsed = JSON.parse(window.localStorage.getItem("fg-gif-history") || "[]"); 
            return Array.isArray(parsed) ? parsed : [];
        } catch { 
            return []; 
        }
    });
    const [isGifLoading, setIsGifLoading] = useState(false);
    const [activeGifTab, setActiveGifTab] = useState<"trending" | "history">("trending");
    
    // Personal API Key State
    const [giphyKey, setGiphyKey] = useState(() => window.localStorage.getItem("fg-giphy-key") || "");
    const [gifError, setGifError] = useState<string | null>(null);

    // Native GIPHY Fetcher
    useEffect(() => {
        if (!isGifPickerOpen) return;
        if (activeGifTab === "history") return;
        if (!giphyKey) {
            setGifError("Missing API Key");
            return;
        }

        const fetchGifs = async () => {
            setIsGifLoading(true);
            setGifError(null);
            try {
                const endpoint = gifSearchQuery.trim()
                    ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(gifSearchQuery)}&limit=30`
                    : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=30`;
                const res = await fetch(endpoint);
                const data = (await res.json()) as any;
                
                if (data?.meta?.status === 401) {
                    setGifError("Invalid API Key (401 Unauthorized)");
                    setGifResults([]);
                } else {
                    setGifResults(Array.isArray(data?.data) ? data.data : []);
                }
            } catch (e) {
                appLog.error("Failed to fetch GIFs", e);
                setGifError("Network Error");
            } finally {
                setIsGifLoading(false);
            }
        };
        const debounce = setTimeout(fetchGifs, 400);
        return () => clearTimeout(debounce);
    }, [gifSearchQuery, isGifPickerOpen, activeGifTab, giphyKey]);

    const handleSendGif = async (gif: any) => {
        setIsGifPickerOpen(false);
        
        // Grab the raw animated GIF URL from Giphy
        const url = gif.images?.original?.url || gif.images?.fixed_height?.url;
        if (!url) { toast.error("GIF format not supported."); return; }
        
        // Save to local history
        setGifHistory(prev => {
            const next = [gif, ...prev.filter((g: any) => g.id !== gif.id)].slice(0, 15);
            window.localStorage.setItem("fg-gif-history", JSON.stringify(next));
            return next;
        });
        
        const loadingToast = toast.loading("Uploading GIF...");
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            
            // Package explicitly as image/gif so the uploader bypasses the Canvas compressor!
            const file = new File([blob], `giphy-${gif.id}.gif`, { type: "image/gif" });
            toast.dismiss(loadingToast);
            
            // Send directly through your attachment pipeline. It will stay perfectly animated!
            void confirmAttachmentFile(file, { looping: true, takenOnGrindr: false });
        } catch (e) {
            toast.dismiss(loadingToast);
            toast.error("Failed to process GIF.");
        }
    };

    // Close popups on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Placeholder references for closing logic
            const emojiPickerRef = { current: null }; 
            const gifPickerRef = { current: null };
            
            if (emojiPickerRef.current && !(emojiPickerRef.current as any).contains(e.target as Node)) setIsEmojiPickerOpen(false);
            if (gifPickerRef.current && !(gifPickerRef.current as any).contains(e.target as Node)) setIsGifPickerOpen(false);
            
            // Close mic menu if clicking outside
            setIsMicMenuOpen(false);
        };
        
        if (isEmojiPickerOpen || isGifPickerOpen || isMicMenuOpen) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [isEmojiPickerOpen, isGifPickerOpen, isMicMenuOpen]);

    // --- IMMUTABLE DYNAMIC STATE (Fixes Reactivity Bug!) ---
    const showGhostButton = window.localStorage.getItem("fg-show-ghost-btn") !== "false";
    const isGhosted = selectedConversation ? isChatGhosted(selectedConversation.data.conversationId) : false;

    const closeBlockConfirm = () => {
        if (isBlockingProfile) {
            return;
        }
        setIsBlockConfirmOpen(false);
    };

    const closeDeleteConversationConfirm = () => {
        if (isDeletingConversation) {
            return;
        }
        setIsDeleteConversationConfirmOpen(false);
    };

        useEffect(() => {
            if (!pendingAttachmentFile) {
                setAttachmentPreviewUrl(null);
                setAttachmentCrop(undefined);
                setAttachmentCompletedCrop(undefined);
                return;
            }
            const url = URL.createObjectURL(pendingAttachmentFile);
            setAttachmentPreviewUrl(url);
            setAttachmentCrop(undefined);
            setAttachmentCompletedCrop(undefined);
            return () => URL.revokeObjectURL(url);
        }, [pendingAttachmentFile]);

        useEffect(() => {
            if (!attachmentPreviewUrl) return;
            setAttachmentCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
        }, [attachmentPreviewUrl]);

        const applyAttachmentTransform = useCallback(async (type: "flipH" | "rotateCw") => {
            const img = attachmentImgRef.current;
            if (!img || !img.complete || img.naturalWidth === 0) return;
            const sw = img.naturalWidth;
            const sh = img.naturalHeight;
            const canvas = document.createElement("canvas");
            canvas.width = type === "rotateCw" ? sh : sw;
            canvas.height = type === "rotateCw" ? sw : sh;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            if (type === "flipH") ctx.scale(-1, 1);
            if (type === "rotateCw") ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.95),
            );
            if (!blob) return;
            setAttachmentPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(blob);
            });
        }, []);

        const handleConfirmAttachment = useCallback(async () => {
            if (!pendingAttachmentFile) return;
            let fileToUpload: File = pendingAttachmentFile;
            const isFullImage =
                !attachmentCompletedCrop ||
                !attachmentImgRef.current ||
                (attachmentCompletedCrop.x <= 1 &&
                    attachmentCompletedCrop.y <= 1 &&
                    Math.abs(attachmentCompletedCrop.width - attachmentImgRef.current.width) <= 2 &&
                    Math.abs(attachmentCompletedCrop.height - attachmentImgRef.current.height) <= 2);
            if (!isFullImage && attachmentCompletedCrop?.width && attachmentCompletedCrop.height && attachmentImgRef.current) {
                const img = attachmentImgRef.current;
                const scaleX = img.naturalWidth / img.width;
                const scaleY = img.naturalHeight / img.height;
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(attachmentCompletedCrop.width * scaleX);
                canvas.height = Math.round(attachmentCompletedCrop.height * scaleY);
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.drawImage(
                        img,
                        attachmentCompletedCrop.x * scaleX,
                        attachmentCompletedCrop.y * scaleY,
                        attachmentCompletedCrop.width * scaleX,
                        attachmentCompletedCrop.height * scaleY,
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                    );
                    fileToUpload = await new Promise<File>((resolve) => {
                        canvas.toBlob(
                            (blob) => {
                                if (!blob) { resolve(pendingAttachmentFile); return; }
                                resolve(new File([blob], pendingAttachmentFile.name, { type: pendingAttachmentFile.type || "image/jpeg" }));
                            },
                            pendingAttachmentFile.type || "image/jpeg",
                            0.92,
                        );
                    });
                }
            }
            await confirmAttachmentFile(fileToUpload);
        }, [pendingAttachmentFile, attachmentCompletedCrop, confirmAttachmentFile]);

        const handleAddPhrase = () => {
            const trimmed = newPhraseInput.trim();
            if (!trimmed) return;
            const updated = saveSavedPhrases([...savedPhrases, trimmed]);
            setSavedPhrases(updated);
            setNewPhraseInput("");
        };

        const handleDeletePhrase = (index: number) => {
            const updated = saveSavedPhrases(savedPhrases.filter((_, i) => i !== index));
            setSavedPhrases(updated);
        };

        const albumCoverMap = useMemo(() => {
            const map = new Map<number, string>();
            for (const msg of threadMessages) {
                const aid = getMessageAlbumId(msg);
                const cover = getMessageAlbumCoverUrl(msg);
                if (aid && cover) map.set(aid, cover);
            }
            return map;
        }, [threadMessages]);

        const sharedAlbumIds = useMemo(() => {
            const ids = new Set<number>();
            for (const msg of threadMessages) {
                const aid = getMessageAlbumId(msg);
                const body = msg.body as any;
                if (aid && body?.isViewable) ids.add(aid);
            }
            return ids;
        }, [threadMessages]);

        const handleLocationSelect = useCallback(async (lat: number, lon: number) => {
            const setIsLocationPickerOpen = (v: boolean) => {}; // shim
            setIsLocationPickerOpen(false);
            setPendingLocationShare({ lat, lon });
        }, []);

        const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            
            setIsMicMenuOpen(false);
            setIsProcessingAudioFile(true);
            
            try {
                let audioBlob: Blob;
                let durationMs: number;
                
                // If it's a video file, extract the audio into WAV
                if (file.type.startsWith("video/")) {
                    toast.loading(t("chat.extracting_audio", { defaultValue: "Extracting audio from video..." }), { id: "audio-extract" });
                    const result = await extractAudioToWav(file);
                    audioBlob = result.blob;
                    durationMs = result.durationMs;
                    toast.success(t("chat.extracted_audio", { defaultValue: "Audio extracted!" }), { id: "audio-extract" });
                } else {
                    audioBlob = file;
                    // Get duration
                    durationMs = await getAudioDuration(audioBlob);
                }
                
                // Send to the preview pipeline so the user can verify and send it
                onAudioRecorded(audioBlob, Math.round(durationMs), false);
                
            } catch (err) {
                appLog.error("Error processing audio file:", err);
                toast.error(t("chat.errors.process_audio_failed", { defaultValue: "Failed to process audio file" }));
            } finally {
                setIsProcessingAudioFile(false);
                if (audioFileInputRef.current) {
                    audioFileInputRef.current.value = "";
                }
            }
        };

        const handleLocationShareRequest = () => {
        if (pendingLocationShare) {
            setPendingLocationShare(null);
            return;
        }
        if (!geohash) {
            toast.error(t("chat.errors.no_location_set", { defaultValue: "No location set in settings" }));
            return;
        }
        try {
            const decoded = decodeGeohash(geohash);
            const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
            const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
            setPendingLocationShare({ lat, lon });
        } catch (error) {
            appLog.error("Failed to decode geohash", error);
            toast.error(t("chat.errors.invalid_location", { defaultValue: "Invalid location format" }));
        }
    };

    const onFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (pendingLocationShare) {
            void onSendLocation(pendingLocationShare.lat, pendingLocationShare.lon);
            setPendingLocationShare(null);
        } else {
            handleSend(event);
        }
    };

    const handleCopy = async (message: UiMessage) => {
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
    };

    useModalClose({
        isOpen: pendingAlbumShare !== null,
        onClose: closePendingAlbumShare,
        escapeKey: !isSharingAlbum,
    });

    useModalClose({
        isOpen: isBlockConfirmOpen,
        onClose: closeBlockConfirm,
        escapeKey: !isBlockingProfile,
    });

    useModalClose({
        isOpen: isDeleteConversationConfirmOpen,
        onClose: closeDeleteConversationConfirm,
        escapeKey: !isDeletingConversation,
    });

    useEffect(() => {
        setIsBlockConfirmOpen(false);
        setIsDeleteConversationConfirmOpen(false);
        setDontAskBlockAgain(false);
    }, [selectedConversation?.data.conversationId]);

        useEffect(() => {
        if (isDesktop) {
            setMobileKeyboardInset(0);
            return;
        }

        // Strict Mobile Platform check to prevent desktop window resizing from generating fake offsets
        const isMobilePlatform = typeof window !== "undefined" && 
            (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
        if (!isMobilePlatform) {
            setMobileKeyboardInset(0);
            return;
        }

        if (typeof window === "undefined" || !window.visualViewport) {
            setMobileKeyboardInset(0);
            return;
        }

        const viewport = window.visualViewport;

        const updateKeyboardInset = () => {
            const layoutHeight = window.innerHeight;
            const visibleBottom = viewport.height + viewport.offsetTop;
            const overlap = Math.max(0, Math.round(layoutHeight - visibleBottom));
            setMobileKeyboardInset(overlap >= 60 ? overlap : 0);
        };

        updateKeyboardInset();
        viewport.addEventListener("resize", updateKeyboardInset);
        viewport.addEventListener("scroll", updateKeyboardInset);

        return () => {
            viewport.removeEventListener("resize", updateKeyboardInset);
            viewport.removeEventListener("scroll", updateKeyboardInset);
        };
    }, [isDesktop]);

    const handlePendingAlbumShareBackdropClose = createBackdropCloseHandler(
        closePendingAlbumShare,
    );
            const renderThread = selectedConversation ? (
            <div
                className={`flex h-full flex-col ${!isDesktop ? "overflow-hidden p-0" : "overflow-hidden p-3 sm:p-4"} bg-transparent`}
                style={
                    !isDesktop
                        ? {
                            height: "100%",
                        }
                        : undefined
                }
            >
            {/* Global Liquid Glass Blur override for all Drawer/Sheet overlays */}
            <style>{`
                .bg-black\\/50, .bg-black\\/45 {
                    backdrop-filter: blur(20px) !important;
                    -webkit-backdrop-filter: blur(20px) !important;
                    background-color: rgba(10, 12, 16, 0.55) !important;
                }
            `}</style>
            {(() => {
                const otherParticipant = getOtherParticipant(
                    selectedConversation,
                    userId,
                );
                const otherParticipantOnlineMeta = getParticipantOnlineMeta(
                    otherParticipant?.lastOnline,
                    otherParticipant?.onlineUntil,
                    nowTimestamp,
                    t,
                );
                const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
                const distanceLabel = otherParticipant?.distanceMetres
                    ? formatDistance(otherParticipant.distanceMetres, t, unitsPreset)
                    : null;
                const displayName =
                    localNickname || selectedConversation.data.name || t("chat.conversation");

                const requestBlockProfile = () => {
                    if (!otherParticipant || isBlockingProfile || !onBlockProfile) {
                        return;
                    }

                    setIsHeaderActionsMenuOpen(false);
                    if (skipBlockConfirm) {
                        void onBlockProfile(otherParticipant.profileId);
                        return;
                    }

                    setDontAskBlockAgain(false);
                    setIsBlockConfirmOpen(true);
                };

                const confirmBlockProfile = () => {
                    if (!otherParticipant || isBlockingProfile || !onBlockProfile) {
                        return;
                    }

                    if (dontAskBlockAgain && typeof window !== "undefined") {
                        localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
                        setSkipBlockConfirm(true);
                    }

                    setIsBlockConfirmOpen(false);
                    void onBlockProfile(otherParticipant.profileId);
                };

                const requestDeleteConversation = () => {
                    if (!onDeleteConversation || isDeletingConversation) {
                        return;
                    }
                    setIsHeaderActionsMenuOpen(false);
					
                    if (skipDeleteConfirm) {
                        void onDeleteConversation(selectedConversation.data.conversationId);
                        return;
                    }
					
                    setDontAskDeleteAgain(false);
                    setIsDeleteConversationConfirmOpen(true);
                };

                const confirmDeleteConversation = () => {
                    if (!onDeleteConversation || isDeletingConversation) {
                        return;
                    }
					
                    if (dontAskDeleteAgain && typeof window !== "undefined") {
                        localStorage.setItem("chat_skip_delete_confirm", "true");
                        setSkipDeleteConfirm(true);
                    }
					
                    setIsDeleteConversationConfirmOpen(false);
                    void onDeleteConversation(selectedConversation.data.conversationId);
                };

                            return (
                            <>
                            <div
                                className={`mb-3 flex items-center justify-between gap-3 pb-3 z-20 ${!isDesktop ? "fixed inset-x-0 top-0 py-3 px-[var(--app-px)] bg-zinc-950/70 dark:bg-black/75 backdrop-blur-3xl border-b border-white/5" : "sticky top-0 pt-3 bg-transparent border-none shadow-none"}`}
                                style={
                                    !isDesktop
                                        ? {
                                            top: 0,
                                            paddingTop:
                                                "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))",
                                        }
                                        : undefined
                                }
                            >
                            <div
                                className={`min-w-0 flex items-center gap-3 ${!isDesktop ? "pl-0" : ""}`}
                            >
                                {!isDesktop && (
                                    <button
                                        type="button"
                                        onClick={() => navigate("/chat")}
                                        className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
                                        aria-label={t("browse_location.back_aria")}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="relative shrink-0 h-10 w-10">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!otherParticipant) return;
                                            const returnTo = getProfileReturnToChatPath(otherParticipant.profileId);
                                            const nextParams = new URLSearchParams();
                                            nextParams.set("returnTo", returnTo);
                                            navigate(`/profile/${otherParticipant.profileId}?${nextParams.toString()}`, { state: { returnTo } });
                                        }}
                                        disabled={!otherParticipant}
                                        aria-label="Open profile"
                                        title={otherParticipantOnlineMeta.label}
                                        className="h-full w-full overflow-hidden rounded-full border bg-[var(--surface-2)] transition disabled:cursor-default disabled:opacity-80 flex items-center justify-center border-white/10 hover:border-[var(--accent)]"
                                    >
                                        {getParticipantAvatarUrl(otherParticipant?.primaryMediaHash) ? (
                                            <img
                                                src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash) || undefined}
                                                alt={displayName}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <User className="h-5 w-5 text-[var(--text-muted)] opacity-70" />
                                        )}
                                    </button>
                                    
                                    {/* Glowing Pulsing Liquid Glass Green Dot (Online Status) - Outside overflow-hidden so it's not clipped */}
                                    {isOtherParticipantOnline && (
                                        <span className="absolute bottom-0 right-0 flex h-3 w-3 z-20">
                                            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 opacity-75" />
                                            <span className="relative inline-block rounded-full h-3 w-3 bg-emerald-500 border-2 border-[#101216] dark:border-[#101216] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <p className="truncate text-lg font-semibold">
                                            {displayName}
                                        </p>
                                        {otherParticipant?.profileId &&
                                        presenceResults[otherParticipant.profileId] ? (
                                            <img
                                                src={freegrindLogo}
                                                alt="Free Grind user"
                                                title="Uses Free Grind"
                                                className="shrink-0 h-5 w-5 rounded-full border border-[var(--border)]"
                                            />
                                        ) : null}
                                    </div>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        {distanceLabel
                                            ? `${otherParticipantOnlineMeta.label} · ${distanceLabel}`
                                            : otherParticipantOnlineMeta.label}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                            {/* --- CONDITIONAL RENDER: HIDE HEADER ACTIONS DURING MULTI-SELECT --- */}
                            {!isActive && (
                                <>
                                    {isDesktop && (
                                        <>
                                            {showGhostButton && selectedConversation && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newState = toggleChatGhost(selectedConversation.data.conversationId);
                                                        
                                                        // SHOUT THE MAGIC EVENT TO TRIGGER INSTANT REDRAWS EVERYWHERE
                                                        window.dispatchEvent(new Event("fg-ghost-update"));

                                                        // If turning Ghost Mode OFF, instantly mark the last message as read!
                                                        if (!newState) {
                                                            const lastMsg = threadMessages[threadMessages.length - 1];
                                                            if (lastMsg) {
                                                                apiFunctions.markRead(selectedConversation.data.conversationId, lastMsg.messageId).catch(() => {});
                                                                loadThread({ conversationId: selectedConversation.data.conversationId, older: false });
                                                            }
                                                        }
                                                        toast.success(newState ? "Ghost Mode ON for this chat." : "Ghost Mode OFF. They will see read receipts.");
                                                    }}
                                                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                                        isGhosted
                                                            ? "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                                            : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110"
                                                    }`}
                                                    title={isGhosted ? "Ghost Mode ON (Hidden)" : "Ghost Mode OFF (Visible)"}
                                                >
                                                    {isGhosted ? <EyeOff className="mr-1 inline h-3.5 w-3.5" /> : <Eye className="mr-1 inline h-3.5 w-3.5" />}
                                                    {isGhosted ? "Ghosting" : "Reading"}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!otherParticipant || !onToggleFavorite) return;
                                                    void onToggleFavorite(otherParticipant.profileId, isFavorite);
                                                }}
                                                disabled={isTogglingFavorite || !otherParticipant || !onToggleFavorite}
                                                className={`rounded-xl border px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${
                                                    isFavorite
                                                        ? "border-pink-500/40 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
                                                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                                                }`}
                                            >
                                                {isTogglingFavorite ? (
                                                    <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Heart className={`mr-1 inline h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
                                                )}
                                                {isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isUpdatingConversationState}
                                                onClick={togglePin}
                                                className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                                            >
                                                <Pin className="mr-1 inline h-3.5 w-3.5" />
                                                {selectedConversation.data.pinned ? t("chat.unpin") : t("chat.pin")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={requestBlockProfile}
                                                disabled={isBlockingProfile || !otherParticipant || !onBlockProfile}
                                                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                                            >
                                                {isBlockingProfile ? (
                                                    <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Ban className="mr-1 inline h-3.5 w-3.5" />
                                                )}
                                                {isBlockingProfile
                                                    ? t("profile_details.block_in_progress")
                                                    : t("profile_details.block")}
                                            </button>
                                        </>
                                    )}

                                    <div
                                        ref={headerActionsMenuRef}
                                        className={`relative ${!isDesktop ? "pr-0" : ""}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsHeaderActionsMenuOpen((current) => !current)
                                            }
                                            className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                            aria-label="Open conversation actions"
                                            aria-expanded={isHeaderActionsMenuOpen}
                                        >
                                            <Ellipsis className="h-4 w-4" />
                                        </button>
                                        {isHeaderActionsMenuOpen ? (
                                            <div className="absolute right-0 top-full z-30 mt-2 flex min-w-[210px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        if (!otherParticipant) return;
                                                        const returnTo = getProfileReturnToChatPath(otherParticipant.profileId);
                                                        const nextParams = new URLSearchParams();
                                                        nextParams.set("returnTo", returnTo);
                                                        navigate(`/profile/${otherParticipant.profileId}?${nextParams.toString()}`, { state: { returnTo } });
                                                    }}
                                                    disabled={!otherParticipant}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                                                >
                                                    <User className="mr-2 h-4 w-4 opacity-70" />
                                                    {t("chat.view_profile")}
                                                </button>

                                                {!isDesktop && showGhostButton && selectedConversation && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsHeaderActionsMenuOpen(false);
                                                            const newState = toggleChatGhost(selectedConversation.data.conversationId);
                                                            window.dispatchEvent(new Event("fg-ghost-update"));
                                                            toast.success(newState ? "Ghost Mode ON for this chat." : "Ghost Mode OFF.");
                                                        }}
                                                        className={`flex items-center rounded-lg px-2 py-2 text-left text-sm transition ${
                                                            isGhosted ? "text-[var(--accent)] hover:bg-[var(--accent)]/10" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                                                        }`}
                                                    >
                                                        {isGhosted ? <EyeOff className="mr-2 h-4 w-4 opacity-70" /> : <Eye className="mr-2 h-4 w-4 opacity-70" />}
                                                        {isGhosted ? "Ghosting (Hidden)" : "Reading (Visible)"}
                                                    </button>
                                                )}
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
                                                        const newList = currentList ? `${currentList}, ${displayName}` : displayName;
                                                        window.localStorage.setItem("fg-forbidden-words", newList);
                                                        toast.success(`Added "${displayName}" to Forbidden Keywords!`);
                                                    }}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                                                >
                                                    <Ban className="mr-2 h-4 w-4 opacity-70" />
                                                    Ban Name "{displayName}"
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        if (!otherParticipant) return;
                                                        
                                                        const loadToast = toast.loading("Loading bio...");
                                                        try {
                                                            const profile = await apiFunctions.getProfileDetail(String(otherParticipant.profileId));
                                                            toast.dismiss(loadToast);
                                                            
                                                            const bio = profile.aboutMe || "";
                                                            if (!bio.trim()) {
                                                                toast.error("This user has no bio!");
                                                                return;
                                                            }

                                                            const wordToBan = window.prompt("Trim this bio down to the exact phrase you want to ban:", bio);
                                                            if (wordToBan && wordToBan.trim()) {
                                                                const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
                                                                const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
                                                                window.localStorage.setItem("fg-forbidden-words", newList);
                                                                toast.success(`Added "${wordToBan.trim()}" to Forbidden Keywords!`);
                                                            }
                                                        } catch (e) {
                                                            toast.dismiss(loadToast);
                                                            toast.error("Failed to load bio.");
                                                        }
                                                    }}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                                                >
                                                    <Ban className="mr-2 h-4 w-4 opacity-70" />
                                                    Ban Bio Phrase
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        if (!otherParticipant || !onEditLocalNickname) return;
                                                        void onEditLocalNickname(otherParticipant.profileId, displayName);
                                                    }}
                                                    disabled={!otherParticipant || !onEditLocalNickname}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                                                >
                                                    <PencilLine className="mr-2 h-4 w-4 opacity-70" />
                                                    {localNickname ? t("chat.nicknames.edit") : t("chat.nicknames.set")}
                                                </button>

                                                {!isDesktop && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsHeaderActionsMenuOpen(false);
                                                                if (!otherParticipant || !onToggleFavorite) return;
                                                                void onToggleFavorite(otherParticipant.profileId, isFavorite);
                                                            }}
                                                            disabled={isTogglingFavorite || !otherParticipant || !onToggleFavorite}
                                                            className={`flex items-center rounded-lg px-2 py-2 text-left text-sm transition disabled:opacity-60 ${
                                                                isFavorite ? "text-pink-400 hover:bg-pink-500/10" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                                                            }`}
                                                        >
                                                            {isTogglingFavorite ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Heart className={`mr-2 h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
                                                            )}
                                                            {isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isUpdatingConversationState}
                                                            onClick={() => {
                                                                setIsHeaderActionsMenuOpen(false);
                                                                void togglePin();
                                                            }}
                                                            className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                                                        >
                                                            <Pin className="mr-2 h-4 w-4 opacity-70" />
                                                            {selectedConversation.data.pinned ? t("chat.unpin") : t("chat.pin")}
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    type="button"
                                                    disabled={isUpdatingConversationState}
                                                    onClick={() => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        void toggleMute();
                                                    }}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                                                >
                                                    {selectedConversation.data.muted ? (
                                                        <Volume2 className="mr-2 h-4 w-4 opacity-70" />
                                                    ) : (
                                                        <MessageCircleOff className="mr-2 h-4 w-4 opacity-70" />
                                                    )}
                                                    {selectedConversation.data.muted ? t("chat.unmute") : t("chat.mute")}
                                                </button>

                                                {!isDesktop && (
                                                    <button
                                                        type="button"
                                                        onClick={requestBlockProfile}
                                                        disabled={isBlockingProfile || !otherParticipant || !onBlockProfile}
                                                        className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
                                                    >
                                                        <Ban className="mr-2 h-4 w-4 opacity-70" />
                                                        {isBlockingProfile
                                                            ? t("profile_details.block_in_progress")
                                                            : t("profile_details.block")}
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsHeaderActionsMenuOpen(false);
                                                        void clearLocalHistory();
                                                    }}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4 opacity-70" />
                                                    {t("chat.clear_local_history")}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={requestDeleteConversation}
                                                    disabled={!onDeleteConversation || isDeletingConversation}
                                                    className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
                                                >
                                                    <MessageCircleX className="mr-2 h-4 w-4 opacity-70" />
                                                    {isDeletingConversation
                                                        ? t("chat.delete_conversation_in_progress")
                                                        : t("chat.delete_conversation")}
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </>
                            )}
                            {/* --- END CONDITIONAL RENDER --- */}
                            </div>
                        </div>

                        <ConfirmDialog
                            isOpen={isBlockConfirmOpen}
                            title={t("profile_details.block")}
                            message={t("profile_details.block_confirm")}
                            confirmLabel={t("profile_details.block")}
                            cancelLabel={t("chat.actions.cancel")}
                            onConfirm={confirmBlockProfile}
                            onCancel={closeBlockConfirm}
                            isProcessing={isBlockingProfile}
                            confirmTone="danger"
                            dontAskAgainLabel={t("profile_details.dont_ask_again")}
                            dontAskAgainChecked={dontAskBlockAgain}
                            onDontAskAgainChange={setDontAskBlockAgain}
                        />
                        <ConfirmDialog
                            isOpen={isDeleteConversationConfirmOpen}
                            title={t("chat.delete_conversation")}
                            message={t("chat.delete_conversation_confirm")}
                            confirmLabel={t("chat.delete_conversation")}
                            cancelLabel={t("chat.actions.cancel")}
                            onConfirm={confirmDeleteConversation}
                            onCancel={closeDeleteConversationConfirm}
                            isProcessing={isDeletingConversation}
                            confirmTone="danger"
                            dontAskAgainLabel={t("profile_details.dont_ask_again", { defaultValue: "Don't ask again" })}
                            dontAskAgainChecked={dontAskDeleteAgain}
                            onDontAskAgainChange={setDontAskDeleteAgain}
                        />
                    </>
                );
            })()}

            {isLoadingThread &&
            threadConversationId !== selectedConversation.data.conversationId ? (
                <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat.loading_messages")}
                </div>
            ) : threadError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-[var(--text-muted)]">{threadError}</p>
                    <button
                        type="button"
                        onClick={() =>
                            void loadThread({
                                conversationId: selectedConversation.data.conversationId,
                                older: false,
                            })
                        }
                        className="btn-accent px-4 py-2 text-sm"
                    >
                        {t("chat.retry")}
                    </button>
                </div>
            ) : (
                <>
                    <ChatThreadMessages
                        isDesktop={isDesktop}
                        selectedConversation={selectedConversation}
                        userId={userId}
                        nowTimestamp={nowTimestamp}
                        messagePageKey={messagePageKey}
                        isLoadingOlderMessages={isLoadingOlderMessages}
                        loadThread={loadThread}
                        threadScrollContainerRef={threadScrollContainerRef}
                        handleThreadScroll={handleThreadScroll}
                        threadMessages={threadMessages}
                        threadLastReadTimestamp={threadLastReadTimestamp}
                        messageElementRefs={messageElementRefs}
                        startMessageLongPress={startMessageLongPress}
                        endMessageLongPress={endMessageLongPress}
                        messageLongPressTriggeredRef={messageLongPressTriggeredRef}
                        openFullScreenImage={openFullScreenImage}
                        openAlbumViewerById={openAlbumViewerById}
                        selectedThreadMessageMatches={selectedThreadMessageMatches}
                        activeThreadSearchIndex={activeThreadSearchIndex}
                        openMessageActionId={openMessageActionId}
                        setOpenMessageActionId={setOpenMessageActionId}
                        isMutatingMessageId={isMutatingMessageId}
                        reactionBurstMessageId={reactionBurstMessageId}
                        handleReact={handleReact}
                        handleUnsend={handleUnsend}
                        handleDelete={handleDelete}
                        handleRetry={handleRetry}
                        handleReply={handleReply}
                        handleMessageTap={handleMessageTap}
                        handleStopAlbumShare={handleStopAlbumShare}
                        threadBottomRef={threadBottomRef}
                    />

                        <form
                            onSubmit={onFormSubmit}
                            className={`border-t border-white/5 ${!isDesktop ? "fixed bottom-0 left-0 right-0 z-30 px-[var(--app-px)] py-3 bg-zinc-950/70 dark:bg-black/75 backdrop-blur-3xl" : "mt-3 pt-3 bg-transparent"}`}
                            style={
                                !isDesktop
                                    ? {
                                        bottom: `${mobileKeyboardInset}px`,
                                        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                                    }
                                    : undefined
                            }
                        >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    toggleAlbumPicker();
                                    if (isDrawerOpen) toggleDrawer();
                                    if (pendingLocationShare) handleLocationShareRequest();
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                aria-label={t("chat.share_album_label")}
                                title={t("chat.share_album_label")}
                            >
                                <Share2 className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    attachmentInputRef.current?.click();
                                    if (isDrawerOpen) toggleDrawer();
                                    if (pendingLocationShare) handleLocationShareRequest();
                                }}
                                disabled={isUploadingAttachment}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                                aria-label={t("chat.attach_media")}
                                title={t("chat.attach_media")}
                            >
                                <ImagePlus className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    toggleDrawer();
                                    if (pendingLocationShare) handleLocationShareRequest();
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                aria-label={t("chat.drawer_label")}
                                title={t("chat.drawer_label")}
                            >
                                <SquareStack className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleLocationShareRequest();
                                    if (isDrawerOpen) toggleDrawer();
                                }}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                    pendingLocationShare
                                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                                }`}
                                aria-label={t("chat.share_location_label", { defaultValue: "Share Location" })}
                                title={t("chat.share_location_label", { defaultValue: "Share Location" })}
                            >
                                {pendingLocationShare ? (
                                    <X className="h-4 w-4" />
                                ) : (
                                    <MapPin className="h-4 w-4" />
                                )}
                            </button>

                            <input
                                type="file"
                                ref={attachmentInputRef}
                                onChange={onAttachmentInput}
                                accept="image/*,video/*"
                                className="hidden"
                            />

                        {/* --- QUICK PHRASE PILLS --- */}
                            {savedPhrases.length > 0 && (
                                <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 -mb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {savedPhrases.filter((phrase) => draft.trim() === "" || phrase.toLowerCase().startsWith(draft.trim().toLowerCase())).map((phrase, idx) => {
                                        const isExact = phrase.toLowerCase() === draft.trim().toLowerCase();
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleUsePhrase(phrase)}
                                                className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                                                    isExact
                                                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                                                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                                }`}
                                            >
                                                {phrase}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {/* -------------------------- */}
                            <button
                                type="button"
                                onClick={() => setIsSavedPhrasesOpen((prev) => !prev)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                aria-label={t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
                                title={t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
                            >
                                <BookMarked className="h-4 w-4" />
                            </button>
                        </div>

                        {pendingLocationShare ? (
                            <div className="mb-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                                <div className="p-3">
                                    <p className="text-xs font-medium text-[var(--text)]">
                                        {t("chat.share_location_confirm", { defaultValue: "Share this location?" })}
                                    </p>
                                </div>
                                <div className="h-64 w-full border-t border-[var(--border)]">
                                    <LeafletLocationPicker
                                        selectedLocation={pendingLocationShare}
                                        onPick={(lat, lon) => setPendingLocationShare({ lat, lon })}
                                        onError={(msg) => toast.error(msg)}
                                        className="h-full w-full"
                                        defaultZoom={18}
                                    />
                                </div>
                            </div>
                        ) : null}

                                {pendingAttachmentFile ? (
                                <BottomDrawer
                                    title={t("chat.attachments.ready_to_send", { file: pendingAttachmentFile.name })}
                                    onClose={cancelPendingAttachment}
                                    onConfirm={() => void handleConfirmAttachment()}
                                    confirmLabel={attachmentMaxViews !== 2147483647 ? t("chat.attachments.send_expiring", { defaultValue: "Send Expiring" }) : t("chat.attachments.send_attachment")}
                                    cancelLabel={t("chat.actions.cancel")}
                                    isProcessing={isUploadingAttachment}
                                    isDesktop={isDesktop}
                                    footerLeft={(() => {
                                        const isVideo = pendingAttachmentFile.type.startsWith("video/");
                                        const cycle = isVideo ? [2147483647, 1, 2] as const : [2147483647, 1] as const;
                                        const idx = cycle.indexOf(attachmentMaxViews as typeof cycle[number]);
                                        const next = cycle[(idx === -1 ? 0 : idx + 1) % cycle.length];
                                        const isLimited = attachmentMaxViews !== 2147483647;
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => setAttachmentMaxViews(next)}
                                                className={`inline-flex min-w-[64px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 transition ${
                                                    isLimited
                                                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                                                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                                                }`}
                                            >
                                                <Hourglass className="h-4 w-4" />
                                                {attachmentMaxViews === 2147483647
                                                    ? <span className="text-base font-semibold leading-none">∞</span>
                                                    : <span className="text-sm font-semibold">{attachmentMaxViews}×</span>
                                                }
                                            </button>
                                        );
                                    })()}
                                >
                                    
                                {attachmentPreviewUrl && (
                                    pendingAttachmentFile.type.startsWith("video/") ? (
                                        <div className="px-3 pb-3">
                                            <video src={attachmentPreviewUrl} controls className="w-full object-contain rounded-xl border border-[var(--border)]" style={{ maxHeight: "40dvh" }} />
                                        </div>
                                    ) : (
                                        <div className="px-3 pb-3">
                                            <div className="flex justify-center">
                                                <style>{`
                                                    @keyframes attach-logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
                                                    .attach-logo-shine { animation: attach-logo-shine 2.8s ease-in-out infinite; }
                                                    .attach-crop .ReactCrop__crop-mask { display: none !important; } .attach-crop .ReactCrop__crop-selection { background-image: none !important; animation: none !important; outline: none !important; border: 3px solid rgba(255,255,255,0.6) !important; border-radius: 11px !important; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5) !important; }
                                                    .attach-crop .ord-n, .attach-crop .ord-s, .attach-crop .ord-e, .attach-crop .ord-w { display: none !important; }
                                                    .attach-crop .ReactCrop__drag-handle { background: transparent !important; border: none !important; width: 15px !important; height: 15px !important; }
                                                    .attach-crop .ord-nw { transform: translate(4px, 4px) !important; border-top: 2px solid white !important; border-left: 2px solid white !important; border-top-left-radius: 4px !important; }
                                                    .attach-crop .ord-ne { transform: translate(-4px, 4px) !important; border-top: 2px solid white !important; border-right: 2px solid white !important; border-top-right-radius: 4px !important; }
                                                    .attach-crop .ord-sw { transform: translate(4px, -4px) !important; border-bottom: 2px solid white !important; border-left: 2px solid white !important; border-bottom-left-radius: 4px !important; }
                                                    .attach-crop .ord-se { transform: translate(-4px, -4px) !important; border-bottom: 2px solid white !important; border-right: 2px solid white !important; border-bottom-right-radius: 4px !important; }
                                                `}</style>
                                                <div className="relative rounded-xl border border-[var(--border)] overflow-hidden">
                                                <ReactCrop
                                                    crop={attachmentCrop}
                                                    onChange={(c) => { setIsDraggingAttachmentCrop(true); setAttachmentCrop(c); }}
                                                    onComplete={(c) => { setIsDraggingAttachmentCrop(false); setAttachmentCompletedCrop(c); }}
                                                    ruleOfThirds={isDraggingAttachmentCrop}
                                                    minWidth={150}
                                                    minHeight={150}
                                                    className="attach-crop ReactCrop--no-animate"
                                                    style={{ maxHeight: "45dvh", display: "block" }}
                                                >
                                                    <img ref={attachmentImgRef} src={attachmentPreviewUrl} alt="Preview" className="block" style={{ maxHeight: "45dvh" }} />
                                                </ReactCrop>
                                                {attachmentTakenOnGrindr && attachmentCrop && (
                                                    <div
                                                        className="absolute inline-flex items-center gap-1.5 pointer-events-none"
                                                        style={{
                                                            left: `calc(${attachmentCrop.unit === "%" ? attachmentCrop.x + "%" : attachmentCrop.x + "px"} + 10px)`,
                                                            top: `calc(${attachmentCrop.unit === "%" ? (attachmentCrop.y + attachmentCrop.height) + "%" : (attachmentCrop.y + attachmentCrop.height) + "px"} - 10px)`,
                                                            transform: "translateY(-100%)",
                                                        }}
                                                    >
                                                        <img src={freegrindLogo} alt="" className="h-5 w-5 rounded-full attach-logo-shine" />
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                                                            <span>{t("chat.time.just_now", { defaultValue: "just now" })}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-center gap-8">
                                                <button type="button" onClick={() => void applyAttachmentTransform("flipH")} className="text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Flip horizontal">
                                                    <SquareCenterlineDashedHorizontal className="h-6 w-6" />
                                                </button>
                                                <button type="button" onClick={() => void applyAttachmentTransform("rotateCw")} className="text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Rotate clockwise">
                                                    <RotateCw className="h-6 w-6" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                )}
                                <div className="px-3 pb-3 grid gap-3">
                                    <ToggleRow
                                        checked={attachmentLooping}
                                        onChange={setAttachmentLooping}
                                        label={t("chat.attachments.looping")}
                                    />
                                    <ToggleRow
                                        checked={attachmentTakenOnGrindr}
                                        onChange={setAttachmentTakenOnGrindr}
                                        label={t("chat.attachments.taken_on_grindr")}
                                        description={t("chat.attachments.taken_on_grindr_description")}
                                    />
                                </div>
                            </BottomDrawer>
                        ) : null}

                        {isAlbumPickerOpen ? (
                            <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
                                {isLoadingAlbums ? (
                                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("chat.loading_albums")}
                                    </div>
                                ) : shareableAlbums.length === 0 ? (
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {t("chat.no_albums_available")}
                                    </p>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {shareableAlbums.map((album) => (
                                            <div
                                                key={album.albumId}
                                                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
                                            >
                                                <p className="truncate text-xs font-medium">
                                                    {album.albumName || t("chat.album_fallback", { id: album.albumId })}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void shareAlbumToCurrentConversation(
                                                            album.albumId,
                                                            album.albumName,
                                                        )
                                                    }
                                                    disabled={!album.isShareable || isSharingAlbum}
                                                    className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] disabled:opacity-50"
                                                >
                                                    {t("chat.share")}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {isUploadingAttachment || uploadProgress > 0 ? (
                            <div className="mb-2">
                                <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
                                    <span>{t("chat.attachments.uploading")}</span>
                                    <span>{Math.round(uploadProgress)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--surface-2)]">
                                    <div
                                        className="h-2 rounded-full bg-[var(--accent)] transition-all"
                                        style={{ width: `${Math.min(100, uploadProgress)}%` }}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {replyTargetMessage ? (
                            <div className="mb-2 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--surface-2)_82%,var(--accent)_8%)] shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                                <div className="flex items-stretch">
                                    <div className="w-1 shrink-0 bg-[var(--accent)]" aria-hidden="true" />
                                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                                                <Reply className="h-3 w-3" />
                                                <span>
                                                    {`${t("chat.actions.reply", { defaultValue: "Reply" })} · ${
                                                        userId != null && Number(replyTargetMessage.senderId) === Number(userId)
                                                            ? t("chat.you")
                                                            : (selectedConversation.data.name?.trim() || t("chat.unknown"))
                                                    }`}
                                                </span>
                                            </p>
                                            <div className="rounded-lg border border-[var(--border)]/80 bg-[var(--surface)]/85 px-2 py-1.5">
                                                <p className="max-h-10 overflow-hidden text-xs leading-5 text-[var(--text)]">
                                                    {getMessagePreviewLabel(replyTargetMessage, t)}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearReplyTarget}
                                            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                            aria-label={t("chat.actions.cancel")}
                                            title={t("chat.actions.cancel")}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                            <div className="group/input relative flex items-end gap-3 pt-2">
                            {/* --- EMOJI PICKER LIQUID GLASS POPUP --- */}
                            {isEmojiPickerOpen && (
                                <div 
                                    className="absolute bottom-[calc(100%+10px)] left-0 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] overflow-hidden">
                                        {/* @ts-ignore - Supress missing types for external library */}
                                        <Picker 
                                            data={data} 
                                            onEmojiSelect={(emoji: any) => setDraft(draft + emoji.native)}
                                            theme="dark"
                                            set="native"
                                            previewPosition="none"
                                            skinTonePosition="none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* --- TENOR GIF PICKER LIQUID GLASS POPUP --- */}
                            {isGifPickerOpen && (
                                <div 
                                    className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[320px] max-w-[90vw] animate-in slide-in-from-bottom-5 fade-in duration-300"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex flex-col h-[400px] rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] overflow-hidden">
                                        
                                        {/* Header / Tabs */}
                                        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/10">
                                                    <p className="text-sm font-bold text-white tracking-wide">GIPHY</p>
                                                    <div className="flex gap-2">
                                                <button type="button" onClick={() => setActiveGifTab("trending")} className={`text-xs font-bold transition ${activeGifTab === "trending" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"}`}>Trending</button>
                                                <button type="button" onClick={() => setActiveGifTab("history")} className={`text-xs font-bold transition flex items-center gap-1 ${activeGifTab === "history" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"}`}><Clock className="h-3 w-3"/> History</button>
                                            </div>
                                        </div>

                                        {/* Search Bar */}
                                        {activeGifTab === "trending" && (
                                            <div className="px-3 pt-3 pb-1">
                                                <div className="relative flex items-center bg-black/30 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[var(--accent)] transition-colors">
                                                    <SearchIcon className="h-4 w-4 text-[var(--text-muted)]" />
                                                    <input 
                                                        type="text" 
                                                        placeholder="Search GIFs..." 
                                                        value={gifSearchQuery}
                                                        onChange={e => setGifSearchQuery(e.target.value)}
                                                        className="ml-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--text-muted)]"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                            {/* Grid */}
                                            <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                {!giphyKey || gifError === "Invalid API Key (401 Unauthorized)" ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                                        <p className="text-sm font-bold text-red-400 mb-2">API Key Required</p>
                                                        <p className="text-[10px] text-[var(--text-muted)] mb-4 leading-relaxed">
                                                            Please paste your personal Giphy API key below. You can generate one for free at <span className="text-[var(--accent)]">developers.giphy.com</span>
                                                        </p>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Paste Giphy API Key & hit Enter..." 
                                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--accent)] transition-colors"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    const val = e.currentTarget.value.trim();
                                                                    window.localStorage.setItem("fg-giphy-key", val);
                                                                    setGiphyKey(val);
                                                                    setGifError(null);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                ) : isGifLoading ? (
                                                    <div className="h-full flex items-center justify-center">
                                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                                                    </div>
                                            ) : activeGifTab === "history" && gifHistory.length === 0 ? (
                                                <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-60">
                                                    <Clock className="h-8 w-8 mb-2" />
                                                    <p className="text-xs font-medium">No recent GIFs</p>
                                                </div>
                                            ) : (
                                            <div className="columns-2 gap-2 space-y-2">
                                                {(activeGifTab === "history" ? gifHistory : gifResults).map((gif, idx) => {
                                                    // Fallback structure for safety
                                                    const previewUrl = gif?.images?.fixed_height?.url || gif?.images?.original?.url;
                                                    if (!previewUrl) return null;
                                                    return (
                                                        <img 
                                                            key={idx}
                                                            src={previewUrl} 
                                                            alt="GIF" 
                                                            onClick={() => void handleSendGif(gif)}
                                                            className="w-full rounded-lg cursor-pointer hover:opacity-80 transition active:scale-95 break-inside-avoid shadow-sm"
                                                        />
                                                    );
                                                })}
                                            </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- INPUT OR AUDIO RECORDER --- */}
                            {pendingAudioBlob ? (
                                <div className="relative flex-1 min-w-0 flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-black/40 backdrop-blur-xl pl-4 pr-2 py-1.5 min-h-[50px] shadow-inner animate-in fade-in zoom-in-95 duration-300">
                                    <div className="flex-1 min-w-0 flex items-center">
                                        <AudioPreviewPlayer blob={pendingAudioBlob} durationMs={pendingAudioDuration} recordedBars={recordedWaveform} recordedFraction={Math.min(1, pendingAudioDuration / 60_000)} />
                                    </div>
                                    <button type="button" onClick={() => { setRecordedWaveform([]); cancelAudio(); }} className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition shadow-sm"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ) : isRecording ? (
                                <div className={`relative flex-1 flex items-center gap-3 rounded-full border transition-colors ${recordingMs >= 50_000 ? "border-red-500/50 bg-red-500/10" : "border-[var(--accent)]/50 bg-black/30 backdrop-blur-lg"} pl-2 pr-4 py-2 h-[50px] shadow-inner`}>
                                    <button type="button" onClick={cancelRecording} className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:scale-105 active:scale-95 transition">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    <span className={`text-sm font-bold tabular-nums shrink-0 ${recordingMs >= 50_000 ? "text-red-500 animate-pulse" : "text-[var(--accent)]"}`}>
                                        {`${Math.floor(Math.floor(recordingMs / 1000) / 60)}:${(Math.floor(recordingMs / 1000) % 60).toString().padStart(2, "0")}`}
                                    </span>
                                    <div className="flex-1" />
                                    {isDesktop ? (
                                        <button type="button" onClick={() => stopRecording()} className="shrink-0 text-red-500 hover:text-red-400 transition"><Square className="h-5 w-5 fill-current" /></button>
                                    ) : (
                                        showRecordCircle && <span className="text-[11px] font-medium text-[var(--text-muted)] shrink-0 select-none animate-pulse">Slide left to cancel</span>
                                    )}
                                </div>
                            ) : (
                                <div className={`relative flex-1 flex items-end`}>
                                    <textarea
                                        ref={textareaRef}
                                        value={draft}
                                        onChange={(event) => setDraft(event.target.value)}
                                        rows={1}
                                        maxLength={1000}
                                        placeholder={t("chat.write_message")}
                                        disabled={!!pendingLocationShare}
                                        className="w-full min-h-[50px] max-h-[120px] bg-white/5 border border-white/10 shadow-inner rounded-3xl pl-5 pr-[80px] py-3.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/50 focus:bg-white/10 transition-all ease-out duration-300 resize-none disabled:opacity-60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                    />
                                    <div className="absolute right-4 bottom-[13px] flex items-center gap-3 z-10 opacity-0 group-hover/input:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setIsEmojiPickerOpen(!isEmojiPickerOpen); setIsGifPickerOpen(false); }} className={`shrink-0 inline-flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${isEmojiPickerOpen ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"}`}><Smile className="h-[22px] w-[22px]" strokeWidth={2.5} /></button>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setIsGifPickerOpen(!isGifPickerOpen); setIsEmojiPickerOpen(false); }} className={`shrink-0 inline-flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${isGifPickerOpen ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"}`}><span className="font-black text-[13px] tracking-tight">GIF</span></button>
                                    </div>
                                </div>
                            )}

                            {/* --- ACTION BUTTON (SEND OR MIC) --- */}
                            {pendingAudioBlob ? (
                                <button type="button" onClick={() => { setRecordedWaveform([]); void confirmAudio(); }} disabled={isSendingAudio} className="self-stretch shrink-0 px-6 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center disabled:opacity-50 bg-[var(--accent)] text-[var(--accent-contrast)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]">
                                    {isSendingAudio ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
                                </button>
                            ) : draft.trim().length > 0 || isSending || pendingLocationShare ? (
                                <button type="submit" disabled={isSending || (!pendingLocationShare && draft.trim().length === 0)} className="self-stretch shrink-0 px-6 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out hover:scale-105 hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] active:scale-95 text-sm font-bold flex items-center justify-center disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none" style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast, black)" }}>
                                    {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : t("chat.send")}
                                </button>
                            ) : !isRecording && (
                                <div className="relative flex self-stretch shrink-0">
                                    <button
                                        type="button"
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setIsMicMenuOpen(true);
                                        }}
                                        onPointerDown={(e) => {
                                            if (e.button !== 0 && e.pointerType === "mouse") return; // Only left click or touch
                                            e.preventDefault();
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                            pointerStartPos.current = { x: e.clientX, y: e.clientY };
                                            wasLongPressRef.current = false;
                                            
                                            // Start long press timer
                                            longPressTimerRef.current = setTimeout(() => {
                                                wasLongPressRef.current = true;
                                                setIsMicMenuOpen(true);
                                                longPressTimerRef.current = null;
                                                if (!isDesktop && isCapturingRef.current) {
                                                    cancelRecording();
                                                    setShowRecordCircle(false);
                                                    setRecordDragX(0);
                                                }
                                            }, 450);

                                            if (!isDesktop) {
                                                swipeStartXRef.current = e.clientX; 
                                                isCapturingRef.current = true; 
                                                hasVibratedRef.current = false; 
                                                setRecordDragX(0); 
                                                holdTimerRef.current = setTimeout(() => setShowRecordCircle(true), 150); 
                                                void startRecording();
                                            }
                                        }}
                                        onPointerMove={(e) => {
                                            if (longPressTimerRef.current) {
                                                const dx = Math.abs(e.clientX - pointerStartPos.current.x);
                                                const dy = Math.abs(e.clientY - pointerStartPos.current.y);
                                                if (dx > 10 || dy > 10) {
                                                    clearTimeout(longPressTimerRef.current);
                                                    longPressTimerRef.current = null;
                                                }
                                            }
                                            if (!isDesktop && isCapturingRef.current) {
                                                const dx = e.clientX - swipeStartXRef.current; setRecordDragX(Math.min(0, dx));
                                                if (!hasVibratedRef.current && dx < -CANCEL_THRESHOLD) {
                                                    hasVibratedRef.current = true; isCapturingRef.current = false; e.currentTarget.releasePointerCapture(e.pointerId); if (holdTimerRef.current) clearTimeout(holdTimerRef.current); navigator.vibrate?.(80); setTrashBounce(true); setTimeout(() => { setTrashBounce(false); setRecordDragX(0); setShowRecordCircle(false); cancelRecording(); }, 280);
                                                }
                                            }
                                        }}
                                        onPointerUp={(e) => {
                                            const isLong = wasLongPressRef.current;
                                            if (longPressTimerRef.current) {
                                                clearTimeout(longPressTimerRef.current);
                                                longPressTimerRef.current = null;
                                            }
                                            if (isDesktop) {
                                                if (!isLong) {
                                                    void startRecording();
                                                }
                                            } else {
                                                isCapturingRef.current = false; setRecordDragX(0); if (holdTimerRef.current) clearTimeout(holdTimerRef.current); setShowRecordCircle(false); 
                                                if (!isLong) {
                                                    stopRecording(true);
                                                }
                                            }
                                        }}
                                        onPointerCancel={(e) => {
                                            if (longPressTimerRef.current) {
                                                clearTimeout(longPressTimerRef.current);
                                                longPressTimerRef.current = null;
                                            }
                                            if (!isDesktop) {
                                                isCapturingRef.current = false; setRecordDragX(0); if (holdTimerRef.current) clearTimeout(holdTimerRef.current); setShowRecordCircle(false); cancelRecording();
                                            }
                                        }}
                                        className="relative self-stretch shrink-0 w-[55px] rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center text-[var(--accent-contrast)] bg-[var(--accent)] disabled:opacity-50 select-none touch-none"
                                        style={showRecordCircle ? { transform: `translateX(${recordDragX}px)`, transition: recordDragX === 0 ? "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)" : "none" } : undefined}
                                        disabled={isProcessingAudioFile}
                                    >
                                        {showRecordCircle && <span className="pointer-events-none absolute rounded-full" style={{ inset: "-15px", background: `color-mix(in srgb, var(--accent) ${Math.round((1 - dragProgress) * 100)}%, #ef4444)`, opacity: 0.2 }} />}
                                        {isProcessingAudioFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                    </button>
                                    
                                    {/* Glassmorphism Popup Menu for Audio/Video Upload */}
                                    <div 
                                        className={cn(
                                            "absolute bottom-full right-0 mb-3 w-[220px] origin-bottom-right rounded-2xl border border-white/10 bg-[var(--surface)]/80 backdrop-blur-xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300",
                                            isMicMenuOpen ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                audioFileInputRef.current?.click();
                                            }}
                                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-[var(--text)] transition-colors hover:bg-white/10 active:bg-white/5"
                                        >
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
                                                <FileAudio className="h-4 w-4" />
                                            </div>
                                            <span>{t("chat.upload_audio_video", { defaultValue: "Upload Audio/Video" })}</span>
                                        </button>
                                    </div>
                                    
                                    <input
                                        type="file"
                                        ref={audioFileInputRef}
                                        accept="audio/mp4, audio/aac, audio/mpeg, audio/ogg, audio/wav, audio/webm, video/mp4, video/webm, video/quicktime"
                                        className="hidden"
                                        onChange={handleAudioFileSelect}
                                    />
                                </div>
                            )}
                        </div>
                    </form>

                    {isDrawerOpen ? (
                        <ChatDrawerPanel
                            media={drawerMedia}
                            isLoading={isLoadingDrawer}
                            error={drawerError}
                            isSending={isSendingDrawerMedia}
                            isAdding={isAddingDrawerMedia}
                            deletingMediaId={deletingDrawerMediaId}
                            onBack={toggleDrawer}
                            onLoadMedia={onLoadDrawerMedia}
                            onSendMedia={onSendDrawerMedia}
                            onAddMedia={onAddDrawerMedia}
                            onDeleteMedia={onDeleteDrawerMedia}
                            onShareAlbum={onShareAlbumFromDrawer}
                            onStopAlbumShare={onStopAlbumShareFromDrawer}
                            albums={shareableAlbums}
                            isLoadingAlbums={isLoadingAlbums}
                            albumCoverMap={albumCoverMap}
                            sharedAlbumIds={sharedAlbumIds}
                            isSharingAlbum={isSharingAlbum}
                            isDesktop={isDesktop}
                            noConversation={!selectedConversation}
                        />
                    ) : null}

                    {!isDesktop && selectedActionMessage && albumViewer === null ? (
                        <div
                            className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm no-touch-callout"
                            onClick={() => setOpenMessageActionId(null)}
                        >
                            <div
                                className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-3 shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <p className="px-1 pb-2 text-center text-xs font-medium tracking-wide text-[var(--text-muted)]">
                                    {t("chat.actions.title")}
                                </p>
                                <div className="grid gap-2">
                                    {(() => {
                                        const loc = getMessageLocation(selectedActionMessage);
                                        const body = selectedActionMessage.body as any;
                                        const hasText = body && typeof body.text === "string" && body.text.trim().length > 0;
                                        if (!loc && !hasText) return null;

                                        return (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopy(selectedActionMessage)}
                                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95"
                                                >
                                                    {t("chat.actions.copy", { defaultValue: "Copy" })}
                                                </button>

                                                {hasText && !selectedActionMessageMine ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const body = selectedActionMessage.body as any;
                                                            const wordToBan = window.prompt("Trim this message down to the specific keyword you want to ban:", body?.text || "");
                                                            if (wordToBan && wordToBan.trim()) {
                                                                const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
                                                                const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
                                                                window.localStorage.setItem("fg-forbidden-words", newList);
                                                                toast.success(`Added "${wordToBan.trim()}" to Forbidden Keywords!`);
                                                                setOpenMessageActionId(null);
                                                            }
                                                        }}
                                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95"
                                                    >
                                                        <Ban className="mr-2 h-4 w-4 inline opacity-70" /> Add to Forbidden Keywords
                                                    </button>
                                                ) : null}
                                            </>
                                        );
                                    })()}

                                    {(() => {
                                        const imageUrl = getMessageImageUrl(selectedActionMessage);
                                        const videoUrl = getMessageVideoUrl(selectedActionMessage);
                                        const audioUrl = getMessageAudioUrl(selectedActionMessage);
                                        const mediaUrl = imageUrl || videoUrl || audioUrl;
										
                                        if (!mediaUrl) return null;

                                        return (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    toast.success("Opening media...");
                                                    const a = document.createElement("a");
                                                    a.href = mediaUrl;
                                                    a.target = "_blank";
                                                    a.rel = "noopener noreferrer";
                                                    a.download = `free-grind-media-${Date.now()}`;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                    setOpenMessageActionId(null);
                                                }}
                                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95"
                                            >
                                                Download Media
                                            </button>
                                        );
                                    })()}

                                    <button
                                        type="button"
                                        onClick={() => void handleReply(selectedActionMessage)}
                                        disabled={isMutatingMessageId === selectedActionMessage.messageId}
                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95 disabled:opacity-60"
                                    >
                                        {t("chat.actions.reply", { defaultValue: "Reply" })}
                                    </button>
                                    {selectedActionMessageMine && !selectedActionMessage.unsent ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleUnsend(selectedActionMessage)}
                                            disabled={
                                                isMutatingMessageId === selectedActionMessage.messageId
                                            }
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95 disabled:opacity-60"
                                        >
                                            {t("chat.actions.unsend")}
                                        </button>
                                    ) : null}
                                    {(() => {
                                        const albumId = getMessageAlbumId(selectedActionMessage);
                                        const isViewable = (selectedActionMessage.body as any)?.isViewable;
                                        if (!selectedActionMessageMine || !albumId || !isViewable) return null;
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => void handleStopAlbumShare(albumId)}
                                                disabled={isMutatingMessageId === selectedActionMessage.messageId}
                                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95 disabled:opacity-60"
                                            >
                                                {t("chat.actions.stop_sharing", { defaultValue: "Stop Sharing" })}
                                            </button>
                                        );
                                    })()}
                                    <button
                                        type="button"
                                        onClick={() => void handleDelete(selectedActionMessage)}
                                        disabled={
                                            isMutatingMessageId === selectedActionMessage.messageId
                                        }
                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text)] transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-95 disabled:opacity-60"
                                    >
                                        {t("chat.actions.delete")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOpenMessageActionId(null)}
                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium text-[var(--text-muted)] transition-all duration-300 hover:text-[var(--text)] active:scale-95"
                                    >
                                        {t("chat.actions.cancel")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                            {pendingAlbumShare && albumViewer === null ? (
                            <div
                                className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[20px] no-touch-callout transition-all duration-300 ${
                                    isDesktop ? "pb-32" : ""
                                }`}
                                onClick={isSharingAlbum ? undefined : handlePendingAlbumShareBackdropClose}
                            >
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="chat-album-share-confirm-title"
                                className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-4 shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <p
                                    id="chat-album-share-confirm-title"
                                    className="text-sm font-semibold text-[var(--text)]"
                                >
                                    {t("chat.share_album_label")}
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                                    {t("chat.confirm_share_album", {
                                        album: pendingAlbumShare.albumName,
                                    })}
                                </p>

                                <div className="mt-4">
                                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                        {t("chat.expiration.title")}
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedExpirationType}
                                            onChange={(e) => setSelectedExpirationType(e.target.value)}
                                            className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2.5 pl-10 pr-4 text-sm font-medium text-[var(--text)] transition focus:border-[var(--accent)] focus:outline-none"
                                        >
                                            <option value="INDEFINITE">{t("chat.expiration.indefinite")}</option>
                                            <option value="ONCE">{t("chat.expiration.once")}</option>
                                            <option value="TEN_MINUTES">{t("chat.expiration.ten_minutes")}</option>
                                            <option value="ONE_HOUR">{t("chat.expiration.one_hour")}</option>
                                            <option value="ONE_DAY">{t("chat.expiration.one_day")}</option>
                                        </select>
                                        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                                            {selectedExpirationType === "INDEFINITE" && <Infinity className="h-4 w-4" />}
                                            {selectedExpirationType === "ONCE" && <TimerOff className="h-4 w-4" />}
                                            {(selectedExpirationType === "TEN_MINUTES" || selectedExpirationType === "ONE_HOUR" || selectedExpirationType === "ONE_DAY") && <Hourglass className="h-4 w-4" />}
                                        </div>
                                        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                                            <ChevronDown className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={closePendingAlbumShare}
                                        disabled={isSharingAlbum}
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                                    >
                                        {t("chat.actions.cancel")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void confirmPendingAlbumShare(selectedExpirationType)}
                                        disabled={isSharingAlbum}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
                                    >
                                        {isSharingAlbum ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : null}
                                        <span>{t("chat.share")}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
        {isSavedPhrasesOpen ? (
                            <BottomSheet
                                onClose={() => {
                                    setPhrasesExpanded(false);
                                    setIsSavedPhrasesOpen(false);
                                }}
                                onExpand={() => setPhrasesExpanded(true)}
                                isDesktop={isDesktop}
                                bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
                            >
                                <div className="flex items-center justify-between px-4 pb-3">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-[var(--text)]">
                                            {t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
                                        </p>
                                        {savedPhrases.length > 0 && (
                                            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                                                {savedPhrases.length}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => { setIsSavedPhrasesOpen(false); navigate("/settings/saved-phrases"); }}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                                            aria-label={t("chat.saved_phrases_manage", { defaultValue: "Manage" })}
                                        >
                                            <Settings2 className="h-4 w-4" />
                                        </button>
                                        <SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                                            <X className="h-4 w-4" />
                                        </SheetClose>
                                    </div>
                                </div>
                                <div className="px-3 pb-3">
                                    <div className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1.5">
                                        <input
                                            type="text"
                                            value={newPhraseInput}
                                            onChange={(e) => setNewPhraseInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddPhrase(); } }}
                                            placeholder={t("settings_saved_phrases.new_placeholder", { defaultValue: "Add a new phrase..." })}
                                            className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddPhrase}
                                            disabled={!newPhraseInput.trim()}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-40"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            {t("settings_saved_phrases.add", { defaultValue: "Add" })}
                                        </button>
                                    </div>
                                </div>
                                <div className="border-t border-[var(--border)]" />
                                <div data-lenis-prevent className="overflow-y-auto" style={{ maxHeight: phrasesExpanded ? "72dvh" : "40dvh", transition: "max-height 0.25s ease" }}>
                                    {savedPhrases.length === 0 ? (
                                        <div className="flex flex-col items-center gap-2.5 py-8 text-[var(--text-muted)]">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                                                <BookMarked className="h-5 w-5 opacity-60" />
                                            </div>
                                            <p className="text-sm font-medium">
                                                {t("settings_saved_phrases.empty", { defaultValue: "No saved phrases yet." })}
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            {savedPhrases.map((phrase, originalIndex) => (
                                                <div key={originalIndex} className="group flex items-center px-4">
                                                    <div className="flex flex-1 items-center gap-1 py-3">
                                                        <SheetClose
                                                            onClick={() => handleUsePhrase(phrase)}
                                                            className="min-w-0 flex-1 text-left text-sm text-[var(--text)] transition hover:text-[var(--accent)]"
                                                        >
                                                            {phrase}
                                                        </SheetClose>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeletePhrase(originalIndex)}
                                                            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:text-red-400"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </BottomSheet>
                        ) : null}

                    </>
                )}
            </div>
        ) : (
        <div
            className={`flex h-full overflow-hidden items-center justify-center p-6 text-center text-[var(--text-muted)] ${
                isDesktop ? "surface-card" : ""
            }`}
        >
            {t("chat.select_conversation")}
        </div>
    );

    return renderThread;
}
