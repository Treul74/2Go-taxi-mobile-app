import { getGoogleMapsApiKey } from '@/constants/env';
import { calculateDistanceMeters } from '@/lib/distance';
import type { Location } from '@/types';
import { decode } from '@googlemaps/polyline-codec';

/**
 * Google Maps API wrapper for Places and Directions
 * Provides autocomplete, geocoding, and routing functionality
 */

const BASE_URL = 'https://maps.googleapis.com/maps/api';

/**
 * Picks the best district/locality name out of a Google address_components
 * array. Zambia's districts are usually returned as administrative_area_level_2
 * (or locality when Google's data models the place as a town rather than a
 * formal district) — prefer those over the broader province-level component.
 */
function extractDistrict(components: any[] | undefined): string | null {
  if (!components || components.length === 0) return null;

  const preferenceOrder = [
    'administrative_area_level_2',
    'locality',
    'sublocality',
    'administrative_area_level_1',
  ];

  for (const type of preferenceOrder) {
    const match = components.find((c: any) => (c.types || []).includes(type));
    if (match) return match.long_name;
  }

  return null;
}

/**
 * Place autocomplete prediction
 */
export interface PlacePrediction {
  placeId: string;
  description: string;
  structuredFormatting: {
    mainText: string;
    secondaryText: string;
  };
}

/**
 * Place details result
 */
export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: Location;
  /** Best-guess district/locality name parsed from address_components, if any. */
  district: string | null;
}

/**
 * Direction result
 */
export interface DirectionResult {
  distance: {
    text: string;
    value: number; // in meters
  };
  duration: {
    text: string;
    value: number; // in seconds
  };
  /** Live-traffic-adjusted duration — only present when the request passed `{ departureTimeNow: true }` (driving mode only). */
  durationInTraffic?: {
    text: string;
    value: number; // in seconds
  };
  polyline: string; // encoded polyline
  coordinates: Array<{ latitude: number; longitude: number }>;
  steps: DirectionStep[];
  startAddress: string;
  endAddress: string;
}

export interface DirectionStep {
  instruction: string;
  distance: {
    text: string;
    value: number; // in meters
  };
  duration: {
    text: string;
    value: number; // in seconds
  };
  startLocation: { latitude: number; longitude: number };
  endLocation: { latitude: number; longitude: number };
  maneuver?: string;
  /** Encoded polyline covering just this step (Google's `step.polyline.points`) — undecoded, so callers only pay the decode cost if they need it. */
  polyline: string;
}

/** Extra request options shared by `getDirections`/`getAllRoutes`. */
export interface DirectionsOptions {
  /** Requests a live-traffic-adjusted duration via `departure_time=now` (populates `DirectionResult.durationInTraffic`). Only meaningful for `mode: 'driving'`. */
  departureTimeNow?: boolean;
}

/**
 * Get place autocomplete predictions based on user input
 */
export async function getPlaceAutocomplete(
  input: string,
  location?: Location,
  radius: number = 50000 // 50km default
): Promise<PlacePrediction[]> {
  if (!input || input.length < 2) {
    return [];
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      input,
      key: apiKey,
      // 'types' only accepts a single value from Google's table (geocode,
      // address, establishment, (regions), (cities)) — pipe-combining values
      // like 'geocode|establishment' is invalid and was causing malls, bars,
      // car washes, and other establishment types to silently fail to return.
      types: 'establishment',
      components: 'country:zm', // Restrict to Zambia
    });

    // Add location bias if provided (prioritize nearby results)
    if (location) {
      params.append('location', `${location.latitude},${location.longitude}`);
      params.append('radius', radius.toString());
      params.append('strictbounds', 'false'); // Allow some flexibility but prioritize radius
    } else {
      // Default to Lusaka, Zambia center if no location
      params.append('location', '-15.4167,28.2833');
      params.append('radius', '100000'); // 100km from Lusaka
    }

    const response = await fetch(
      `${BASE_URL}/place/autocomplete/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places Autocomplete error:', data.status, data.error_message);
      return [];
    }

    if (!data.predictions || data.predictions.length === 0) {
      return [];
    }

    return data.predictions.map((pred: any) => ({
      placeId: pred.place_id,
      description: pred.description,
      structuredFormatting: {
        mainText: pred.structured_formatting?.main_text || pred.description,
        secondaryText: pred.structured_formatting?.secondary_text || '',
      },
    }));
  } catch (error) {
    console.error('Error fetching place autocomplete:', error);
    return [];
  }
}

/**
 * Get place details (including coordinates) from place ID
 * Constructs a complete address that includes the place name
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'place_id,name,formatted_address,geometry,types,address_components',
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/place/details/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Place Details error:', data.status, data.error_message);
      return null;
    }

    const result = data.result;

    // Construct a complete address with place name
    // If the place is an establishment (business, landmark), include the name
    // Otherwise, just use the formatted address
    const types = result.types || [];
    const isEstablishment = types.includes('establishment') ||
      types.includes('point_of_interest') ||
      types.includes('lodging') ||
      types.includes('restaurant') ||
      types.includes('shopping_mall');

    let completeAddress = result.formatted_address;

    // If it's a specific place (not a generic location like city/country)
    // and the name is not already in the formatted_address, prepend it
    if (isEstablishment && result.name) {
      const nameLower = result.name.toLowerCase();
      const addressLower = result.formatted_address.toLowerCase();

      // Check if name is already in the address
      if (!addressLower.includes(nameLower)) {
        completeAddress = `${result.name}, ${result.formatted_address}`;
      }
    }

    return {
      placeId: result.place_id,
      name: result.name,
      formattedAddress: result.formatted_address,
      location: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        address: completeAddress, // Use the complete address with place name
      },
      district: extractDistrict(result.address_components),
    };
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
  }
}

/**
 * Maps one raw Google Directions API `route` entry (as found in
 * `data.routes[]`) into this module's `DirectionResult` shape. Shared by
 * `getDirections` (single route) and `getAllRoutes` (every alternative), so
 * the two can never drift into separately-maintained mapping logic.
 */
function mapGoogleRouteToDirectionResult(route: any): DirectionResult {
  const leg = route.legs[0];

  // Decode polyline
  const polylineEncoded = route.overview_polyline.points;
  const decodedPath = decode(polylineEncoded);
  const coordinates = decodedPath.map(([lat, lng]) => ({
    latitude: lat,
    longitude: lng,
  }));

  const steps: DirectionStep[] = (leg.steps || []).map((step: any) => ({
    instruction: step.html_instructions || '',
    distance: {
      text: step.distance.text,
      value: step.distance.value,
    },
    duration: {
      text: step.duration.text,
      value: step.duration.value,
    },
    startLocation: {
      latitude: step.start_location.lat,
      longitude: step.start_location.lng,
    },
    endLocation: {
      latitude: step.end_location.lat,
      longitude: step.end_location.lng,
    },
    maneuver: step.maneuver,
    polyline: step.polyline?.points ?? '',
  }));

  return {
    distance: {
      text: leg.distance.text,
      value: leg.distance.value,
    },
    duration: {
      text: leg.duration.text,
      value: leg.duration.value,
    },
    durationInTraffic: leg.duration_in_traffic
      ? { text: leg.duration_in_traffic.text, value: leg.duration_in_traffic.value }
      : undefined,
    polyline: polylineEncoded,
    coordinates,
    steps,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
  };
}

/**
 * Get directions between two points
 */
export async function getDirections(
  origin: Location,
  destination: Location,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
  options?: DirectionsOptions
): Promise<DirectionResult | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode,
      key: apiKey,
    });
    if (options?.departureTimeNow) {
      params.append('departure_time', 'now');
    }

    const response = await fetch(
      `${BASE_URL}/directions/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Directions error:', data.status, data.error_message);
      return null;
    }

    return mapGoogleRouteToDirectionResult(data.routes[0]);
  } catch (error) {
    console.error('Error fetching directions:', error);
    return null;
  }
}

/**
 * Get every alternative route Google offers between two points (Directions
 * API `alternatives=true`). Kept as a separate function rather than a param
 * on `getDirections` so that function's existing single-route contract
 * never changes for its current callers.
 */
export async function getAllRoutes(
  origin: Location,
  destination: Location,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
  options?: DirectionsOptions
): Promise<DirectionResult[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode,
      alternatives: 'true',
      key: apiKey,
    });
    if (options?.departureTimeNow) {
      params.append('departure_time', 'now');
    }

    const response = await fetch(
      `${BASE_URL}/directions/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Directions (alternatives) error:', data.status, data.error_message);
      return [];
    }

    return (data.routes || []).map(mapGoogleRouteToDirectionResult);
  } catch (error) {
    console.error('Error fetching alternative directions:', error);
    return [];
  }
}

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(address: string): Promise<Location | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      address,
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/geocode/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Geocode error:', data.status, data.error_message);
      return null;
    }

    const result = data.results[0];

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      address: result.formatted_address,
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

/** Landmarks/POIs within this radius of the pin are treated as "right next to it". */
const NEARBY_PLACE_RADIUS_METERS = 25;

/** Geocode result types specific enough to show instead of a city/country fallback. */
const SPECIFIC_ADDRESS_TYPES = [
  'street_address',
  'premise',
  'subpremise',
  'route',
  'plus_code',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'neighborhood',
];

/**
 * Looks for a named point of interest within `radiusMeters` of the pin.
 * Reverse geocoding alone rarely surfaces establishments — Google only
 * attaches a POI to a reverse-geocode result when the coordinate lands
 * almost exactly on that POI's registered point, so a dropped pin a few
 * metres off a landmark (e.g. across the driveway) gets nothing back from
 * `/geocode/json`. Places Nearby Search finds it instead.
 */
async function findNearbyPlaceName(
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<string | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      location: `${latitude},${longitude}`,
      radius: radiusMeters.toString(),
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/place/nearbysearch/json?${params.toString()}`
    );
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Nearby Search error:', data.status, data.error_message);
      return null;
    }

    if (!data.results || data.results.length === 0) {
      return null;
    }

    // `radius` alone doesn't sort by distance (only rankby=distance does,
    // which can't be combined with radius) — find the closest candidate
    // ourselves and confirm it's actually inside the radius.
    let closest: any = null;
    let closestDistance = Infinity;

    for (const place of data.results) {
      const placeLat = place.geometry?.location?.lat;
      const placeLng = place.geometry?.location?.lng;
      if (placeLat == null || placeLng == null) continue;

      const distance = calculateDistanceMeters(latitude, longitude, placeLat, placeLng);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = place;
      }
    }

    if (!closest || closestDistance > radiusMeters) {
      return null;
    }

    return closest.vicinity ? `${closest.name}, ${closest.vicinity}` : closest.name;
  } catch (error) {
    console.error('Error finding nearby place:', error);
    return null;
  }
}

/**
 * Picks the most specific usable address out of a geocode `results` array.
 * Results are normally ordered most-specific-first, but when no street-level
 * data exists for a coordinate the first (and sometimes only) entry can be a
 * bare locality/country — walk the list for a result whose types indicate an
 * actual street/place before falling back to whatever is first.
 */
function pickMostSpecificAddress(results: any[]): string | null {
  const specific = results.find((result: any) =>
    (result.types || []).some((type: string) => SPECIFIC_ADDRESS_TYPES.includes(type))
  );

  return (specific || results[0])?.formatted_address ?? results[0]?.formatted_address ?? null;
}

/**
 * Reverse geocode coordinates to address
 * Returns the best available address, preferring specific places over generic locations
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    // 1. A named landmark right next to the pin takes priority over any
    // generic geocoded address.
    const nearbyPlace = await findNearbyPlaceName(latitude, longitude, NEARBY_PLACE_RADIUS_METERS);
    if (nearbyPlace) {
      return nearbyPlace;
    }

    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/geocode/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Reverse geocode error:', data.status, data.error_message);
      return null;
    }

    const results = data.results;

    if (!results || results.length === 0) {
      return null;
    }

    // 2. Try to find a specific place (establishment) directly in the
    // geocode results themselves — covers the rare case where the pin does
    // land exactly on a POI's registered point.
    const establishmentResult = results.find((result: any) => {
      const types = result.types || [];
      return types.includes('establishment') ||
        types.includes('point_of_interest') ||
        types.includes('premise');
    });

    if (establishmentResult && establishmentResult.place_id) {
      try {
        const details = await getPlaceDetails(establishmentResult.place_id);
        if (details && details.name) {
          return details.location.address;
        }
      } catch (error) {
        console.error('Error fetching place name from reverse geocode:', error);
      }
    }

    // 3. No POI at all — fall back to the most specific street/area level
    // address available, rather than jumping straight to city/country.
    return pickMostSpecificAddress(results);
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to an address plus a parsed district name.
 * Used by Plus Code resolution, which needs the district as a separate
 * field rather than folded into a single formatted-address string.
 */
export async function reverseGeocodeComponents(
  latitude: number,
  longitude: number
): Promise<{ formattedAddress: string; district: string | null } | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/geocode/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Reverse geocode error:', data.status, data.error_message);
      return null;
    }

    const results = data.results;
    if (!results || results.length === 0) {
      return null;
    }

    const best = results[0];
    return {
      formattedAddress: best.formatted_address,
      district: extractDistrict(best.address_components),
    };
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Calculate distance matrix for multiple origins/destinations
 * Useful for finding nearest driver or ETA calculations
 */
export async function getDistanceMatrix(
  origins: Location[],
  destinations: Location[],
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): Promise<Array<{
  origin: Location;
  destination: Location;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
}> | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const originsStr = origins
      .map(loc => `${loc.latitude},${loc.longitude}`)
      .join('|');
    const destinationsStr = destinations
      .map(loc => `${loc.latitude},${loc.longitude}`)
      .join('|');

    const params = new URLSearchParams({
      origins: originsStr,
      destinations: destinationsStr,
      mode,
      key: apiKey,
    });

    const response = await fetch(
      `${BASE_URL}/distancematrix/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Distance Matrix error:', data.status, data.error_message);
      return null;
    }

    const results: any[] = [];

    data.rows.forEach((row: any, originIndex: number) => {
      row.elements.forEach((element: any, destIndex: number) => {
        if (element.status === 'OK') {
          results.push({
            origin: origins[originIndex],
            destination: destinations[destIndex],
            distance: {
              text: element.distance.text,
              value: element.distance.value,
            },
            duration: {
              text: element.duration.text,
              value: element.duration.value,
            },
          });
        }
      });
    });

    return results;
  } catch (error) {
    console.error('Error fetching distance matrix:', error);
    return null;
  }
}

/**
 * Snap coordinates to the nearest road using Google Maps Roads API
 * Useful for breadcrumbs and improving GPS accuracy
 */
export async function snapToRoads(
  path: Array<{ latitude: number; longitude: number }>,
  interpolate: boolean = true
): Promise<Array<{ latitude: number; longitude: number }>> {
  if (path.length === 0) return [];

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    // Convert path to comma-separated lat,lng pairs
    const pathStr = path
      .map(coord => `${coord.latitude},${coord.longitude}`)
      .join('|');

    const params = new URLSearchParams({
      path: pathStr,
      interpolate: interpolate.toString(),
      key: apiKey,
    });

    const response = await fetch(
      `https://roads.googleapis.com/v1/snapToRoads?${params.toString()}`
    );

    const data = await response.json();

    if (!data.snappedPoints || data.snappedPoints.length === 0) {
      return path; // Fallback to original path
    }

    return data.snappedPoints.map((point: any) => ({
      latitude: point.location.latitude,
      longitude: point.location.longitude,
    }));
  } catch (error) {
    console.error('Error snapping to roads:', error);
    return path; // Fallback to original path on error
  }
}

/**
 * Find the nearest road point for a single set of coordinates
 */
export async function nearestRoad(
  location: { latitude: number; longitude: number }
): Promise<{ latitude: number; longitude: number } | null> {
  const points = await snapToRoads([location], false);
  return points.length > 0 ? points[0] : null;
}
