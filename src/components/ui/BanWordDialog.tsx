import { useEffect, useRef, useState } from "react";
import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { getForbiddenWords, setForbiddenWords } from "../../utils/autoblock";

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
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setWord(initialText);
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

	const handleConfirm = async () => {
		const wordToBan = word.trim();
		if (!wordToBan) return;

		setIsProcessing(true);
		try {
			const currentList = getForbiddenWords();
			const existingWords = currentList
				? currentList.split(",").map((w) => w.trim()).filter((w) => w.length > 0)
				: [];

			// Append cleanly & deduplicate case-insensitively
			const lowerToBan = wordToBan.toLowerCase();
			const alreadyExists = existingWords.some((w) => w.toLowerCase() === lowerToBan);

			let newListString = currentList;
			if (!alreadyExists) {
				const newList = [...existingWords, wordToBan];
				newListString = newList.join(", ");
				await setForbiddenWords(newListString);
			}

			toast.success(
				t("chat.actions.ban_word_added", {
					defaultValue: `Added "${wordToBan}" to forbidden keywords!`,
					word: wordToBan,
				}),
			);
			onSuccess?.(wordToBan);
			onClose();
		} catch (error) {
			toast.error("Failed to add forbidden keyword.");
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
				className="p-4"
			>
				<div className="flex items-center gap-2 text-[var(--accent)]">
					<Ban className="h-5 w-5 shrink-0" />
					<p className="text-base font-bold text-[var(--text)]">
						{t("chat.actions.ban_word_title", { defaultValue: "Ban Keyword" })}
					</p>
				</div>

				<p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
					{t("chat.actions.ban_word_prompt", {
						defaultValue: "Trim this message down to the specific keyword you want to ban:",
					})}
				</p>

				<div className="mt-3">
					<input
						ref={inputRef}
						type="text"
						value={word}
						onChange={(e) => setWord(e.target.value)}
						placeholder="Enter word to ban..."
						disabled={isProcessing}
						className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
					/>
				</div>

				{word.trim() && (
					<p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--accent)]/90 font-medium">
						<ShieldAlert className="h-3.5 w-3.5 shrink-0" />
						<span>Will autoblock any user matching "{word.trim()}"</span>
					</p>
				)}

				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
						disabled={isProcessing || !word.trim()}
						className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-50"
					>
						{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						<span>{t("chat.actions.ban_word_confirm", { defaultValue: "Add & Auto-Block" })}</span>
					</button>
				</div>
			</form>
		</dialog>
	);
}
