export type AnalyticsConsentChoice = "granted" | "denied";

export const ANALYTICS_CONSENT_STORAGE_KEY = "fg-analytics-consent";
export const ANALYTICS_CONSENT_EVENT = "fg-analytics-consent-change";

export function readAnalyticsConsentChoice(): AnalyticsConsentChoice | null {
	if (typeof window !== "undefined") {
		try {
			window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
		} catch {}
	}
	return "denied";
}

export function writeAnalyticsConsentChoice(_choice: AnalyticsConsentChoice): void {
	if (typeof window !== "undefined") {
		try {
			window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
			window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
		} catch {}
	}
}

export function hasAnalyticsConsent(): boolean {
	return false;
}
