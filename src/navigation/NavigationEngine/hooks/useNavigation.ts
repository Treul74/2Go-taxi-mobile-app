/**
 * The ONLY navigation import a screen should need.
 *
 * Per the Bible: "Screens simply say navigation.previewRoute() ... and the
 * engine does everything" — this hook is that `navigation` object. It
 * exposes NavigationActions only (see types.ts) — no camera, GPS, or route
 * internals leak through it. If a screen needs to read live navigation
 * state (ETA, current step, mode) to render its own UI, pair this with the
 * relevant selector — screens should still prefer a purpose-built component
 * from src/components/navigation/ (NavigationHUD, TurnBanner, etc., per the
 * Bible's component list) over reading raw state themselves where one exists.
 *
 * Usage (once implemented):
 *   const navigation = useNavigation();
 *   navigation.previewRoute(pickup, destination);
 *   navigation.startNavigationToPickup();
 *
 * Never call animateCamera(), fitToCoordinates(), watchPositionAsync(), or
 * a Directions API helper directly from a screen — request it through this
 * hook instead (see AGENTS.md "Camera Rules" / Bible "Core Principles").
 */

import { useShallow } from 'zustand/react/shallow';
import { useNavigationStore } from '../NavigationStore';
import type { NavigationActions } from '../types';

export function useNavigation(): NavigationActions {
  return useNavigationStore(
    useShallow((s) => ({
      transition: s.transition,
      preview: s.preview,
      requestMatch: s.requestMatch,
      driverToPickup: s.driverToPickup,
      arrivedAtPickup: s.arrivedAtPickup,
      startTrip: s.startTrip,
      arrivedAtDropoff: s.arrivedAtDropoff,
      completeTrip: s.completeTrip,
      cancel: s.cancel,
      reset: s.reset,
      goOffline: s.goOffline,
      goOnline: s.goOnline,
      followDriver: s.followDriver,
      recenter: s.recenter,
      fitRoute: s.fitRoute,
      overview: s.overview,
      enterFreeExplore: s.enterFreeExplore,
      setNavigationEnabled: s.setNavigationEnabled,
    }))
  );
}
