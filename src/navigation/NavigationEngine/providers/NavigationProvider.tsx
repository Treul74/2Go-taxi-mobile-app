/**
 * NavigationProvider — the engine's single mount point.
 *
 * Responsibility: own the lifecycle of engine-wide singletons that must
 * exist exactly once for the whole app (the one GPS watcher per the Bible's
 * "GPS Engine — One GPS watcher. Never five.", the NavigationEventBus, and
 * eventually the reroute/off-route watcher). It does NOT own navigation
 * state — that stays in `useNavigationStore` (see NavigationStore.ts), which
 * any component can read directly without needing this provider in its
 * ancestor tree.
 *
 * Mounted once at the app root (see app/_layout.tsx). Subscribes to
 * `GPSManager`'s existing event bus (`onFix`/`onStatusChange`) and forwards
 * every fix/status change into `NavigationStore` via `setGpsFix`/
 * `setGpsStatus` (Architecture.md's Rollout plan step 4) — this is
 * `NavigationStore.driverLocation`/`heading`/`speed`/`gpsState` becoming
 * live for the first time.
 *
 * Deliberately does NOT call `GPSManager.acquire`/`start`/`applyScenario`:
 * it only *listens*. The driver screens already own GPS acquisition via
 * `acquire('foreground', 'driverBestNavigation')`/`release()` — this
 * provider piggybacks on whatever fixes are already flowing rather than
 * creating a second, redundant standing subscription or fighting a screen's
 * own accuracy profile via a competing `applyScenario` call (an explicit
 * scope cut for this pass — see Architecture.md's Rollout plan step 4 note).
 *
 * Phase 7 additionally makes this the one place that keeps live route
 * progress current (Bible: "Remaining distance", "ETA", "Route progress")
 * and checks for off-route drift (Bible: "Rerouting... moved 30 meters? ...
 * off route? ... fetch") — both via `RouteProgressTracker`, on every fix
 * while a route and a driver position both exist. This mirrors the GPS
 * forwarding above: same listener, same "only reacts to what's already
 * flowing" shape, no new subscription.
 *
 * Phase 7F (performance): the fix + progress publish is one store commit
 * (`RouteProgressTracker.applyGpsFixWithProgress`) instead of two, when a
 * route is active — see that function's own doc.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as GPSManager from '../GPSManager';
import { navigationEventBus, type NavigationEventBus } from '../NavigationEvents';
import { useNavigationStore } from '../NavigationStore';
import { applyGpsFixWithProgress, checkAndReroute } from '../RouteProgressTracker';
import type { LatLng } from '../types';

/**
 * Dev-only transition visibility (Phase 5.5B, Task 2: "Log every transition
 * in development mode"). Subscribes to the same `navigationEventBus` every
 * `NavigationStore` mode-transition action already emits on — no new event,
 * no store change — so every accepted/rejected transition from any screen
 * is visible in the Metro log without instrumenting each call site.
 */
function logTransitionsInDev(): () => void {
  if (!__DEV__) return () => {};
  const unsubscribeChanged = navigationEventBus.on('MODE_CHANGED', (event) => {
    console.log(`[NavigationStore] ${event.payload.previous} -> ${event.payload.next}`);
  });
  const unsubscribeRejected = navigationEventBus.on('TRANSITION_REJECTED', (event) => {
    console.log(`[NavigationStore] rejected: ${event.payload.from} -> ${event.payload.attempted}`);
  });
  return () => {
    unsubscribeChanged();
    unsubscribeRejected();
  };
}

interface NavigationEngineContextValue {
  eventBus: NavigationEventBus;
}

const NavigationEngineContext = createContext<NavigationEngineContextValue | null>(null);

export interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  // Caller-owned state for RouteProgressTracker.checkAndReroute (see that
  // function's own doc) — reset whenever the active route's id changes so
  // movement-since-last-check tracking restarts against the new route
  // instead of comparing against a position measured on a stale one.
  const lastRerouteCheckRef = useRef<{ current: LatLng | null }>({ current: null });
  const lastRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Phase 7R.9 (GPS seed restoration): before this effect existed, every
    // driver screen called `Location.getCurrentPositionAsync()` itself,
    // synchronously seeding its own `driverLocation` state before ever
    // depending on `watchPositionAsync`'s first callback (see `bae3beb`,
    // the pre-Navigation-Engine baseline). That guarantee was lost when
    // `driverLocation` moved to `NavigationStore`, owned exclusively by this
    // provider's `onFix` listener below — a passive register-and-wait with
    // no fallback for a fix that already exists by the time this provider
    // starts caring (e.g. the driver was already online and GPS was already
    // flowing before this listener was registered). `GPSManager.getLastFix()`
    // is a synchronous read of the cache GPSManager already maintains — not
    // a new subscription, not a direct `expo-location` call, not a second
    // GPS owner — so this restores the old immediate-availability guarantee
    // without changing GPS ownership.
    const cachedFix = GPSManager.getLastFix();
    if (cachedFix) {
      useNavigationStore.getState().setGpsFix(cachedFix);
    }

    const unsubscribeFix = GPSManager.onFix((fix) => {
      // TEMPORARY (Phase 7R.1 runtime verification) — remove after verification.
      if (__DEV__) console.log('[NavigationProvider.onFix] received GPS fix', fix.coordinate);

      // Performance optimization (Phase 7F): when a route is already active,
      // publish the fix and its route progress in ONE store commit
      // (`applyGpsFixWithProgress`) instead of two separate ones
      // (`setGpsFix` then `applyRouteProgress`) — same final state, half the
      // synchronous store-subscriber notifications per tick (see
      // `RouteProgressTracker.applyGpsFixWithProgress`'s own doc). `route`
      // is read before applying the fix since a fix never changes it.
      const routeBeforeFix = useNavigationStore.getState().route;
      if (routeBeforeFix) {
        if (__DEV__) console.log('[NavigationProvider.onFix] entering applyGpsFixWithProgress()');
        applyGpsFixWithProgress(fix, routeBeforeFix);
        if (__DEV__) console.log('[NavigationProvider.onFix] applyGpsFixWithProgress() returned successfully');
      } else {
        useNavigationStore.getState().setGpsFix(fix);
      }

      const state = useNavigationStore.getState();
      if (state.route && state.driverLocation) {
        if (lastRouteIdRef.current !== state.route.id) {
          lastRouteIdRef.current = state.route.id;
          lastRerouteCheckRef.current.current = null;
        }
        if (__DEV__) console.log('[NavigationProvider.onFix] entering checkAndReroute()');
        void checkAndReroute(state.driverLocation, state.route, lastRerouteCheckRef.current)
          .then(() => {
            if (__DEV__) console.log('[NavigationProvider.onFix] checkAndReroute() returned successfully');
          })
          .catch((error) => {
            if (__DEV__) console.log('[NavigationProvider.onFix] checkAndReroute() REJECTED', error);
          });
      }
    });
    const unsubscribeStatus = GPSManager.onStatusChange((status) => {
      useNavigationStore.getState().setGpsStatus(status);
    });
    return () => {
      unsubscribeFix();
      unsubscribeStatus();
    };
  }, []);

  useEffect(() => logTransitionsInDev(), []);

  const value = useMemo<NavigationEngineContextValue>(
    () => ({
      eventBus: navigationEventBus,
    }),
    []
  );

  return (
    <NavigationEngineContext.Provider value={value}>{children}</NavigationEngineContext.Provider>
  );
}

/** Internal accessor for the engine's singletons — not for screen use. */
export function useNavigationEngineContext(): NavigationEngineContextValue {
  const ctx = useContext(NavigationEngineContext);
  if (!ctx) {
    throw new Error('useNavigationEngineContext must be used within a <NavigationProvider>');
  }
  return ctx;
}
