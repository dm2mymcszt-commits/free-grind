import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Ghost, ImageOff, ScanSearch } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";
import { usePreferences } from "../../contexts/PreferencesContext";


export function SettingsPrivacyPage() {
	const { t } = useTranslation();
	const { blurIncomingMedia, setPreferences } = usePreferences();

	const [ghostMode, setGhostMode] = useState(() => window.localStorage.getItem("fg-ghost-mode") === "true");
	const [showGhostButton, setShowGhostButton] = useState(() => window.localStorage.getItem("fg-show-ghost-btn") !== "false");

	const [imageScannerEnabled, setImageScannerEnabled] = useState(() => window.localStorage.getItem("fg-image-scanner-enabled") === "true");
	const [blurOutgoingMedia, setBlurOutgoingMedia] = useState(() => window.localStorage.getItem("fg-blur-outgoing-media") === "true");

	return (
		<section className="app-screen pb-32">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.privacy")}</h1>
				<p className="app-subtitle">{t("settings.privacy_desc")}</p>
			</header>

			<div className="grid gap-6">

				{/* Security */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Security</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<ScanSearch className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label="Media Scanner"
							description="Adds a Scanner Hub to the photo viewer to instantly reverse-search images using Google Lens."
							checked={imageScannerEnabled}
							onChange={(checked) => {
								setImageScannerEnabled(checked);
								window.localStorage.setItem("fg-image-scanner-enabled", String(checked));
							}}
						/>
					</div>
				</div>

				{/* Ghost Mode */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.ghost_mode")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<Ghost className="h-5 w-5" />}
							iconClass="bg-indigo-500/15 text-indigo-400"
							label={t("privacy.global_ghost_mode")}
							description={t("privacy.global_ghost_mode_desc")}
							checked={ghostMode}
							onChange={(checked) => {
								setGhostMode(checked);
								window.localStorage.setItem("fg-ghost-mode", String(checked));
							}}
						/>
						<ToggleRow
							icon={<Eye className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label={t("privacy.per_chat_overrides")}
							description={t("privacy.per_chat_overrides_desc")}
							checked={showGhostButton}
							onChange={(checked) => {
								setShowGhostButton(checked);
								window.localStorage.setItem("fg-show-ghost-btn", String(checked));
							}}
						/>
					</div>
				</div>

				{/* NSFW Content */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{t("privacy.nsfw_content")}</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-sky-500/15 text-sky-400"
							label={t("customizability.blur_incoming_media", { defaultValue: "Blur Incoming Media" })}
							description={t("customizability.blur_incoming_media_description", { defaultValue: "Blur received photos until tapped to protect against NSFW surprises." })}
							checked={blurIncomingMedia}
							onChange={(checked) => void setPreferences({ blurIncomingMedia: checked })}
						/>
						<ToggleRow
							icon={<ImageOff className="h-5 w-5" />}
							iconClass="bg-pink-500/15 text-pink-400"
							label="Blur Outgoing Media"
							description="Blur images you send to prevent people nearby from seeing your screen."
							checked={blurOutgoingMedia}
							onChange={(checked) => {
								setBlurOutgoingMedia(checked);
								window.localStorage.setItem("fg-blur-outgoing-media", String(checked));
							}}
						/>
					</div>
				</div>


			</div>
		</section>
	);
}
