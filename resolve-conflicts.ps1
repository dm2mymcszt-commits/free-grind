# Resolve all 5 merge conflicts
# Strategy: Read each file, remove conflict markers by combining both sides

$ErrorActionPreference = "Stop"

function Resolve-ConflictFile {
    param([string]$FilePath)
    
    $content = [System.IO.File]::ReadAllText($FilePath)
    $original = $content
    
    # Process conflict blocks iteratively
    $maxIterations = 20
    $iteration = 0
    
    while ($content -match '(?s)<<<<<<<[^\r\n]*\r?\n' -and $iteration -lt $maxIterations) {
        $iteration++
        
        # Find the first conflict block
        $startMatch = [regex]::Match($content, '<<<<<<<[^\r\n]*\r?\n')
        if (-not $startMatch.Success) { break }
        
        $startIdx = $startMatch.Index
        $afterStart = $startIdx + $startMatch.Length
        
        # Find ======= 
        $sepMatch = [regex]::Match($content, '=======\r?\n', [System.Text.RegularExpressions.RegexOptions]::None, $afterStart)
        if (-not $sepMatch.Success) { break }
        $sepIdx = $sepMatch.Index
        $afterSep = $sepIdx + $sepMatch.Length
        
        # Find >>>>>>>
        $endMatch = [regex]::Match($content, '>>>>>>>[^\r\n]*\r?\n?', [System.Text.RegularExpressions.RegexOptions]::None, $afterSep)
        if (-not $endMatch.Success) { break }
        $endIdx = $endMatch.Index
        $afterEnd = $endIdx + $endMatch.Length
        
        # Extract HEAD and upstream sections
        $headContent = $content.Substring($afterStart, $sepIdx - $afterStart)
        $upstreamContent = $content.Substring($afterSep, $endIdx - $afterSep)
        
        # Get context to decide how to resolve
        $contextBefore = ""
        if ($startIdx -gt 100) {
            $contextBefore = $content.Substring($startIdx - 100, 100)
        } elseif ($startIdx -gt 0) {
            $contextBefore = $content.Substring(0, $startIdx)
        }
        
        Write-Host "  Conflict #$iteration context: $($contextBefore.Substring([Math]::Max(0, $contextBefore.Length - 60)))"
        Write-Host "    HEAD lines: $($headContent.Split("`n").Count), Upstream lines: $($upstreamContent.Split("`n").Count)"
        
        # Default: keep HEAD (our custom features)
        $replacement = $headContent
        
        # File-specific resolution logic applied below after this function
        # For the generic resolver, we keep HEAD
        
        $content = $content.Substring(0, $startIdx) + $replacement + $content.Substring($afterEnd)
    }
    
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($FilePath, $content)
        Write-Host "  Resolved $iteration conflicts in $([System.IO.Path]::GetFileName($FilePath))"
    }
    
    return $iteration
}

# ============================================
# FILE 1: ProfileDetailsContent.tsx
# ============================================
Write-Host "`n=== Resolving ProfileDetailsContent.tsx ==="
$file1 = "c:\Users\47ira\free-grind\src\pages\app\gridpage\components\ProfileDetailsContent.tsx"
$c = [System.IO.File]::ReadAllText($file1)

# CONFLICT 1 (lines 1-62): Imports
# Keep HEAD imports + add upstream's Plane, Sparkles, useMemo; remove HEAD's Triangle, Loader2; keep HEAD's UIEvent
$c = $c -replace '(?s)import \{\r?\n<<<<<<< HEAD\r?\n(.*?)=======\r?\n(.*?)>>>>>>> upstream/main\r?\n', @'
import {
    ArrowDown,
    ArrowLeftRight,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    ChevronsDown,
    ChevronsUp,
    Compass,
    ExternalLink,
    Flame,
    Globe,
    Hash,
    Heart,
    Loader2,
    MapPin,
    MessageCircle,
    MessageSquare,
    type LucideIcon,
    Plane,
    Ruler,
    Scale,
    Search,
    Shield,
    ShieldCheck,
    Sparkles,
    Syringe,
    Triangle,
    User,
    Zap,
} from "lucide-react";
import { type ReactNode, type RefObject, type UIEvent, useEffect, useMemo, useRef, useState } from "react";
'@

# CONFLICT 2 (lines 121-354): Props type and function signature
# Keep HEAD (our custom props: handleMobileCarouselScroll, photoCreatedAtByHash, block/unblock, favorite, triangle, view count)
# Add upstream's travelPlans prop
$c = $c -replace '(?s)type ProfileDetailsContentProps = \{\r?\n<<<<<<< HEAD\r?\n(.*?)\} = usePreferences\(\);\r?\n    const hasChatHistory.*?\r?\n    const lastMessageLabel.*?\r?\n=======\r?\n(.*?)\} = usePreferences\(\);\r?\n\tconst hasChatHistory.*?\r?\n\tconst lastMessageLabel.*?\r?\n\tconst visibleTravelPlans.*?\r?\n\t\t\(\) => \(travelPlans.*?\r?\n\t\t\[travelPlans\],\r?\n\t\);\r?\n\tconst hasTravelPlans = visibleTravelPlans\.length > 0;\r?\n>>>>>>> upstream/main', @'
type ProfileDetailsContentProps = {
    activeProfile: ProfileDetail;
    activeProfilePhotoHashes: string[];
    isDesktopLike: boolean;
    showMobileCarousel: boolean;
    mobileCarouselRef: RefObject<HTMLDivElement | null>;
    mobileCarouselPhotoIndex: number;
    onPhotoIndexChange?: (index: number) => void;
    handleMobileCarouselScroll?: (event: UIEvent<HTMLDivElement>) => void;
    openPhotoViewer: (index: number) => void;
    photoCreatedAtByHash: Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }>;
    activeProfileName: string;
    estimatedCreatedAt: string;
    travelPlans?: TravelPlan[];
    profileStatusLabel: string;
    profileStatusLevel?: "online" | "recent" | "offline";
    ownTags?: string[];
    profileDistance: number | null;
    chatContactStatus: ChatContactIndexRecord | null;
    messageProfileId: string | null;
    usesFreegrind: boolean;
    onMessageProfile?: (profileId: string) => void;
    onTapProfile?: (profileId: string, tapId?: number) => void;
    onBlockProfile?: (profileId: string) => void;
    onUnblockProfile?: (profileId: string) => void;
    onToggleFavoriteProfile?: (
        profileId: string,
        currentlyFavorite: boolean,
    ) => void | Promise<void>;
    isFavorite: boolean;
    isTogglingFavorite: boolean;
    isBlocked: boolean;
    isBlockingProfile: boolean;
    isTapDisabled: boolean;
    isTapBlocked: boolean;
    isTapActive: boolean;
    tapId: number;
    tapButtonClassName: string;
    onTriangleProfile?: (profileId: string) => void;
    isTriangleDisabled: boolean;
    triangleButtonClassName: string;
    isLocatingProfile: boolean;
    hasTagsContent: boolean;
    hasAboutContent: boolean;
    hasExpectationsFields: boolean;
    hasHealthFields: boolean;
    hasStatsFields: boolean;
    hasSocialFields: boolean;
    formattedActiveGenders: string;
    formattedActivePronouns: string;
    lookingForLabels: LabelMap;
    meetAtLabels: LabelMap;
    nsfwLabels: LabelMap;
    tribeLabels: LabelMap;
    hivStatusLabels: LabelMap;
    sexualHealthLabels: LabelMap;
    vaccineLabels: LabelMap;
    sexualPositionLabels: LabelMap;
    bodyTypeLabels: LabelMap;
    ethnicityLabels: LabelMap;
    relationshipStatusLabels: LabelMap;
    extraTopSection?: ReactNode;
    hidePicturesSection?: boolean;
    onDragDeltaChange?: (delta: number) => void;
};

export function ProfileDetailsContent({
    activeProfile,
    activeProfilePhotoHashes,
    isDesktopLike,
    showMobileCarousel,
    mobileCarouselRef,
    mobileCarouselPhotoIndex,
    onPhotoIndexChange,
    openPhotoViewer,
    photoCreatedAtByHash,
    activeProfileName,
    estimatedCreatedAt,
    travelPlans,
    profileStatusLabel,
    profileStatusLevel,
    ownTags = [],
    profileDistance,
    chatContactStatus,
    messageProfileId,
    usesFreegrind,
    onMessageProfile,
    onTapProfile,
    onToggleFavoriteProfile,
    isFavorite,
    isTogglingFavorite,
    isTapDisabled,
    isTapBlocked,
    isTapActive,
    tapId,
    tapButtonClassName,
    onTriangleProfile,
    isTriangleDisabled,
    isLocatingProfile,
    hasTagsContent,
    hasAboutContent,
    hasExpectationsFields,
    hasHealthFields,
    hasStatsFields,
    hasSocialFields,
    formattedActiveGenders,
    formattedActivePronouns,
    lookingForLabels,
    meetAtLabels,
    nsfwLabels,
    tribeLabels,
    hivStatusLabels,
    sexualHealthLabels,
    vaccineLabels,
    sexualPositionLabels,
    bodyTypeLabels,
    ethnicityLabels,
    relationshipStatusLabels,
    extraTopSection,
    hidePicturesSection = false,
    onDragDeltaChange,
}: ProfileDetailsContentProps) {
    const { t } = useTranslation();
    const { unitsPreset } = usePreferences();
    const hasChatHistory = Boolean(chatContactStatus?.hasChatted) || (chatContactStatus?.unreadCount ?? 0) > 0;
    const lastMessageLabel = formatRelativeTime(chatContactStatus?.lastMessageTimestamp ?? null);
    const visibleTravelPlans = useMemo(
        () => (travelPlans ?? []).filter((plan) => plan.showOnProfile && plan.endDate >= Date.now()),
        [travelPlans],
    );
    const hasTravelPlans = visibleTravelPlans.length > 0;
'@

[System.IO.File]::WriteAllText($file1, $c)
Write-Host "  Applied conflict 1+2 resolutions"

# Re-read for remaining conflicts
$c = [System.IO.File]::ReadAllText($file1)

# CONFLICT 3 (around line 425-474): onMove handler for touch events
# Keep HEAD's onMove, remove upstream's duplicate onEnd
$conflict3Pattern = '(?s)<<<<<<< HEAD\r?\n        const onMove = \(e: TouchEvent\).*?onDragDeltaChangeRef\.current\?\.\(dy\);\r?\n        \};\r?\n=======\r?\n\t\t\tif \(!navigating\) return;\r?\n\t\t\te\.preventDefault\(\);\r?\n\t\t\tlastDeltaRef\.current = dy;\r?\n\t\t\tsetDragDelta\(dy\);\r?\n\t\t\tonDragDeltaChange\?\.\(dy\);\r?\n\t\t\};\r?\n\r?\n\t\tconst onEnd = \(\) => \{\r?\n\t\t\tisDraggingRef\.current = false;\r?\n\t\t\tif \(!navigating\) return;\r?\n\t\t\tnavigating = false;\r?\n\t\t\tconst dy = lastDeltaRef\.current;\r?\n\t\t\tconst idx = currentIndexRef\.current;\r?\n\t\t\tconst total = activeProfilePhotoHashes\.length;\r?\n\t\t\tif \(dy < -60.*?\r?\n\t\t\t\tonPhotoIndexChangeRef\.current\?\.\(idx \+ 1\);\r?\n\t\t\t\} else if \(dy > 60.*?\r?\n\t\t\t\tonPhotoIndexChangeRef\.current\?\.\(idx - 1\);\r?\n\t\t\t\}\r?\n\t\t\tlastDeltaRef\.current = 0;\r?\n\t\t\tsetDragDelta\(0\);\r?\n\t\t\tonDragDeltaChange\?\.\(0\);\r?\n\t\t\};\r?\n>>>>>>> upstream/main'

if ($c -match $conflict3Pattern) {
    $c = [regex]::Replace($c, $conflict3Pattern, @'
        const onMove = (e: TouchEvent) => {
            endY = e.touches[0].clientY;
            endX = e.touches[0].clientX;
            const dy = endY - startY;
            const dx = endX - startX;

            if (!decided) {
                if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
                decided = true;
                if (Math.abs(dx) >= Math.abs(dy)) return; // horizontal swipe -> ignore
                const idx = currentIndexRef.current;
                const total = activeProfilePhotoHashes.length;
                if ((dy < 0 && idx < total - 1) || (dy > 0 && idx > 0)) {
                    navigating = true;
                    isDraggingRef.current = true;
                    e.preventDefault();
                }
            }
            if (!navigating) return;
            e.preventDefault();
            lastDeltaRef.current = dy;
            setDragDelta(dy);
            onDragDeltaChangeRef.current?.(dy);
        };
'@)
    Write-Host "  Applied conflict 3 resolution (onMove handler)"
} else {
    Write-Host "  WARNING: Could not find conflict 3 pattern"
}

[System.IO.File]::WriteAllText($file1, $c)
$c = [System.IO.File]::ReadAllText($file1)

# CONFLICT 4 (around line 506-587): renderPhotoCreatedBadge vs upstream return
# Keep HEAD's renderPhotoCreatedBadge, remove upstream's partial return block
$conflict4Start = '<<<<<<< HEAD
    const renderPhotoCreatedBadge'
$conflict4End = '>>>>>>> upstream/main'

# Use line-by-line approach for this complex conflict
$lines = $c -split "`r`n"
$newLines = @()
$inConflict = $false
$skipUntilEnd = $false
$conflictNum = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    
    if ($line -match '^<<<<<<< HEAD') {
        $inConflict = $true
        $conflictNum++
        # Check what this conflict is about
        if ($i + 1 -lt $lines.Count -and $lines[$i+1] -match 'renderPhotoCreatedBadge') {
            # Conflict 4: Keep HEAD's renderPhotoCreatedBadge
            $skipUntilEnd = $false
            continue
        }
        elseif ($i + 1 -lt $lines.Count -and $lines[$i+1] -match 'extraTopSection') {
            # Conflict 5: Keep HEAD's rendering (our glassmorphic styling)
            $skipUntilEnd = $false
            continue
        }
        elseif ($i + 1 -lt $lines.Count -and $lines[$i+1] -match 'hasAboutContent') {
            # Conflict 6: Keep HEAD's about section styling, add upstream's travel plans
            $skipUntilEnd = $false
            continue
        }
        elseif ($i + 1 -lt $lines.Count -and $lines[$i+1] -match 'hasSocialFields') {
            # Conflict 7: Keep HEAD's social styling
            $skipUntilEnd = $false
            continue
        }
        else {
            $skipUntilEnd = $false
            continue
        }
    }
    elseif ($line -match '^=======') {
        if ($inConflict) {
            $skipUntilEnd = $true
            continue
        }
    }
    elseif ($line -match '^>>>>>>> upstream/main') {
        $inConflict = $false
        $skipUntilEnd = $false
        continue
    }
    
    if (-not $skipUntilEnd) {
        $newLines += $line
    }
}

$c = $newLines -join "`r`n"

# Now we need to add the travel plans section after hasAboutContent in the HEAD version
# Insert travel plans section after the about section block
$aboutSectionEnd = '                    )}'
$travelPlansSection = @'

                    {hasTravelPlans && (
                        <div className="rounded-2xl border border-white/10 p-4 backdrop-blur-[20px]" style={{ background: 'color-mix(in srgb, var(--surface) 25%, transparent)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.45)' }}>
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                                {t("profile_details.travel_plans")}
                            </p>
                            <div className="space-y-3">
                                {visibleTravelPlans.map((plan) => (
                                    <TravelPlanRow key={plan.travelPlanId} plan={plan} t={t} />
                                ))}
                            </div>
                        </div>
                    )}
'@

# Find the about section and insert travel plans after it
$aboutPattern = '(?s)(                    \{hasAboutContent && \(\r?\n                        <div className="rounded-2xl border border-white/10 p-4 backdrop-blur-\[20px\]".*?                    \)\})'
if ($c -match $aboutPattern) {
    $c = $c -replace $aboutPattern, ('$1' + "`r`n" + $travelPlansSection)
    Write-Host "  Added travel plans section after about content"
}

[System.IO.File]::WriteAllText($file1, $c)
Write-Host "  ProfileDetailsContent.tsx resolved"

# Verify no markers remain
$remaining = (Select-String -Path $file1 -Pattern '<<<<<<<|=======|>>>>>>>' | Measure-Object).Count
Write-Host "  Remaining conflict markers: $remaining"

# ============================================
# FILE 2: ProfileDetailsModal.tsx
# ============================================  
Write-Host "`n=== Resolving ProfileDetailsModal.tsx ==="
$file2 = "c:\Users\47ira\free-grind\src\pages\app\gridpage\components\ProfileDetailsModal.tsx"
$c = [System.IO.File]::ReadAllText($file2)

# CONFLICT 1 (lines 1-5): Import - keep HEAD's imports (includes Loader2, Eye)
$c = $c -replace '(?s)<<<<<<< HEAD\r?\nimport \{ Ban, Check, ChevronLeft, Ellipsis, Flame, Loader2, MessageCircle, Pencil, Phone, StickyNote, Star, Trash2, Triangle, X, Eye \} from "lucide-react";\r?\n=======\r?\nimport \{ Ban, Check, ChevronLeft, Ellipsis, Flame, MessageCircle, Pencil, Phone, StickyNote, Star, Trash2, Triangle, X \} from "lucide-react";\r?\n>>>>>>> upstream/main', 'import { Ban, Check, ChevronLeft, Ellipsis, Flame, Loader2, MessageCircle, Pencil, Phone, StickyNote, Star, Trash2, Triangle, X, Eye } from "lucide-react";'

# Remove duplicate SKIP_BLOCK_CONFIRM_KEY local const (upstream imports it, HEAD had local const)
# Keep the import from blockConfirm utils (line 60), remove the local const (line 66)
$c = $c -replace '(?m)^const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";\r?\n', ''

# CONFLICT 2 (lines 232-235): After messageProfileId - upstream adds travelPlans hook
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n=======\r?\n\tconst \{ data: travelPlans \} = useTravelPlans\(activeProfile\?\.\s*profileId\);\r?\n>>>>>>> upstream/main', "`tconst { data: travelPlans } = useTravelPlans(activeProfile?.profileId);"

# CONFLICT 3 (lines 389-405): Block confirm state
# Keep HEAD's skipBlockConfirm state + upstream's requestBlock helper
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n\tconst \[dontAskAgainChecked, setDontAskAgainChecked\] = useState\(false\);\r?\n\tconst \[skipBlockConfirm, setSkipBlockConfirm\] = useState\(\(\) => \{\r?\n\t\tif \(typeof window === "undefined"\) \{\r?\n\t\t\treturn false;\r?\n\t\t\}\r?\n\t\treturn localStorage\.getItem\(SKIP_BLOCK_CONFIRM_KEY\) === "true";\r?\n\t\}\);\r?\n=======\r?\n\tconst requestBlock = \(\) => \{\r?\n\t\tif \(typeof window !== "undefined" && window\.localStorage\.getItem\(SKIP_BLOCK_CONFIRM_KEY\) === "true"\) \{\r?\n\t\t\tif \(messageProfileId\) onBlockProfile\?\.\(String\(messageProfileId\)\);\r?\n\t\t\} else \{\r?\n\t\t\tsetShowBlockConfirm\(true\);\r?\n\t\t\}\r?\n\t\};\r?\n>>>>>>> upstream/main', @'
	const [dontAskAgainChecked, setDontAskAgainChecked] = useState(false);
	const [skipBlockConfirm, setSkipBlockConfirm] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
	});
	const requestBlock = () => {
		if (typeof window !== "undefined" && window.localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true") {
			if (messageProfileId) onBlockProfile?.(String(messageProfileId));
		} else {
			setShowBlockConfirm(true);
		}
	};
'@

# CONFLICT 4 (lines 426-429): viewCount state - keep HEAD's viewCount
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n\tconst \[viewCount, setViewCount\] = useState<number \| null>\(null\);\r?\n=======\r?\n>>>>>>> upstream/main', "`tconst [viewCount, setViewCount] = useState<number | null>(null);"

# CONFLICT 5 (lines 460-476): viewCount useEffect - keep HEAD's interestViewsStore
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n\tuseEffect\(\(\) => \{\r?\n\t\tif \(!messageProfileId\) \{\r?\n\t\t\tsetViewCount\(null\);\r?\n\t\t\treturn;\r?\n\t\t\}\r?\n\r?\n\t\tinterestViewsStore\.getAll\(\)\.then\(\(rows\) => \{\r?\n\t\t\tconst match = rows\.find\(\(r\) => String\(r\.profileId\) === String\(messageProfileId\)\);\r?\n\t\t\tsetViewCount\(match \? \(match\.viewCount \?\? 1\) : null\);\r?\n\t\t\}\)\.catch\(\(\) => \{\r?\n\t\t\tsetViewCount\(null\);\r?\n\t\t\}\);\r?\n\t\}, \[messageProfileId\]\);\r?\n\r?\n=======\r?\n>>>>>>> upstream/main', @'
	useEffect(() => {
		if (!messageProfileId) {
			setViewCount(null);
			return;
		}

		interestViewsStore.getAll().then((rows) => {
			const match = rows.find((r) => String(r.profileId) === String(messageProfileId));
			setViewCount(match ? (match.viewCount ?? 1) : null);
		}).catch(() => {
			setViewCount(null);
		});
	}, [messageProfileId]);

'@

# CONFLICT 6 (lines 897-901): useEffect dependency - keep HEAD's version (with activeProfile?.profileId)
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n\t\}, \[isModalSplit, activeProfile\?\.profileId\]\);\r?\n=======\r?\n\t\}, \[isModalSplit\]\);\r?\n>>>>>>> upstream/main', "`t}, [isModalSplit, activeProfile?.profileId]);"

[System.IO.File]::WriteAllText($file2, $c)
$c = [System.IO.File]::ReadAllText($file2)

# CONFLICT 7 (lines 979-1404 vs 1405-end): renderInlineLayout - HEAD has glassmorphic styling
# Keep HEAD version (our custom glassmorphic UI), but add upstream's travelPlans prop to ProfileDetailsContent
# Process line by line
$lines = $c -split "`r`n"
$newLines = @()
$inConflict = $false
$skipUntilEnd = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    
    if ($line -match '^<<<<<<< HEAD') {
        $inConflict = $true
        $skipUntilEnd = $false
        continue
    }
    elseif ($line -match '^=======' -and $inConflict) {
        $skipUntilEnd = $true
        continue
    }
    elseif ($line -match '^>>>>>>> upstream/main' -and $inConflict) {
        $inConflict = $false
        $skipUntilEnd = $false
        continue
    }
    
    if (-not $skipUntilEnd) {
        $newLines += $line
    }
}

$c = $newLines -join "`r`n"

# Add travelPlans prop to ProfileDetailsContent call in the inline layout
# Find the estimatedCreatedAt prop and add travelPlans after it  
$c = $c -replace '(\t\t\t\t\t\t\testimatedCreatedAt=\{estimatedCreatedAt\})', "`$1`r`n`t`t`t`t`t`t`ttravelPlans={travelPlans}"

[System.IO.File]::WriteAllText($file2, $c)
Write-Host "  ProfileDetailsModal.tsx resolved"

$remaining = (Select-String -Path $file2 -Pattern '<<<<<<<|=======|>>>>>>>' | Measure-Object).Count
Write-Host "  Remaining conflict markers: $remaining"

# ============================================
# FILE 3: cache.ts
# ============================================
Write-Host "`n=== Resolving cache.ts ==="
$file3 = "c:\Users\47ira\free-grind\src\pages\app\gridpage\cache.ts"
$c = [System.IO.File]::ReadAllText($file3)

# Single conflict: HEAD has nothing, upstream adds clearAllCaches
# Accept upstream's clearAllCaches function
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n=======\r?\n\r?\n/\*\*\r?\n \* Resets every module-level cache.*?\r?\n \*/\r?\nexport function clearAllCaches\(\): void \{.*?\}\r?\n>>>>>>> upstream/main', @'

/**
 * Resets every module-level cache here — call on logout/account switch.
 * Without this, a second account would briefly see the previous account's
 * profile cache, browse cards, blocked list, and own-profile fields, since
 * none of these caches were ever keyed or cleared by account.
 */
export function clearAllCaches(): void {
	profileCache.clear();
	browseCache.clear();
	genderOptionsCache = null;
	pronounOptionsCache = null;
	blockedProfileIdsCache = null;
	ownProfilePhotoHashCache = null;
	ownDisplayNameCache = undefined;
	ownShowDistanceCache = undefined;
}
'@

[System.IO.File]::WriteAllText($file3, $c)
Write-Host "  cache.ts resolved"

$remaining = (Select-String -Path $file3 -Pattern '<<<<<<<|=======|>>>>>>>' | Measure-Object).Count
Write-Host "  Remaining conflict markers: $remaining"

# ============================================
# FILE 4: LocationSettingsPanel.tsx  
# ============================================
Write-Host "`n=== Resolving LocationSettingsPanel.tsx ==="
$file4 = "c:\Users\47ira\free-grind\src\pages\app\gridpage\components\LocationSettingsPanel.tsx"
$c = [System.IO.File]::ReadAllText($file4)

# CONFLICT 1 (lines 5-692): Imports - Keep HEAD's LeafletLocationPicker + all our custom code, 
# but also add MapLocationPicker import for future use
$c = $c -replace '(?s)<<<<<<< HEAD\r?\nimport \{ LeafletLocationPicker \} from "\./LeafletLocationPicker";\r?\nimport type \{ SavedLocation \} from "\.\./\.\./BrowseLocationPage";\r?\nimport \{ ConfirmDialog \} from "\.\./\.\./\.\./\.\./components/ui/confirm-dialog";\r?\nimport \{ COUNTRY_CENTERS \} from "\./countryCenters";(.*?)=======\r?\nimport \{ MapLocationPicker \} from "\./MapLocationPicker";\r?\n>>>>>>> upstream/main', @'
import { LeafletLocationPicker } from "./LeafletLocationPicker";
import type { SavedLocation } from "../../BrowseLocationPage";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { COUNTRY_CENTERS } from "./countryCenters";$1
'@

[System.IO.File]::WriteAllText($file4, $c)
$c = [System.IO.File]::ReadAllText($file4)

# CONFLICT 2 (lines 818-843): dwell time useEffect vs upstream's MapLocationPicker
# Keep HEAD's dwell useEffect, discard upstream's MapLocationPicker render block (it's out of place)
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n    useEffect\(\(\) => \{\r?\n        window\.localStorage\.setItem\("fg-location-dwell-metropolis", String\(dwellMetropolis\)\);\r?\n        window\.dispatchEvent\(new Event\("fg-engine-tick"\)\);\r?\n    \}, \[dwellMetropolis\]\);\r?\n=======\r?\n\t\t\t\t\t\{isMapPickerOpen \? \(\r?\n\t\t\t\t\t\tmapPickerError \? \(\r?\n\t\t\t\t\t\t\t<div className="p-3 text-xs text-\[var\(--text-muted\)\]">\r?\n\t\t\t\t\t\t\t\t\{mapPickerError\}\r?\n\t\t\t\t\t\t\t</div>\r?\n\t\t\t\t\t\t\) : \(\r?\n\t\t\t\t\t\t\t<MapLocationPicker\r?\n\t\t\t\t\t\t\t\tselectedLocation=\{selectedLocation\}\r?\n\t\t\t\t\t\t\t\tonPick=\{onMapPick\}\r?\n\t\t\t\t\t\t\t\tonError=\{onMapPickerError\}\r?\n\t\t\t\t\t\t\t\tdefaultZoom=\{11\}\r?\n\t\t\t\t\t\t\t\tinitialCenter=\{initialCenter\}\r?\n\t\t\t\t\t\t\t/>\r?\n\t\t\t\t\t\t\)\r?\n\t\t\t\t\t\) : \(\r?\n\t\t\t\t\t\t<div className="p-3 text-xs text-\[var\(--text-muted\)\]">\r?\n\t\t\t\t\t\t\t\{t\("browse_location\.map_picker_instructions"\)\}\r?\n\t\t\t\t\t\t</div>\r?\n\t\t\t\t\t\)\}\r?\n>>>>>>> upstream/main', @'
    useEffect(() => {
        window.localStorage.setItem("fg-location-dwell-metropolis", String(dwellMetropolis));
        window.dispatchEvent(new Event("fg-engine-tick"));
    }, [dwellMetropolis]);
'@

[System.IO.File]::WriteAllText($file4, $c)
Write-Host "  LocationSettingsPanel.tsx resolved"

$remaining = (Select-String -Path $file4 -Pattern '<<<<<<<|=======|>>>>>>>' | Measure-Object).Count
Write-Host "  Remaining conflict markers: $remaining"

# ============================================
# FILE 5: ProfileEditorFormSections.tsx
# ============================================
Write-Host "`n=== Resolving ProfileEditorFormSections.tsx ==="
$file5 = "c:\Users\47ira\free-grind\src\pages\app\profile-editor\ProfileEditorFormSections.tsx"
$c = [System.IO.File]::ReadAllText($file5)

# Single conflict: upstream adds moderation={photoModerationByHash?.get(hash)} prop
# Accept upstream's addition
$c = $c -replace '(?s)<<<<<<< HEAD\r?\n=======\r?\n\t\t\t\t\t\t\t\t\t\tmoderation=\{photoModerationByHash\?\.get\(hash\)\}\r?\n>>>>>>> upstream/main', "`t`t`t`t`t`t`t`t`tmoderation={photoModerationByHash?.get(hash)}"

[System.IO.File]::WriteAllText($file5, $c)
Write-Host "  ProfileEditorFormSections.tsx resolved"

$remaining = (Select-String -Path $file5 -Pattern '<<<<<<<|=======|>>>>>>>' | Measure-Object).Count
Write-Host "  Remaining conflict markers: $remaining"

Write-Host "`n=== All files processed ==="
