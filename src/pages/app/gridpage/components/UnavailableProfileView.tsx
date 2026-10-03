import { Ban, ChevronLeft, Loader2, MessageCircle, RotateCw, UserX, X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ProfileImage } from "../../../../components/ui/profile-image";
import {
	createBackdropCloseHandler,
	useModalClose,
} from "../../../../hooks/useModalClose";
import type { UnavailableProfile } from "../../../../hooks/useUnavailableProfile";
import type { UnavailableProfileState } from "../../../../utils/unavailableProfile";

type UnavailableProfileViewProps = {
	variant?: "modal" | "page";
	profileId: string;
	profile: UnavailableProfile;
	onClose: () => void;
	/** Offered only when the block is this account's own. */
	onUnblock?: (profileId: string) => void;
	isUnblocking?: boolean;
	/** Offered only when there is a chat with them on this device. */
	onOpenChat?: (conversationId: string) => void;
	/** Asks Grindr again; offered while nothing says whose block it is. */
	onRetry?: () => void;
	isRetrying?: boolean;
};

function describeState(
	t: TFunction,
	state: UnavailableProfileState,
): { title: string; detail: string } {
	if (state === "you_blocked") {
		return {
			title: t("profile_unavailable.you_blocked", {
				defaultValue: "You blocked this person",
			}),
			detail: t("profile_unavailable.you_blocked_detail", {
				defaultValue: "Their profile stays hidden while your block is in place.",
			}),
		};
	}
	if (state === "blocked_you") {
		return {
			title: t("profile_unavailable.blocked_you", {
				defaultValue: "This person blocked you",
			}),
			detail: t("profile_unavailable.blocked_you_detail", {
				defaultValue: "Their profile can't be opened while their block is in place.",
			}),
		};
	}
	if (state === "deleted") {
		return {
			title: t("profile_unavailable.deleted", {
				defaultValue: "This profile no longer exists",
			}),
			detail: t("profile_unavailable.deleted_detail", {
				defaultValue: "Grindr no longer has a profile for this person.",
			}),
		};
	}
	return {
		title: t("profile_unavailable.blocked_unknown", {
			defaultValue: "This profile can't be opened right now",
		}),
		detail: t("profile_unavailable.blocked_unknown_detail", {
			defaultValue:
				"There is a block between you and this person, and the app can't tell yet which side set it.",
		}),
	};
}

/**
 * Shown in place of the profile when Grindr only returns its empty stub — a
 * block in either direction, or a profile that is gone. Says which, shows the
 * name and picture this device still has, and offers what can still be done.
 */
export function UnavailableProfileView({
	variant = "modal",
	profileId,
	profile,
	onClose,
	onUnblock,
	isUnblocking = false,
	onOpenChat,
	onRetry,
	isRetrying = false,
}: UnavailableProfileViewProps) {
	const { t } = useTranslation();
	useModalClose({ isOpen: true, onClose });
	const handleBackdropClose = useMemo(() => createBackdropCloseHandler(onClose), [onClose]);

	const name =
		profile.name ?? t("profile_details.profile_fallback", { id: profileId });
	const description = describeState(t, profile.state);
	const BadgeIcon = profile.state === "deleted" ? UserX : Ban;
	const conversationId = profile.conversationId;

	const body = (
		<div className="flex w-full max-w-sm flex-col items-center text-center">
			<div className="relative">
				<div className="h-28 w-28 squircle bg-[var(--surface-2)] opacity-80 grayscale-[0.4]">
					<ProfileImage src={profile.photoUrl} alt={name} loading="eager" />
				</div>
				{!profile.isResolving && (
					<div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
						<BadgeIcon className="h-4 w-4" />
					</div>
				)}
			</div>

			<p className="mt-4 max-w-full truncate text-lg font-semibold text-[var(--text)]">{name}</p>

			{profile.isResolving ? (
				<div
					className="mt-4 flex items-center justify-center text-[var(--text-muted)]"
					role="status"
					aria-label={t("profile_details.loading")}
				>
					<Loader2 className="h-5 w-5 animate-spin" />
				</div>
			) : (
				<>
					<p className="mt-3 text-base font-semibold text-[var(--text)]">{description.title}</p>
					<p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{description.detail}</p>

					<div className="mt-6 flex w-full flex-col gap-2">
						{profile.state === "you_blocked" && onUnblock && (
							<button
								type="button"
								onClick={() => onUnblock(profileId)}
								disabled={isUnblocking}
								className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:opacity-90 disabled:opacity-60"
							>
								{isUnblocking ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Ban className="h-4 w-4" />
								)}
								{isUnblocking
									? t("profile_details.unblock_in_progress")
									: t("profile_details.unblock")}
							</button>
						)}
						{conversationId && onOpenChat && (
							<button
								type="button"
								onClick={() => onOpenChat(conversationId)}
								className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
							>
								<MessageCircle className="h-4 w-4" />
								{t("profile_unavailable.open_chat", { defaultValue: "Open your chat" })}
							</button>
						)}
						{profile.state === "blocked_unknown" && onRetry && (
							<button
								type="button"
								onClick={onRetry}
								disabled={isRetrying}
								className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] disabled:opacity-60"
							>
								<RotateCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
								{t("profile_unavailable.retry", { defaultValue: "Check again" })}
							</button>
						)}
					</div>
				</>
			)}
		</div>
	);

	if (variant === "page") {
		return (
			<div className="app-screen relative flex h-dvh w-full flex-col overflow-x-hidden bg-[var(--bg)] !px-0 !pb-0 !pt-0">
				<div
					className="flex items-center px-4 sm:px-5"
					style={{
						paddingTop: "calc(env(safe-area-inset-top,0px) + 10px)",
						paddingBottom: "0.75rem",
					}}
				>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text)] transition-colors"
						aria-label={t("settings.back_to_browse")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)]">
					{body}
				</div>
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
			onClick={handleBackdropClose}
		>
			<div
				className="surface-card relative flex w-full max-w-md flex-col items-center rounded-2xl px-6 pb-8 pt-12"
				onClick={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					onClick={onClose}
					className="absolute left-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text)]"
					aria-label={t("profile_details.close_profile_details")}
				>
					<X className="h-4 w-4" />
				</button>
				{body}
			</div>
		</div>
	);
}
