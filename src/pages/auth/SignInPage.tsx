import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { AuthShell } from "../../components/ui/auth-shell";
import { Button } from "../../components/ui/button";
import { BugReportButton } from "../../components/ui/BugReportButton";
import type { SignInMethod } from "../../types/auth";
import { useTranslation } from "react-i18next";


export function SignInPage() {
	const { t } = useTranslation();
	const [method, setMethod] = useState<SignInMethod>("password");

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);

	const [jwtToken, setJwtToken] = useState("");
	const [isTokenLoading, setIsTokenLoading] = useState(false);

	const { login, loginWithJwt, error } = useAuth();
	const navigate = useNavigate();

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

	return (
		<AuthShell
			title={t("auth.sign_in.title")}
			subtitle={t("auth.sign_in.subtitle")}
			footer={
				<div className="flex flex-col items-center gap-3">
					<Link
						to="/auth/sign-up"
						className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						{t("auth.sign_in.no_account")}
					</Link>
					<BugReportButton />
				</div>
			}
		>
			{/* Method selector */}
			<div className="mb-5 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1">
				<button
					type="button"
					onClick={() => setMethod("password")}
					className={`flex-1 rounded-[10px] py-2 text-sm font-medium transition-colors ${
						method === "password"
							? "bg-[var(--accent)] text-[var(--accent-contrast)]"
							: "text-[var(--text-muted)] hover:text-[var(--text)]"
					}`}
				>
					{t("auth.sign_in.method_password")}
				</button>
				<button
					type="button"
					onClick={() => setMethod("token")}
					className={`flex-1 rounded-[10px] py-2 text-sm font-medium transition-colors ${
						method === "token"
							? "bg-[var(--accent)] text-[var(--accent-contrast)]"
							: "text-[var(--text-muted)] hover:text-[var(--text)]"
					}`}
				>
					{t("auth.sign_in.method_token")}
				</button>
			</div>

			{method === "password" ? (
				<form onSubmit={handlePasswordSubmit} className="space-y-3">
					<div>
						<label className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
							{t("auth.common.email")}
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="input-field"
							placeholder="your@email.com"
						/>
					</div>
					<div>
						<label className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
							{t("auth.common.password")}
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="input-field"
							placeholder="••••••••"
						/>
					</div>
					{error ? <p className="text-sm text-[var(--text-muted)]">{error}</p> : null}
					<div className="pt-1">
						<Button
							type="submit"
							variant="primary"
							loading={isPasswordLoading}
							className="w-full"
						>
							{isPasswordLoading
								? t("auth.sign_in.signing_in")
								: t("auth.sign_in.submit")}
						</Button>
					</div>
				</form>
			) : (
				<form onSubmit={handleTokenSubmit} className="space-y-3">
					<div>
						<label className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
							{t("auth.sign_in.jwt_label")}
						</label>
						<input
							type="text"
							value={jwtToken}
							onChange={(e) => setJwtToken(e.target.value)}
							required
							className="input-field"
							placeholder="eyJhbGciOi..."
							autoComplete="off"
						/>
						<a
							href="https://freegrinddocs.imaoreo.dev/guide/login"
							target="_blank"
							rel="noreferrer"
							className="mt-1.5 block text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
						>
							{t("auth.sign_in.token_help")}
						</a>
					</div>
					{error ? <p className="text-sm text-[var(--text-muted)]">{error}</p> : null}
					<div className="pt-1">
						<Button
							type="submit"
							variant="primary"
							loading={isTokenLoading}
							className="w-full"
						>
							{isTokenLoading
								? t("auth.sign_in.signing_in")
								: t("auth.sign_in.sign_in_with_token")}
						</Button>
					</div>
				</form>
			)}
		</AuthShell>
	);
}
