import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Triangle } from "lucide-react";
import {
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import z from "zod";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useManagedGenders, useManagedPronouns, useBlockedProfileIds, useBlockProfile, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import { usePreferences } from "../../contexts/PreferencesContext";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
import { validateMediaHash } from "../../utils/media";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import { useTapProfile } from "./gridpage/hooks/useTapProfile";
import {
    getCachedProfileDetail,
    setCachedProfileDetail,
} from "./gridpage/cache";
import {
    type ProfileDetail,
} from "./GridPage.types";
import { getChatContactIndexForProfiles } from "../../services/chatContactIndex";
import type { ChatContactIndexRecord } from "../../types/chat-contact-index";
import { appLog } from "../../utils/logger";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
const SKIP_UNBLOCK_CONFIRM_KEY = "profile_skip_unblock_confirm";

let globalIsLocating = false;
const LOCATE_STATE_EVENT = "fg-locate-state-change";

const profileRouteParamsSchema = z.object({
    profileId: z.string().min(1),
});

export function GridProfilePage() {
    const { t } = useTranslation();
    const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const apiFunctions = useApiFunctions();
    const { geohash } = usePreferences();

    const { data: managedGenders } = useManagedGenders();
    const { data: managedPronouns } = useManagedPronouns();
    const { data: blockedProfileIdsData } = useBlockedProfileIds();
    const { mutateAsync: blockProfileMutation, isPending: isBlockingProfile } = useBlockProfile();
    const { mutateAsync: unblockProfileMutation, isPending: isUnblockingProfile } = useUnblockProfile();

    const blockedProfileIds = useMemo(() => new Set(blockedProfileIdsData ?? []), [blockedProfileIdsData]);

    const genderOptions = useMemo(() => {
        return managedGenders?.map((item) => ({
            value: item.genderId,
            label: item.gender,
        })) ?? [];
    }, [managedGenders]);

    const pronounOptions = useMemo(() => {
        return managedPronouns?.map((item) => ({
            value: item.pronounId,
            label: item.pronoun,
        })) ?? [];
    }, [managedPronouns]);

    const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
        null,
    );
    const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(true);
    const [activeProfileError, setActiveProfileError] = useState<string | null>(
        null,
    );
    const [isLocatingProfile, setIsLocatingProfile] = useState(globalIsLocating);
    const [chatContactStatus, setChatContactStatus] = useState<ChatContactIndexRecord | null>(null);

    useEffect(() => {
        const handleLocateChange = () => setIsLocatingProfile(globalIsLocating);
        window.addEventListener(LOCATE_STATE_EVENT, handleLocateChange);
        return () => window.removeEventListener(LOCATE_STATE_EVENT, handleLocateChange);
    }, []);

    const [mutatingFavoriteProfileId, setMutatingFavoriteProfileId] = useState<string | null>(
        null,
    );
    const [pendingProfileConfirm, setPendingProfileConfirm] = useState<{
        action: "block" | "unblock";
        profileId: string;
    } | null>(null);
    const [dontAskAgainChecked, setDontAskAgainChecked] = useState(false);
    const [skipBlockConfirm, setSkipBlockConfirm] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
    });
    const [skipUnblockConfirm, setSkipUnblockConfirm] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return localStorage.getItem(SKIP_UNBLOCK_CONFIRM_KEY) === "true";
    });

	const isDesktopLike = useDesktopBreakpoint();

    // --- CUSTOM DIALOGS STATE ---
    const [isLocateConfirmOpen, setIsLocateConfirmOpen] = useState(false);
    const [selectedRounds, setSelectedRounds] = useState(15);
    const [locateTargetProfileId, setLocateTargetProfileId] = useState<string | null>(null);
    const [isMapsConfirmOpen, setIsMapsConfirmOpen] = useState(false);
    const [finalCoordinates, setFinalCoordinates] = useState<{ lat: number; lon: number } | null>(null);
    
    // Trilateration Real-Time Progress States
    const [locateProgress, setLocateProgress] = useState(0);
    const [locateStatus, setLocateStatus] = useState("");
    const [locateLogs, setLocateLogs] = useState<string[]>([]);
    const isLocateCancelledRef = useRef(false);
    const terminalRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [locateLogs]);

    const parsedParams = profileRouteParamsSchema.safeParse(params);
    const profileId = parsedParams.success ? parsedParams.data.profileId : null;

    useEffect(() => {
        if (!profileId) {
            setChatContactStatus(null);
            return;
        }

        setChatContactStatus(null);
        let cancelled = false;
        void getChatContactIndexForProfiles([profileId])
            .then((records) => {
                if (cancelled) {
                    return;
                }
                setChatContactStatus(records[0] ?? null);
            })
            .catch((error) => {
                if (!cancelled) {
                    setChatContactStatus(null);
                }
                appLog.warn("[chat-index] failed to hydrate profile chat metadata", error);
            });

        return () => {
            cancelled = true;
        };
    }, [profileId]);

    const {
        tappingProfileId,
        resolvedTapVisualState,
        hasSentTapRecently,
        handleTapProfile,
    } = useTapProfile({
        activeProfile,
        setActiveProfile,
        activeProfileId: profileId,
        tap: apiFunctions.tap,
        TAP_WINDOW_MS,
    });

    const isTappingProfile = tappingProfileId === profileId;

    const locationState = (location.state as { returnTo?: unknown; profileIds?: unknown } | null) ?? {};
    const returnToFromState =
        typeof locationState.returnTo === "string" ? locationState.returnTo : null;
    const profileIds: string[] = Array.isArray(locationState.profileIds)
        ? (locationState.profileIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
    const returnToFromQuery = searchParams.get("returnTo");
    const returnTo = returnToFromState ?? returnToFromQuery;
    const safeReturnTo =
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
            ? returnTo
            : "/browse";

    const currentIndex = profileId ? profileIds.indexOf(profileId) : -1;
    const prevProfileId = currentIndex > 0 ? profileIds[currentIndex - 1] : null;
    const nextProfileId = currentIndex >= 0 && currentIndex < profileIds.length - 1 ? profileIds[currentIndex + 1] : null;

    const handlePrevProfile = prevProfileId
        ? () => navigate(`/profile/${prevProfileId}`, { replace: true, state: { returnTo: safeReturnTo, profileIds } })
        : undefined;
    const handleNextProfile = nextProfileId
        ? () => navigate(`/profile/${nextProfileId}`, { replace: true, state: { returnTo: safeReturnTo, profileIds } })
        : undefined;

    useEffect(() => {
        if (!profileId) {
            setActiveProfile(null);
            setActiveProfileError(t("api.errors.invalid_profile_id"));
            setIsLoadingActiveProfile(false);
            return;
        }

        let cancelled = false;

        const loadProfileDetails = async () => {
            const cachedProfile = getCachedProfileDetail(profileId);

            if (cachedProfile) {
                setActiveProfile(cachedProfile);
                setIsLoadingActiveProfile(false);
            } else {
                setIsLoadingActiveProfile(true);
            }

            setActiveProfileError(null);

            try {
                const parsed = await apiFunctions.getProfileDetail(profileId || "");

                if (!cancelled) {
                    setActiveProfile(parsed);
                    setCachedProfileDetail(profileId, parsed);
                }
            } catch (error) {
                if (!cancelled) {
                    if (!cachedProfile) {
                        setActiveProfile(null);
                        setActiveProfileError(
                            error instanceof Error
                                ? error.message
                                : t("browse_page.errors.load_profile_details"),
                        );
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingActiveProfile(false);
                }
            }
        };

        void loadProfileDetails();

        return () => {
            cancelled = true;
        };
    }, [apiFunctions, profileId]);

    const activeProfilePhotoHashes = useMemo(() => {
        if (!activeProfile) {
            return [];
        }

        const fromList = activeProfile.medias
            .map((item) => item.mediaHash ?? "")
            .filter((hash): hash is string => validateMediaHash(hash));

        const hashes = [...fromList];

        if (
            activeProfile.profileImageMediaHash &&
            validateMediaHash(activeProfile.profileImageMediaHash) &&
            !hashes.includes(activeProfile.profileImageMediaHash)
        ) {
            hashes.unshift(activeProfile.profileImageMediaHash);
        }

        return hashes;
    }, [activeProfile]);

	const handleSendQuickMessage = async (targetProfileId: string, text: string) => {
		try {
			await apiFunctions.sendText({ targetProfileId: Number(targetProfileId), text });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
		}
	};

    const handleMessageProfile = (targetProfileId: string) => {
        const nextParams = new URLSearchParams();
        nextParams.set("targetProfileId", targetProfileId);
        nextParams.set("returnTo", safeReturnTo);
        navigate(`/chat?${nextParams.toString()}`);
    };

    const performBlockProfile = async (targetProfileId: string) => {
        try {
            await blockProfileMutation(targetProfileId);
            toast.success(t("profile_details.block_success"));
            navigate(safeReturnTo, { replace: true });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : t("profile_details.block_failed"),
            );
        }
    };

    const performUnblockProfile = async (targetProfileId: string) => {
        try {
            await unblockProfileMutation(targetProfileId);
            toast.success(t("profile_details.unblock_success"));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t("profile_details.unblock_failed"),
            );
        }
    };

    const handleBlockProfile = async (targetProfileId: string) => {
        if (isBlockingProfile || isUnblockingProfile) {
            return;
        }
        if (skipBlockConfirm) {
            await performBlockProfile(targetProfileId);
            return;
        }
        setDontAskAgainChecked(false);
        setPendingProfileConfirm({ action: "block", profileId: targetProfileId });
    };

    const handleUnblockProfile = async (targetProfileId: string) => {
        if (isBlockingProfile || isUnblockingProfile) {
            return;
        }
        if (skipUnblockConfirm) {
            await performUnblockProfile(targetProfileId);
            return;
        }
        setDontAskAgainChecked(false);
        setPendingProfileConfirm({ action: "unblock", profileId: targetProfileId });
    };

    const handleToggleFavoriteProfile = async (
        targetProfileId: string,
        currentlyFavorite: boolean,
    ) => {
        if (mutatingFavoriteProfileId) {
            return;
        }

        setMutatingFavoriteProfileId(targetProfileId);
        try {
            if (currentlyFavorite) {
                await apiFunctions.removeFavorite(targetProfileId);
            } else {
                await apiFunctions.addFavorite(targetProfileId);
            }

            setActiveProfile((previous) => {
                if (!previous || previous.profileId !== targetProfileId) {
                    return previous;
                }
                return {
                    ...previous,
                    isFavorite: !currentlyFavorite,
                };
            });

            toast.success(
                currentlyFavorite ? t("favorites.removed") : t("favorites.added"),
            );
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : currentlyFavorite
                        ? t("favorites.remove_failed")
                        : t("favorites.add_failed"),
            );
        } finally {
            setMutatingFavoriteProfileId(null);
        }
    };

    const handleCancelProfileConfirm = () => {
        if (isBlockingProfile || isUnblockingProfile) {
            return;
        }
        setPendingProfileConfirm(null);
    };

    const handleConfirmProfileAction = async () => {
        if (!pendingProfileConfirm || isBlockingProfile || isUnblockingProfile) {
            return;
        }

        const { action, profileId: confirmProfileId } = pendingProfileConfirm;
        if (dontAskAgainChecked && typeof window !== "undefined") {
            if (action === "block") {
                localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
                setSkipBlockConfirm(true);
            } else {
                localStorage.setItem(SKIP_UNBLOCK_CONFIRM_KEY, "true");
                setSkipUnblockConfirm(true);
            }
        }

        setPendingProfileConfirm(null);
        if (action === "block") {
            await performBlockProfile(confirmProfileId);
            return;
        }
        await performUnblockProfile(confirmProfileId);
    };

    const solveTrilateration = (points: { lat: number, lon: number, dist: number }[]) => {
        const p1 = points[0];
        const p2 = points[1];
        const p3 = points[2];

        const latToM = 111320;
        const lonToM = 111320 * Math.cos(p1.lat * (Math.PI / 180));

        const x2 = (p2.lon - p1.lon) * lonToM;
        const y2 = (p2.lat - p1.lat) * latToM;
        const x3 = (p3.lon - p1.lon) * lonToM;
        const y3 = (p3.lat - p1.lat) * latToM;

        const r1 = p1.dist;
        const r2 = p2.dist;
        const r3 = p3.dist;

        const A = 2 * x2;
        const B = 2 * y2;
        const C = Math.pow(r1, 2) - Math.pow(r2, 2) + Math.pow(x2, 2) + Math.pow(y2, 2);
        const D = 2 * x3;
        const E = 2 * y3;
        const F = Math.pow(r1, 2) - Math.pow(r3, 2) + Math.pow(x3, 2) + Math.pow(y3, 2);

        const denom = A * E - D * B;
        if (Math.abs(denom) < 1e-10) {
            throw new Error("Trilateration failed: measurement points are collinear or too close together. Try again with a larger initial offset.");
        }
        const x = (C * E - F * B) / denom;
        const y = (A * F - D * C) / denom;

        return {
            lat: p1.lat + (y / latToM),
            lon: p1.lon + (x / lonToM)
        };
    };

    const getDistanceFromProfile = async (targetId: string): Promise<number | null> => {
        try {
            const profile = await apiFunctions.getProfileDetail(targetId);
            return typeof profile.distance === "number" && Number.isFinite(profile.distance)
                ? profile.distance
                : null;
        } catch {
            return null;
        }
    };

    const handleTriangleProfile = async (targetProfileId: string) => {
        if (!geohash) {
            toast.error(t("browse_page.errors.location_required"));
            return;
        }

        if (isLocatingProfile) {
            return;
        }

        const initialDist = await getDistanceFromProfile(targetProfileId);
        if (initialDist === null) {
            toast.error(t("profile_details.cannot_locate_hidden", { defaultValue: "Cannot locate because user has location hidden" }));
            return;
        }

        setLocateTargetProfileId(targetProfileId);
        setIsLocateConfirmOpen(true);
    };

    const runTrilateration = async () => {
        const target = locateTargetProfileId || "";
        const currentGeohash = geohash || "";
        if (!target || !currentGeohash) return;

        // Intentionally keep modal open to show the Progress Bar
        globalIsLocating = true;
        isLocateCancelledRef.current = false;
        setLocateProgress(0);
        setLocateStatus("Initializing coordinate spoofer...");
        window.dispatchEvent(new Event(LOCATE_STATE_EVENT));

        const processLog: string[] = [];
        setLocateLogs([]);
        const appendLog = (line: string) => {
            processLog.push(line);
            setLocateLogs((prev) => [...prev, line]);
        };

        appendLog(`=== FREE GRIND TRILATERATION LOG ===`);
        appendLog(`Target Profile: ${target}`);
        appendLog(`Started at: ${new Date().toLocaleString()}`);
        appendLog(`====================================`);

        let originalLat: number;
        let originalLon: number;

        try {
            const decoded = decodeGeohash(currentGeohash);
            originalLat = (decoded.lat[0] + decoded.lat[1]) / 2;
            originalLon = (decoded.lon[0] + decoded.lon[1]) / 2;
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t("browse_page.errors.location_read_failed"),
            );
            globalIsLocating = false;
            setIsLocateConfirmOpen(false);
            setLocateProgress(0);
            setLocateStatus("");
            window.dispatchEvent(new Event(LOCATE_STATE_EVENT));
            return;
        }

        const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        const putServerLocation = async (lat: number, lon: number, targetGeohash: string) => {
            const payloads = [
                { lat, lon },
                { latitude: lat, longitude: lon },
                { geohash: targetGeohash },
                { nearbyGeoHash: targetGeohash },
            ];

            let lastErr = null;
            for (const payload of payloads) {
                    try {
                        const response = await apiFunctions.request("/v4/location", {
                            method: "PUT",
                            body: payload,
                        });
                        if (response && (response as any).error) throw new Error((response as any).error);
                        return;
                    } catch (e) {
                    lastErr = e;
                    continue;
                }
            }
            throw new Error(lastErr instanceof Error ? lastErr.message : "Failed to update server location across all payload types.");
        };

        try {
            const initialDist = await getDistanceFromProfile(target);
            if (initialDist === null) {
                toast.error(t("profile_details.location_finder_error_distance"));
                return;
            }

            let currentLat = originalLat;
            let currentLon = originalLon;
            let rounds = selectedRounds;
            let offset = (initialDist * 1.1) / 111320;

            toast.success(`Locating... Initial dist: ${Math.round(initialDist)}m. Rounds: ${rounds}`);
            appendLog(`[INIT] Initial Distance: ${Math.round(initialDist)}m | Selected Rounds: ${rounds}`);

            for (let i = 0; i < rounds; i++) {
                if (isLocateCancelledRef.current) throw new Error("Trilateration aborted by user.");

                setLocateProgress(Math.round((i / rounds) * 100));
                setLocateStatus(`Round ${i + 1} of ${rounds}: Spoofing location...`);

                const points = [
                    { lat: currentLat + offset, lon: currentLon },
                    { lat: currentLat - (offset / 2), lon: currentLon + (offset * 0.866) },
                    { lat: currentLat - (offset / 2), lon: currentLon - (offset * 0.866) },
                ];

                const results: { lat: number, lon: number, dist: number }[] = [];

                for (const p of points) {
                    if (isLocateCancelledRef.current) throw new Error("Trilateration aborted by user.");
                    await putServerLocation(p.lat, p.lon, encodeGeohash(p.lat, p.lon));
                    await waitMs(4000);
                    if (isLocateCancelledRef.current) throw new Error("Trilateration aborted by user.");
                    const d = await getDistanceFromProfile(target);
                    if (d !== null) results.push({ lat: p.lat, lon: p.lon, dist: d });
                }

                if (results.length === 3) {
                    const estimate = solveTrilateration(results);
                    currentLat = estimate.lat;
                    currentLon = estimate.lon;
                    
                    let radiusMeters = offset * 111320;
                    let zoom = 2.0;
                    if (radiusMeters < 80) {
                        zoom = 1.02; 
                    } else if (radiusMeters < 200) {
                        zoom = 1.05; 
                    } else if (radiusMeters < 400) {
                        zoom = 1.15;
                    } else if (radiusMeters < 1000) {
                        zoom = 1.3;
                    } else if (radiusMeters < 2500) {
                        zoom = 1.6;
                    }
                    offset /= zoom;

                    const msg = `Round ${i + 1}/${rounds} complete. Est: ${currentLat.toFixed(6)}, ${currentLon.toFixed(6)} | Dist: ${Math.round(results[0].dist)}m`;
                    toast.success(msg);
                    appendLog(`[ROUND ${i + 1}] Lat: ${currentLat.toFixed(6)}, Lon: ${currentLon.toFixed(6)} | Reference Dist: ${Math.round(results[0].dist)}m | Next Zoom Factor: ${zoom}`);
                }
            }

            const finalCoords = `${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}`;
            setFinalCoordinates({ lat: currentLat, lon: currentLon });

            toast.success(`Process complete. Coordinates found within ~${Math.round(offset * 111320)}m error radius.`);
            
            appendLog(``);
            appendLog(`=== FINAL TRILATERATION RESULT ===`);
            appendLog(`Coordinates: ${finalCoords}`);
            appendLog(`Estimated Error Radius: ~${Math.round(offset * 111320)} meters`);

            try {
                const historyKey = "fg-location-finder-history";
                interface HistoryEntry {
                    profileId: string;
                    name: string;
                    lat: number;
                    lon: number;
                    timestamp: number;
                }
                const currentHistory = JSON.parse(localStorage.getItem(historyKey) || "[]") as HistoryEntry[];
                const newEntry: HistoryEntry = {
                    profileId: target,
                    name: activeProfile?.displayName || "Unknown",
                    lat: currentLat,
                    lon: currentLon,
                    timestamp: Date.now()
                };
                currentHistory.unshift(newEntry);
                localStorage.setItem(historyKey, JSON.stringify(currentHistory.slice(0, 50)));
            } catch (e) {
                appLog.warn("Failed to save location history log", e);
            }

            setLocateProgress(100);
            setLocateStatus("Finalizing coordinates...");
            
            // Trigger maps confirm dialog synchronously
            setIsMapsConfirmOpen(true);

            // Defer the download prompt so it doesn't block the UI thread in WebViews
            setTimeout(() => {
                try {
                    const blob = new Blob([processLog.join("\n")], { type: "text/plain" });
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = `FreeGrind_Locate_${target}_${Date.now()}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                    toast.success("Trilateration log downloaded successfully.");
                } catch (err) {
                    appLog.error("Failed to download log", err);
                }
            }, 300);

        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("profile_details.location_finder_error_general"));
        } finally {
            try {
                // Try to restore original location safely without crashing the modal closure
                setLocateStatus("Restoring original location...");
                await waitMs(3000); 
                await putServerLocation(originalLat, originalLon, currentGeohash);
            } catch (cleanupError) {
                appLog.warn("Failed to restore original location", cleanupError);
            }
            
            globalIsLocating = false;
            setIsLocateConfirmOpen(false); // Force modal close
            setLocateProgress(0);
            setLocateStatus("");
            isLocateCancelledRef.current = false;
            window.dispatchEvent(new Event(LOCATE_STATE_EVENT));
        }
    };

    // Bulletproof Google Maps Launcher
    const launchGoogleMaps = async () => {
        setIsMapsConfirmOpen(false);
        if (!finalCoordinates) return;
        
        const url = `https://www.google.com/maps/search/?api=1&query=${finalCoordinates.lat},${finalCoordinates.lon}`;
        
        // 1. Try Native Tauri Opener First
        try {
            if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
                try {
                    const { openUrl: tauriOpen } = await import("@tauri-apps/plugin-opener");
                    await tauriOpen(url);
                    return;
                } catch (tauriError) {
                    appLog.warn("Tauri plugin-opener failed dynamically, falling back to Web Anchor", tauriError);
                }
            }
        } catch (e) {
            appLog.warn("Tauri check threw error", e);
        }

        // 2. Fallback to invisible Anchor tag (Bypasses popup blockers since it's chained from a trusted user click)
        try {
            const a = document.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            // 3. Absolute final fallback
            window.location.assign(url);
        }
    };

    return (
        <>
            <ProfileDetailsModal
                variant={isDesktopLike ? "modal" : "page"}
                isOpen
                onClose={() => {
                    navigate(safeReturnTo, { replace: true });
                }}
                onPrevProfile={handlePrevProfile}
                onNextProfile={handleNextProfile}
                onMessageProfile={handleMessageProfile}
                onSendQuickMessage={handleSendQuickMessage}
                onTriangleProfile={handleTriangleProfile}
                onBlockProfile={handleBlockProfile}
                onUnblockProfile={handleUnblockProfile}
                onToggleFavoriteProfile={handleToggleFavoriteProfile}
                isFavorite={Boolean(activeProfile?.isFavorite)}
                isTogglingFavorite={Boolean(
                    profileId && mutatingFavoriteProfileId === profileId,
                )}
                isBlocked={profileId ? blockedProfileIds.has(profileId) : false}
                isBlockingProfile={isBlockingProfile || isUnblockingProfile}
                isLocatingProfile={isLocatingProfile}
                onTapProfile={handleTapProfile}
                isTappingProfile={isTappingProfile}
                isTapBlocked={hasSentTapRecently}
                tapVisualState={resolvedTapVisualState}
                activeProfile={activeProfile}
                selectedBrowseCard={null}
                isLoadingActiveProfile={isLoadingActiveProfile}
                activeProfileError={activeProfileError}
                activeProfilePhotoHashes={activeProfilePhotoHashes}
                chatContactStatus={chatContactStatus}
                genderOptions={genderOptions}
                pronounOptions={pronounOptions}
            />

            <ConfirmDialog
                isOpen={pendingProfileConfirm !== null}
                title={
                    pendingProfileConfirm?.action === "unblock"
                        ? t("profile_details.unblock")
                        : t("profile_details.block")
                }
                message={
                    pendingProfileConfirm?.action === "unblock"
                        ? t("profile_details.unblock_confirm")
                        : t("profile_details.block_confirm")
                }
                confirmLabel={
                    pendingProfileConfirm?.action === "unblock"
                        ? t("profile_details.unblock")
                        : t("profile_details.block")
                }
                cancelLabel={t("chat.actions.cancel")}
                onConfirm={handleConfirmProfileAction}
                onCancel={handleCancelProfileConfirm}
                isProcessing={isBlockingProfile || isUnblockingProfile}
                confirmTone={
                    pendingProfileConfirm?.action === "unblock" ? "default" : "danger"
                }
                dontAskAgainLabel={t("profile_details.dont_ask_again", { defaultValue: "Don't ask again" })}
                dontAskAgainChecked={dontAskAgainChecked}
                onDontAskAgainChange={setDontAskAgainChecked}
            />

            {/* Custom Liquid Glass Settings Modal for Advanced Locate */}
            {isLocateConfirmOpen && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-[12px] p-4 transition-all animate-in fade-in duration-300">
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-[2.5rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] animate-in zoom-in-95 duration-300"
                    >
                        <div className="flex flex-col items-center text-center">
                            {!isLocatingProfile ? (
                                <>
                                    <h2 className="mb-2 text-xl font-bold text-white drop-shadow-md">Advanced Locate</h2>
                                    <p className="mb-6 text-xs leading-relaxed text-[var(--text-muted)]">
                                        Spoofs location in a shrinking triangle. A raw coordinates log will be downloaded upon completion.
                                    </p>

                                    {/* Range Slider Container */}
                                    <div className="mb-6 w-full rounded-[1.5rem] border border-white/5 bg-black/20 p-4 shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)]">
                                        <div className="mb-3 flex items-end justify-between">
                                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Precision Rounds</span>
                                            <span className="text-xl font-black text-white">{selectedRounds}</span>
                                        </div>

                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={selectedRounds}
                                            onChange={(e) => setSelectedRounds(Number(e.target.value))}
                                            className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-[var(--accent)] outline-none transition-all cursor-pointer hover:bg-white/15"
                                        />

                                        <div className="mt-3 flex justify-between text-[9px] font-black uppercase tracking-wider">
                                            <span className={selectedRounds <= 6 ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.4)]" : "text-[var(--text-muted)]/60"}>Safe</span>
                                            <span className={selectedRounds > 6 && selectedRounds <= 14 ? "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.4)]" : "text-[var(--text-muted)]/60"}>Moderate</span>
                                            <span className={selectedRounds > 14 ? "text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.4)]" : "text-[var(--text-muted)]/60"}>Ban Risk</span>
                                        </div>
                                    </div>

                                    {/* Info Grid (Time & Accuracy) */}
                                    <div className="mb-6 grid w-full grid-cols-2 gap-3 text-left">
                                        <div className="rounded-[1.25rem] border border-white/5 bg-white/5 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_8px_16px_rgba(0,0,0,0.15)]">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Est. Time</p>
                                            <p className="mt-1 text-sm font-bold text-white font-mono leading-none">
                                                ~ {Math.floor((selectedRounds * 15) / 60)}m {(selectedRounds * 15) % 60}s
                                            </p>
                                        </div>
                                        <div className="rounded-[1.25rem] border border-white/5 bg-white/5 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_8px_16px_rgba(0,0,0,0.15)]">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Est. Accuracy</p>
                                            <p className="mt-1 text-sm font-bold text-white leading-none">
                                                {
                                                    selectedRounds <= 3 ? "Low (~5km)" :
                                                    selectedRounds <= 6 ? "Fair (~1km)" :
                                                    selectedRounds <= 9 ? "Good (~200m)" :
                                                    selectedRounds <= 12 ? "High (~50m)" :
                                                    selectedRounds <= 16 ? "V. High (~15m)" :
                                                    "Extreme (<5m)"
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex w-full gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsLocateConfirmOpen(false)}
                                            className="flex-1 inline-flex h-11 items-center justify-center rounded-xl bg-transparent px-4 text-sm font-semibold text-[var(--text-muted)] transition-all duration-300 hover:text-[var(--text)] hover:bg-white/5 active:scale-95"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={runTrilateration}
                                            className={`flex-1 inline-flex h-11 items-center justify-center rounded-xl border px-6 text-sm font-bold transition-all duration-300 hover:scale-[1.02] active:scale-95 ${
                                                selectedRounds > 14
                                                    ? "border-red-500/40 bg-red-500/25 text-white hover:bg-red-500/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                                                    : "border-[var(--accent)]/40 bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                            }`}
                                        >
                                            Locate
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex w-full flex-col items-center pb-2 pt-2">
                                    <h2 className="mb-2 text-xl font-bold text-white drop-shadow-md">Locating Target...</h2>
                                    <p className="mb-4 text-xs font-semibold text-[var(--accent)] animate-pulse text-center">
                                        {locateStatus || "Initializing coordinates..."}
                                    </p>
                                    
                                    {/* NavBar-Style Liquid Glass Progress Bar */}
                                    <div 
                                        className="relative mb-4 flex h-10 w-full rounded-full border border-white/10 dark:border-white/5 p-1.5 backdrop-blur-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),_inset_0_-1px_0_rgba(0,0,0,0.2),_0_12px_40px_rgba(0,0,0,0.45)] select-none"
                                        style={{
                                            backgroundColor: "rgba(15, 17, 21, 0.25)",
                                            background: "color-mix(in srgb, var(--surface) 25%, transparent)",
                                        }}
                                    >
                                        <style>
                                            {`
                                            @keyframes glass-shimmer {
                                                0% { transform: translateX(-100%); }
                                                100% { transform: translateX(100%); }
                                            }
                                            `}
                                        </style>
                                        
                                        {/* Fill Container */}
                                        <div 
                                            className="relative h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out shadow-[0_0_20px_var(--accent)]"
                                            style={{ width: `${Math.max(6, locateProgress)}%` }}
                                        >
                                            <div className="absolute inset-0 overflow-hidden rounded-full">
                                                {/* Top Specular Highlight (The subtle Glass Arc matching tabs) */}
                                                <div className="absolute left-0 top-0 h-1/2 w-full bg-gradient-to-b from-white/30 to-transparent" />
                                                
                                                {/* Sweeping Elegance Shimmer */}
                                                <div 
                                                    className="absolute inset-0 w-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                                                    style={{ animation: 'glass-shimmer 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p className="text-xl font-black tracking-wider text-white drop-shadow-lg mb-4">
                                        {locateProgress}%
                                    </p>

                                    {/* Scrolling Terminal Log Container */}
                                    <div ref={terminalRef} className="w-full rounded-2xl border border-white/5 bg-black/40 p-4 h-36 overflow-y-auto font-mono text-[10px] text-left text-green-400/90 leading-relaxed scrollbar-none shadow-inner relative">
                                        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />
                                        <div className="space-y-1 relative z-10">
                                            {locateLogs.map((log, index) => (
                                                <div key={index} className="whitespace-pre-wrap">
                                                    {log.startsWith("[ROUND") ? (
                                                        <span className="text-yellow-400/90">{log}</span>
                                                    ) : log.startsWith("[INIT") ? (
                                                        <span className="text-cyan-400/90">{log}</span>
                                                    ) : log.includes("FINAL TRILATERATION") || log.startsWith("Coordinates:") || log.startsWith("Estimated Error") ? (
                                                        <span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.3)]">{log}</span>
                                                    ) : (
                                                        <span>{log}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => { isLocateCancelledRef.current = true; }}
                                        className="mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-6 text-xs font-bold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/20 active:scale-95"
                                    >
                                        Abort
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.getElementById("app") ?? document.body
            )}

            <ConfirmDialog
                isOpen={isMapsConfirmOpen}
                title="Trilateration Complete"
                message={`The user's estimated location has been pinpointed and the raw log file has been downloaded.\n\nWould you like to open these coordinates in Google Maps?`}
                confirmLabel="Open Google Maps"
                cancelLabel="Dismiss"
                onConfirm={launchGoogleMaps}
                onCancel={() => setIsMapsConfirmOpen(false)}
                isProcessing={false}
                confirmTone="default"
            />
        </>
    );
}