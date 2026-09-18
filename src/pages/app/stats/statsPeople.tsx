/**
 * How the Stats page names people and opens their profiles. A chat deleted
 * from this device keeps no name, so a row without one asks Grindr — once per
 * visit — while it is on screen. Opening someone checks first that Grindr
 * still has their profile, and says why not when it does not.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { PersonLookup, PersonState } from "./statsGrindr";

export type StatsPeople = {
	lookUp: (profileId: string) => Promise<PersonLookup>;
	known: (profileId: string) => PersonLookup | null;
	/** Opens their profile if it can be opened; otherwise says why not. */
	open: (profileId: string) => Promise<PersonLookup>;
};

export const StatsPeopleContext = createContext<StatsPeople | null>(null);

const CLOSED_STATES: ReadonlySet<PersonState> = new Set<PersonState>([
	"deleted",
	"blocked_you",
]);

export type PersonHandle = {
	lookup: PersonLookup | null;
	/** Waiting for Grindr to name someone this device has no name for. */
	naming: boolean;
	opening: boolean;
	/** Missing when there is no profile to open. */
	open: (() => void) | undefined;
};

/**
 * One person on the page. Grindr is asked straight away only when this device
 * has no name for them; otherwise only when they are opened.
 */
export function usePerson(
	profileId: string | null,
	localName: string | null | undefined,
): PersonHandle {
	const people = useContext(StatsPeopleContext);
	const needsName = !localName?.trim();
	const [lookup, setLookup] = useState<PersonLookup | null>(() =>
		profileId && people ? people.known(profileId) : null,
	);
	const [opening, setOpening] = useState(false);

	useEffect(() => {
		if (!needsName || !profileId || !people) return;
		let cancelled = false;
		void people.lookUp(profileId).then((result) => {
			if (!cancelled) setLookup(result);
		});
		return () => {
			cancelled = true;
		};
	}, [needsName, people, profileId]);

	const closed = lookup != null && CLOSED_STATES.has(lookup.state);
	return {
		lookup,
		naming: needsName && profileId != null && people != null && !lookup,
		opening,
		open:
			profileId && people && !closed
				? () => {
						if (opening) return;
						setOpening(true);
						void people.open(profileId).then((result) => {
							setLookup(result);
							setOpening(false);
						});
					}
				: undefined,
	};
}

export function personDisplayName(
	t: TFunction,
	localName: string | null | undefined,
	person: PersonHandle,
): string {
	return (
		localName?.trim() ||
		person.lookup?.name ||
		(person.naming ? "…" : t("stats.person.unknown", { defaultValue: "Unknown" }))
	);
}

/** Why their profile cannot be opened, or that you blocked them. */
export function personStateLabel(
	t: TFunction,
	state: PersonState | undefined,
): string | null {
	if (state === "deleted")
		return t("stats.person.deleted", { defaultValue: "profile deleted" });
	if (state === "blocked_you")
		return t("stats.person.blocked_you", { defaultValue: "blocked you" });
	if (state === "you_blocked")
		return t("stats.person.you_blocked", { defaultValue: "you blocked them" });
	return null;
}

/** A person's name inside a line of text, opening their profile when tapped. */
export function PersonLink({
	profileId,
	name,
	suffix,
}: {
	profileId: string | null;
	name: string | null | undefined;
	suffix?: string;
}) {
	const { t } = useTranslation();
	const person = usePerson(profileId, name);
	const text = [
		personDisplayName(t, name, person),
		personStateLabel(t, person.lookup?.state),
		suffix,
	]
		.filter(Boolean)
		.join(" · ");
	if (!person.open) return <>{text}</>;
	return (
		<button
			type="button"
			onClick={person.open}
			disabled={person.opening}
			className="max-w-full truncate align-bottom hover:text-[var(--accent)] disabled:opacity-60"
		>
			{text}
		</button>
	);
}
