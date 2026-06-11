import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ShieldOff, UserX, X } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useBlockedProfileIds, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "../../components/ui/states";

type BlockedProfileListItem = {
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
};

/** How many profile details to fetch in one batch as the user scrolls. */
const BATCH_SIZE = 20;

export function SettingsBlockedPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const apiFunctions = useApiFunctions();
	const { data: blockedIdsData, isLoading: isLoadingIds, refetch: refetchIds } = useBlockedProfileIds();
	const { mutateAsync: unblockProfileMutation, isPending: isUnblocking } = useUnblockProfile();

	// ── Cache: profileId → detail (persists across scrolls) ──────────────
	const profileCacheRef = useRef(new Map<string, BlockedProfileListItem>());
	const [profileCache, setProfileCache] = useState(new Map<string, BlockedProfileListItem>());

	// ── Lazy-loading state ───────────────────────────────────────────────
	const [loadedUpTo, setLoadedUpTo] = useState(0); // how many IDs we've fetched details for
	const [initialBatchLoaded, setInitialBatchLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// ── Search ───────────────────────────────────────────────────────────
	const [searchQuery, setSearchQuery] = useState("");

	// ── UI state ─────────────────────────────────────────────────────────
	const [mutatingProfileId, setMutatingProfileId] = useState<string | null>(null);
	const [isUnblockingAll, setIsUnblockingAll] = useState(false);
	const [confirmUnblockAll, setConfirmUnblockAll] = useState(false);

	// ── Sentinel ref for IntersectionObserver ─────────────────────────────
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// ── All blocked IDs (master list) ────────────────────────────────────
	const allBlockedIds: string[] = useMemo(() => blockedIdsData ?? [], [blockedIdsData]);

	// ── Filtered list (search) ───────────────────────────────────────────
	const filteredBlockedIds = useMemo(() => {
		if (!searchQuery.trim()) return allBlockedIds;
		const q = searchQuery.trim().toLowerCase();
		return allBlockedIds.filter((id) => {
			const cached = profileCache.get(id);
			if (cached) {
				return (
					cached.displayName.toLowerCase().includes(q) ||
					cached.profileId.includes(q)
				);
			}
			return id.includes(q);
		});
	}, [allBlockedIds, searchQuery, profileCache]);

	// ── Visible slice: show everything we've loaded so far ───────────────
	const visibleIds = useMemo(
		() => filteredBlockedIds.slice(0, loadedUpTo),
		[filteredBlockedIds, loadedUpTo],
	);

	const hasMore = loadedUpTo < allBlockedIds.length;

	// ── Extract profile metadata from raw API response ───────────────────
	const extractBlockedProfileMeta = useCallback(
		(rawProfilePayload: unknown, profileId: string) => {
			const fallbackName = t("profile_details.profile_fallback", { id: profileId });
			if (typeof rawProfilePayload !== "object" || rawProfilePayload === null) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const profiles = (rawProfilePayload as { profiles?: unknown }).profiles;
			if (!Array.isArray(profiles) || profiles.length === 0) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const first = profiles[0];
			if (typeof first !== "object" || first === null) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const displayNameRaw = (first as { displayName?: unknown }).displayName;
			const aboutMeRaw = (first as { aboutMe?: unknown }).aboutMe;

			// The Grindr API returns placeholder data for blocked profiles
			// (e.g. displayName: "4"). Detect these and prefer aboutMe or
			// the profile-id fallback instead.
			const isPlaceholder = (v: unknown): boolean => {
				if (typeof v !== "string" || v.trim().length === 0) return true;
				const trimmed = v.trim();
				// Pure numeric strings of 5 digits or less are almost certainly placeholders
				if (trimmed.length <= 5 && /^\d+$/.test(trimmed)) return true;
				return false;
			};

			let displayName = fallbackName;
			if (!isPlaceholder(displayNameRaw)) {
				displayName = (displayNameRaw as string).trim();
			} else if (typeof aboutMeRaw === "string" && aboutMeRaw.trim().length > 0) {
				// Use the first line of aboutMe as a rough name substitute
				const firstLine = aboutMeRaw.trim().split("\n")[0].slice(0, 40);
				if (firstLine.length > 0) displayName = firstLine;
			}

			const hashRaw = (first as { profileImageMediaHash?: unknown }).profileImageMediaHash;
			const avatarUrl =
				typeof hashRaw === "string" && validateMediaHash(hashRaw)
					? getThumbImageUrl(hashRaw, "75x75")
					: null;

			// Also try medias array for a photo hash
			let finalAvatarUrl = avatarUrl;
			if (!finalAvatarUrl) {
				const medias = (first as { medias?: unknown[] }).medias;
				if (Array.isArray(medias)) {
					for (const m of medias) {
						const mh = (m as { mediaHash?: unknown }).mediaHash;
						if (typeof mh === "string" && validateMediaHash(mh)) {
							finalAvatarUrl = getThumbImageUrl(mh, "75x75");
							break;
						}
					}
				}
			}

			return { displayName, avatarUrl: finalAvatarUrl };
		},
		[t],
	);

	// ── Batch-fetch profile details for a list of IDs ────────────────────
	const fetchBatch = useCallback(
		async (ids: string[]) => {
			// Filter out already-cached IDs
			const uncached = ids.filter((id) => !profileCacheRef.current.has(id));
			if (uncached.length === 0) return;

			const results = await Promise.allSettled(
				uncached.map(async (profileId) => {
					const raw = await apiFunctions.getRawProfile(profileId);
					const { displayName, avatarUrl } = extractBlockedProfileMeta(raw, profileId);
					return { profileId, displayName, avatarUrl } satisfies BlockedProfileListItem;
				}),
			);

			const newEntries = new Map(profileCacheRef.current);
			for (const result of results) {
				if (result.status === "fulfilled") {
					newEntries.set(result.value.profileId, result.value);
				} else {
					// For failed fetches, create a fallback entry so we don't retry
					const failedId = uncached[results.indexOf(result)];
					if (failedId && !newEntries.has(failedId)) {
						newEntries.set(failedId, {
							profileId: failedId,
							displayName: t("profile_details.profile_fallback", { id: failedId }),
							avatarUrl: null,
						});
					}
				}
			}

			profileCacheRef.current = newEntries;
			setProfileCache(new Map(newEntries));
		},
		[apiFunctions, extractBlockedProfileMeta, t],
	);

	// ── Sequential batch loader ───────────────────────────────────────────
	const loadNextBatch = useCallback(async () => {
		if (!blockedIdsData || blockedIdsData.length === 0) return;

		const start = profileCacheRef.current.size;
		const end = Math.min(start + BATCH_SIZE, blockedIdsData.length);
		const batchIds = blockedIdsData.slice(start, end);

		if (batchIds.length === 0) return;

		try {
			await fetchBatch(batchIds);
		} catch {
			// Best effort — fetchBatch already creates fallback entries
		}

		setLoadedUpTo(end);
	}, [blockedIdsData, fetchBatch]);

	// ── Load initial batch when blocked IDs arrive ────────────────────────
	useEffect(() => {
		if (!blockedIdsData) return;

		if (blockedIdsData.length === 0) {
			setInitialBatchLoaded(true);
			return;
		}

		let cancelled = false;
		setError(null);

		void (async () => {
			try {
				await fetchBatch(blockedIdsData.slice(0, BATCH_SIZE));
				if (!cancelled) {
					setLoadedUpTo(Math.min(BATCH_SIZE, blockedIdsData.length));
					setInitialBatchLoaded(true);
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(loadError instanceof Error ? loadError.message : t("settings_blocked.error_load"));
				}
			}
		})();

		return () => { cancelled = true; };
	}, [blockedIdsData, fetchBatch, t]);

	// ── IntersectionObserver → triggers loadNextBatch when sentinel visible
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasMore || !initialBatchLoaded) return;

		let loading = false;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !loading) {
					loading = true;
					void loadNextBatch().finally(() => { loading = false; });
				}
			},
			{ rootMargin: "600px" },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
		// Re-create the observer after each batch so it fires again
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasMore, initialBatchLoaded, loadedUpTo, loadNextBatch]);

	// ── Handlers ─────────────────────────────────────────────────────────
	const isLoading = isLoadingIds || (!initialBatchLoaded && (blockedIdsData?.length ?? 0) > 0);

	const handleUnblock = async (profileId: string) => {
		if (isUnblocking) return;

		const requiresConfirm = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
		const confirmed = requiresConfirm ? window.confirm(t("profile_details.unblock_confirm")) : true;
		if (!confirmed) return;

		setMutatingProfileId(profileId);
		try {
			await unblockProfileMutation(profileId);
			toast.success(t("profile_details.unblock_success"));

			// Remove from local cache
			const updated = new Map(profileCacheRef.current);
			updated.delete(profileId);
			profileCacheRef.current = updated;
			setProfileCache(new Map(updated));
		} catch (unblockError) {
			toast.error(
				unblockError instanceof Error ? unblockError.message : t("profile_details.unblock_failed"),
			);
		} finally {
			setMutatingProfileId(null);
		}
	};

	const handleUnblockPress = (profileId: string) => {
		if (mutatingProfileId) return;
		void handleUnblock(profileId);
	};

	const handleUnblockAll = async () => {
		setIsUnblockingAll(true);
		try {
			await apiFunctions.unblockAllProfiles();
			toast.success(t("settings_blocked.unblock_all_success", { defaultValue: "All users unblocked." }));
			profileCacheRef.current = new Map();
			setProfileCache(new Map());
			void refetchIds();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("settings_blocked.unblock_all_failed", { defaultValue: "Failed to unblock all profiles." }));
		} finally {
			setIsUnblockingAll(false);
			setConfirmUnblockAll(false);
		}
	};

	const handleProfileClick = (profileId: string) => {
		navigate(`/profile/${profileId}`, { state: { returnTo: "/settings/blocked" } });
	};

	// ── Computed display values ──────────────────────────────────────────
	const loadedCount = profileCache.size;
	const totalCount = allBlockedIds.length;

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={() => refetchIds()}
			isDisabled={isLoading}
			refreshingLabel={t("settings_blocked.refreshing")}
		>
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings_blocked.title")}</h1>
				<p className="app-subtitle">{t("settings_blocked.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				{isLoading ? (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
							{!isLoadingIds && blockedIdsData && blockedIdsData.length > 0 && (
								<div className="h-3.5 w-5 animate-pulse rounded-full bg-[var(--surface-2)]" />
							)}
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{Array.from({ length: isLoadingIds ? 4 : Math.min(blockedIdsData?.length ?? 4, BATCH_SIZE) }).map((_, i) => (
								<div key={i} className="flex items-center gap-3 px-4 py-3">
									<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
									<div className="min-w-0 flex-1 space-y-1.5">
										<div className="h-3.5 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
										<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
									</div>
									<div className="h-7 w-20 animate-pulse rounded-xl bg-[var(--surface-2)]" />
								</div>
							))}
						</div>
					</div>
				) : error ? (
					<ErrorState
						title={t("settings_blocked.error_load")}
						description={error}
						onRetry={() => void refetchIds()}
					/>
				) : allBlockedIds.length === 0 ? (
					<EmptyState
						title={t("settings_blocked.empty")}
						description={t("settings_blocked.empty_desc", { defaultValue: "Accounts you block won't be able to see you or message you." })}
					/>
				) : (
					<div>
						{/* ── Search bar ─────────────────────────────── */}
						<div className="relative mb-3">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder={t("settings_blocked.search_placeholder", { defaultValue: "Search by name or ID..." })}
								className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] py-2.5 pl-9 pr-9 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text)]"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>

						{/* ── Header with counts ─────────────────────── */}
						<div className="mb-2 flex items-center gap-2 px-1">
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_blocked.section_label", { defaultValue: "Blocked" })}
							</p>
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{searchQuery ? `${filteredBlockedIds.length} / ${totalCount}` : totalCount}
							</span>
							{loadedCount < totalCount && !searchQuery && (
								<span className="text-[10px] text-[var(--text-muted)] opacity-60">
									({loadedCount} {t("settings_blocked.loaded_label", { defaultValue: "loaded" })})
								</span>
							)}
						</div>

						{/* ── Profile list ────────────────────────────── */}
						{filteredBlockedIds.length === 0 && searchQuery ? (
							<div className="surface-card flex flex-col items-center justify-center gap-2 p-8 text-center">
								<Search className="h-8 w-8 text-[var(--text-muted)] opacity-40" />
								<p className="text-sm text-[var(--text-muted)]">
									{t("settings_blocked.no_search_results", { defaultValue: "No blocked profiles match your search." })}
								</p>
							</div>
						) : (
							<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
								{visibleIds.map((profileId) => {
									const profile = profileCache.get(profileId);
									const isMutating = mutatingProfileId === profileId;
									const isLoaded = !!profile;

									return (
										<div
											key={profileId}
											className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]/50 cursor-pointer active:bg-[var(--surface-2)]"
											onClick={() => handleProfileClick(profileId)}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => { if (e.key === "Enter") handleProfileClick(profileId); }}
										>
											{/* Avatar */}
											<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
												{isLoaded ? (
													<ProfileImage
														src={profile.avatarUrl}
														alt={t("profile_details.photo_alt", { name: profile.displayName })}
													/>
												) : (
													<div className="h-full w-full animate-pulse bg-[var(--surface-2)]" />
												)}
											</div>

											{/* Name + ID */}
											<div className="min-w-0 flex-1">
												{isLoaded ? (
													<>
														<p className="truncate text-sm font-semibold">
															{profile.displayName}
														</p>
														<p className="text-xs text-[var(--text-muted)]">
															{t("settings_blocked.profile_id", { id: profileId })}
														</p>
													</>
												) : (
													<div className="space-y-1.5">
														<div className="h-3.5 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
														<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
													</div>
												)}
											</div>

											{/* Unblock button */}
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													handleUnblockPress(profileId);
												}}
												onPointerUp={(event) => {
													if (event.pointerType === "mouse") return;
													event.preventDefault();
													event.stopPropagation();
													handleUnblockPress(profileId);
												}}
												disabled={isMutating}
												className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-red-400/60 hover:bg-red-500/5 hover:text-red-400 disabled:opacity-50"
											>
												<UserX className="h-3.5 w-3.5" />
												{isMutating
													? t("profile_details.unblock_in_progress")
													: t("profile_details.unblock")}
											</button>
										</div>
									);
								})}

								{/* Infinite-scroll sentinel */}
								{hasMore && (
									<div ref={sentinelRef} className="flex items-center justify-center gap-2 px-4 py-4">
										<div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
										<span className="text-xs text-[var(--text-muted)]">
											{t("settings_blocked.loading_more", { defaultValue: "Loading more..." })}
										</span>
									</div>
								)}
							</div>
						)}
					</div>
				)}

				{/* Unblock all — shown once list is loaded and non-empty */}
				{!isLoading && !error && allBlockedIds.length > 0 && (
					<div className="surface-card overflow-hidden">
						<div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-red-500/15 p-2.5 text-red-400">
								<ShieldOff className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="grid grid-cols-[1fr_auto] gap-x-3">
									<p className="text-sm font-semibold leading-snug">
										{t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
									</p>
									<div className="row-span-2 flex items-start">
										{isUnblockingAll ? (
											<span className="text-xs text-[var(--text-muted)]">
												{t("settings_blocked.unblocking_all", { defaultValue: "Unblocking…" })}
											</span>
										) : (
											<button
												type="button"
												onClick={() => setConfirmUnblockAll(true)}
												className="shrink-0 inline-flex items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
											>
												{t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
											</button>
										)}
									</div>
									<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
										{t("settings_blocked.unblock_all_desc", { defaultValue: "Remove all blocked accounts at once. This cannot be undone." })}
									</p>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			<ConfirmDialog
				isOpen={confirmUnblockAll}
				title={t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
				message={t("settings_blocked.unblock_all_confirm", { defaultValue: "This will unblock all blocked accounts. Are you sure?" })}
				confirmLabel={isUnblockingAll ? t("settings_blocked.unblocking_all", { defaultValue: "Unblocking…" }) : t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
				cancelLabel={t("settings_blocked.cancel", { defaultValue: "Cancel" })}
				onConfirm={() => void handleUnblockAll()}
				onCancel={() => setConfirmUnblockAll(false)}
				isProcessing={isUnblockingAll}
				confirmTone="danger"
			/>
		</PullToRefreshContainer>
	);
}
