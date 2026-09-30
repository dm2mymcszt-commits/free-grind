import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import type { SignInMethod, SignInProvider } from "../../types/auth";
import { useTranslation } from "react-i18next";
import { Mail, Lock, KeyRound, AlertCircle, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";

function AuthMethodTab({
	active,
	icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
				active
					? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md shadow-[var(--accent)]/25"
					: "text-[var(--text-muted)] hover:text-[var(--text)]",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

function IconInput({
	icon,
	className,
	rightSlot,
	...inputProps
}: { icon: ReactNode; rightSlot?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
	return (
		<div className="group relative">
			<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors duration-150 group-focus-within:text-[var(--accent)]">
				{icon}
			</span>
			<input {...inputProps} className={cn("input-field pl-9", rightSlot && "pr-10", className)} />
			{rightSlot ? (
				<span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
			) : null}
		</div>
	);
}

function AuthSubmitSection({
	error,
	loading,
	disabled,
	loadingLabel,
	label,
}: {
	error: string | null;
	loading: boolean;
	disabled: boolean;
	loadingLabel: string;
	label: string;
}) {
	return (
		<>
			{error ? (
				<div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--border)_60%,#f87171_40%)] bg-[color-mix(in_srgb,var(--surface)_88%,#f87171_12%)] px-3 py-2.5 text-sm text-[var(--text)]">
					<AlertCircle className="h-4 w-4 shrink-0 text-[#f87171]" />
					<span>{error}</span>
				</div>
			) : null}
			<div className="pt-1">
				<Button
					type="submit"
					variant="primary"
					loading={loading}
					disabled={disabled}
					className="w-full"
				>
					{loading ? loadingLabel : label}
				</Button>
			</div>
		</>
	);
}

function GoogleMark() {
	return (
		<svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
			<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
			<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
			<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
			<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
		</svg>
	);
}

function AppleMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
			<path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
		</svg>
	);
}

function FacebookMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
			<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
		</svg>
	);
}

const PROVIDERS: {
	id: SignInProvider;
	name: string;
	mark: ReactNode;
	className: string;
}[] = [
	{
		id: "google",
		name: "Google",
		mark: <GoogleMark />,
		className: "border border-[#dadce0] bg-white text-[#1f1f1f] hover:bg-[#f7f8f8]",
	},
	{
		id: "apple",
		name: "Apple",
		mark: <AppleMark />,
		// The light edge keeps the black button visible on a dark theme.
		className: "border border-white/15 bg-black text-white hover:bg-[#1a1a1a]",
	},
	{
		id: "facebook",
		name: "Facebook",
		mark: <FacebookMark />,
		className: "bg-[#1877F2] text-white hover:bg-[#166fe0]",
	},
];

function ProviderSignIn({
	pending,
	disabled,
	onSignIn,
	onCancel,
}: {
	pending: SignInProvider | null;
	disabled: boolean;
	onSignIn: (provider: SignInProvider) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const pendingName = PROVIDERS.find((provider) => provider.id === pending)?.name ?? "";
	return (
		<div className="mt-6">
			<div className="mb-4 flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
				<span className="h-px flex-1 bg-[var(--border)]" />
				{t("auth.sign_in.or", { defaultValue: "or" })}
				<span className="h-px flex-1 bg-[var(--border)]" />
			</div>
			<div className="space-y-2.5">
				{PROVIDERS.map((provider) => (
					<button
						key={provider.id}
						type="button"
						onClick={() => onSignIn(provider.id)}
						disabled={disabled || pending != null}
						className={cn(
							"flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
							provider.className,
						)}
					>
						{pending === provider.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : provider.mark}
						{t("auth.sign_in.continue_with", {
							defaultValue: "Continue with {{provider}}",
							provider: provider.name,
						})}
					</button>
				))}
			</div>
			{pending ? (
				<div className="mt-3 flex flex-col items-center gap-1.5 text-center text-xs text-[var(--text-muted)]">
					<span>
						{t("auth.sign_in.provider_waiting", {
							defaultValue: "Finish signing in with {{provider}} in the window that opened.",
							provider: pendingName,
						})}
					</span>
					<button
						type="button"
						onClick={onCancel}
						className="font-semibold text-[var(--text)] underline-offset-2 hover:underline"
					>
						{t("common.cancel", { defaultValue: "Cancel" })}
					</button>
				</div>
			) : null}
		</div>
	);
}

export function SignInPage() {
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const addProfileMode = searchParams.get("mode") === "add-profile";
	const [method, setMethod] = useState<SignInMethod>("password");

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);

	const [jwtToken, setJwtToken] = useState("");
	const [isTokenLoading, setIsTokenLoading] = useState(false);

	const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(null);

	const { login, loginWithJwt, loginWithProvider, cancelProviderLogin, error } = useAuth();
	const navigate = useNavigate();

	const isPasswordFormValid = email.trim().length > 0 && password.trim().length > 0;
	const isTokenFormValid = jwtToken.trim().length > 0;

	const handlePasswordSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsPasswordLoading(true);
		try {
			await login(email, password);
			navigate("/");
		} catch {
			// AuthContext updates `error`, which is rendered in the form.
		} finally {
			setIsPasswordLoading(false);
		}
	};

	const handleTokenSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsTokenLoading(true);
		try {
			await loginWithJwt(jwtToken.trim());
			navigate("/");
		} catch {
			// AuthContext updates `error`, which is rendered in the form.
		} finally {
			setIsTokenLoading(false);
		}
	};

	const handleProviderSignIn = async (provider: SignInProvider) => {
		setPendingProvider(provider);
		try {
			if (await loginWithProvider(provider)) {
				navigate("/");
			}
		} catch {
			// AuthContext updates `error`, which is rendered in the form.
		} finally {
			setPendingProvider(null);
		}
	};

	return (
		<AuthShell
			title={addProfileMode ? t("auth.sign_in.add_profile_title", { defaultValue: "Add Profile" }) : t("auth.sign_in.title")}
			subtitle={addProfileMode ? t("auth.sign_in.add_profile_subtitle", { defaultValue: "Sign in with the account you want to add." }) : t("auth.sign_in.subtitle")}
			footer={
				addProfileMode ? (
					<div className="flex flex-col items-center gap-3">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
						>
							{t("common.cancel", { defaultValue: "Cancel" })}
						</button>
					</div>
				) : undefined
			}
		>
			{/* Method selector */}
			<div className="mb-6 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1 shadow-sm">
				<AuthMethodTab
					active={method === "password"}
					icon={<Lock className="h-3.5 w-3.5" />}
					label={t("auth.sign_in.method_password")}
					onClick={() => setMethod("password")}
				/>
				<AuthMethodTab
					active={method === "token"}
					icon={<KeyRound className="h-3.5 w-3.5" />}
					label={t("auth.sign_in.method_token")}
					onClick={() => setMethod("token")}
				/>
			</div>

			{method === "password" ? (
				<form key="password" onSubmit={handlePasswordSubmit} className="animate-fade-in space-y-3">
					<IconInput
						icon={<Mail className="h-4 w-4" />}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoFocus
						placeholder={t("auth.common.email")}
					/>
					<IconInput
						icon={<Lock className="h-4 w-4" />}
						type={showPassword ? "text" : "password"}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						placeholder={t("auth.common.password")}
						rightSlot={
							<button
								type="button"
								onClick={() => setShowPassword((prev) => !prev)}
								className="flex items-center p-0 text-[var(--text-muted)] hover:text-[var(--text)]"
								tabIndex={-1}
								aria-label={
									showPassword
										? t("auth.common.hide_password")
										: t("auth.common.show_password")
								}
							>
								{showPassword ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						}
					/>
					<AuthSubmitSection
						error={error}
						loading={isPasswordLoading}
						disabled={!isPasswordFormValid}
						loadingLabel={t("auth.sign_in.signing_in")}
						label={t("auth.sign_in.submit")}
					/>
				</form>
			) : (
				<form key="token" onSubmit={handleTokenSubmit} className="animate-fade-in space-y-3">
					<div>
						<a
							href="https://freegrinddocs.imaoreo.dev/guide/login"
							target="_blank"
							rel="noreferrer"
							className="mb-2 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-[var(--accent)] hover:underline"
						>
							<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{t("auth.sign_in.token_help")}</span>
						</a>
						<IconInput
							icon={<KeyRound className="h-4 w-4" />}
							type="text"
							value={jwtToken}
							onChange={(e) => setJwtToken(e.target.value)}
							required
							autoFocus
							placeholder="eyJhbGciOi..."
							autoComplete="off"
						/>
					</div>
					<AuthSubmitSection
						error={error}
						loading={isTokenLoading}
						disabled={!isTokenFormValid}
						loadingLabel={t("auth.sign_in.signing_in")}
						label={t("auth.sign_in.submit")}
					/>
				</form>
			)}

			<ProviderSignIn
				pending={pendingProvider}
				disabled={isPasswordLoading || isTokenLoading}
				onSignIn={(provider) => void handleProviderSignIn(provider)}
				onCancel={() => void cancelProviderLogin()}
			/>
		</AuthShell>
	);
}
