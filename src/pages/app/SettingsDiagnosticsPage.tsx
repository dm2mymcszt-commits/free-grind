import { Fragment, useEffect, useState } from "react";
import { Activity, Copy, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import {
	buildDiagnosticsReport,
	clearDiagnostics,
	getBlockEvents,
	getRestarts,
	getSessionStartedAt,
	isDiagnosticsHudEnabled,
	setDiagnosticsHudEnabled,
	takeSnapshot,
	type BlockRecord,
	type DiagnosticsSnapshot,
	type RestartRecord,
} from "../../utils/diagnostics";

// TEMPORARY — see utils/diagnostics.ts.

const HOUR_MS = 60 * 60 * 1000;

function formatTime(at: number): string {
	return new Date(at).toLocaleTimeString();
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function SnapshotDetails({ snapshot }: { snapshot: DiagnosticsSnapshot }) {
	return (
		<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
			<dt className="text-[var(--text-muted)]">Screen</dt>
			<dd className="truncate text-right font-mono">{snapshot.route}</dd>
			<dt className="text-[var(--text-muted)]">Media held in memory</dt>
			<dd className="text-right font-mono">{snapshot.cacheMb} MB</dd>
			{snapshot.caches.map((cache) => (
				<Fragment key={cache.name}>
					<dt className="pl-3 text-[var(--text-muted)]">{cache.name}</dt>
					<dd className="text-right font-mono">
						{cache.mb}/{cache.limitMb} MB · {cache.entries}
					</dd>
				</Fragment>
			))}
			<dt className="text-[var(--text-muted)]">JS heap</dt>
			<dd className="text-right font-mono">{snapshot.jsHeapMb == null ? "n/a here" : `${snapshot.jsHeapMb} MB`}</dd>
			<dt className="text-[var(--text-muted)]">Page elements</dt>
			<dd className="text-right font-mono">{snapshot.domNodes}</dd>
			<dt className="text-[var(--text-muted)]">Images · videos</dt>
			<dd className="text-right font-mono">
				{snapshot.images} · {snapshot.videos}
			</dd>
			<dt className="text-[var(--text-muted)]">Running for</dt>
			<dd className="text-right font-mono">{formatDuration(snapshot.uptimeMs)}</dd>
		</dl>
	);
}

export function SettingsDiagnosticsPage() {
	const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(() => takeSnapshot(getSessionStartedAt()));
	const [restarts, setRestarts] = useState<RestartRecord[]>(() => getRestarts());
	const [blocks, setBlocks] = useState<BlockRecord[]>(() => getBlockEvents());
	const [hudEnabled, setHudEnabled] = useState(() => isDiagnosticsHudEnabled());

	useEffect(() => {
		const timer = window.setInterval(() => {
			setSnapshot(takeSnapshot(getSessionStartedAt()));
			setBlocks(getBlockEvents());
		}, 2000);
		return () => window.clearInterval(timer);
	}, []);

	const lastHour = restarts.filter((restart) => snapshot.at - restart.detectedAt <= HOUR_MS);
	const inForeground = lastHour.filter((restart) => restart.wasVisible);

	const copyReport = async () => {
		try {
			await navigator.clipboard.writeText(buildDiagnosticsReport());
			toast.success("Report copied — paste it into the chat.");
		} catch {
			toast.error("Couldn't copy the report.");
		}
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">Diagnostics</h1>
				<p className="app-subtitle">Temporary. Tracks why the app restarts, and goes away once that is fixed.</p>
			</header>

			<div className="grid gap-6">
				<div className="surface-card grid gap-3 p-4">
					<div className="flex items-center gap-3">
						<div className="shrink-0 rounded-2xl bg-rose-500/15 p-2.5 text-rose-400">
							<Activity className="h-5 w-5" />
						</div>
						<div className="min-w-0">
							<p className="text-sm font-semibold">
								{lastHour.length} unexpected restart{lastHour.length === 1 ? "" : "s"} in the last hour
							</p>
							<p className="text-xs text-[var(--text-muted)]">
								{inForeground.length} while the app was on screen
							</p>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={() => void copyReport()}
							className="btn-accent inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm font-semibold"
						>
							<Copy className="h-4 w-4" /> Copy report
						</button>
						<button
							type="button"
							onClick={() => {
								clearDiagnostics();
								setRestarts([]);
								setBlocks([]);
								toast.success("Cleared");
							}}
							className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-semibold"
						>
							<Trash2 className="h-4 w-4" /> Clear
						</button>
					</div>
				</div>

				<div className="surface-card overflow-hidden">
					<ToggleRow
						label="Layout overlay"
						description="Shows live screen, keyboard and chat measurements on top of the app."
						checked={hudEnabled}
						onChange={(checked) => {
							setHudEnabled(checked);
							setDiagnosticsHudEnabled(checked);
						}}
					/>
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Right now</p>
					<div className="surface-card p-4">
						<SnapshotDetails snapshot={snapshot} />
					</div>
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						Restarts, newest first
					</p>
					{restarts.length === 0 ? (
						<p className="px-1 text-xs text-[var(--text-muted)]">None recorded yet.</p>
					) : (
						<div className="grid gap-3">
							{restarts.map((restart) => (
								<div key={restart.detectedAt} className="surface-card grid gap-2 p-4">
									<p className="text-sm font-semibold">
										{formatTime(restart.detectedAt)} · ran {formatDuration(restart.uptimeMs)}
										<span className={`ml-2 text-xs ${restart.wasVisible ? "text-rose-400" : "text-[var(--text-muted)]"}`}>
											{restart.wasVisible ? "on screen" : "in background"}
										</span>
									</p>
									{restart.snapshot ? (
										<SnapshotDetails snapshot={restart.snapshot} />
									) : (
										<p className="text-xs text-[var(--text-muted)]">No snapshot was saved.</p>
									)}
									{restart.errors.length > 0 ? (
										<ul className="grid gap-1 border-t border-[var(--border)] pt-2 font-mono text-[10px] text-amber-300">
											{restart.errors.map((error) => (
												<li key={`${error.at}-${error.message}`}>
													{formatTime(error.at)} {error.message}
												</li>
											))}
										</ul>
									) : null}
								</div>
							))}
						</div>
					)}
				</div>

				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						Blocks, newest first
					</p>
					{blocks.length === 0 ? (
						<p className="px-1 text-xs text-[var(--text-muted)]">None recorded yet.</p>
					) : (
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{blocks.map((block) => (
								<div key={`${block.at}-${block.profileId}`} className="grid gap-0.5 px-4 py-2.5 text-xs">
									<p className="font-semibold">
										{formatTime(block.at)} · {block.source}
									</p>
									<p className="font-mono text-[var(--text-muted)]">
										{block.profileId}
										{block.detail ? ` · ${block.detail}` : ""}
									</p>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
