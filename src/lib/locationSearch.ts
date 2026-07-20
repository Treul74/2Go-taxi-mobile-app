import {
  geocodeAddress,
  getPlaceAutocomplete,
  getPlaceDetails,
  reverseGeocodeComponents,
  type PlacePrediction,
} from '@/lib/google';
import { decodePlusCode, encodePlusCode, extractPlusCode } from '@/lib/plusCode';
import type { Location } from '@/types';

/**
 * Location search resolver.
 *
 * Accepts flexible input — a Plus Code alone, a place/address name alone, a
 * district name alone, or a combined "Address, Plus Code, District" string —
 * and resolves it to one consistent result shape, regardless of which input
 * type was used. Plus Code detection/decoding goes through plusCode.ts; text
 * search goes through google/mapsApi.ts (the only file allowed to call
 * Google Maps REST endpoints).
 */

export interface LocationSearchResult {
  addressName: string;
  plusCode: string | null;
  districtName: string | null;
  latitude: number;
  longitude: number;
}

export type LocationSearchOutcome =
  | { type: 'resolved'; result: LocationSearchResult }
  | { type: 'places'; predictions: PlacePrediction[] }
  | { type: 'not_found' };

interface ReferenceLocation {
  latitude: number;
  longitude: number;
}

/** Maps a unified search result onto the app-wide Location shape. */
export function toLocation(result: LocationSearchResult): Location {
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    address: result.addressName,
    plusCode: result.plusCode ?? undefined,
    district: result.districtName,
  };
}

/**
 * Resolves a Plus Code (with optional accompanying locality text) to a full
 * search result: decode -> reverse geocode for address_name/district_name.
 *
 * Short codes need a reference point. Preference order: the locality found
 * alongside the code in the input, then the caller's current/last known
 * location — matching how Google's own short codes resolve.
 */
async function resolvePlusCode(
  code: string,
  locality: string | null,
  referenceLocation?: ReferenceLocation
): Promise<LocationSearchResult | null> {
  let reference: ReferenceLocation | undefined = referenceLocation;

  if (locality) {
    const geocoded = await geocodeAddress(locality);
    if (geocoded) {
      reference = { latitude: geocoded.latitude, longitude: geocoded.longitude };
    }
  }

  const decoded = decodePlusCode(code, reference);
  if (!decoded) return null;

  const geocodedBack = await reverseGeocodeComponents(decoded.latitude, decoded.longitude);

  return {
    addressName: geocodedBack?.formattedAddress ?? locality ?? code,
    plusCode: code,
    districtName: geocodedBack?.district ?? null,
    latitude: decoded.latitude,
    longitude: decoded.longitude,
  };
}

/**
 * Resolves a selected Places Autocomplete prediction to a full search
 * result: place details -> encode its Plus Code so it displays alongside
 * the name, same as a Plus Code-first resolution would.
 */
export async function resolvePlaceSelection(placeId: string): Promise<LocationSearchResult | null> {
  const details = await getPlaceDetails(placeId);
  if (!details) return null;

  const { latitude, longitude } = details.location;

  return {
    addressName: details.location.address,
    plusCode: encodePlusCode(latitude, longitude),
    districtName: details.district,
    latitude,
    longitude,
  };
}

/**
 * Entry point for the search screen: detects a Plus Code anywhere in the
 * input and resolves it directly, otherwise falls back to Places
 * Autocomplete text search.
 */
export async function searchLocation(
  query: string,
  referenceLocation?: Location
): Promise<LocationSearchOutcome> {
  const extracted = extractPlusCode(query);

  if (extracted) {
    const result = await resolvePlusCode(extracted.code, extracted.locality, referenceLocation);
    return result ? { type: 'resolved', result } : { type: 'not_found' };
  }

  const predictions = await getPlaceAutocomplete(query, referenceLocation);
  return predictions.length > 0 ? { type: 'places', predictions } : { type: 'not_found' };
}
