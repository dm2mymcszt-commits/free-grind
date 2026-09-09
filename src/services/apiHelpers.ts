import type { RestFetcher, RestResponse } from "../types/chat-service";
import { hasAnalyticsConsent } from "../utils/analyticsConsent";
import { appLog } from "../utils/logger";

export class ApiFunctionError extends Error {
	status: number;
	payload: unknown;

	constructor(message: string, status: number, payload: unknown) {
		super(message);
		this.name = "ApiFunctionError";
		this.status = status;
		this.payload = payload;
	}
}

export const GRINDAPI_BASE = "https://grindapi.imaoreo.dev";

export async function parseJsonSafe(response: RestResponse | Response): Promise<unknown> {
	try {
		return response.json();
	} catch {
		return null;
	}
}

export async function assertSuccess(response: RestResponse | Response, fallbackMessage: string) {
	const status = "status" in response ? response.status : (response as Response).status;
	if (status >= 200 && status < 300) {
		return;
	}

	const payload = await parseJsonSafe(response);
	let message = fallbackMessage;

	if (payload && typeof payload === "object") {
		const p = payload as Record<string, unknown>;
		if (typeof p.message === "string" && p.message) {
			message = p.message;
		} else if (typeof p.error === "string" && p.error) {
			message = p.error;
		}
	}

	throw new ApiFunctionError(message, status, payload);
}

export async function trackUpdateCheck(data: {
	channel: string;
	platform: string;
	arch: string;
	version: string;
	appVersion: string;
}, fetchRest?: RestFetcher): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const url = `${GRINDAPI_BASE}/api/analytics/track-update`;
		const response = fetchRest
			? await fetchRest(url, { method: "POST", body: data })
			: await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(data),
			});

		const status = "status" in response ? response.status : (response as Response).status;
		if (status < 200 || status >= 300) {
			appLog.warn(`Failed to track update check: ${status}`);
		}
	} catch (error) {
		appLog.error("Update tracking error:", error);
	}
}

export async function registerPresence(profileId: string | number, fetchRest?: RestFetcher): Promise<void> {
	if (!hasAnalyticsConsent()) {
		return;
	}

	try {
		const url = `${GRINDAPI_BASE}/api/presence/register`;
		const body = {
			profileId: String(profileId),
		};
		const response = fetchRest
			? await fetchRest(url, { method: "POST", body })
			: await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

		const status = "status" in response ? response.status : (response as Response).status;
		if (status < 200 || status >= 300) {
			appLog.warn(`Failed to register presence: ${status}`);
		}
	} catch (error) {
		appLog.error("Presence registration error:", error);
	}
}
