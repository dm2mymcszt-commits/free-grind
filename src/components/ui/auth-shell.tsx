import type { ReactNode } from "react";

export function AuthShell({
	title,
	subtitle,
	children,
	footer,
}: {
	title: string;
	subtitle: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="fs-card-outer">
			<div className="fs-card-inner">
				{/* Header */}
				<div
					className="animate-fade-in flex shrink-0 flex-col items-center px-6 pb-10 text-center"
					style={{ paddingTop: "max(64px, env(safe-area-inset-top))" }}
				>
					<img
						src="/newLogo.webp"
						alt="Free Grind"
						className="mb-7 h-16 w-16 rounded-2xl object-cover"
					/>
					<h1 className="text-2xl font-bold text-[var(--text)]">{title}</h1>
					<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
				</div>

				{/* Form */}
				<div className="animate-fade-in flex flex-1 flex-col overflow-y-auto px-6">
					<div className="flex-1">{children}</div>
					{footer ? (
						<div
							className="mt-6 text-center"
							style={{ paddingBottom: "max(56px, calc(env(safe-area-inset-bottom) + 24px))" }}
						>
							{footer}
						</div>
					) : (
						<div style={{ paddingBottom: "max(56px, calc(env(safe-area-inset-bottom) + 24px))" }} />
					)}
				</div>
			</div>
		</div>
	);
}
