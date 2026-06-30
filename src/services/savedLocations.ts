import { appLog } from "../utils/logger";
import { geohashSchema } from "../utils/geohash";
import z from "zod";

export const SAVED_LOCATIONS_STORAGE_KEY = "fg-saved-locations";

const savedLocationSchema = z.object({
	id: z.string(),
	name: z.string(),
	geohash: geohashSchema,
	lat: z.number(),
	lon: z.number(),
});

export type SavedLocation = z.infer<typeof savedLocationSchema>;

export function loadSavedLocations(): SavedLocation[] {
	if (typeof window === "undefined") {
		return [];
	}

	try {
		const stored = window.localStorage.getItem(SAVED_LOCATIONS_STORAGE_KEY);
		if (!stored) {
			return [];
		}
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) {
			return [];
		}
		const result: SavedLocation[] = [];
		for (const item of parsed) {
			const parsedItem = savedLocationSchema.safeParse(item);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[savedLocations] loadSavedLocations failed", error);
		return [];
	}
}

function persist(locations: SavedLocation[]): void {
	window.localStorage.setItem(SAVED_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
}

export function addSavedLocation(input: {
	name: string;
	geohash: string;
	lat: number;
	lon: number;
}): SavedLocation[] {
	const existing = loadSavedLocations();
	const entry: SavedLocation = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: input.name.trim(),
		geohash: input.geohash,
		lat: input.lat,
		lon: input.lon,
	};
	const next = [...existing, entry];
	persist(next);
	return next;
}

export function deleteSavedLocation(id: string): SavedLocation[] {
	const next = loadSavedLocations().filter((location) => location.id !== id);
	persist(next);
	return next;
}
