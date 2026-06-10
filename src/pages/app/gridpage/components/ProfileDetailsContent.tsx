import {
    ArrowDown,
    ArrowLeftRight,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    ChevronsDown,
    ChevronsUp,
    Compass,
    ExternalLink,
    Flame,
    Globe,
    Hash,
    Heart,
    Loader2,
    Star,
    MapPin,
    MessageCircle,
    MessageSquare,
    type LucideIcon,
    Ruler,
    Scale,
    Search,
    Shield,
    ShieldCheck,
    Syringe,
    Triangle,
    User,
    Zap,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { type RefObject, type UIEvent, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileDetail } from "../../GridPage.types";
import {
    formatDistance,
    formatEnumArray,
    formatEnumValue,
    formatHeightCm,
    formatOptionalNumber,
    formatTimeAgo,
    formatWeightKg,
    shouldHideField,
} from "../utils";
import { getProfileImageUrl, getThumbImageUrl } from "../../../../utils/media";
import { ProfileImage } from "../../../../components/ui/profile-image";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import { TapSelector } from "./TapSelector";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";
import { formatDateTime24 } from "../../chat/chatUtils";
import { formatRelativeTime } from "../../../../utils/relativeTime";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { cn } from "../../../../utils/cn";

type LabelMap = Record<number, string>;

type ProfileDetailsContentProps = {
    activeProfile: ProfileDetail;
    activeProfilePhotoHashes: string[];
    isDesktopLike: boolean;
    showMobileCarousel: boolean;
    mobileCarouselRef: RefObject<HTMLDivElement | null>;
    mobileCarouselPhotoIndex: number;
    onPhotoIndexChange?: (index: number) => void;
    handleMobileCarouselScroll: (event: UIEvent<HTMLDivElement>) => void;
    openPhotoViewer: (index: number) => void;
    photoCreatedAtByHash: Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }>;
    activeProfileName: string;
    estimatedCreatedAt: string;
    profileStatusLabel: string;
    profileStatusLevel?: "online" | "recent" | "offline";
    ownTags?: string[];
    profileDistance: number | null;
    chatContactStatus: ChatContactIndexRecord | null;
    messageProfileId: string | null;
    usesFreegrind: boolean;
    onMessageProfile?: (profileId: string) => void;
    onTapProfile?: (profileId: string, tapId?: number) => void;
    onBlockProfile?: (profileId: string) => void;
    onUnblockProfile?: (profileId: string) => void;
    onToggleFavoriteProfile?: (
        profileId: string,
        currentlyFavorite: boolean,
    ) => void | Promise<void>;
    isFavorite: boolean;
    isTogglingFavorite: boolean;
    isBlocked: boolean;
    isBlockingProfile: boolean;
    isTapDisabled: boolean;
    isTapBlocked: boolean;
    isTapActive: boolean;
    tapId: number;
    tapButtonClassName: string;
    onTriangleProfile?: (profileId: string) => void;
    isTriangleDisabled: boolean;
    triangleButtonClassName: string;
    isLocatingProfile: boolean;
    hasTagsContent: boolean;
    hasAboutContent: boolean;
    hasExpectationsFields: boolean;
    hasHealthFields: boolean;
    hasStatsFields: boolean;
    hasSocialFields: boolean;
    formattedActiveGenders: string;
    formattedActivePronouns: string;
    lookingForLabels: LabelMap;
    meetAtLabels: LabelMap;
    tribeLabels: LabelMap;
    hivStatusLabels: LabelMap;
    sexualHealthLabels: LabelMap;
    vaccineLabels: LabelMap;
    sexualPositionLabels: LabelMap;
    bodyTypeLabels: LabelMap;
    ethnicityLabels: LabelMap;
    relationshipStatusLabels: LabelMap;
};

export function ProfileDetailsContent({
    activeProfile,
    activeProfilePhotoHashes,
    isDesktopLike,
    showMobileCarousel,
    mobileCarouselRef,
    mobileCarouselPhotoIndex,
    handleMobileCarouselScroll,
    openPhotoViewer,
    photoCreatedAtByHash,
    activeProfileName,
    estimatedCreatedAt,
    profileStatusLabel,
    profileStatusLevel,
    ownTags = [],
    profileDistance,
    chatContactStatus,
    messageProfileId,
    usesFreegrind,
    onMessageProfile,
    onTapProfile,
    onBlockProfile,
    onUnblockProfile,
    onToggleFavoriteProfile,
    isFavorite,
    isTogglingFavorite,
    isBlocked,
    isBlockingProfile,
    isTapDisabled,
    isTapBlocked,
    isTapActive,
    tapId,
    tapButtonClassName,
    onTriangleProfile,
    isTriangleDisabled,
    triangleButtonClassName,
    isLocatingProfile,
    hasTagsContent,
    hasAboutContent,
    hasExpectationsFields,
    hasHealthFields,
    hasStatsFields,
    hasSocialFields,
    formattedActiveGenders,
    formattedActivePronouns,
    lookingForLabels,
    meetAtLabels,
    tribeLabels,
    hivStatusLabels,
    sexualHealthLabels,
    vaccineLabels,
    sexualPositionLabels,
    bodyTypeLabels,
    ethnicityLabels,
    relationshipStatusLabels,
}: ProfileDetailsContentProps) {
    const { t } = useTranslation();
    const { unitsPreset } = usePreferences();
    const hasChatHistory = Boolean(chatContactStatus?.hasChatted) || (chatContactStatus?.unreadCount ?? 0) > 0;
    const lastMessageLabel = formatRelativeTime(chatContactStatus?.lastMessageTimestamp ?? null);

    // Desktop Hover State for Chevrons
    const [isHovered, setIsHovered] = useState(false);

    // Tap Burst Emoji Animation
    const [tapBurst, setTapBurst] = useState<{ key: number; emoji: string } | null>(null);
    const handleTapWithBurst = (profileId: string, tapIdArg?: number) => {
        const id = tapIdArg ?? 1;
        const emojis: Record<number, string> = { 0: "👋", 1: "🔥", 2: "😈" };
        setTapBurst({ key: Date.now(), emoji: emojis[id] ?? "🔥" });
        onTapProfile?.(profileId, id);
    };

    const positionIconMap: Record<number, LucideIcon> = {
        1: ArrowUp,        // Top
        2: ArrowDown,      // Bottom
        3: ArrowUpDown,    // Versatile
        4: ChevronsDown,   // Vers Bottom
        5: ChevronsUp,     // Vers Top
        6: ArrowLeftRight, // Side
    };
    const PositionIcon = activeProfile?.sexualPosition != null
        ? (positionIconMap[activeProfile.sexualPosition] ?? Compass)
        : null;

    const renderPhotoCreatedBadge = (hash: string) => {
        const meta = photoCreatedAtByHash[hash] ?? null;
        const timeLabel = meta?.createdAt ? formatDateTime24(meta.createdAt) : null;
        if (!timeLabel && !meta?.takenOnGrindr) return null;
        return (
            <div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
                {meta?.takenOnGrindr ? (
                    <>
                        <img
                            src={freegrindLogo}
                            alt={t("chat.thread.taken_on_grindr")}
                            className="h-3.5 w-3.5 rounded-full"
                        />
                        <span>{t("chat.thread.taken_on_grindr")}</span>
                    </>
                ) : null}
                {timeLabel ? <span>{timeLabel}</span> : null}
            </div>
        );
    };

    const handleBlockAction = () => {
        if (!messageProfileId || isBlockingProfile) return;
        if (isBlocked) onUnblockProfile?.(messageProfileId);
        else onBlockProfile?.(messageProfileId);
    };

    const handleFavoriteAction = () => {
        if (!messageProfileId || !onToggleFavoriteProfile || isTogglingFavorite) return;
        void onToggleFavoriteProfile(messageProfileId, isFavorite);
    };

    const showGlassQuickActions = showMobileCarousel && !isDesktopLike && activeProfilePhotoHashes.length > 0 && Boolean(messageProfileId && onMessageProfile);
    const glassActionButtonClassName = "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-white/18 text-white shadow-[0_10px_30px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:bg-white/24 disabled:opacity-60";

    return (
        <div className="grid gap-6">
            {/* TAP BURST OVERLAY */}
            {tapBurst && (
                <div key={tapBurst.key} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
                    <span className="absolute left-1/2 top-1/2 text-7xl animate-tap-burst -translate-x-1/2 -translate-y-1/2">
                        {tapBurst.emoji}
                    </span>
                </div>
            )}

            <div className="w-full">
                {activeProfilePhotoHashes.length > 0 ? (
                    showMobileCarousel ? (
                        <div className="w-full relative">
                            {/* Highly Responsive Carousel (Edge-to-edge mobile, Rigid compact desktop) */}
                            <div 
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                className={cn(
                                    "select-none touch-pan-y relative w-full",
                                    isDesktopLike 
                                        ? "mx-auto !w-[340px] rounded-2xl border border-white/10 dark:border-white/5 shadow-lg overflow-hidden" 
                                        : "-mx-[var(--app-px)] rounded-none border-0 shadow-none overflow-hidden"
                                )}
                            >
                                <div
                                    ref={mobileCarouselRef}
                                    onScroll={handleMobileCarouselScroll}
                                    className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                >
                                    {activeProfilePhotoHashes.map((hash, index) => (
                                        <div
                                            key={hash}
                                            className="relative aspect-[3/4] w-full shrink-0 snap-center snap-always overflow-hidden bg-[var(--surface-2)]"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openPhotoViewer(index)}
                                                className="absolute inset-0 z-10"
                                                aria-label={t("profile_details.open_photo", { index: index + 1 })}
                                            />
                                            <img
                                                src={getProfileImageUrl(hash, "1024x1024")}
                                                alt={t("profile_details.photo_alt", { name: activeProfileName })}
                                                className="h-full w-full object-cover"
                                            />
                                            {renderPhotoCreatedBadge(hash)}
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Floating Chevrons */}
                                {activeProfilePhotoHashes.length > 1 && isDesktopLike && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (mobileCarouselRef.current) mobileCarouselRef.current.scrollBy({ left: -mobileCarouselRef.current.clientWidth, behavior: "smooth" });
                                            }}
                                            className={cn(
                                                "absolute left-2.5 top-1/2 -translate-y-1/2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition-all duration-300 active:scale-95",
                                                isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                                            )}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (mobileCarouselRef.current) mobileCarouselRef.current.scrollBy({ left: mobileCarouselRef.current.clientWidth, behavior: "smooth" });
                                            }}
                                            className={cn(
                                                "absolute right-2.5 top-1/2 -translate-y-1/2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition-all duration-300 active:scale-95",
                                                isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                                            )}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </>
                                )}

                                {/* Mobile Glass Quick Actions */}
                                {showGlassQuickActions && messageProfileId ? (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20">
                                        <div className="pointer-events-auto flex items-center justify-center gap-3 px-3">
                                            <button
                                                type="button"
                                                onClick={() => onMessageProfile?.(messageProfileId)}
                                                className={glassActionButtonClassName}
                                                aria-label={t("profile_details.message")}
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </button>
                                            <TapSelector
                                                profileId={messageProfileId}
                                                onTapProfile={handleTapWithBurst}
                                                isTapDisabled={isTapDisabled}
                                                isTapBlocked={isTapBlocked}
                                                isTapActive={isTapActive}
                                                tapId={tapId}
                                                tapButtonClassName={tapButtonClassName}
                                            />
                                            {onToggleFavoriteProfile ? (
                                                <button
                                                    type="button"
                                                    onClick={handleFavoriteAction}
                                                    disabled={isTogglingFavorite}
                                                    className={glassActionButtonClassName}
                                                    aria-label={isFavorite ? t("profile_details.unfavorite") : t("browse_filters.options.favorites")}
                                                >
                                                    {isTogglingFavorite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />}
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => { if (messageProfileId && onTriangleProfile) onTriangleProfile(messageProfileId); }}
                                                disabled={isTriangleDisabled || isLocatingProfile}
                                                className={glassActionButtonClassName}
                                                title={isLocatingProfile ? "Locating..." : "Locate"}
                                            >
                                                {isLocatingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Triangle className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Dots Indicator */}
                            {activeProfilePhotoHashes.length > 1 ? (
                                <div className="mt-3 flex items-center justify-center gap-1.5">
                                    {activeProfilePhotoHashes.map((hash, index) => (
                                        <span
                                            key={`${hash}-dot`}
                                            className={`h-1.5 rounded-full transition-all ${index === mobileCarouselPhotoIndex ? "w-3 bg-[var(--text)]" : "w-1.5 bg-[var(--border)]"}`}
                                            aria-hidden="true"
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            {activeProfilePhotoHashes.map((hash, index) => (
                                <button
                                    type="button"
                                    key={hash}
                                    onClick={() => openPhotoViewer(index)}
                                    className="overflow-hidden rounded-xl border border-[var(--border)]"
                                >
                                    <div className="relative">
                                        <img src={getThumbImageUrl(hash, "320x320")} className="aspect-square w-full object-cover" />
                                        {renderPhotoCreatedBadge(hash)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] aspect-square flex items-center justify-center">
                        <ProfileImage alt={t("profile_details.default_profile")} />
                    </div>
                )}
            </div>

            {/* PROFILE HEADER & STANDARD ACTIONS */}
            <div className="px-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                            {activeProfileName}
                            {activeProfile.age && Number.isFinite(activeProfile.age) && (
                                <span className="ml-2 text-xl font-normal text-[var(--text-muted)] sm:text-2xl">
                                    {activeProfile.age}
                                </span>
                            )}
                        </h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                            {profileStatusLabel && (
                                <span className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full ${profileStatusLevel === "online" ? "bg-emerald-400" : "bg-[var(--text-muted)]/40"}`} />
                                    {profileStatusLabel}
                                </span>
                            )}
                            {profileDistance !== undefined && profileDistance !== null && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {formatDistance(profileDistance, t, unitsPreset)}
                                </span>
                            )}
                        </div>
                    </div>
                    {usesFreegrind && (
                        <img
                            src={freegrindLogo}
                            alt="Free Grind user"
                            title={t("profile_details.uses_free_grind")}
                            className="mt-1 h-6 w-6 shrink-0 rounded-full border border-[var(--border)]"
                        />
                    )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {activeProfile.profileId}
                    </span>
                    <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        ~{estimatedCreatedAt}
                    </span>
                    {hasChatHistory && (
                        <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {lastMessageLabel ? t("profile_details.last_message", { time: lastMessageLabel }) : t("profile_details.chatted_before")}
                            {(chatContactStatus?.unreadCount ?? 0) > 0 ? ` · ${chatContactStatus?.unreadCount ?? 0} ${t("chat.unread")}` : ""}
                        </span>
                    )}
                </div>

                {/* Regular Desktop / Non-Glass Actions */}
                {messageProfileId && onMessageProfile ? (
                    <div className="mt-3 grid gap-2">
                        {!showGlassQuickActions && (
                            <>
                                <div className="flex items-center justify-center gap-4 py-1">
                                    <button
                                        type="button"
                                        onClick={() => onMessageProfile(messageProfileId)}
                                        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] shadow transition hover:bg-[var(--surface)]"
                                    >
                                        <MessageCircle className="h-5 w-5" />
                                    </button>
                                    <TapSelector
                                        profileId={messageProfileId}
                                        onTapProfile={handleTapWithBurst}
                                        isTapDisabled={isTapDisabled}
                                        isTapBlocked={isTapBlocked}
                                        isTapActive={isTapActive}
                                        tapId={tapId}
                                        tapButtonClassName={tapButtonClassName}
                                    />
                                    {onToggleFavoriteProfile ? (
                                        <button
                                            type="button"
                                            onClick={handleFavoriteAction}
                                            disabled={isTogglingFavorite}
                                            className={`inline-flex h-12 w-12 items-center justify-center rounded-full border shadow transition disabled:opacity-70 ${
                                                isFavorite ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]"
                                            }`}
                                        >
                                            {isTogglingFavorite ? <Loader2 className="h-5 w-5 animate-spin" /> : <Star className={`h-5 w-5 ${isFavorite ? "fill-[var(--accent)]" : ""}`} />}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => { if (messageProfileId && onTriangleProfile) onTriangleProfile(messageProfileId); }}
                                        disabled={isTriangleDisabled}
                                        className={`inline-flex h-12 w-12 items-center justify-center rounded-full border shadow transition ${isTriangleDisabled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] opacity-50" : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]"}`}
                                    >
                                        <Triangle className="h-5 w-5" />
                                    </button>
                                </div>
                                {(onBlockProfile || onUnblockProfile) ? (
                                    <button
                                        type="button"
                                        onClick={handleBlockAction}
                                        className={`relative z-20 inline-flex h-8 w-full items-center justify-center rounded-lg border px-3 text-xs font-medium transition disabled:opacity-70 ${
                                            isBlocked ? "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]" : "border-red-500/25 bg-transparent text-red-400/70 hover:border-red-400/50 hover:text-red-400"
                                        }`}
                                    >
                                        {isBlockingProfile ? (isBlocked ? t("profile_details.unblock_in_progress") : t("profile_details.block_in_progress")) : (isBlocked ? t("profile_details.unblock") : t("profile_details.block"))}
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/* PROFILE INFO GRID (Expectations, Health, Stats, Social) */}
            <div className="grid gap-8 px-3 lg:grid-cols-[1.25fr_1fr]">
                <div className="grid gap-8">
                    {hasTagsContent && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.tags")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {activeProfile.profileTags.map((tag) => {
                                    const isMatch = ownTags.some((own) => own.toLowerCase() === tag.toLowerCase());
                                    return (
                                        <span key={tag} className={`rounded-full border px-3 py-1.5 text-sm ${isMatch ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold" : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"}`}>
                                            {tag}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {hasAboutContent && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.about")}
                            </p>
                            <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3">
                                <p className="text-base leading-relaxed text-[var(--text)]">
                                    {activeProfile.aboutMe?.trim()}
                                </p>
                            </div>
                        </div>
                    )}

                    {hasExpectationsFields && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.expectations")}
                            </p>
                            <div className="space-y-2.5">
                                {!shouldHideField(formatEnumArray(activeProfile.lookingFor, lookingForLabels)) && (
                                    <div className="flex items-start gap-2.5">
                                        <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.looking_for")}:</span> <span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.lookingFor, lookingForLabels, t)}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumArray(activeProfile.meetAt, meetAtLabels, t)) && (
                                    <div className="flex items-start gap-2.5">
                                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.meet_at")}:</span> <span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.meetAt, meetAtLabels, t)}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumArray(activeProfile.grindrTribes, tribeLabels, t)) && (
                                    <div className="flex items-start gap-2.5">
                                        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.tribes")}:</span> <span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.grindrTribes, tribeLabels, t)}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formattedActiveGenders) && (
                                    <div className="flex items-start gap-2.5">
                                        <User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.genders")}:</span> <span className="text-[var(--text-muted)]">{formattedActiveGenders}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formattedActivePronouns) && (
                                    <div className="flex items-start gap-2.5">
                                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.pronouns")}:</span> <span className="text-[var(--text-muted)]">{formattedActivePronouns}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(activeProfile.rightNowText?.trim()) && (
                                    <div className="flex items-start gap-2.5">
                                        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.right_now")}:</span> <span className="text-[var(--text-muted)]">{activeProfile.rightNowText?.trim()}</span></p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {hasHealthFields && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.health")}
                            </p>
                            <div className="space-y-2.5">
                                {!shouldHideField(formatEnumValue(activeProfile.hivStatus, hivStatusLabels)) && (
                                    <div className="flex items-start gap-2.5">
                                        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.hiv_status")}:</span> <span className="text-[var(--text-muted)]">{formatEnumValue(activeProfile.hivStatus, hivStatusLabels, t)}</span></p>
                                    </div>
                                )}
                                {activeProfile.lastTestedDate && (
                                    <div className="flex items-start gap-2.5">
                                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.last_tested")}:</span> <span className="text-[var(--text-muted)]">{formatTimeAgo(activeProfile.lastTestedDate, t)}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels, t)) && (
                                    <div className="flex items-start gap-2.5">
                                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.sexual_health")}:</span> <span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels, t)}</span></p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumArray(activeProfile.vaccines, vaccineLabels, t)) && (
                                    <div className="flex items-start gap-2.5">
                                        <Syringe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm"><span className="font-semibold text-[var(--text)]">{t("profile_details.vaccines")}:</span> <span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.vaccines, vaccineLabels, t)}</span></p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-8">
                    {hasStatsFields && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.stats")}
                            </p>
                            <div className="space-y-2.5">
                                {PositionIcon != null && !shouldHideField(formatEnumValue(activeProfile.sexualPosition, sexualPositionLabels)) && (
                                    <div className="flex items-center gap-2.5">
                                        <PositionIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.sexualPosition, sexualPositionLabels, t)}</p>
                                    </div>
                                )}
                                {!shouldHideField(formatHeightCm(activeProfile.height, t, unitsPreset)) && (
                                    <div className="flex items-center gap-2.5">
                                        <Ruler className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatHeightCm(activeProfile.height, t, unitsPreset)}</p>
                                    </div>
                                )}
                                {!shouldHideField(formatWeightKg(activeProfile.weight, t, unitsPreset)) && (
                                    <div className="flex items-center gap-2.5">
                                        <Scale className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatWeightKg(activeProfile.weight, t, unitsPreset)}</p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumValue(activeProfile.bodyType, bodyTypeLabels, t)) && (
                                    <div className="flex items-center gap-2.5">
                                        <User className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.bodyType, bodyTypeLabels, t)}</p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumValue(activeProfile.ethnicity, ethnicityLabels, t)) && (
                                    <div className="flex items-center gap-2.5">
                                        <Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.ethnicity, ethnicityLabels, t)}</p>
                                    </div>
                                )}
                                {!shouldHideField(formatEnumValue(activeProfile.relationshipStatus, relationshipStatusLabels, t)) && (
                                    <div className="flex items-center gap-2.5">
                                        <Heart className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.relationshipStatus, relationshipStatusLabels, t)}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {hasSocialFields && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {t("profile_details.social")}
                            </p>
                            <div className="grid gap-2">
                                {activeProfile.socialNetworks?.instagram?.userId && (
                                    <a href={`https://instagram.com/${activeProfile.socialNetworks.instagram.userId}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]">
                                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
                                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                        </svg>
                                        <span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.instagram.userId}</span>
                                        <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                                    </a>
                                )}
                                {activeProfile.socialNetworks?.twitter?.userId && (
                                    <a href={`https://x.com/${activeProfile.socialNetworks.twitter.userId}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]">
                                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.26 5.632L18.245 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                                        </svg>
                                        <span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.twitter.userId}</span>
                                        <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                                    </a>
                                )}
                                {activeProfile.socialNetworks?.facebook?.userId && (
                                    <a href={`https://facebook.com/${activeProfile.socialNetworks.facebook.userId}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]">
                                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                        </svg>
                                        <span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.facebook.userId}</span>
                                        <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}