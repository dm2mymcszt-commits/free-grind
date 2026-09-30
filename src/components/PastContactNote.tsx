import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { usePastContact } from "../services/pastContacts";
import { describePastContact, type PastContact } from "../utils/pastContactRules";
import { cn } from "../utils/cn";

function formatPastDate(timestamp: number): string {
	const date = new Date(timestamp);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

type Tone = "blocked" | "unanswered" | "talked";

function toneOf(contact: PastContact): Tone {
	if (contact.blockedByMeAt != null || contact.blockedMeAt != null) return "blocked";
	return contact.myMessages > 0 ? "talked" : "unanswered";
}

const TONE_TEXT: Record<Tone, string> = {
	blocked: "text-red-400",
	unanswered: "text-amber-400",
	talked: "text-emerald-400",
};

/**
 * What an earlier account on this device knew about this person: whether
 * they wrote, whether they got an answer, who blocked whom.
 *
 * - `banner`: one tappable line that opens the details, for the chat and
 *   the profile.
 * - `icon`: a small coloured clock beside a name, for inbox rows.
 */
export function PastContactNote({
	profileId,
	variant,
	className,
}: {
	profileId: string | number | null | undefined;
	variant: "banner" | "icon";
	className?: string;
}) {
	const { settingsReady } = useAuth();
	const contact = usePastContact(profileId, settingsReady);
	const [isOpen, setIsOpen] = useState(false);

	if (!contact) return null;
	const summary = describePastContact(contact, formatPastDate);
	const tone = toneOf(contact);

	if (variant === "icon") {
		return (
			<span title={summary.badge} aria-label={summary.badge}>
				<History className={cn("h-3.5 w-3.5 shrink-0", TONE_TEXT[tone], className)} />
			</span>
		);
	}

	return (
		<div className={cn("rounded-xl bg-[var(--surface-2)] text-xs", className)}>
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				<History className={cn("h-3.5 w-3.5 shrink-0", TONE_TEXT[tone])} />
				<span className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">{summary.badge}</span>
				<ChevronDown
					className={cn(
						"h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</button>
			{isOpen ? (
				<ul className="space-y-1 px-3 pb-2.5 pl-[2.1rem] leading-snug text-[var(--text-muted)]">
					{summary.lines.map((line) => (
						<li key={line} className="break-words">
							{line}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
