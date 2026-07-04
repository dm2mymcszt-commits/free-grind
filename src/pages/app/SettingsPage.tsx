import { useNavigate } from "react-router-dom";
import {
    BadgeInfo,
    Bell,
    Bookmark,
    Bug,
    Check,
    ChevronLeft,
    ChevronRight,
    DatabaseBackup,
    Download,
    Images,
    Info,
    Loader2,
    LogOut,
    Palette,
    Radar,
    Shield,
    Workflow,
    Trash2,
    UserPlus,
    UserX,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/useAuth";
import { useApi } from "../../hooks/useApi";
import { usePreferences } from "../../contexts/PreferencesContext";
import { exportAllLogs } from "../../services/chatLog";
import { Button } from "../../components/ui/button";
import { FingerprintCheckButton } from "../../components/FingerprintCheckButton";
import { Avatar } from "../../components/ui/avatar";
import { getThumbImageUrl } from "../../utils/media";
import { getSavedAccountProfile, removeSavedAccountProfile } from "../../services/savedAccountProfiles";

const PUSH_TOKEN_STORAGE_KEY = "fg-fcm-token";
const PUSH_TOKEN_SYNCED_STORAGE_KEY = "fg-fcm-token-synced";

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        // ignore
    }
    return fallback;
}

export function SettingsPage() {
    const { t } = useTranslation();
    const { userId, logout, savedAccounts, switchAccount, removeSavedAccount } = useAuth();
    const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
    const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const navigate = useNavigate();
    const { callMethod, asAppError } = useApi();
    const { developerMode, showDebugInfo, setPreferences } = usePreferences();

    // --- States ---
    const [isExporting, setIsExporting] = useState(false);
    const [isSyncingFcm, setIsSyncingFcm] = useState(false);
    const [fcmToken, setFcmToken] = useState<string | null>(() => {
        const stored = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
        if (stored) return stored;
        const win = window as Window & { __FG_FCM_TOKEN?: string };
        return typeof win.__FG_FCM_TOKEN === "string" ? win.__FG_FCM_TOKEN : null;
    });
    const [fcmSyncedToken, setFcmSyncedToken] = useState<string | null>(() => window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY));
    const [fcmEventLog, setFcmEventLog] = useState<{ time: string; token: string }[]>([]);
    const [manualToken, setManualToken] = useState("");
    const fcmLogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onFcmToken = (event: Event) => {
            const token = (event as CustomEvent<{ token: string }>).detail?.token;
            if (typeof token !== "string") return;
            setFcmToken(token);
            setFcmSyncedToken(window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY));
            const time = new Date().toLocaleTimeString();
            setFcmEventLog((prev) => [...prev, { time, token }]);
            setTimeout(() => {
                fcmLogRef.current?.scrollTo({ top: fcmLogRef.current.scrollHeight, behavior: "smooth" });
            }, 50);
        };
        window.addEventListener("fg:fcm-token", onFcmToken as EventListener);
        return () => window.removeEventListener("fg:fcm-token", onFcmToken as EventListener);
    }, []);

    const handleForceSyncFcm = useCallback(async (overrideToken?: string) => {
        const tokenToSync = overrideToken ?? fcmToken;
        if (!tokenToSync) {
            toast.error("No FCM token to sync.");
            return;
        }
        setIsSyncingFcm(true);
        try {
            await callMethod("sync_push_token", { token: tokenToSync });
            window.localStorage.setItem(PUSH_TOKEN_SYNCED_STORAGE_KEY, tokenToSync);
            setFcmSyncedToken(tokenToSync);
            toast.success("FCM token synced to Grindr.");
        } catch (error) {
            const appError = asAppError(error);
            toast.error(appError?.prettyMessage ?? (error instanceof Error ? error.message : "Sync failed"));
        } finally {
            setIsSyncingFcm(false);
        }
    }, [fcmToken, callMethod, asAppError]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await logout();
            navigate("/auth/sign-in");
        } catch (error) {
            const message = getErrorMessage(error, "Failed to log out.");
            toast.error(message);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const handleSwitchAccount = async (profileId: string) => {
        setSwitchingProfileId(profileId);
        try {
            await switchAccount(profileId);
            navigate("/");
        } catch (error) {
            const message = getErrorMessage(error, "Failed to switch account.");
            toast.error(message);
        } finally {
            setSwitchingProfileId(null);
        }
    };

    const handleRemoveSavedAccount = async (profileId: string) => {
        setRemovingProfileId(profileId);
        try {
            await removeSavedAccount(profileId);
            removeSavedAccountProfile(profileId);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to remove saved account.");
            toast.error(message);
        } finally {
            setRemovingProfileId(null);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const data = await exportAllLogs();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `free-grind-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Chat export downloaded.");
        } catch (error) {
            const message = getErrorMessage(error, "Failed to export chat data.");
            toast.error(message);
        } finally {
            setIsExporting(false);
        }
    };



    const navRow = (
        onClick: (() => void) | null,
        icon: React.ReactNode,
        iconClass: string,
        label: string,
        desc: string,
        right?: React.ReactNode,
        disabled?: boolean,
    ) => {
        const inner = (
            <>
                <div className={`rounded-2xl p-2.5 shrink-0 ${iconClass}`}>
                    {icon}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{label}</p>
                    <p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">{desc}</p>
                </div>
                {right ?? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />}
            </>
        );
        const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"}`;
        return onClick ? (
            <button type="button" onClick={onClick} disabled={disabled} className={cls}>
                {inner}
            </button>
        ) : (
            <div className={cls}>{inner}</div>
        );
    };

    return (
        <section className="app-screen pb-32">
            <header className="mb-7">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    aria-label={t("settings.back_to_browse")}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Browse
                </button>
                <div className="flex items-center gap-2">
                    <h1 className="app-title">{t("settings.title")}</h1>
                    {developerMode ? (
                        <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-contrast)]">
                            Developer Mode
                        </span>
                    ) : null}
                </div>
                <p className="app-subtitle mt-1">{t("settings.subtitle")}</p>
            </header>

            <div className="grid gap-6">

                {/* Profile */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Profile</p>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        {navRow(
                            () => navigate("/settings/profile-editor"),
                            <BadgeInfo className="h-5 w-5" />,
                            "bg-blue-500/15 text-blue-400",
                            t("settings.profile_editor"),
                            t("settings.profile_editor_desc"),
                        )}
                        {navRow(
                            () => navigate("/settings/albums"),
                            <Images className="h-5 w-5" />,
                            "bg-pink-500/15 text-pink-400",
                            t("settings.my_albums"),
                            t("settings.my_albums_desc"),
                        )}
                        {navRow(
                            () => navigate("/settings/customizability"),
                            <Palette className="h-5 w-5" />,
                            "bg-violet-500/15 text-violet-400",
                            t("settings.customizability"),
                            t("settings.customizability_desc"),
                        )}
                    </div>
                </div>

                {/* Chat */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Chat</p>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        {navRow(
                            () => navigate("/settings/automation"),
                            <Workflow className="h-5 w-5" />,
                            "bg-amber-500/15 text-amber-400",
                            t("settings.automation"),
                            t("settings.automation_desc"),
                        )}
                        {navRow(
                            () => navigate("/settings/saved-phrases"),
                            <Bookmark className="h-5 w-5" />,
                            "bg-emerald-500/15 text-emerald-400",
                            t("settings.saved_phrases", { defaultValue: "Saved Phrases" }),
                            t("settings.saved_phrases_desc", { defaultValue: "Manage chat quick replies and import/export .txt" }),
                        )}
                        {navRow(
                            isExporting ? null : () => void handleExport(),
                            <Download className="h-5 w-5" />,
                            "bg-teal-500/15 text-teal-400",
                            t("settings.export_chat"),
                            t("settings.export_chat_desc"),
                            isExporting ? <span className="text-xs text-[var(--text-muted)]">{t("settings.exporting")}</span> : undefined,
                            isExporting,
                        )}
                    </div>
                </div>

                {/* Safety & Notifications */}
                <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Safety & Notifications</p>
                    <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                        {navRow(
                            () => navigate("/settings/blocked"),
                            <UserX className="h-5 w-5" />,
                            "bg-red-500/15 text-red-400",
                            t("settings.blocked_accounts"),
                            t("settings.blocked_accounts_desc"),
                        )}
                        {navRow(
                            () => navigate("/settings/privacy"),
                            <Shield className="h-5 w-5" />,
                            "bg-sky-500/15 text-sky-400",
                            t("settings.privacy", { defaultValue: "Privacy" }),
                            t("settings.privacy_desc", { defaultValue: "Manage read receipts and blocking behaviors." }),
                        )}
                        {navRow(
                            () => navigate("/settings/notifications"),
                            <Bell className="h-5 w-5" />,
                            "bg-amber-500/15 text-amber-400",
                            t("settings.notifications", { defaultValue: "Notifications" }),
                            t("settings.notifications_desc", { defaultValue: "Choose which events trigger native alerts." }),
                        )}
                    </div>
                </div>


                {/* Dev tools */}
                {developerMode ? (
                    <div>
                        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Developer</p>
                        <div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
                            <div className="flex w-full items-center gap-3 px-4 py-3.5">
                                <div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
                                    <Bug className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-snug">Show Debug Overlays</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Displays source (cache/network) info in the grid.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void setPreferences({ showDebugInfo: !showDebugInfo })}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${showDebugInfo ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${showDebugInfo ? "translate-x-5" : "translate-x-0"}`} />
                                </button>
                            </div>
                            {navRow(
                                () => navigate("/settings/api-inspector"),
                                <Radar className="h-5 w-5" />,
                                "bg-[var(--surface-2)] text-[var(--text-muted)]",
                                t("settings.api_inspector"),
                                t("settings.api_inspector_desc"),
                            )}
                            <div className="p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
                                        <Bell className="h-5 w-5" />
                                    </div>
                                    <div className="grid gap-3 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold">Push Token (FCM)</p>
                                            {fcmToken && (
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${fcmSyncedToken === fcmToken ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                                                    {fcmSyncedToken === fcmToken ? "✓ Synced" : "⚠ Not synced"}
                                                </span>
                                            )}
                                        </div>
                                        {fcmToken ? (
                                            <div className="grid gap-2">
                                                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                                                    <p className="text-xs text-[var(--text-muted)] mb-1">Token (tap to select)</p>
                                                    <p className="break-all font-mono text-xs select-all">{fcmToken}</p>
                                                </div>
                                                <Button type="button" size="sm" disabled={isSyncingFcm} onClick={() => void handleForceSyncFcm()} className="w-full justify-center">
                                                    {isSyncingFcm ? "Syncing..." : "Force re-sync"}
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-400">
                                                <p className="font-medium mb-0.5">No token received yet</p>
                                                <p className="text-xs opacity-80">Android delivers the FCM token via the <code>fg:fcm-token</code> event after Firebase initialises on launch.</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs font-medium text-[var(--text-muted)] mb-1">
                                                Live event log {fcmEventLog.length > 0 ? `(${fcmEventLog.length} received this session)` : "(waiting…)"}
                                            </p>
                                            <div ref={fcmLogRef} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 max-h-32 overflow-y-auto">
                                                {fcmEventLog.length === 0 ? (
                                                    <p className="font-mono text-xs text-[var(--text-muted)] italic">No fg:fcm-token events fired since this page opened</p>
                                                ) : (
                                                    fcmEventLog.map((entry, i) => (
                                                        <p key={i} className="font-mono text-xs break-all">
                                                            <span className="text-[var(--text-muted)]">[{entry.time}] </span>
                                                            {entry.token.slice(0, 20)}…{entry.token.slice(-8)}
                                                        </p>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <p className="text-xs font-medium text-[var(--text-muted)]">Manual token (paste to force-sync)</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={manualToken}
                                                    onChange={(e) => setManualToken(e.target.value)}
                                                    placeholder="Paste FCM token here…"
                                                    className="input-field min-w-0 flex-1 font-mono text-xs"
                                                />
                                                <Button type="button" size="sm" disabled={isSyncingFcm || !manualToken.trim()} onClick={() => void handleForceSyncFcm(manualToken.trim())}>
                                                    Sync
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 sm:p-5 border-t border-[var(--border)]">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
                                    <Radar className="h-5 w-5" />
                                </div>
                                <div className="grid gap-3 min-w-0 flex-1">
                                    <div>
                                        <p className="text-sm font-semibold">Fingerprint Check</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Verify your HTTP/TLS fingerprint matches OkHttp configuration.</p>
                                    </div>
                                    <FingerprintCheckButton />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

				{/* Data */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings.data_section", { defaultValue: "Data" })}
					</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/data"),
							<DatabaseBackup className="h-5 w-5" />,
							"bg-teal-500/15 text-teal-400",
							t("settings.data", { defaultValue: "Data" }),
							t("settings.data_desc", { defaultValue: "Downloaded media storage, and back up/restore your entire account" }),
						)}
					</div>
				</div>

				{/* About */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">About</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/about"),
							<Info className="h-5 w-5" />,
							"bg-slate-500/15 text-slate-400",
							t("settings.about"),
							t("settings.about_desc"),
						)}
					</div>
				</div>

				{/* Account switcher — saved accounts you can tap between without
				    re-entering a password. Each one keeps its own chat history
				    and caches fully separate (see chatDb.ts/cache.ts), so
				    switching never shows a leftover account's data. */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings.account_section", { defaultValue: "Account" })}
					</p>
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						{savedAccounts.map((account) => {
							const isActive = userId != null && String(userId) === account.profileId;
							const isSwitching = switchingProfileId === account.profileId;
							const isRemoving = removingProfileId === account.profileId;
							const savedProfile = getSavedAccountProfile(account.profileId);
							return (
								<div key={account.profileId} className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => void handleSwitchAccount(account.profileId)}
										disabled={isActive || isSwitching || isRemoving}
										className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:cursor-not-allowed"
									>
										<div className="relative h-10 w-10 shrink-0">
											<Avatar
												src={savedProfile.photoHash ? getThumbImageUrl(savedProfile.photoHash, "75x75") : null}
												alt=""
												fallback={savedProfile.displayName ?? undefined}
												className="h-full w-full rounded-2xl border-0"
											/>
											{isSwitching && (
												<div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface)]/80">
													<Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
												</div>
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold leading-snug">
												{savedProfile.displayName || account.email || account.profileId}
											</p>
											<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
												{isActive
													? t("settings.account_active", { defaultValue: "Currently active" })
													: t("settings.account_tap_to_switch", { defaultValue: "Tap to switch" })}
											</p>
										</div>
										{isActive && (
											<div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] py-1 pl-1.5 pr-2.5 text-xs font-bold text-white shadow-sm">
												<Check className="h-3.5 w-3.5 shrink-0" />
												{t("browse_location.badge_active", { defaultValue: "Active" })}
											</div>
										)}
									</button>
									{isActive ? (
										<button
											type="button"
											onClick={() => void handleLogout()}
											disabled={isLoggingOut}
											aria-label={t("settings.logout")}
											className="mr-2 shrink-0 rounded-xl p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
										>
											{isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
										</button>
									) : (
										<button
											type="button"
											onClick={() => void handleRemoveSavedAccount(account.profileId)}
											disabled={isSwitching || isRemoving}
											aria-label={t("settings.account_remove", { defaultValue: "Remove saved account" })}
											className="mr-2 shrink-0 rounded-xl p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
										>
											{isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
										</button>
									)}
								</div>
							);
						})}
						<button
							type="button"
							onClick={() => navigate("/auth/sign-in?mode=add-profile")}
							className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
						>
							<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
								<UserPlus className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("settings.add_account", { defaultValue: "Add account" })}
								</p>
								<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
									{t("settings.add_account_desc", { defaultValue: "Sign in with another account" })}
								</p>
							</div>
							<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
						</button>
						{/* Fallback while savedAccounts is still loading (briefly empty
						    right after mount) — never leaves the user without any way
						    to log out. */}
						{savedAccounts.length === 0 && (
							<button
								type="button"
								onClick={() => void handleLogout()}
								disabled={isLoggingOut}
								className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:opacity-60"
							>
								<div className="rounded-2xl bg-red-500/15 p-2.5 shrink-0 text-red-400">
									{isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-semibold leading-snug">{t("settings.logout")}</p>
									<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
										{t("profile_editor.logout_description", { defaultValue: "You will be signed out of your account on this device." })}
									</p>
								</div>
							</button>
						)}
					</div>
				</div>

            </div>
        </section>
    );
}