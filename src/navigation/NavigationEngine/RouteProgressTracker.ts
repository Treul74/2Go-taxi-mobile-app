/**
 * RouteProgressTracker — turns live GPS ticks into `NavigationStore.progress`
 * updates and, when warranted, a re-route (Bible: "Remaining distance",
 * "ETA", "Route progress", "Rerouting").
 *
 * Purely orchestration, same module shape as `RouteEngine.ts`/`CameraController.ts`
 * (plain functions, reaches `useNavigationStore.getState()` directly, no
 * React) — the actual math lives in `RouteEngine.computeRouteProgress`/
 * `evaluateReroute`; this file's only job is calling them at the right time
 * and publishing the result. `NavigationProvider` is the intended (and, as
 * of this pass, only) caller, once per accepted GPS fix while a route and a
 * driver position both exist.
 */

import { navigationEventBus } from './NavigationEvents';
import { computeRouteProgress, evaluateReroute, snapToRoute } from './RouteEngine';
import { useNavigationStore } from './NavigationStore';
import type { GPSFix, LatLng, RouteData } from './types';

/** Computes progress for `position` along `route` and publishes it into the store. Safe to call on every qualifying GPS tick — `computeRouteProgress` is pure/cheap (snap-to-path + arithmetic, no network). */
export function applyRouteProgress(position: LatLng, route: RouteData): void {
  useNavigationStore.getState().setRouteProgress(computeRouteProgress(position, route));
}

/**
 * Performance optimization (Phase 7F): the synchronous, once-per-GPS-tick
 * twin of calling `NavigationStore.setGpsFix(fix)` then
 * `applyRouteProgress(fix.coordinate, route)` separately — publishes both in
 * one store commit via `setGpsFixWithProgress`. Same final state as the two
 * separate calls; halves how often `CameraController`'s store subscription
 * (the one that matters today) re-evaluates during active navigation with a
 * route loaded, which was previously running twice per fix (once for the
 * fix, once for progress) instead of once.
 */
export function applyGpsFixWithProgress(fix: GPSFix, route: RouteData): void {
  const snappedLocation = snapToRoute(fix.coordinate, route);
  useNavigationStore.getState().setGpsFixWithProgress(fix, computeRouteProgress(fix.coordinate, route), snappedLocation);
}

/**
 * Off-route check + reroute-if-needed, using `RouteEngine`'s pure gate
 * (`shouldReroute`) and network-capable combinator (`evaluateReroute`).
 *
 * `lastCheckedPositionRef` is caller-owned mutable state — per
 * `shouldReroute`'s own doc, "the caller owns this bit of state" so the
 * underlying function stays pure. The caller (`NavigationProvider`) resets
 * `.current` to `null` whenever the active route's id changes, so movement
 * tracking restarts cleanly against the new route instead of comparing
 * against a position measured on a route that no longer exists.
 *
 * Network errors are swallowed here (dev-logged only): a failed reroute
 * fetch must never crash the GPS tick that triggered it. Per
 * `evaluateReroute`'s own doc, the correct fallback for "reroute needed but
 * the fetch failed" is identical to "no reroute needed" — keep driving on
 * the current route — so there is no separate error-handling branch beyond
 * not touching the store.
 */
export async function checkAndReroute(
  position: LatLng,
  route: RouteData,
  lastCheckedPositionRef: { current: LatLng | null }
): Promise<void> {
  if (!lastCheckedPositionRef.current) {
    lastCheckedPositionRef.current = position;
    return;
  }
  const previousChecked = lastCheckedPositionRef.current;
  lastCheckedPositionRef.current = position;

  try {
    const fresh = await evaluateReroute(position, previousChecked, route);
    if (fresh) {
      useNavigationStore.getState().setRoute(fresh);
      // `setRoute` alone resets `currentStep`/`currentInstruction` to the
      // fresh route's first step as a placeholder (its own documented
      // behavior) — recomputing progress immediately against `fresh`,
      // rather than waiting for the next ambient GPS tick, is what makes
      // the reroute land smoothly: distance/duration/current-step snap to
      // correct values in the same moment the new route appears instead of
      // lagging up to one GPS interval (~1s at driverBestNavigation) behind
      // it. `position` is reused rather than re-read from the store since
      // it's the same fix this whole check already ran against.
      applyRouteProgress(position, fresh);
      navigationEventBus.emit('ROUTE_RECALCULATED', { routeId: fresh.id, reason: 'off-route' });
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[RouteProgressTracker] reroute fetch failed, keeping current route', error);
    }
  }
}
