/**
 * Internal, granular selector hooks over `useNavigationStore`.
 *
 * These are consumed by the NavigationEngine's own components
 * (NavigationMap, NavigationHUD, TurnBanner, etc. — see Architecture.md) so
 * each one re-renders only on the slice of state it actually needs, instead
 * of subscribing to the whole store.
 *
 * This file is NOT the public API screens use — that is
 * `hooks/useNavigation.ts`, which wraps NavigationActions only. Screens
 * should not import from here directly; if a screen finds itself needing
 * one of these selectors, that's a signal the action surface in
 * `hooks/useNavigation.ts` is missing something, not that it should reach
 * into the engine's internals.
 */

import { useShallow } from 'zustand/react/shallow';
import { useNavigationStore } from './NavigationStore';
import type { CameraState, GPSState, LatLng, RecenterState, RouteData, RouteProgress, RouteStep } from './types';
import type { NavigationMode } from './NavigationModes';

// --- Lifecycle ---------------------------------------------------------------

export function useNavigationMode(): NavigationMode {
  return useNavigationStore((s) => s.mode);
}

export function useNavigationModeHistory(): NavigationMode[] {
  return useNavigationStore((s) => s.modeHistory);
}

export function useNavigationEnabled(): boolean {
  return useNavigationStore((s) => s.navigationEnabled);
}

// --- Trip endpoints ------------------------------------------------------

export function usePickupDestination(): { pickup: LatLng | null; destination: LatLng | null } {
  return useNavigationStore(
    useShallow((s) => ({ pickup: s.pickup, destination: s.destination }))
  );
}

// --- Live positions --------------------------------------------------------

export function useDriverLocation(): LatLng | null {
  return useNavigationStore((s) => s.driverLocation);
}

export function useCustomerLocation(): LatLng | null {
  return useNavigationStore((s) => s.customerLocation);
}

export function useHeading(): number | null {
  return useNavigationStore((s) => s.heading);
}

export function useSpeed(): number | null {
  return useNavigationStore((s) => s.speed);
}

// --- GPS ---------------------------------------------------------------

export function useGPSState(): GPSState {
  return useNavigationStore((s) => s.gpsState);
}

// --- Route ---------------------------------------------------------------

export function useActiveRoute(): RouteData | null {
  return useNavigationStore((s) => s.route);
}

export function useRouteProgress(): RouteProgress | null {
  return useNavigationStore((s) => s.progress);
}

export function useCurrentStep(): RouteStep | null {
  return useNavigationStore((s) => s.currentStep);
}

export function useCurrentInstruction(): string | null {
  return useNavigationStore((s) => s.currentInstruction);
}

export function useEtaSeconds(): number | null {
  return useNavigationStore((s) => s.etaSeconds);
}

export function useDistanceMeters(): number | null {
  return useNavigationStore((s) => s.distanceMeters);
}

export function useDistanceRemainingMeters(): number | null {
  return useNavigationStore((s) => s.distanceRemainingMeters);
}

// --- Camera --------------------------------------------------------------

export function useCameraState(): CameraState {
  return useNavigationStore((s) => s.cameraState);
}

export function useBearing(): number | null {
  return useNavigationStore((s) => s.bearing);
}

export function useZoom(): number | null {
  return useNavigationStore((s) => s.zoom);
}

export function usePitch(): number | null {
  return useNavigationStore((s) => s.pitch);
}

export function useFollowMode(): boolean {
  return useNavigationStore((s) => s.followMode);
}

export function useRecenterState(): RecenterState {
  return useNavigationStore((s) => s.recenterState);
}
