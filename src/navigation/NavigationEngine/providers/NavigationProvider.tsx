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
 */

import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import * as GPSManager from '../GPSManager';
import { navigationEventBus, type NavigationEventBus } from '../NavigationEvents';
import { useNavigationStore } from '../NavigationStore';

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
  useEffect(() => {
    const unsubscribeFix = GPSManager.onFix((fix) => {
      useNavigationStore.getState().setGpsFix(fix);
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
