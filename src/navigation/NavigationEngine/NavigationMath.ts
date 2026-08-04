/**
 * Pure math for camera, route, and position calculations.
 *
 * Every function here is a pure function of its arguments — no store reads,
 * no side effects — so the camera/route logic can be unit tested without
 * mounting a map. This is also the ONLY place in the engine allowed to do
 * geometric math; NavigationStore and the components consume these
 * functions rather than reimplementing them inline.
 *
 * Distance: per AGENTS.md ("always import from src/lib/distance.ts — never
 * write inline Haversine implementations"), this file delegates to
 * `calculateDistanceMeters` from '@/lib/distance' rather than redefining it.
 *
 * `dynamicZoomForSpeed`/`dynamicPitchForMode`/`computeBounds`/
 * `applyEdgePadding` are implemented (needed by `CameraController.ts`);
 * `distanceFromPath`/`hasMovedSignificantly` are implemented (needed by
 * `RouteEngine.ts`'s re-routing gate). `bearingBetween`/`predictPosition`
 * remain TODO stubs — nothing built so far needs them yet (`CameraAnimation`'s
 * look-ahead functions already cover the camera's own predictive-position
 * need; these two are for a future consumer, e.g. deriving heading from
 * position deltas when a device reports none).
 *
 * `distanceFromPath` delegates to `snapToPath` (`@/lib/routeSnapping`) rather
 * than re-deriving nearest-segment projection math — that function already
 * exists and is already used for marker road-snapping
 * (`useRoadSnappedVehicle.ts`); this file reuses it for the different
 * purpose of measuring off-route distance instead of duplicating it.
 *
 * Relationship to CameraAnimation.ts: that file owns generic, Bible-agnostic
 * animation math (easing, curve evaluation, damping, look-ahead). This file
 * owns the Bible's *specific* tables/values (dynamic zoom/pitch breakpoints)
 * and calls into CameraAnimation.ts's generic evaluator rather than
 * reimplementing curve interpolation here — see CameraAnimation.ts's header
 * for the full rationale.
 */

import { calculateDistanceMeters } from '@/lib/distance';
import { snapToPath } from '@/lib/routeSnapping';
import { calculateCameraPitch, calculateCameraZoom, type SpeedCurvePoint } from './CameraAnimation';
import type { CameraProfile, EdgePadding, LatLng, LatLngBounds } from './types';

/** Bible: "Rerouting... moved 30 meters?" — the default movement gate `hasMovedSignificantly` uses when no threshold is given. */
const DEFAULT_MOVEMENT_THRESHOLD_METERS = 30;

/**
 * The Bible's "Dynamic Zoom" table (walking 18.5, city driving 17.5, highway
 * 16, very fast 15), expressed as speed breakpoints. The Bible names
 * categories, not exact m/s thresholds, so these breakpoints are this file's
 * documented interpretation: ~0 m/s (stationary/walking pace), ~4 m/s (~14
 * km/h, city driving begins), ~14 m/s (~50 km/h, highway begins), ~25 m/s
 * (~90 km/h, "very fast").
 */
const DYNAMIC_ZOOM_CURVE: SpeedCurvePoint[] = [
  { speedMetersPerSecond: 0, value: 18.5 },
  { speedMetersPerSecond: 4, value: 17.5 },
  { speedMetersPerSecond: 14, value: 16 },
  { speedMetersPerSecond: 25, value: 15 },
];

/**
 * The Bible's driving pitch range (45-55°): flatter near-stationary, more
 * tilted at speed for a more forward-looking navigation view.
 */
const DYNAMIC_PITCH_CURVE: SpeedCurvePoint[] = [
  { speedMetersPerSecond: 0, value: 45 },
  { speedMetersPerSecond: 20, value: 55 },
];

/** Great-circle distance in meters. Thin re-export wrapper — see file header. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  return calculateDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

/**
 * Initial compass bearing in degrees (0-360) travelling from `a` to `b`.
 * Used to derive actor heading when the device doesn't report one, and to
 * check whether a GPS fix's reported heading is plausible.
 */
export function bearingBetween(a: LatLng, _b: LatLng): number {
  // TODO(implementation phase): standard forward-azimuth formula.
  throw new Error('Not implemented: bearingBetween');
}

/**
 * Predicts the actor's position `horizonMs` milliseconds into the future
 * given a recent fix and heading/speed, so the camera can lead the driver
 * instead of chasing raw GPS (Bible: "Camera Follow" — GPS -> Prediction ->
 * Camera -> Animation, "This removes shaking").
 */
export function predictPosition(_fix: { coordinate: LatLng; headingDegrees: number; speedMetersPerSecond: number }, _horizonMs: number): LatLng {
  // TODO(implementation phase): dead-reckon along heading using speed * time.
  throw new Error('Not implemented: predictPosition');
}

/**
 * Computes north/south/east/west bounds that contain every given point.
 * Feeds fitRoute()/AutoFitEngine — never call `fitToCoordinates` directly
 * from a screen (see Bible: "Automatic Route Fit").
 */
export function computeBounds(points: LatLng[]): LatLngBounds {
  if (points.length === 0) {
    throw new Error('computeBounds: at least one point is required');
  }
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  return {
    northEast: { latitude: maxLat, longitude: maxLng },
    southWest: { latitude: minLat, longitude: minLng },
  };
}

/**
 * Expands raw geographic bounds by UI-driven edge padding (bottom sheet,
 * floating buttons, safe area, status bar, nav banner) so auto-fit never
 * places a marker under chrome (Bible: "Then include Safe Area ... Then fit
 * everything").
 */
export function applyEdgePadding(bounds: LatLngBounds, padding: EdgePadding): LatLngBounds {
  // This function only receives bounds + screen-space padding, not the
  // map's actual rendered size, so it can't convert points -> degrees
  // exactly (that requires a real viewport, which is exactly what
  // CameraAnimation.calculateZoomToFitBounds takes and uses for the
  // authoritative, pixel-accurate padding correction). This is a coarser,
  // viewport-less safety margin: each side's padding is expressed as a
  // fraction of a typical mobile viewport, then applied as that same
  // fraction of the bounds' own span. Intended as a fallback for callers
  // computing an auto-fit before the map has reported a real layout size —
  // see CameraController's fallback path.
  const REFERENCE_VIEWPORT_POINTS = { width: 375, height: 812 };

  const latSpan = bounds.northEast.latitude - bounds.southWest.latitude;
  const lngSpan = bounds.northEast.longitude - bounds.southWest.longitude;

  const topFraction = padding.top / REFERENCE_VIEWPORT_POINTS.height;
  const bottomFraction = padding.bottom / REFERENCE_VIEWPORT_POINTS.height;
  const leftFraction = padding.left / REFERENCE_VIEWPORT_POINTS.width;
  const rightFraction = padding.right / REFERENCE_VIEWPORT_POINTS.width;

  return {
    northEast: {
      latitude: bounds.northEast.latitude + latSpan * topFraction,
      longitude: bounds.northEast.longitude + lngSpan * rightFraction,
    },
    southWest: {
      latitude: bounds.southWest.latitude - latSpan * bottomFraction,
      longitude: bounds.southWest.longitude - lngSpan * leftFraction,
    },
  };
}

/**
 * Dynamic zoom lookup by current speed (m/s), per the Bible's "Dynamic Zoom"
 * table (walking 18.5, city driving 17.5, highway 16, very fast 15).
 */
export function dynamicZoomForSpeed(speedMetersPerSecond: number): number {
  return calculateCameraZoom(speedMetersPerSecond, DYNAMIC_ZOOM_CURVE);
}

/**
 * Dynamic pitch lookup per CameraProfile.pitch === 'dynamic', per the
 * Bible's "Pitch" table (preview 0°, driving 45-55°, arrival 35°, completed 0°).
 */
export function dynamicPitchForMode(profile: CameraProfile, speedMetersPerSecond: number): number {
  if (profile.pitch !== 'dynamic') return profile.pitch;
  return calculateCameraPitch(speedMetersPerSecond, DYNAMIC_PITCH_CURVE);
}

/**
 * Perpendicular distance in meters from `point` to the nearest segment of
 * `path`. Feeds off-route detection (Bible: "Rerouting" — moved 30m? off
 * route? fetch new route only if yes/yes).
 */
export function distanceFromPath(point: LatLng, path: LatLng[]): number {
  const snapped = snapToPath(point, path);
  // Fewer than 2 points means there's no path to measure against at all —
  // treat that as maximally off-route rather than silently reporting 0.
  if (!snapped) return Infinity;
  return distanceMeters(point, snapped.position);
}

/**
 * Whether the actor has moved far enough from the last checked position to
 * warrant a route/off-route check at all (Bible's 30-meter gate). Keeps the
 * engine from evaluating reroute logic on every single GPS tick.
 */
export function hasMovedSignificantly(from: LatLng, to: LatLng, thresholdMeters: number = DEFAULT_MOVEMENT_THRESHOLD_METERS): boolean {
  return distanceMeters(from, to) >= thresholdMeters;
}
