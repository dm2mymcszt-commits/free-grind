/**
 * geocoding.ts — reverse-geocodes a geohash into a human-readable place
 * name (e.g. "Berlin, Germany") via Nominatim, the same free OSM-backed
 * service already used for forward search in LocationOverlay.tsx.
 *
 * Results are cached by geohash for the lifetime of the session — travel
 * plan geohashes are low-cardinality (the same handful of places tend to
 * recur) and Nominatim's usage policy expects clients to cache rather than
 * re-request the same lookup.
 */

import { decodeGeohash } from "../../../utils/geohash";
import { appLog } from "../../../utils/logger";

const cache = new Map<string, Promise<string | null>>();

export type NominatimAddress = {
	road?: string;
	house_number?: string;
	neighbourhood?: string;
	suburb?: string;
	borough?: string;
	city_district?: string;
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	state?: string;
	country?: string;
};

type NominatimReverseResponse = {
	address?: NominatimAddress;
	display_name?: string;
};

/**
 * "Street Housenumber, City, District" — street+number leads (most specific,
 * and the two read naturally together), then city, then district last.
 * Reads better than Nominatim's own display_name order (housenumber,
 * street, district, city). Shared between reverse geocoding and forward
 * search results so both render addresses identically.
 */
export function formatNominatimAddress(address: NominatimAddress, fallback: string | null): string | null {
	const street = address.road
		? (address.house_number ? `${address.road} ${address.house_number}` : address.road)
		: null;
	const cityName = address.city ?? address.town ?? address.village ?? address.municipality ?? null;
	const district = address.neighbourhood ?? address.suburb ?? address.borough ?? address.city_district ?? null;

	const parts = [street, cityName, district].filter(
		(part, index, all): part is string => !!part && all.indexOf(part) === index,
	);
	if (parts.length > 0) {
		return parts.join(", ");
	}
	return address.country ?? fallback;
}

async function fetchReverseGeocode(lat: number, lon: number): Promise<string | null> {
	try {
		// zoom=18 (building/street level) — anything coarser collapses picks
		// that are a few streets apart into the same neighbourhood/suburb
		// result, since those fields don't change within a whole district.
		// Only the `road` field changes street-to-street, so resolving that
		// fine is the only way to reflect small map moves.
		const response = await fetch(
			`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lon}`,
			{ headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
		);
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as NominatimReverseResponse;
		if (!data.address) {
			return data.display_name ?? null;
		}
		return formatNominatimAddress(data.address, data.display_name ?? null);
	} catch (error) {
		appLog.warn("[geocoding] reverse lookup failed", error);
		return null;
	}
}

/** Resolves a geohash to a "City, Country"-style label, or null if it can't be resolved. Cached per geohash for the session. */
export function reverseGeocodeGeohash(geohash: string): Promise<string | null> {
	const cached = cache.get(geohash);
	if (cached) {
		return cached;
	}

	const run = (async () => {
		try {
			const decoded = decodeGeohash(geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			return await fetchReverseGeocode(lat, lon);
		} catch (error) {
			appLog.warn(`[geocoding] failed to decode geohash ${geohash}`, error);
			return null;
		}
	})();

	cache.set(geohash, run);
	return run;
}
