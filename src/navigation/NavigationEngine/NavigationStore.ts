/**
 * The single global navigation store — the app's one source of truth for
 * every navigation-related value: trip mode, route, driver/customer
 * position, camera pose, GPS status, ETA/distance, and the follow/recenter
 * affordance. Per the Bible ("Navigation Store — One global store... No
 * screen owns these values") and AGENTS.md's Store Ownership convention
 * (one Zustand store per domain), this is the ONLY store allowed to hold
 * any of it. It is intentionally separate from `driverStore`/`rideStore`
 * (src/state/), which continue to own order/business data (fare, request
 * queue, wallet, etc.) — see Architecture.md "Relationship to existing
 * stores".
 *
 * This pass makes the store the complete, strongly-typed data owner for
 * every field listed in the Bible's "Navigation Store" section plus the
 * additive Customer-location/GPS/follow/recenter/enabled fields — but it
 * does NOT implement GPS, camera, or routing behaviour. Every field exists
 * and is settable; nothing populates route/GPS/camera fields with real data
 * yet. Mode transitions remain the one exception: they're fully
 * implemented and validated (see NavigationModes.ts), same as the previous
 * pass.
 */

import { create } from 'zustand';
import {
  assertValidTransition,
  NavigationMode,
  type NavigationTransitionError,
} from './NavigationModes';
import { navigationEventBus } from './NavigationEvents';
import type { GPSFix, GPSSignalStatus, LatLng, NavigationActions, NavigationDataActions, NavigationState, RouteData } from './types';

const initialState: NavigationState = {
  // Lifecycle
  mode: NavigationMode.IDLE,
  modeHistory: [NavigationMode.IDLE],
  navigationEnabled: false,

  // Trip endpoints
  pickup: null,
  destination: null,

  // Live positions
  actor: null,
  driverLocation: null,
  customerLocation: null,
  heading: null,
  speed: null,

  // GPS
  gpsState: {
    status: 'disabled',
    lastFix: null,
    accuracyMeters: null,
  },

  // Route
  route: null,
  progress: null,
  currentStep: null,
  currentInstruction: null,
  etaSeconds: null,
  distanceMeters: null,
  distanceRemainingMeters: null,

  // Camera
  cameraState: 'OVERVIEW',
  bearing: null,
  zoom: null,
  pitch: null,
  followMode: false,
  recenterState: 'idle',
};

/**
 * Fields that don't carry over once the machine returns to IDLE — a fresh
 * IDLE shouldn't show stale trip data. Deliberately excludes `cameraState`,
 * `followMode`, `recenterState`, `gpsState`, and `navigationEnabled`: those
 * describe the engine/device's own ongoing configuration, not a specific
 * trip, so they persist across trips (e.g. a Transporter's GPS status
 * doesn't reset just because one trip ended).
 */
const IDLE_RESET_FIELDS: Partial<NavigationState> = {
  pickup: null,
  destination: null,
  driverLocation: null,
  customerLocation: null,
  heading: null,
  speed: null,
  route: null,
  progress: null,
  currentStep: null,
  currentInstruction: null,
  etaSeconds: null,
  distanceMeters: null,
  distanceRemainingMeters: null,
  bearing: null,
  zoom: null,
  pitch: null,
};

/**
 * Validates `currentMode -> to`, emits the corresponding event, and either
 * throws (invalid) or returns the state patch to apply (valid). This is the
 * ONLY function in the store allowed to decide whether `mode` may change —
 * every action below calls it instead of setting `mode` directly.
 */
function applyTransition(
  currentMode: NavigationMode,
  currentHistory: NavigationMode[],
  to: NavigationMode
): Pick<NavigationState, 'mode' | 'modeHistory'> & Partial<NavigationState> {
  try {
    assertValidTransition(currentMode, to);
  } catch (error) {
    const err = error as NavigationTransitionError;
    navigationEventBus.emit('TRANSITION_REJECTED', {
      from: currentMode,
      attempted: to,
      reason: err.message,
    });
    throw err;
  }

  navigationEventBus.emit('MODE_CHANGED', { previous: currentMode, next: to });

  return {
    mode: to,
    modeHistory: [...currentHistory, to],
    ...(to === NavigationMode.IDLE ? IDLE_RESET_FIELDS : {}),
  };
}

type NavigationStore = NavigationState & NavigationActions & NavigationDataActions;

export const useNavigationStore = create<NavigationStore>()((set) => ({
  ...initialState,

  // --- Mode transitions (fully implemented — see NavigationModes.ts) -------

  transition: (to: NavigationMode) => {
    set((state) => applyTransition(state.mode, state.modeHistory, to));
  },

  preview: (pickup: LatLng, destination: LatLng) => {
    set((state) => ({
      ...applyTransition(state.mode, state.modeHistory, NavigationMode.PREVIEW),
      pickup,
      destination,
    }));
  },

  requestMatch: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.MATCHING));
  },

  driverToPickup: (driverLocation?: LatLng) => {
    set((state) => ({
      ...applyTransition(state.mode, state.modeHistory, NavigationMode.DRIVER_TO_PICKUP),
      ...(driverLocation ? { driverLocation } : {}),
    }));
  },

  arrivedAtPickup: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.ARRIVED_PICKUP));
  },

  startTrip: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.TRIP_IN_PROGRESS));
  },

  arrivedAtDropoff: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.ARRIVED_DROPOFF));
  },

  completeTrip: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.TRIP_COMPLETED));
  },

  // Distinct name from `reset`/`goOnline` for call-site clarity — all three
  // resolve to the same `-> IDLE` edge; see types.ts NavigationActions doc.
  cancel: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.IDLE));
  },

  reset: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.IDLE));
  },

  goOffline: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.OFFLINE));
  },

  goOnline: () => {
    set((state) => applyTransition(state.mode, state.modeHistory, NavigationMode.IDLE));
  },

  // --- Camera intents --------------------------------------------------------
  // Plain state setters only — no animation, no math, no gesture handling.
  // `followMode`/`recenterState` are kept in lockstep with `cameraState` here
  // so nothing downstream has to re-derive one from the other.

  followDriver: () => {
    set({ cameraState: 'FOLLOW_DRIVER', followMode: true, recenterState: 'idle' });
  },

  recenter: () => {
    set({ cameraState: 'FOLLOW_DRIVER', followMode: true, recenterState: 'idle' });
  },

  fitRoute: () => {
    set({ cameraState: 'FIT_ROUTE', followMode: false, recenterState: 'idle' });
  },

  overview: () => {
    set({ cameraState: 'OVERVIEW', followMode: false, recenterState: 'idle' });
  },

  enterFreeExplore: () => {
    set({ cameraState: 'FREE_EXPLORE', followMode: false, recenterState: 'available' });
  },

  // --- Data setters (internal — see NavigationDataActions doc in types.ts) ---
  // Not part of the screen-facing NavigationActions surface: only
  // NavigationProvider (GPS) and the route-fetching screens (route) call
  // these, via `useNavigationStore.getState()` rather than `useNavigation()`.

  setGpsFix: (fix: GPSFix) => {
    set({
      driverLocation: fix.coordinate,
      heading: fix.heading ?? null,
      speed: fix.speed ?? null,
      gpsState: {
        status: 'active',
        lastFix: fix,
        accuracyMeters: fix.accuracy ?? null,
      },
    });
  },

  setGpsStatus: (status: GPSSignalStatus) => {
    set((state) => ({ gpsState: { ...state.gpsState, status } }));
  },

  setRoute: (route: RouteData | null) => {
    if (!route) {
      set({
        route: null,
        currentStep: null,
        currentInstruction: null,
        distanceMeters: null,
        etaSeconds: null,
      });
      return;
    }
    const firstStep = route.steps[0] ?? null;
    set({
      route,
      currentStep: firstStep,
      currentInstruction: firstStep?.instruction ?? null,
      distanceMeters: route.distanceMeters,
      etaSeconds: route.durationInTrafficSeconds ?? route.durationSeconds,
    });
  },
}));
