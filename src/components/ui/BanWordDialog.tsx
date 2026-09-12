import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, Loader2, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { addKeywordTo, findKeywordIn, type KeywordListName } from "../../utils/autoblock";
import { canMatchAnywhere, type KeywordEntry, type KeywordMatchMode } from "../../utils/keywordList";
import { MATCH_MODE_LABELS, MATCH_MODE_OPTIONS, suggestedMatchMode } from "./KeywordEditor";
import { SegmentedChoice } from "./segmented-choice";

type Destination = KeywordListName | "both";

const DESTINATION_OPTIONS: readonly { value: Destination; label: string }[] = [
	{ value: "forbidden", label: "Forbidden keywords" },
	{ value: "openers", label: "Opening messages" },
	{ value: "both", label: "Both" },
];

const LIST_LABELS: Record<KeywordListName, string> = {
	forbidden: "Forbidden keywords",
	openers: "Opening messages",
};

function listsFor(destination: Destination): KeywordListName[] {
	return destination === "both" ? ["forbidden", "openers"] : [destination];
}

function describeExisting(list: KeywordListName, entry: KeywordEntry): string {
	return `${LIST_LABELS[list]} (${MATCH_MODE_LABELS[entry.mode]})`;
}

function joinLabels(labels: string[]): string {
	return labels.join(" and ");
}

type BanWordDialogProps = {
	isOpen: boolean;
	initialText: string;
	onClose: () => void;
	onSuccess?: (word: string) => void;
};

export function BanWordDialog({
	isOpen,
	initialText,
	onClose,
	onSuccess,
}: BanWordDialogProps) {
	const { t } = useTranslation();
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [word, setWord] = useState(initialText);
	const [destination, setDestination] = useState<Destination>("forbidden");
	const [mode, setMode] = useState<KeywordMatchMode>(() => suggestedMatchMode(initialText));
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setWord(initialText);
			setMode(suggestedMatchMode(initialText));
		}
	}, [isOpen, initialText]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (isOpen) {
			if (!dialog.open) {
				try {
					dialog.showModal();
				} catch {
					dialog.show();
				}
			}
			setTimeout(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			}, 50);
		} else if (dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		const handleCancel = (event: Event) => {
			event.preventDefault();
			if (!isProcessing) {
				onClose();
			}
		};

		dialog.addEventListener("cancel", handleCancel);
		return () => {
			dialog.removeEventListener("cancel", handleCancel);
		};
	}, [isProcessing, onClose]);

	const text = word.trim();
	const lists = listsFor(destination);
	// Checked as it is typed, so a keyword that is already there is flagged
	// before anyone presses the button.
	const existing = text
		? lists.flatMap((list) => {
				const entry = findKeywordIn(list, text);
				return entry ? [{ list, entry }] : [];
			})
		: [];
	const newLists = lists.filter((list) => !existing.some((item) => item.list === list));
	const forcedWhole = mode === "anywhere" && text !== "" && !canMatchAnywhere(text);
	const effectiveMode: KeywordMatchMode = forcedWhole ? "whole" : mode;

	const handleConfirm = async () => {
		if (!text) return;

		setIsProcessing(true);
		try {
			const added: KeywordListName[] = [];
			const alreadyThere: string[] = [];
			for (const list of lists) {
				const result = await addKeywordTo(list, text, effectiveMode);
				if (result.added) {
					added.push(list);
				} else if (result.existing) {
					alreadyThere.push(describeExisting(list, result.existing));
				}
			}

			if (added.length === 0) {
				// Nothing new: say so and leave the dialog open to change it.
				toast.error(`"${text}" is already in ${joinLabels(alreadyThere)}.`, { id: "ban-word-duplicate" });
				return;
			}

			toast.success(
				`Added "${text}" to ${joinLabels(added.map((list) => LIST_LABELS[list]))}.${
					alreadyThere.length > 0 ? ` It was already in ${joinLabels(alreadyThere)}.` : ""
				}`,
			);
			onSuccess?.(text);
			onClose();
		} catch {
			toast.error("Failed to add the keyword.");
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<dialog
			ref={dialogRef}
			className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/45 z-50"
			onClick={(event) => {
				if (event.target === dialogRef.current && !isProcessing) {
					onClose();
				}
			}}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					void handleConfirm();
				}}
				className="grid gap-4 p-4"
			>
				<div>
					<div className="flex items-center gap-2 text-red-400">
						<Ban className="h-5 w-5 shrink-0" />
						<p className="text-base font-bold text-[var(--text)]">Ban keyword</p>
					</div>
					<p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
						Trim this message down to what you want to block.
					</p>
				</div>

				<input
					ref={inputRef}
					type="text"
					value={word}
					onChange={(e) => setWord(e.target.value)}
					placeholder="Keyword or phrase"
					disabled={isProcessing}
					className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
				/>

				<div className="grid gap-1.5">
					<p className="text-xs font-semibold text-[var(--text-muted)]">Add to</p>
					<SegmentedChoice
						fullWidth
						value={destination}
						options={DESTINATION_OPTIONS}
						onChange={setDestination}
						ariaLabel="Add to"
						disabled={isProcessing}
					/>
				</div>

				<div className="grid gap-1.5">
					<p className="text-xs font-semibold text-[var(--text-muted)]">Match</p>
					<SegmentedChoice
						fullWidth
						value={effectiveMode}
						options={MATCH_MODE_OPTIONS}
						onChange={setMode}
						ariaLabel="Match"
						disabled={isProcessing}
					/>
					{forcedWhole ? (
						<p className="text-[11px] text-[var(--text-muted)]">
							It contains a comma, so it can only match the whole message.
						</p>
					) : null}
				</div>

				{existing.length > 0 ? (
					<p role="status" className="flex items-start gap-1.5 text-xs font-medium text-amber-400">
						<AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
						<span>
							Already in {joinLabels(existing.map((item) => describeExisting(item.list, item.entry)))}.
							{newLists.length > 0
								? ` It will only be added to ${joinLabels(newLists.map((list) => LIST_LABELS[list]))}.`
								: ""}
						</span>
					</p>
				) : text ? (
					<div className="grid gap-1 text-[11px] font-medium text-amber-400/90">
						{lists.map((list) => (
							<p key={list} className="flex items-start gap-1.5">
								<ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
								<span>
									{list === "openers"
										? effectiveMode === "whole"
											? `Blocks when someone's first message is exactly "${text}".`
											: `Blocks when someone's first message contains "${text}".`
										: effectiveMode === "whole"
											? `Blocks when a name, bio or message is exactly "${text}".`
											: `Blocks when a name, bio or message contains "${text}".`}
								</span>
							</p>
						))}
					</div>
				) : null}

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={onClose}
						disabled={isProcessing}
						className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
					>
						{t("common.cancel", { defaultValue: "Cancel" })}
					</button>
					<button
						type="submit"
						disabled={isProcessing || !text}
						className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/20 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
					>
						{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						<span>Add and auto-block</span>
					</button>
				</div>
			</form>
		</dialog>
	);
}
