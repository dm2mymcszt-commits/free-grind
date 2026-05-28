import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldBan, ChevronLeft, Save, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";

export function SettingsAutoBlockPage() {
	const navigate = useNavigate();

	const [blockName, setBlockName] = useState(() => window.localStorage.getItem("fg-block-name") !== "false");
	const [blockBio, setBlockBio] = useState(() => window.localStorage.getItem("fg-block-bio") !== "false");
	const [blockMessage, setBlockMessage] = useState(() => window.localStorage.getItem("fg-block-message") !== "false");
    const [blockFirstMedia, setBlockFirstMedia] = useState(() => window.localStorage.getItem("fg-block-first-media") === "true");
	
	const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
	const [minAge, setMinAge] = useState(() => window.localStorage.getItem("fg-block-min-age") || "");
	const [maxAge, setMaxAge] = useState(() => window.localStorage.getItem("fg-block-max-age") || "");
	const [maxDistance, setMaxDistance] = useState(() => window.localStorage.getItem("fg-block-max-distance") || "");

	const handleSave = () => {
		window.localStorage.setItem("fg-block-name", String(blockName));
		window.localStorage.setItem("fg-block-bio", String(blockBio));
		window.localStorage.setItem("fg-block-message", String(blockMessage));
		window.localStorage.setItem("fg-forbidden-words", forbiddenWords);
		window.localStorage.setItem("fg-block-min-age", minAge);
		window.localStorage.setItem("fg-block-max-age", maxAge);
		window.localStorage.setItem("fg-block-max-distance", maxDistance);
        window.localStorage.setItem("fg-block-first-media", String(blockFirstMedia));
		toast.success("Auto-Block settings saved!");
	};

	const handleExport = () => {
		const blob = new Blob([forbiddenWords], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "free-grind-keywords.txt";
		a.click();
		URL.revokeObjectURL(url);
		toast.success("Keywords exported!");
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			setForbiddenWords(text);
			toast.success("Keywords imported! Make sure to click Save below.");
		};
		reader.readAsText(file);
	};

	return (
		<section className="app-screen">
			<header className="mb-6 flex items-center gap-4">
				<button
					type="button"
					onClick={() => navigate("/settings")}
					className="rounded-full bg-[var(--surface-2)] p-2 transition-transform hover:-translate-y-0.5"
				>
					<ChevronLeft className="h-5 w-5" />
				</button>
				<div>
					<h1 className="app-title flex items-center gap-2">
						<ShieldBan className="h-6 w-6 text-red-400" />
						Auto-Block Features
					</h1>
					<p className="app-subtitle">Configure automated blocking rules.</p>
				</div>
			</header>

			<div className="grid gap-6">
				{/* Toggles */}
				<div className="surface-card p-4 sm:p-5">
					<h2 className="text-base font-semibold mb-3">Where to check for keywords?</h2>
					<div className="flex flex-col gap-3">
						<label className="flex items-center gap-3 text-sm cursor-pointer">
							<input type="checkbox" checked={blockName} onChange={(e) => setBlockName(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
							Profile Names
						</label>
						<label className="flex items-center gap-3 text-sm cursor-pointer">
							<input type="checkbox" checked={blockBio} onChange={(e) => setBlockBio(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
							Profile Bios (About Me)
						</label>
						<label className="flex items-center gap-3 text-sm cursor-pointer">
							<input type="checkbox" checked={blockMessage} onChange={(e) => setBlockMessage(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
							Incoming Chat Messages
						</label>
                        <div className="mt-2 border-t border-[var(--border)] pt-3">
							<p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">Bot Evasion</p>
							<label className="flex items-start gap-3 text-sm cursor-pointer">
								<input type="checkbox" checked={blockFirstMedia} onChange={(e) => setBlockFirstMedia(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500 shrink-0" />
								<span>
									<span className="block font-medium">Block if first message is Media/Album</span>
									<span className="text-xs text-[var(--text-muted)] block mt-0.5">Catches bots that put spam text inside pictures. (Note: This will also block real people if they open with a picture and no text).</span>
								</span>
							</label>
						</div>
					</div>
				</div>

				{/* Keywords */}
				<div className="surface-card p-4 sm:p-5">
					<h2 className="text-base font-semibold mb-1">Forbidden Keywords</h2>
					<p className="text-sm text-[var(--text-muted)] mb-3">
						Block profiles/chats containing exact words or phrases. Separate with commas.
					</p>
					<textarea
						value={forbiddenWords}
						onChange={(e) => setForbiddenWords(e.target.value)}
						placeholder="snapchat, bot, telegram, send feet pics..."
						className="w-full min-h-[100px] rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
					/>
					<div className="flex gap-2 mt-3">
						<button type="button" onClick={handleExport} className="flex-1 flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-9 transition hover:border-[var(--accent)]">
							<Download className="mr-2 h-4 w-4" /> Export (.txt)
						</button>
						<label className="flex-1 flex items-center justify-center cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs h-9 transition hover:border-[var(--accent)]">
							<Upload className="mr-2 h-4 w-4" /> Import (.txt)
							<input type="file" accept=".txt" onChange={handleImport} className="hidden" />
						</label>
					</div>
				</div>

				{/* Number Filters */}
				<div className="surface-card p-4 sm:p-5">
					<h2 className="text-base font-semibold mb-1">Age & Distance Limits</h2>
					<p className="text-sm text-[var(--text-muted)] mb-3">
						Block anyone outside of this range. Leave blank to ignore.
					</p>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="text-xs text-[var(--text-muted)]">Minimum Age</label>
							<input type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="18" className="w-full rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
						</div>
						<div>
							<label className="text-xs text-[var(--text-muted)]">Maximum Age</label>
							<input type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="99" className="w-full rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
						</div>
						<div className="col-span-2">
							<label className="text-xs text-[var(--text-muted)]">Maximum Distance (Kilometers)</label>
							<input type="number" value={maxDistance} onChange={(e) => setMaxDistance(e.target.value)} placeholder="e.g. 50" className="w-full rounded-md border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
						</div>
					</div>
				</div>

				<Button type="button" onClick={handleSave} className="w-full py-4 text-base font-bold">
					<Save className="h-5 w-5 mr-2" />
					Save Auto-Block Settings
				</Button>
			</div>
		</section>
	);
}