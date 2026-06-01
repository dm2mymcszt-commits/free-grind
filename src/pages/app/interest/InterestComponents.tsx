import { Eye, History, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { getThumbImageUrl } from "../../../utils/media";
import blankProfileImage from "../../../images/blank-profile.png";
import { type InterestItem, type InterestTab, formatTimestamp, getTapEmoji, PREVIEW_ID_PREFIX } from "./interestUtils";

export function InterestTabs({
    activeTab,
    onViewsClick,
    onTapsClick,
}: {
    activeTab: InterestTab;
    onViewsClick: () => void;
    onTapsClick: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-10 items-end gap-3">
            <button
                type="button"
                onClick={onViewsClick}
                className={
                    activeTab === "views"
                        ? "inline-flex items-end text-left"
                        : "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
                }
                aria-current={activeTab === "views" ? "page" : undefined}
            >
                <span
                    className={
                        activeTab === "views"
                            ? "text-2xl font-bold leading-none sm:text-3xl"
                            : "text-lg font-semibold leading-none sm:text-xl"
                    }
                >
                    {t("interest_page.tabs.views")}
                </span>
            </button>
            <button
                type="button"
                onClick={onTapsClick}
                className={
                    activeTab === "taps"
                        ? "inline-flex items-end text-left"
                        : "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
                }
                aria-current={activeTab === "taps" ? "page" : undefined}
            >
                <span
                    className={
                        activeTab === "taps"
                            ? "text-2xl font-bold leading-none sm:text-3xl"
                            : "text-lg font-semibold leading-none sm:text-xl"
                    }
                >
                    {t("interest_page.tabs.taps")}
                </span>
            </button>
        </div>
    );
}

export function InterestRow({
    item,
    mode,
    onOpenProfile,
    now,
}: {
    item: InterestItem;
    mode: InterestTab;
    onOpenProfile: (profileId: string) => void;
    now: number;
}) {
    const { t } = useTranslation();
    const imageSrc = item.imageHash ? getThumbImageUrl(item.imageHash, "320x320") : blankProfileImage;

    // Identify if the server hid the ID behind a preview paywall
    const isPreview = item.profileId.startsWith(PREVIEW_ID_PREFIX);
    const isRecovered = !!item.isFromCache && !isPreview;

    const trailing =
        mode === "views"
            ? item.viewCount != null
                ? t("interest_page.view_count", { count: item.viewCount })
                : t("interest_page.viewed")
            : null;

    const handleProfileClick = () => {
        if (isPreview) {
            toast.error("Grindr hid this profile's ID. We can only show their photo!", {
                id: "preview-blocked",
            });
        } else {
            onOpenProfile(item.profileId);
        }
    };

    // Clean up the display name so we don't show the ugly "preview:nohash..." string
    const displayName = item.displayName || (isPreview ? "Unknown Profile" : t("interest_page.profile_fallback", { id: item.profileId }));

    return (
        <button
            type="button"
            onClick={handleProfileClick}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
        >
            <div className="relative h-12 w-12 shrink-0">
                <div className="h-full w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <img 
                        src={imageSrc} 
                        alt={displayName} 
                        className="h-full w-full object-cover" 
                    />
                </div>
                {/* Restored Lock Icon! */}
                {isPreview && (
                    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
                        <Lock className="h-3 w-3" />
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p className={`truncate text-sm font-semibold ${isPreview && !item.imageHash ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
                        {displayName}
                    </p>
                    {isRecovered && (
                        <span title={t("interest_page.recovered_tooltip")}>
                            <History className="h-3 w-3 text-[var(--accent)]" />
                        </span>
                    )}
                </div>
                <p className="truncate text-xs text-[var(--text-muted)]">{formatTimestamp(item.timestamp, t, now)}</p>
            </div>

            <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] ${
                    mode === "views" ? "bg-[var(--surface-2)]" : ""
                }`}
            >
                {mode === "views" ? (
                    <>
                        <Eye className="h-3.5 w-3.5" />
                        {trailing}
                    </>
                ) : (
                    <span className="text-2xl leading-none">{getTapEmoji(item.tapType)}</span>
                )}
            </span>
        </button>
    );
}