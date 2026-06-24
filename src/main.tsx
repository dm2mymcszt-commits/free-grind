import React from "react";
import { createPortal } from "react-dom";
import ReactDOM from "react-dom/client";
import { Toaster, ToastBar } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/ibm-plex-sans/index.css";
import App from "./App";
import ManagerApp from "./ManagerApp";
import "./i18n";

import { initChatContactIndex } from "./services/chatContactIndex";
import { isTauri } from "@tauri-apps/api/core";
import { primeNotifications } from "./services/desktopNotify";
import { appLog } from "./utils/logger";
import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { DEFAULT_GC_TIME_MS } from "./config/ui-constants";
import { CrashBoundary } from "./components/CrashBoundary";
import { installGlobalCrashHandlers } from "./utils/crashOverlay";
import { getRuntimeContext } from "./services/runtimeContext";
import "./index.css";

installGlobalCrashHandlers();

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0, // Data is immediately considered stale (refetch on mount)
			gcTime: DEFAULT_GC_TIME_MS,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

void (async () => {
	const runtimeContext = await getRuntimeContext();
	const renderManager =
		runtimeContext.mode === "manager" || runtimeContext.instanceLabel === "manager";

	if (!renderManager) {

		if (isTauri()) {
			void initChatContactIndex().catch((err) => {
				appLog.warn("[chat-index] failed to initialize:", err);
			});
			void primeNotifications().catch((err) => {
				appLog.warn("[notify] failed to prime notifications:", err);
			});
		}
	}

	ReactDOM.createRoot(document.getElementById("app")!).render(
		<React.StrictMode>
			<CrashBoundary>
				<QueryClientProvider client={queryClient}>
					<BrowserRouter>
						{renderManager ? (
							<ManagerApp currentLabel={runtimeContext.instanceLabel} />
						) : (
							<App />
						)}
						{createPortal(
							<Toaster
								position="top-center"
								containerStyle={{
									// Offset the toast container to avoid overlapping with the device status bar or notch.
									// We use a larger offset to ensure visibility even if env() is not populated.
									top: "calc(env(safe-area-inset-top, 0px) + 54px)",
								}}
								toastOptions={{
									duration: 4000,
									success: {
										icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
									},
									error: {
										icon: <AlertCircle className="w-5 h-5 text-red-500" />,
									},
									loading: {
										icon: (
											<Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
										),
									},
									blank: {
										icon: <Info className="w-5 h-5 text-blue-500" />,
									},
								}}
							>
								{(t) => (
									<ToastBar
										toast={t}
										style={{
											...t.style,
											backgroundColor: "rgba(15, 17, 21, 0.25)",
											background: "color-mix(in srgb, var(--surface) 25%, transparent)",
											backdropFilter: "blur(20px)",
											WebkitBackdropFilter: "blur(20px)",
											color: "var(--text)",
											border: "1px solid rgba(255, 255, 255, 0.1)",
											borderRadius: "9999px",
											padding: "12px 20px",
											boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.45)",
										}}
									>
										{({ icon, message }) => (
											<>
												{icon && (
													<div
														style={{
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															marginRight: "10px",
															filter: `drop-shadow(0 0 6px ${
																t.type === "success"
																	? "rgba(34, 197, 94, 0.65)"
																	: t.type === "error"
																	? "rgba(239, 68, 68, 0.65)"
																	: t.type === "loading"
																	? "rgba(255, 204, 1, 0.65)"
																	: "rgba(59, 130, 246, 0.65)"
															})`,
														}}
													>
														{icon}
													</div>
												)}
												{message}
											</>
										)}
									</ToastBar>
								)}
							</Toaster>,
							document.body
						)}
					</BrowserRouter>
				</QueryClientProvider>
			</CrashBoundary>
		</React.StrictMode>,
	);
})();
