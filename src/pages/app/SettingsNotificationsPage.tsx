import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Zap, ShieldAlert } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import { ToggleRow } from "../../components/ui/toggle-row";

export function SettingsNotificationsPage() {
	const { t } = useTranslation();

	const [notifyChats, setNotifyChats] = useState(() => {
		const stored = window.localStorage.getItem("fg-notify-chats");
		return stored !== "false"; // Default to true
	});

	const [notifyTaps, setNotifyTaps] = useState(() => {
		const stored = window.localStorage.getItem("fg-notify-taps");
		return stored !== "false"; // Default to true
	});

	const [notifyAutoBlock, setNotifyAutoBlock] = useState(() => {
		const stored = window.localStorage.getItem("fg-notify-autoblock");
		return stored !== "false"; // Default to true
	});

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings.notifications", { defaultValue: "Notifications" })}</h1>
				<p className="app-subtitle">
					{t("settings.notifications_desc", { defaultValue: "Choose which events trigger native system notifications." })}
				</p>
			</header>

			<div className="grid gap-6">
				{/* Notification Categories */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("notifications.categories", { defaultValue: "Categories" })}
					</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<ToggleRow
							icon={<MessageSquare className="h-5 w-5" />}
							iconClass="bg-blue-500/15 text-blue-400"
							label={t("notifications.chats", { defaultValue: "Chat Messages" })}
							description={t("notifications.chats_desc", { defaultValue: "Receive alerts for incoming messages, albums, and media." })}
							checked={notifyChats}
							onChange={(checked) => {
								setNotifyChats(checked);
								window.localStorage.setItem("fg-notify-chats", String(checked));
							}}
						/>
						<ToggleRow
							icon={<Zap className="h-5 w-5" />}
							iconClass="bg-amber-500/15 text-amber-400"
							label={t("notifications.taps", { defaultValue: "Taps" })}
							description={t("notifications.taps_desc", { defaultValue: "Receive alerts when someone taps you." })}
							checked={notifyTaps}
							onChange={(checked) => {
								setNotifyTaps(checked);
								window.localStorage.setItem("fg-notify-taps", String(checked));
							}}
						/>
						<ToggleRow
							icon={<ShieldAlert className="h-5 w-5" />}
							iconClass="bg-red-500/15 text-red-400"
							label={t("notifications.autoblock", { defaultValue: "Auto-Block Alerts" })}
							description={t("notifications.autoblock_desc", { defaultValue: "Receive alerts when profiles are automatically blocked." })}
							checked={notifyAutoBlock}
							onChange={(checked) => {
								setNotifyAutoBlock(checked);
								window.localStorage.setItem("fg-notify-autoblock", String(checked));
							}}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
