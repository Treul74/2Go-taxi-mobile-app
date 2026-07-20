import { calculateDistanceMeters } from '@/lib/distance';
import { calculateBearing, snapToPath, type LatLng } from '@/lib/routeSnapping';
import { useRef } from 'react';

export interface RoadSnappedVehicle {
  position: LatLng;
  heading: number;
}

/**
 * Minimum movement (meters) between fixes required to trust a
 * position-derived bearing. Below this, GPS jitter dominates the direction,
 * so the previously derived heading is kept instead of letting the marker
 * flicker in place.
 */
const MIN_BEARING_DISTANCE_METERS = 2;

/**
 * Snaps a live vehicle fix onto the active route polyline — instead of the
 * raw GPS point, which can drift off-road — and derives its heading from
 * consecutive snapped positions rather than trusting the device's raw
 * compass heading, which is frequently noisy, stale, or simply absent.
 *
 * Falls back to the raw coordinate/heading when no route is available yet
 * (e.g. before Directions has returned), so callers can pass this straight
 * through to `AnimatedVehicleMarker` unconditionally.
 */
export function useRoadSnappedVehicle(
  rawLocation: LatLng | undefined,
  rawHeading: number | undefined,
  routeCoordinates: LatLng[]
): RoadSnappedVehicle | null {
  const previous = useRef<{ position: LatLng; heading: number } | null>(null);

  if (!rawLocation) {
    previous.current = null;
    return null;
  }

  const snapped = snapToPath(rawLocation, routeCoordinates);
  const position = snapped?.position ?? rawLocation;

  let heading: number;
  if (previous.current) {
    const moved = calculateDistanceMeters(
      previous.current.position.latitude,
      previous.current.position.longitude,
      position.latitude,
      position.longitude
    );
    heading = moved >= MIN_BEARING_DISTANCE_METERS
      ? calculateBearing(previous.current.position, position)
      : previous.current.heading;
  } else {
    // First fix: prefer the road's own direction over a raw heading value,
    // which is frequently 0/stale before the device has a compass fix.
    heading = snapped?.segmentBearing ?? rawHeading ?? 0;
  }

  previous.current = { position, heading };
  return { position, heading };
}
