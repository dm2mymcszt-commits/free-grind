import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	Film,
	FolderPlus,
	HardDrive,
	Images,
	Pencil,
	Play,
	Plus,
	RefreshCcw,
	Share2,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import {
	EmptyState,
	ErrorState,
	LoadingState,
} from "../../components/ui/states";
import { ApiFunctionError } from "../../services/apiFunctions";
import {
	type Album,
	type AlbumDetail,
	type AlbumLimits,
	type AlbumMedia,
} from "../../types/albums";
import {
	buildMultipartBody,
	countAlbumMedia,
	getVideodimensions,
	getVideoDurationMs,
} from "./settings-albums/settingsAlbumsUtils";

function LimitRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
			<p className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">{label}</p>
			<span className="shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold tabular-nums">
				{value}
			</span>
		</div>
	);
}

function formatMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return seconds === 0 ? `${minutes} min` : `${minutes}:${String(seconds).padStart(2, "0")} min`;
}

export function SettingsAlbumsPage() {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const apiFunctions = useApiFunctions();
	const [albums, setAlbums] = useState<Album[]>([]);
	const [limits, setLimits] = useState<AlbumLimits | null>(null);
	const [limitsExpanded, setLimitsExpanded] = useState(false);
	const maxAlbums = limits?.maxAlbums ?? 1;
	const subscriptionType = limits?.subscriptionType ?? null;

	const planLabel = useMemo(() => {
		if (!subscriptionType) return null;
		return subscriptionType.replace(/Albums$/i, "").trim() || subscriptionType;
	}, [subscriptionType]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [createName, setCreateName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [isSavingEdit, setIsSavingEdit] = useState(false);
	const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
	const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
	const [albumDetails, setAlbumDetails] = useState<Record<string, AlbumDetail>>({});
	const [loadingAlbumDetailsId, setLoadingAlbumDetailsId] = useState<string | null>(null);
	const [uploadingAlbumId, setUploadingAlbumId] = useState<string | null>(null);
	const [reorderingAlbumId, setReorderingAlbumId] = useState<string | null>(null);
	const [deletingContentKey, setDeletingContentKey] = useState<string | null>(null);
	const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState<string | null>(null);
	const [confirmDeleteContentKey, setConfirmDeleteContentKey] = useState<string | null>(null);
	const [editOpenedAlbumId, setEditOpenedAlbumId] = useState<string | null>(null);

	const loadAlbumsAndLimits = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [ownAlbums, ownStorage] = await Promise.all([
				apiFunctions.getOwnAlbums(),
				apiFunctions.getOwnAlbumStorage(),
			]);
			setAlbums(ownAlbums);
			setLimits(ownStorage);

			// Load covers in background without blocking
			void Promise.all(
				ownAlbums.map(async (album) => {
					try {
						const detail = await apiFunctions.getOwnAlbumDetails(album.albumId);
						setAlbumDetails((prev) => ({ ...prev, [album.albumId]: detail }));
					} catch {
						// silently skip
					}
				}),
			);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : t("settings_albums.error_load_fallback"));
		} finally {
			setIsLoading(false);
		}
	}, [apiFunctions]);

	useEffect(() => {
		void loadAlbumsAndLimits();
	}, [loadAlbumsAndLimits]);

	const canCreateAlbum = useMemo(() => albums.length < maxAlbums, [albums.length, maxAlbums]);


	const handleCreateAlbum = async () => {
		if (!canCreateAlbum || isCreating) return;
		setIsCreating(true);
		const albumName = createName.trim() || `Album ${albums.length + 1}`;
		try {
			await apiFunctions.createOwnAlbum({ albumName });
			setCreateName("");
			toast.success(t("settings_albums.toast_created"));
			await loadAlbumsAndLimits();
		} catch (createError) {
			if (createError instanceof ApiFunctionError && createError.status === 402) {
				toast.error(t("settings_albums.limit_reached_toast"));
				return;
			}
			toast.error(createError instanceof Error ? createError.message : t("settings_albums.error_create_fallback"));
		} finally {
			setIsCreating(false);
		}
	};

	const startEditingAlbum = (album: Album) => {
		setEditingAlbumId(album.albumId);
		setEditingName(album.albumName?.trim() ?? "");
	};

	const cancelEditing = () => {
		if (editOpenedAlbumId) {
			setOpenAlbumId((prev) => prev === editOpenedAlbumId ? null : prev);
			setEditOpenedAlbumId(null);
		}
		setEditingAlbumId(null);
		setEditingName("");
	};

	const saveEditingAlbum = async (albumId: string) => {
		if (isSavingEdit) return;
		setIsSavingEdit(true);
		try {
			await apiFunctions.renameOwnAlbum({ albumId, albumName: editingName.trim() });
			setAlbums((previous) =>
				previous.map((album) =>
					album.albumId === albumId ? { ...album, albumName: editingName.trim() } : album,
				),
			);
			toast.success(t("settings_albums.toast_renamed"));
			cancelEditing();
		} catch (saveError) {
			toast.error(saveError instanceof Error ? saveError.message : t("settings_albums.error_rename_fallback"));
		} finally {
			setIsSavingEdit(false);
		}
	};

	const deleteAlbum = async (albumId: string) => {
		if (deletingAlbumId) return;
		setDeletingAlbumId(albumId);
		try {
			await apiFunctions.deleteOwnAlbum({ albumId });
			setAlbums((previous) => previous.filter((album) => album.albumId !== albumId));
			setConfirmDeleteAlbumId((previous) => previous === albumId ? null : previous);
			toast.success(t("settings_albums.toast_deleted"));
		} catch (deleteError) {
			toast.error(deleteError instanceof Error ? deleteError.message : t("settings_albums.error_delete_fallback"));
		} finally {
			setDeletingAlbumId(null);
		}
	};

	const loadAlbumDetails = useCallback(async (albumId: string, forceRefresh = false) => {
		if (!forceRefresh && albumDetails[albumId]) return;
		setLoadingAlbumDetailsId(albumId);
		try {
			const parsed = await apiFunctions.getOwnAlbumDetails(albumId);
			setAlbumDetails((previous) => ({ ...previous, [albumId]: parsed }));
		} catch (loadError) {
			toast.error(loadError instanceof Error ? loadError.message : t("settings_albums.error_load_details_fallback"));
		} finally {
			setLoadingAlbumDetailsId((previous) => previous === albumId ? null : previous);
		}
	}, [albumDetails, apiFunctions]);

	const toggleAlbumOpen = (albumId: string) => {
		if (openAlbumId === albumId) {
			setOpenAlbumId(null);
			return;
		}
		setOpenAlbumId(albumId);
		void loadAlbumDetails(albumId);
	};

	const uploadPictures = async (albumId: string, files: File[]) => {
		if (!files.length || uploadingAlbumId) return;

		// Pre-flight validation against plan limits
		const detail = albumDetails[albumId];
		const currentTotal = detail?.content.length ?? 0;
		const currentVideos = detail?.content.filter(
			(item) => item.contentType?.startsWith("video/"),
		).length ?? 0;

		let candidates = [...files];

		// Album item count
		if (limits?.maxContentItemsPerAlbum != null) {
			const remaining = limits.maxContentItemsPerAlbum - currentTotal;
			if (remaining <= 0) {
				toast.error(t("settings_albums.error_album_full", {
					defaultValue: "Album is full (max {{max}} items).",
					max: limits.maxContentItemsPerAlbum,
				}));
				return;
			}
			if (candidates.length > remaining) {
				toast(t("settings_albums.warning_truncated", {
					defaultValue: "Only {{remaining}} slot(s) left — uploading the first {{remaining}} file(s).",
					remaining,
				}));
				candidates = candidates.slice(0, remaining);
			}
		}

		// Per-file checks (size + video duration/count)
		const valid: File[] = [];
		let videoSlotsLeft = limits?.maxVideosPerAlbum != null
			? limits.maxVideosPerAlbum - currentVideos
			: Infinity;

		for (const file of candidates) {
			const isVideo = file.type.startsWith("video/");

			// File size
			if (limits?.maxContentSize != null && file.size > limits.maxContentSize) {
				toast.error(t("settings_albums.error_file_too_large", {
					defaultValue: "\"{{name}}\" is too large (max {{max}}).",
					name: file.name,
					max: limits.maxContentSizeHumanReadable ?? `${Math.round(limits.maxContentSize / 1_048_576)} MiB`,
				}));
				continue;
			}

			// Video slot count
			if (isVideo) {
				if (videoSlotsLeft <= 0) {
					toast.error(t("settings_albums.error_video_limit", {
						defaultValue: "\"{{name}}\" skipped — album video limit reached (max {{max}}).",
						name: file.name,
						max: limits?.maxVideosPerAlbum,
					}));
					continue;
				}
				videoSlotsLeft -= 1;

				// Video duration
				if (limits?.maxVideoLength != null || limits?.minVideoLength != null) {
					const durationMs = await getVideoDurationMs(file);
					if (durationMs != null) {
						if (limits.maxVideoLength != null && durationMs > limits.maxVideoLength) {
							toast.error(t("settings_albums.error_video_too_long", {
								defaultValue: "\"{{name}}\" is too long (max {{max}}).",
								name: file.name,
								max: formatMs(limits.maxVideoLength),
							}));
							continue;
						}
						if (limits.minVideoLength != null && durationMs < limits.minVideoLength) {
							toast.error(t("settings_albums.error_video_too_short", {
								defaultValue: "\"{{name}}\" is too short (min {{min}}).",
								name: file.name,
								min: formatMs(limits.minVideoLength),
							}));
							continue;
						}
					}
				}
			}

			valid.push(file);
		}

		if (valid.length === 0) return;

		setUploadingAlbumId(albumId);
		try {
			for (const file of valid) {
				const multipart = await buildMultipartBody(file);
				const isVideo = file.type.startsWith("video/");
				const dims = isVideo ? await getVideodimensions(file) : undefined;
				await apiFunctions.uploadOwnAlbumContent({ albumId, multipart, ...dims });
			}
			toast.success(t("settings_albums.toast_picture_added", { count: valid.length }));
			await loadAlbumDetails(albumId, true);
		} catch (uploadError) {
			toast.error(uploadError instanceof Error ? uploadError.message : t("settings_albums.error_upload_fallback"));
		} finally {
			setUploadingAlbumId(null);
		}
	};

	const handleUploadInputChange = async (albumId: string, event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		await uploadPictures(albumId, files);
	};

	const reorderAlbumContent = async (albumId: string, content: AlbumMedia[], fromIndex: number, toIndex: number) => {
		if (reorderingAlbumId || fromIndex < 0 || toIndex < 0) return;
		if (toIndex >= content.length || fromIndex >= content.length) return;

		const reordered = [...content];
		const [movedItem] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, movedItem);

		const contentIds = reordered.map((item) => Number.parseInt(item.contentId, 10));
		if (contentIds.some((value) => Number.isNaN(value))) {
			toast.error(t("settings_albums.error_reorder_unsupported"));
			return;
		}

		setReorderingAlbumId(albumId);
		try {
			await apiFunctions.reorderOwnAlbumContent({ albumId, contentIds });
			setAlbumDetails((previous) => {
				const detail = previous[albumId];
				if (!detail) return previous;
				return { ...previous, [albumId]: { ...detail, content: reordered } };
			});
		} catch (reorderError) {
			toast.error(reorderError instanceof Error ? reorderError.message : t("settings_albums.error_reorder_fallback"));
		} finally {
			setReorderingAlbumId(null);
		}
	};

	const deleteAlbumPicture = async (albumId: string, contentId: string) => {
		if (deletingContentKey) return;
		const deleteKey = `${albumId}:${contentId}`;
		setDeletingContentKey(deleteKey);
		try {
			await apiFunctions.deleteOwnAlbumContent({ albumId, contentId });
			setAlbumDetails((previous) => {
				const detail = previous[albumId];
				if (!detail) return previous;
				return { ...previous, [albumId]: { ...detail, content: detail.content.filter((item) => item.contentId !== contentId) } };
			});
			setConfirmDeleteContentKey((previous) => previous === deleteKey ? null : previous);
			toast.success(t("settings_albums.toast_picture_removed"));
		} catch (deleteError) {
			toast.error(deleteError instanceof Error ? deleteError.message : t("settings_albums.error_delete_content_fallback"));
		} finally {
			setDeletingContentKey(null);
		}
	};

	return (
		<section className="app-screen">
			<div className="grid gap-6">
				<header className="mb-1">
					<BackToSettings />
					<h1 className="app-title mb-1">{t("settings_albums.title")}</h1>
					<p className="app-subtitle">{t("settings_albums.subtitle", { defaultValue: "Manage your private albums." })}</p>
				</header>

				{/* Combined plan summary + create album */}
				<div className="surface-card overflow-hidden">
					{/* Plan limits header — only when data is loaded */}
					{limits && (
						<>
							<button
								type="button"
								onClick={() => setLimitsExpanded((p) => !p)}
								className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--surface-2)]"
							>
								<div className="shrink-0 rounded-2xl bg-amber-500/15 p-2.5 text-amber-400">
									<HardDrive className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold leading-snug">
											{t("settings_albums.limits_title", { defaultValue: "Plan Limits" })}
										</p>
										{planLabel && (
											<span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-contrast)]">
												{planLabel}
											</span>
										)}
									</div>
									<div className="mt-2 space-y-1.5">
										<div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
											<div
												className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
												style={{ width: `${Math.min(100, (albums.length / maxAlbums) * 100)}%` }}
											/>
										</div>
										<div className="flex items-center justify-between gap-3">
											<p className="min-w-0 truncate text-xs text-[var(--text-muted)]">
												{[
													limits.maxContentItemsPerAlbum != null && t("settings_albums.limits_items_short", { defaultValue: "{{n}} items/album", n: limits.maxContentItemsPerAlbum }),
													limits.maxContentSizeHumanReadable != null && limits.maxContentSizeHumanReadable,
													limits.maxVideosPerAlbum != null && t("settings_albums.limits_videos_short", { defaultValue: "{{n}} videos/album", n: limits.maxVideosPerAlbum }),
												].filter(Boolean).join(" · ")}
											</p>
											<span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
												{albums.length} / {maxAlbums} {t("settings_albums.limits_albums", { defaultValue: "albums" })}
											</span>
										</div>
									</div>
								</div>
								<ChevronDown
									className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${limitsExpanded ? "rotate-180" : ""}`}
								/>
							</button>

							{/* Expanded limit detail rows */}
							{limitsExpanded && (
								<div className="divide-y divide-[var(--border)]">
									{limits.maxContentItemsPerAlbum != null && (
										<LimitRow icon={<Images className="h-4 w-4" />} label={t("settings_albums.limits_items_per_album", { defaultValue: "Items per Album" })} value={String(limits.maxContentItemsPerAlbum)} />
									)}
									{limits.maxVideosPerAlbum != null && (
										<LimitRow icon={<Film className="h-4 w-4" />} label={t("settings_albums.limits_videos_per_album", { defaultValue: "Videos per Album" })} value={String(limits.maxVideosPerAlbum)} />
									)}
									{limits.maxVideoLength != null && (
										<LimitRow icon={<Film className="h-4 w-4" />} label={t("settings_albums.limits_max_video_length", { defaultValue: "Max Video Length" })} value={formatMs(limits.maxVideoLength)} />
									)}
									{limits.minVideoLength != null && (
										<LimitRow icon={<Film className="h-4 w-4" />} label={t("settings_albums.limits_min_video_length", { defaultValue: "Min Video Length" })} value={formatMs(limits.minVideoLength)} />
									)}
									{limits.maxContentSizeHumanReadable != null && (
										<LimitRow icon={<HardDrive className="h-4 w-4" />} label={t("settings_albums.limits_storage", { defaultValue: "Max File Size" })} value={limits.maxContentSizeHumanReadable} />
									)}
									{limits.maxShares != null && (
										<LimitRow icon={<Share2 className="h-4 w-4" />} label={t("settings_albums.limits_shares", { defaultValue: "Shares" })} value={String(limits.maxShares)} />
									)}
									{limits.maxShareableAlbums != null && (
										<LimitRow icon={<Share2 className="h-4 w-4" />} label={t("settings_albums.limits_shareable_albums", { defaultValue: "Shareable Albums" })} value={String(limits.maxShareableAlbums)} />
									)}
									{limits.maxViewableAlbums != null && (
										<LimitRow icon={<Images className="h-4 w-4" />} label={t("settings_albums.limits_viewable_albums", { defaultValue: "Viewable Albums (others)" })} value={String(limits.maxViewableAlbums)} />
									)}
									{limits.maxViewableVideos != null && (
										<LimitRow icon={<Film className="h-4 w-4" />} label={t("settings_albums.limits_viewable_videos", { defaultValue: "Viewable Videos (others)" })} value={String(limits.maxViewableVideos)} />
									)}
								</div>
							)}

							<div className="border-t border-[var(--border)]" />
						</>
					)}

					{/* Create album — always visible */}
					<div className="flex items-start gap-3 p-4">
						<div className="shrink-0 rounded-2xl bg-pink-500/15 p-2.5 text-pink-400">
							<FolderPlus className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold leading-snug">{t("settings_albums.create")}</p>
							<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
								{canCreateAlbum
									? t("settings_albums.usage", { count: albums.length, max: maxAlbums })
									: t("settings_albums.limit_reached")}
							</p>
							<div className="mt-3 flex gap-2">
								<input
									type="text"
									value={createName}
									onChange={(e) => setCreateName(e.target.value)}
									placeholder={t("settings_albums.new_album_placeholder")}
									className="input-field min-w-0 flex-1 !min-h-0 !py-2 !px-3 text-sm"
									maxLength={255}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void handleCreateAlbum();
										}
									}}
								/>
								<button
									type="button"
									onClick={() => void handleCreateAlbum()}
									disabled={!canCreateAlbum || isCreating}
									className="btn-accent inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
								>
									<Plus className="h-3.5 w-3.5" />
									{isCreating ? t("settings_albums.creating") : t("settings_albums.create")}
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* Albums list */}
				<div>
					<div className="mb-2 flex items-center gap-2 px-1">
						<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
							{t("settings_albums.your_albums")}
						</p>
						{albums.length > 0 && (
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{albums.length}
							</span>
						)}
					</div>

					{isLoading ? (
						<LoadingState title={t("settings_albums.loading")} description={t("settings_albums.loading_desc")} compact />
					) : error ? (
						<ErrorState title={t("settings_albums.error_load")} description={error} onRetry={() => void loadAlbumsAndLimits()} />
					) : albums.length === 0 ? (
						<EmptyState title={t("settings_albums.empty")} description={t("settings_albums.empty_desc")} />
					) : (
						<div className="grid gap-3">
							{albums.map((album) => {
								const isEditing = editingAlbumId === album.albumId;
								const isOpen = openAlbumId === album.albumId;
								const detail = albumDetails[album.albumId];
								const isLoadingDetails = loadingAlbumDetailsId === album.albumId;
								const uploadInputId = `album-upload-${album.albumId}`;
								const mediaCounts = countAlbumMedia(detail);
								const coverUrl = detail?.content[0]?.thumbUrl || detail?.content[0]?.url || detail?.content[0]?.coverUrl;

								return (
									<div key={album.albumId} className="surface-card overflow-hidden">
										{/* Album row */}
										<div
											className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]"
											onClick={() => !isEditing && toggleAlbumOpen(album.albumId)}
										>
											{coverUrl ? (
												<img src={coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
											) : (
												<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)]">
													<Images className="h-5 w-5 opacity-40" />
												</div>
											)}
											<div className="min-w-0 flex-1">
												{isEditing ? (
													<input
														type="text"
														value={editingName}
														onChange={(e) => setEditingName(e.target.value)}
														onClick={(e) => e.stopPropagation()}
														className="input-field w-full !py-1.5 h-9 [min-height:0]"
														maxLength={255}
													/>
												) : (
													<p className="truncate font-semibold">
														{album.albumName?.trim() || t("settings_albums.untitled")}
													</p>
												)}
												{!isEditing && (
													<p className="text-xs text-[var(--text-muted)]">
														{detail
															? [
																limits?.maxContentItemsPerAlbum != null
																	? `${mediaCounts.total} / ${limits.maxContentItemsPerAlbum} ${t("settings_albums.media_items", { defaultValue: "items" })}`
																	: mediaCounts.total > 0 ? `${mediaCounts.total} ${t("settings_albums.media_items", { defaultValue: "items" })}` : null,
																limits?.maxVideosPerAlbum != null
																	? `${mediaCounts.videos} / ${limits.maxVideosPerAlbum} ${t("settings_albums.media_videos", { defaultValue: "videos" })}`
																	: mediaCounts.videos > 0 ? `${mediaCounts.videos} ${t("settings_albums.media_videos", { defaultValue: "videos" })}` : null,
															].filter(Boolean).join(" · ") || `#${album.albumId}`
															: `#${album.albumId}`}
													</p>
												)}
											</div>
											<div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
												{isEditing ? (
													<>
														<button
															type="button"
															onClick={() => void saveEditingAlbum(album.albumId)}
															disabled={isSavingEdit}
															className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
															title={t("settings_albums.save")}
														>
															<Check className="h-4 w-4" />
														</button>
														<button
															type="button"
															onClick={cancelEditing}
															className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] transition hover:border-[var(--text-muted)]"
															title={t("settings_albums.cancel")}
														>
															<X className="h-4 w-4" />
														</button>
													</>
												) : (
													<>
														<button
															type="button"
															onClick={() => {
																startEditingAlbum(album);
																if (!isOpen) {
																	toggleAlbumOpen(album.albumId);
																	setEditOpenedAlbumId(album.albumId);
																}
															}}
															className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
															title={t("settings_albums.rename")}
														>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															onClick={() => setConfirmDeleteAlbumId(album.albumId)}
															disabled={deletingAlbumId === album.albumId}
															className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
															title={t("settings_albums.delete")}
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</>
												)}
											</div>
										</div>

										{/* Expanded content */}
										{isOpen && (
											<div className="border-t border-[var(--border)] p-4">
												<div className="mb-3 flex items-center justify-between gap-2">
													<p className="text-xs text-[var(--text-muted)]">
														{[
															mediaCounts.images > 0 && `${mediaCounts.images} ${t("settings_albums.media_photos", { defaultValue: "photos" })}`,
															mediaCounts.videos > 0 && `${mediaCounts.videos} ${t("settings_albums.media_videos", { defaultValue: "videos" })}`,
														].filter(Boolean).join(" · ") || t("settings_albums.no_media")}
													</p>
													<div className="flex items-center gap-1.5">
														<input
															id={uploadInputId}
															type="file"
															accept="image/*,video/*"
															multiple
															onChange={(e) => void handleUploadInputChange(album.albumId, e)}
															className="hidden"
														/>
														<label
															htmlFor={uploadInputId}
															className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
														>
															<Upload className="h-3.5 w-3.5" />
															{uploadingAlbumId === album.albumId ? t("settings_albums.uploading") : t("settings_albums.upload")}
														</label>
														<button
															type="button"
															onClick={() => void loadAlbumDetails(album.albumId, true)}
															className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
															title={t("settings_albums.refresh")}
														>
															<RefreshCcw className="h-3.5 w-3.5" />
														</button>
													</div>
												</div>

												{isLoadingDetails ? (
													<p className="text-sm text-[var(--text-muted)]">{t("settings_albums.loading_media")}</p>
												) : !detail || detail.content.length === 0 ? (
													<p className="text-sm text-[var(--text-muted)]">{t("settings_albums.no_media")}</p>
												) : (
													<div className={`grid gap-2 ${isDesktop ? "grid-cols-6" : "grid-cols-3"}`}>
														{detail.content.map((item, index) => {
															const imageUrl = item.thumbUrl || item.url || item.coverUrl || "";
															const canMoveUp = index > 0;
															const canMoveDown = index < detail.content.length - 1;
															const deleteKey = `${album.albumId}:${item.contentId}`;

															return (
																<div
																	key={`${album.albumId}-${item.contentId}`}
																	className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
																>
																	{imageUrl ? (
																		<img
																			src={imageUrl}
																			alt={t("settings_albums.media_alt", { index: index + 1 })}
																			className="aspect-square w-full object-cover"
																		/>
																	) : (
																		<div className="aspect-square w-full bg-[var(--surface)]" />
																	)}
																	{item.contentType?.startsWith("video/") && (
																		<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
																			<div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
																				<Play className="h-4 w-4 fill-white text-white" />
																			</div>
																		</div>
																	)}
																	<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
																		<div className="flex gap-1">
																			<button
																				type="button"
																				onClick={() => void reorderAlbumContent(album.albumId, detail.content, index, index - 1)}
																				disabled={!canMoveUp || reorderingAlbumId === album.albumId}
																				className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm disabled:opacity-30"
																			>
																				<ArrowUp className="h-3 w-3" />
																			</button>
																			<button
																				type="button"
																				onClick={() => void reorderAlbumContent(album.albumId, detail.content, index, index + 1)}
																				disabled={!canMoveDown || reorderingAlbumId === album.albumId}
																				className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm disabled:opacity-30"
																			>
																				<ArrowDown className="h-3 w-3" />
																			</button>
																		</div>
																		<button
																			type="button"
																			onClick={() => setConfirmDeleteContentKey(deleteKey)}
																			disabled={deletingContentKey === deleteKey}
																			className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm disabled:opacity-30"
																			title={t("settings_albums.delete")}
																		>
																			<Trash2 className="h-3 w-3" />
																		</button>
																	</div>
																</div>
															);
														})}
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<ConfirmDialog
				isOpen={confirmDeleteAlbumId !== null}
				title={t("settings_albums.confirm_delete")}
				message={t("settings_albums.confirm_delete_message", { defaultValue: "This album and all its content will be permanently deleted." })}
				confirmLabel={deletingAlbumId ? t("settings_albums.deleting") : t("settings_albums.delete")}
				cancelLabel={t("settings_albums.cancel")}
				onConfirm={() => confirmDeleteAlbumId ? void deleteAlbum(confirmDeleteAlbumId) : undefined}
				onCancel={() => setConfirmDeleteAlbumId(null)}
				isProcessing={deletingAlbumId !== null}
				confirmTone="danger"
			/>

			<ConfirmDialog
				isOpen={confirmDeleteContentKey !== null}
				title={t("settings_albums.confirm_delete")}
				message={t("settings_albums.confirm_delete_content_message", { defaultValue: "This image will be permanently removed from the album." })}
				confirmLabel={deletingContentKey ? t("settings_albums.deleting") : t("settings_albums.delete")}
				cancelLabel={t("settings_albums.cancel")}
				onConfirm={() => {
					if (!confirmDeleteContentKey) return;
					const [albumId, contentId] = confirmDeleteContentKey.split(":");
					void deleteAlbumPicture(albumId, contentId);
				}}
				onCancel={() => setConfirmDeleteContentKey(null)}
				isProcessing={deletingContentKey !== null}
				confirmTone="danger"
			/>
		</section>
	);
}
