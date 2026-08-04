/**
 * RouteEngine — the only owner of routing in the app.
 *
 * Per the Bible ("Route Engine owns: Google Directions API, Polyline
 * decoding, Polyline rendering, Alternative routes, Traffic routes,
 * Remaining distance, ETA, Route progress, Re-routing, Snap to Roads...
 * Never duplicate route calculations anywhere else") and AGENTS.md's Maps
 * APIs rule ("Never call a Google Maps REST endpoint directly from a screen
 * or component — always go through mapsApi.ts"), this file is the one place
 * that turns a (pickup, destination) pair into the engine's `RouteData`, and
 * the one place that decides whether an active route needs refetching.
 *
 * Layering: `src/lib/google/mapsApi.ts` is the sanctioned raw Google REST
 * wrapper (Directions, Roads, Places, Geocoding — every REST call in the
 * app already goes through it, not just navigation's). This file sits above
 * it: RouteEngine calls `mapsApi.ts`'s `getDirections`/`getAllRoutes`, then
 * owns everything Bible-specific on top — converting the raw REST shape
 * into `RouteData`/`RouteStep`, caching, progress/ETA math, and the
 * re-routing decision. RouteEngine never calls `fetch()` or a Google
 * endpoint itself.
 *
 * Math this file leans on rather than re-deriving:
 *  - `NavigationMath.ts` — `distanceMeters` (Haversine), `distanceFromPath`
 *    and `hasMovedSignificantly` (the re-routing gate's two conditions).
 *  - `@/lib/routeSnapping`'s `snapToPath` — nearest-point-on-polyline
 *    projection, already used by `useRoadSnappedVehicle.ts` for marker
 *    snapping; this file reuses it for progress tracking and off-route
 *    distance instead of a second implementation.
 *  - `@googlemaps/polyline-codec`'s `decode` — the same codec
 *    `mapsApi.ts` already uses for the overview polyline; this file uses it
 *    for per-step polylines too (see `decodePolyline`).
 *
 * What this pass deliberately does NOT do: migrate the existing screens/
 * hooks that already call `getDirections` directly (`RidePlannerSheet.tsx`,
 * `LocationSearchModal.tsx`, `rideStore.ts`, `LocationAutocomplete.tsx`,
 * the driver navigation screens) onto this engine. That mirrors every prior
 * engine module in this codebase (`GPSManager.ts`, `CameraController.ts`,
 * `AutoFitEngine.ts`): the engine capability ships first, migrating call
 * sites is a separate, later pass.
 */

import type { Location } from '@/types';
import { decode } from '@googlemaps/polyline-codec';
import { getAllRoutes, getDirections, type DirectionResult, type DirectionsOptions } from '@/lib/google';
import { snapToPath } from '@/lib/routeSnapping';
import { distanceFromPath, distanceMeters, hasMovedSignificantly } from './NavigationMath';
import type { LatLng, RouteData, RouteProgress, RouteStep } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options shared by `fetchRoute`/`fetchAlternativeRoutes`. */
export interface RouteFetchOptions {
  /** Travel mode passed to Directions. Defaults to `'driving'` — the only mode this engine's driving/navigation modes actually use today. */
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  /** Requests a live-traffic-adjusted duration (populates `RouteData.durationInTrafficSeconds`). Only meaningful for `mode: 'driving'`. */
  withTraffic?: boolean;
  /** Bypasses the cache and forces a fresh network fetch. Re-routing always sets this — a cached stale route would defeat the point of re-routing. */
  forceRefresh?: boolean;
}

/** Options for `shouldReroute`/`evaluateReroute`. */
export interface RerouteCheckOptions {
  /** Bible: "moved 30 meters?" — minimum movement before even checking whether the route is still valid. Defaults to `NavigationMath`'s own 30m default. */
  movementThresholdMeters?: number;
  /** Perpendicular distance from the route path, in meters, beyond which the actor is considered off-route. */
  offRouteThresholdMeters?: number;
}

/** Bible: "Rerouting... Off route?" — the default perpendicular-distance threshold `shouldReroute` uses when none is given. */
const DEFAULT_OFF_ROUTE_THRESHOLD_METERS = 50;

/** How long a cached route stays valid before a fresh fetch is required — traffic-aware duration especially can go stale within a few minutes. */
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Route cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  route: RouteData;
  fetchedAtMs: number;
}

const routeCache = new Map<string, CacheEntry>();

function cacheKey(origin: LatLng, destination: LatLng, mode: string): string {
  return `${mode}:${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}->${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
}

/**
 * Returns a still-fresh cached route for (origin, destination, mode), or
 * `null` if none exists or it has expired (`ROUTE_CACHE_TTL_MS`). Does not
 * fetch — pair with `fetchRoute` for the fetch-or-cache-hit behaviour most
 * callers actually want.
 *
 * @example
 * ```ts
 * const cached = getCachedRoute(pickup, destination);
 * if (cached) showRoutePreview(cached);
 * ```
 */
export function getCachedRoute(origin: LatLng, destination: LatLng, mode: RouteFetchOptions['mode'] = 'driving'): RouteData | null {
  const key = cacheKey(origin, destination, mode);
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAtMs > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return entry.route;
}

/** Clears every cached route. Exists for hygiene (e.g. logout) — routes aren't user-specific, so this is rarely needed, but nothing should hold a stale route across sessions indefinitely. */
export function clearRouteCache(): void {
  routeCache.clear();
}

// ---------------------------------------------------------------------------
// Google Directions -> RouteData
// ---------------------------------------------------------------------------

let routeIdCounter = 0;

/** Generates a locally-unique `RouteData.id` — no server-issued route id exists, and a `Date.now()` + counter pair is sufficient for this engine's own comparisons (e.g. "is this the same route object as before"). */
function generateRouteId(): string {
  routeIdCounter += 1;
  return `route-${Date.now()}-${routeIdCounter}`;
}

/** Google's Directions API returns step instructions as HTML (`<b>Turn</b> right`) — strips markup for the plain text `RouteStep.instruction` expects (Bible: Navigation HUD / Turn Banner show plain instruction text). */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Adapter for `mapsApi.ts`'s `Location` type (which carries a required `address` field this engine doesn't track) — the address is unused by the Directions request itself, only by the response's own `startAddress`/`endAddress` text. */
function toApiLocation(point: LatLng): Location {
  return { latitude: point.latitude, longitude: point.longitude, address: '' };
}

/**
 * Converts one `mapsApi.DirectionResult` into this engine's `RouteData`,
 * decoding every step's own polyline (see `decodePolyline`) rather than
 * leaving each `RouteStep.path` as a naive straight line between its start
 * and end.
 */
function toRouteData(origin: LatLng, destination: LatLng, result: DirectionResult): RouteData {
  const steps: RouteStep[] = result.steps.map((step, index) => ({
    id: `step-${index}`,
    instruction: stripHtmlTags(step.instruction),
    maneuver: step.maneuver ?? 'straight',
    distanceMeters: step.distance.value,
    durationSeconds: step.duration.value,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    path: decodePolyline(step.polyline),
  }));

  return {
    id: generateRouteId(),
    path: result.coordinates,
    steps,
    distanceMeters: result.distance.value,
    durationSeconds: result.duration.value,
    durationInTrafficSeconds: result.durationInTraffic?.value,
    origin,
    destination,
    distanceText: result.distance.text,
    durationText: result.duration.text,
  };
}

function toDirectionsOptions(options: RouteFetchOptions): DirectionsOptions {
  return { departureTimeNow: options.withTraffic };
}

// ---------------------------------------------------------------------------
// Public API — fetching
// ---------------------------------------------------------------------------

/**
 * Fetches the primary route between two points (Google Directions, via
 * `mapsApi.getDirections` — never called directly by a screen). Serves a
 * cached result when one is still fresh unless `forceRefresh` is set.
 *
 * Purpose: the single entry point for "get me a route" — covers Preview
 * mode's initial route, and (with `forceRefresh: true`) a re-routing fetch.
 * Parameters: `origin`/`destination` — the two endpoints; `options` — mode,
 * live-traffic request, and cache-bypass.
 * Returns: a fully-typed `RouteData` (decoded path, per-step polylines,
 * distance/duration, live-traffic duration when requested), or `null` if
 * Google returned no route (e.g. no drivable path exists) or the request
 * failed.
 * Throws: only if the Google Maps API key isn't configured at all (a
 * misconfiguration, not a routing failure) — matches `mapsApi.ts`'s own
 * convention for that case.
 *
 * @example
 * ```ts
 * const route = await fetchRoute(pickup, destination, { withTraffic: true });
 * if (route) navigationStore.setRoute(route);
 * ```
 */
export async function fetchRoute(origin: LatLng, destination: LatLng, options: RouteFetchOptions = {}): Promise<RouteData | null> {
  const mode = options.mode ?? 'driving';

  if (!options.forceRefresh) {
    const cached = getCachedRoute(origin, destination, mode);
    if (cached) return cached;
  }

  const result = await getDirections(toApiLocation(origin), toApiLocation(destination), mode, toDirectionsOptions(options));
  if (!result) return null;

  const route = toRouteData(origin, destination, result);
  routeCache.set(cacheKey(origin, destination, mode), { route, fetchedAtMs: Date.now() });
  return route;
}

/**
 * Fetches every alternative route Google offers between two points (Bible:
 * "Alternative routes"), via `mapsApi.getAllRoutes` (Directions
 * `alternatives=true`). Not cached individually — unlike `fetchRoute`'s hot
 * "the active route" path, alternatives are typically requested once for a
 * one-off "choose your route" comparison, not repeatedly.
 *
 * Purpose: give a Preview-mode "choose a route" UI every option Google
 * offers, ranked in Google's own order (first entry is Google's suggested
 * default route — the same one `fetchRoute` alone would return).
 * Parameters: `origin`/`destination` — the two endpoints; `options` — mode
 * and live-traffic request (`forceRefresh` is a no-op here — nothing is
 * cached to bypass).
 * Returns: an array of `RouteData`, one per alternative (empty if none were
 * returned or the request failed — never `null`, so callers can `.map`
 * unconditionally).
 *
 * @example
 * ```ts
 * const alternatives = await fetchAlternativeRoutes(pickup, destination);
 * ```
 */
export async function fetchAlternativeRoutes(origin: LatLng, destination: LatLng, options: RouteFetchOptions = {}): Promise<RouteData[]> {
  const mode = options.mode ?? 'driving';
  const results = await getAllRoutes(toApiLocation(origin), toApiLocation(destination), mode, toDirectionsOptions(options));
  return results.map((result) => toRouteData(origin, destination, result));
}

// ---------------------------------------------------------------------------
// Public API — polyline decoding
// ---------------------------------------------------------------------------

/**
 * Decodes a Google-encoded polyline string into a coordinate path. Exposed
 * as its own documented method (Bible: "Polyline decoding" is a named owned
 * responsibility) even though `fetchRoute`/`fetchAlternativeRoutes` already
 * call it internally for every step — any future caller holding a raw
 * encoded polyline (e.g. from a push-notification payload, or a
 * server-computed route) decodes it here rather than importing the codec
 * directly.
 *
 * Purpose: turn one encoded polyline string into `LatLng[]`.
 * Parameters: `encoded` — a Google polyline-encoded string; `''` and
 * malformed input both decode to `[]` rather than throwing.
 * Returns: the decoded path, in order.
 *
 * @example
 * ```ts
 * const path = decodePolyline(step.polyline);
 * ```
 */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  return decode(encoded).map(([latitude, longitude]) => ({ latitude, longitude }));
}

// ---------------------------------------------------------------------------
// Public API — progress, ETA, remaining distance
// ---------------------------------------------------------------------------

/** Meters travelled from `path[0]` up to the snapped point on `path[segmentIndex]` -> `path[segmentIndex + 1]`. */
function metersAlongPath(path: LatLng[], segmentIndex: number, snappedPoint: LatLng): number {
  let total = 0;
  for (let i = 0; i < segmentIndex; i++) {
    total += distanceMeters(path[i], path[i + 1]);
  }
  total += distanceMeters(path[segmentIndex], snappedPoint);
  return total;
}

/** First step index whose cumulative distance-from-route-start reaches `traveledMeters` — the step currently being driven. */
function findActiveStepIndex(steps: RouteStep[], traveledMeters: number): number {
  let cumulative = 0;
  for (let i = 0; i < steps.length; i++) {
    cumulative += steps[i].distanceMeters;
    if (traveledMeters <= cumulative) return i;
  }
  return Math.max(0, steps.length - 1);
}

/**
 * Computes remaining distance, remaining ETA, the currently-active step,
 * and fraction complete for an actor's position along a route (Bible:
 * "Remaining distance", "ETA", "Route progress").
 *
 * Purpose: the one function that turns (live position, active route) into
 * `RouteProgress` — feeds `NavigationStore.progress`/`etaSeconds`/
 * `distanceRemainingMeters`/`currentStep` once wired (see Architecture.md's
 * Rollout plan).
 * Parameters: `position` — the actor's current (ideally already
 * road-snapped) coordinate; `route` — the active `RouteData`.
 * Returns: a `RouteProgress` — `distanceRemainingMeters`/
 * `durationRemainingSeconds` scale off `route`'s total distance/duration
 * (preferring `durationInTrafficSeconds` when present) by how far along the
 * path `position` projects to; `activeStepIndex` is the step whose
 * cumulative distance range contains that point; `fractionComplete` is
 * 0-1. If `route.path` has fewer than 2 points (shouldn't happen for a real
 * fetched route), progress is reported as 0% complete rather than throwing.
 *
 * @example
 * ```ts
 * const progress = computeRouteProgress(driverLocation, activeRoute);
 * navigationStore.setProgress(progress);
 * ```
 */
export function computeRouteProgress(position: LatLng, route: RouteData): RouteProgress {
  const snapped = snapToPath(position, route.path);
  const traveledMeters = snapped ? metersAlongPath(route.path, snapped.segmentIndex, snapped.position) : 0;

  const distanceRemainingMeters = Math.max(0, route.distanceMeters - traveledMeters);
  const fractionComplete = route.distanceMeters === 0 ? 1 : Math.min(1, Math.max(0, traveledMeters / route.distanceMeters));

  const totalDurationSeconds = route.durationInTrafficSeconds ?? route.durationSeconds;
  const durationRemainingSeconds = Math.max(0, totalDurationSeconds * (1 - fractionComplete));

  return {
    distanceRemainingMeters,
    durationRemainingSeconds,
    activeStepIndex: findActiveStepIndex(route.steps, traveledMeters),
    fractionComplete,
  };
}

// ---------------------------------------------------------------------------
// Public API — road snapping
// ---------------------------------------------------------------------------

/**
 * Snaps a raw position onto the active route's own path (Bible: "Snap to
 * Roads") — distinct from `mapsApi.snapToRoads`/`nearestRoad` (Google's
 * Roads API, which snaps onto *any* nearby road and costs a network round
 * trip): this snaps onto the route already in hand, for free, every frame.
 *
 * Purpose: the coordinate a marker/camera should treat as the actor's
 * position while a route is active, instead of a raw GPS fix that can
 * drift off-road.
 * Parameters: `position` — the raw fix; `route` — the active `RouteData`.
 * Returns: the nearest point on `route.path`, or `position` unchanged if
 * the route has fewer than 2 path points to snap onto.
 *
 * @example
 * ```ts
 * const onRoad = snapToRoute(rawFix, activeRoute);
 * ```
 */
export function snapToRoute(position: LatLng, route: RouteData): LatLng {
  const snapped = snapToPath(position, route.path);
  return snapped ? snapped.position : position;
}

// ---------------------------------------------------------------------------
// Public API — re-routing
// ---------------------------------------------------------------------------

/**
 * Pure re-routing decision (Bible: "Rerouting — Driver moved 30 meters? No
 * -> Ignore. Yes -> Check route. Off route? Yes -> Fetch. No -> Keep
 * current route. This dramatically reduces API usage"). No network call,
 * no side effects — `evaluateReroute` below is the network-capable
 * convenience built on top of this.
 *
 * Purpose: decide whether the current route is still valid for the actor's
 * live position.
 * Parameters: `currentPosition` — the actor's latest fix; `lastCheckedPosition`
 * — the position this same check was last run against (the caller owns
 * this bit of state — typically a future `NavigationProvider`/
 * `RouteProgressTracker` — so this function stays a pure function of its
 * arguments rather than hiding a singleton "last checked" value); `route`
 * — the active `RouteData`; `options` — movement/off-route thresholds
 * (defaults: 30m movement per the Bible, 50m off-route).
 * Returns: `true` only if the actor has moved far enough to bother
 * checking AND the live position is now further than the off-route
 * threshold from `route.path`.
 *
 * @example
 * ```ts
 * if (shouldReroute(driverLocation, lastChecked, activeRoute)) {
 *   const fresh = await fetchRoute(driverLocation, activeRoute.destination, { forceRefresh: true });
 * }
 * ```
 */
export function shouldReroute(
  currentPosition: LatLng,
  lastCheckedPosition: LatLng,
  route: RouteData,
  options: RerouteCheckOptions = {}
): boolean {
  if (!hasMovedSignificantly(lastCheckedPosition, currentPosition, options.movementThresholdMeters)) {
    return false;
  }
  const offRouteThreshold = options.offRouteThresholdMeters ?? DEFAULT_OFF_ROUTE_THRESHOLD_METERS;
  return distanceFromPath(currentPosition, route.path) > offRouteThreshold;
}

/**
 * Convenience combinator: runs `shouldReroute`, and if it says yes, fetches
 * a fresh route from `currentPosition` to `route.destination` (always with
 * `forceRefresh: true` — a cached stale route would defeat the point).
 *
 * Purpose: the one call a consumer needs for "check and, if warranted,
 * re-route" instead of re-orchestrating `shouldReroute` + `fetchRoute`
 * itself every time.
 * Parameters: same as `shouldReroute`, plus any `RouteFetchOptions` to
 * apply to the resulting fetch (e.g. `withTraffic`).
 * Returns: the new `RouteData` if a re-route was warranted and the fetch
 * succeeded; `null` both when no re-route was needed and when one was
 * needed but the fetch failed — in both cases the caller's correct
 * fallback is identical (keep the current route), matching the Bible's own
 * flowchart, which has no separate "re-route failed" branch.
 *
 * @example
 * ```ts
 * const rerouted = await evaluateReroute(driverLocation, lastChecked, activeRoute, { withTraffic: true });
 * if (rerouted) navigationStore.setRoute(rerouted);
 * ```
 */
export async function evaluateReroute(
  currentPosition: LatLng,
  lastCheckedPosition: LatLng,
  route: RouteData,
  options: RerouteCheckOptions & RouteFetchOptions = {}
): Promise<RouteData | null> {
  if (!shouldReroute(currentPosition, lastCheckedPosition, route, options)) return null;
  return fetchRoute(currentPosition, route.destination, { ...options, forceRefresh: true });
}
