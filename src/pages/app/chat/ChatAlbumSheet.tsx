import { Loader2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { EmptyState } from "../../../components/ui/states";
import type { AlbumViewerState } from "../../../types/chat-page";

type ChatAlbumSheetProps = {
	viewer: AlbumViewerState | null;
	isLoading: boolean;
	fullScreenIndex: number | null;
	onClose: () => void;
	onOpenFullScreen: (index: number) => void;
	isDesktop: boolean;
};

export function ChatAlbumSheet({
	viewer,
	isLoading,
	fullScreenIndex,
	onClose,
	onOpenFullScreen,
	isDesktop,
}: ChatAlbumSheetProps) {
	const { t } = useTranslation();

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[85dvh] overflow-hidden rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] backdrop-blur-[30px] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--surface-2)]/30 to-transparent pointer-events-none" />
			{/* Header */}
			<div className="relative flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 dark:border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-purple-600 shadow-[0_0_20px_var(--accent)]/30 overflow-hidden p-[1px]">
                        <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[var(--surface)]/80 backdrop-blur-md">
                            <span className="text-lg font-black text-white drop-shadow-md">
                                {viewer ? viewer.content.length : 0}
                            </span>
                        </div>
                    </div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="truncate text-lg font-bold tracking-tight text-[var(--text)] drop-shadow-sm">
								{viewer?.albumName?.trim() || t("shared_albums.album_label")}
							</p>
						</div>
						<p className="truncate text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
							{viewer?.albumName?.trim() ? t("shared_albums.album_label") : `#${viewer?.albumId}`}
						</p>
					</div>
				</div>
				<SheetClose className="inline-flex h-10 w-10 shrink-0 self-start items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--text-muted)] shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:text-[var(--text)] active:scale-95">
					<X className="h-5 w-5" />
				</SheetClose>
			</div>

			{/* Body */}
			{isLoading ? (
				<div className="relative flex min-h-[300px] items-center justify-center py-10">
					<Loader2 className="h-8 w-8 animate-spin text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]" />
				</div>
			) : !viewer || viewer.content.length === 0 ? (
				<div className="relative p-6 min-h-[300px] flex items-center justify-center">
					<div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl shadow-2xl">
                        <EmptyState
                            title={t("shared_albums.empty_album_title")}
                            description={t("shared_albums.empty_album_desc")}
                        />
                    </div>
				</div>
			) : (
				<div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 sm:gap-3 sm:p-6">
						{viewer.content.map((item, index) => {
							const isVideo = item.contentType?.startsWith("video/");
							const mediaUrl = isVideo
								? (item.thumbUrl || item.coverUrl || item.url)
								: (item.thumbUrl || item.url || item.coverUrl);
							const isActive = index === fullScreenIndex;

							return (
								<button
									key={item.contentId}
									type="button"
									onClick={() => onOpenFullScreen(index)}
									className={`group relative aspect-square overflow-hidden rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
										isActive
											? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] scale-[0.95]"
											: "hover:scale-[1.03] hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] active:scale-[0.95]"
									}`}
								>
									{mediaUrl ? (
										<>
											<img
                                                src={mediaUrl ?? undefined}
                                                alt={t("shared_albums.content_alt", { index: index + 1 })}
                                                loading="lazy"
                                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            />
                                            <div className="absolute inset-0 border border-white/10 dark:border-white/5 rounded-2xl mix-blend-overlay pointer-events-none" />
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
											{isVideo && (
												<div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all duration-300 group-hover:bg-black/40 group-hover:backdrop-blur-[4px]">
													<div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-110 group-hover:bg-[var(--accent)] group-hover:border-[var(--accent)] group-hover:shadow-[0_0_20px_var(--accent)]">
														<Play className="h-4 w-4 fill-white" />
													</div>
												</div>
											)}
										</>
									) : (
										<div className="flex h-full w-full items-center justify-center bg-[var(--surface-2)]/50 backdrop-blur-sm border border-white/5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
											{t("shared_albums.unavailable")}
										</div>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</BottomSheet>
	);
}
