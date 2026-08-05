/**
 * CameraController — the only owner of the Google Maps camera.
 *
 * Per the Bible ("Core Principles": "No individual screen should ever call
 * animateCamera()...") and AGENTS.md's "Camera Rules", every camera move in
 * the app must go through here. This module owns the one `animateCamera`
 * call site for the whole engine: it subscribes to `NavigationStore`, turns
 * (`mode`, `cameraState`, driver/customer position, heading, speed) into a
 * single target `CameraPose` per the Bible's per-mode camera table (see
 * Architecture.md "Camera profiles"), and applies it to whichever MapView
 * is currently attached — gated so routine GPS jitter never re-triggers an
 * animation (Bible: "No abrupt camera jumps... no shaking").
 *
 * Shape follows `GPSManager.ts`'s established convention: a plain,
 * dependency-light singleton (module state, not a class or a Zustand
 * store), not a React component/hook — consistent with the rest of the
 * codebase's engine-style modules (`src/core/spatialEngine.ts`,
 * `src/lib/google/mapsApi.ts`). The (not yet built) `NavigationMap`
 * component is the intended caller of `attachMap`/`detachMap`/
 * `setViewportSize`, wiring them to its underlying `MapView`'s
 * `onMapReady`/`onLayout`/unmount — see the TODO at the bottom of this file.
 *
 * Camera math lives in three other files, not here:
 *  - `CameraAnimation.ts` — generic, Bible-agnostic animation primitives
 *    (easing, thresholds, look-ahead, damping).
 *  - `NavigationMath.ts` — the Bible's concrete tables (dynamic zoom/pitch
 *    curves, bounds geometry).
 *  - `AutoFitEngine.ts` — every fit-style shot (Preview, Driver Accepted,
 *    Completed/Overview): what points to include and how UI chrome (safe
 *    area, bottom sheet, floating buttons, nav banner, map controls) turns
 *    into edge padding. This file no longer computes bounds/zoom itself for
 *    those modes — it calls into `AutoFitEngine.ts`, the same way it calls
 *    into `NavigationMath.ts`/`CameraAnimation.ts` for everything else.
 * This file's job is orchestration only: read the store, pick a mode's
 * `CameraProfile`, call the math, decide whether the result is worth
 * animating to, and make exactly one `animateCamera` call when it is.
 *
 * What this pass deliberately does NOT do (migrating the 7 screens that
 * still call `animateCamera`/`fitToCoordinates` directly onto this
 * controller): that mirrors how `GPSManager.ts` shipped standalone before
 * its own dedicated migration pass (Phase 3.5) moved every call site onto
 * it — see Architecture.md's Rollout plan, which lists that migration as a
 * separate future step, not part of building the controller itself.
 */

import { normalizeHeading } from '@/lib/mapAnimation';
import { DEFAULT_CHROME, fitCompleted, fitPreview, type AutoFitChrome } from './AutoFitEngine';
import {
  applyCameraDamping,
  ARRIVAL_DURATION,
  calculateAnimationDuration,
  calculateForwardOffset,
  calculateLookAheadDistance,
  calculateLookAheadPoint,
  calculateMovementThreshold,
  calculateRotationThreshold,
  interpolateBearing,
  lerp,
  MIN_PITCH,
  MIN_ZOOM,
  RECENTER_DURATION,
  shortestBearing,
  shouldAnimate,
  shouldRotate,
  type CameraAnimationState,
} from './CameraAnimation';
import { distanceMeters, dynamicPitchForMode, dynamicZoomForSpeed } from './NavigationMath';
import { NavigationMode } from './NavigationModes';
import { useNavigationStore } from './NavigationStore';
import type { CameraProfile, EdgePadding, LatLng, NavigationState } from './types';

// ---------------------------------------------------------------------------
// Camera profiles per mode — Architecture.md "Camera profiles (from the
// Bible, per mode)". Values quoted directly from that table where it gives
// one; where the Bible/table only describes behaviour qualitatively
// ("zoom in slightly", "—"), a concrete number is chosen and documented.
// ---------------------------------------------------------------------------

const CAMERA_PROFILES: Readonly<Record<NavigationMode, CameraProfile>> = {
  // No camera opinion before a trip is previewed / while offline — screens
  // are free to show whatever they want (e.g. a plain "my location" map).
  [NavigationMode.IDLE]: {
    rotationEnabled: false,
    pitch: MIN_PITCH,
    zoom: MIN_ZOOM,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: false,
  },
  [NavigationMode.OFFLINE]: {
    rotationEnabled: false,
    pitch: MIN_PITCH,
    zoom: MIN_ZOOM,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: false,
  },

  // "Automatically fit Pickup -> Destination -> Entire route. Vehicle
  // rotation OFF. Map rotation OFF. Pitch 0°. Bearing North."
  [NavigationMode.PREVIEW]: {
    rotationEnabled: false,
    pitch: 0,
    zoom: MIN_ZOOM, // unused fallback — autoFit computes the real zoom
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: true,
  },
  // "Shows pickup, destination, nearby drivers. Everything remains
  // visible." — nearby-driver candidates aren't tracked in NavigationState
  // yet, so this fits pickup + destination, same as PREVIEW.
  [NavigationMode.MATCHING]: {
    rotationEnabled: false,
    pitch: 0,
    zoom: MIN_ZOOM,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: true,
  },

  // "Vehicle arrow fixed 68% down the screen. Road moves. Camera rotates...
  // Pitch 50°. Zoom 17.5. Bearing driver heading. Animation Smooth."
  [NavigationMode.DRIVER_TO_PICKUP]: {
    rotationEnabled: true,
    pitch: 50,
    zoom: 17.5,
    bearingSource: 'heading',
    followAnchorRatio: 0.68,
    autoFit: false,
  },

  // "Vehicle stops. Camera zooms slightly closer. Passenger pin becomes
  // focus." No rotation/pitch value is given for a stopped vehicle, so the
  // camera settles flat and north-up rather than holding a driving tilt.
  [NavigationMode.ARRIVED_PICKUP]: {
    rotationEnabled: false,
    pitch: 30,
    zoom: 18.5,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: false,
  },

  // "Vehicle always faces north. Road rotates underneath... Dynamic zoom
  // adjusts automatically based on speed." Pitch/zoom are both dynamic
  // (Bible: pitch 45-55°, zoom per the walking/city/highway/very-fast
  // table) — see NavigationMath.ts's dynamicPitchForMode/dynamicZoomForSpeed.
  [NavigationMode.TRIP_IN_PROGRESS]: {
    rotationEnabled: true,
    pitch: 'dynamic',
    zoom: 'dynamic',
    bearingSource: 'heading',
    followAnchorRatio: 0.68,
    autoFit: false,
  },

  // "Zoom slightly out. Destination highlighted." Rotation "slows" — modeled
  // as settling to north-up rather than continuing to track heading.
  [NavigationMode.ARRIVED_DROPOFF]: {
    rotationEnabled: false,
    pitch: 35,
    zoom: 16.5,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: false,
  },

  // "Zoom out. Show both vehicle, destination." Same auto-fit shape as
  // Overview (cameraState 'OVERVIEW') — see `overviewFitPoints`.
  [NavigationMode.TRIP_COMPLETED]: {
    rotationEnabled: false,
    pitch: 0,
    zoom: MIN_ZOOM,
    bearingSource: 'north',
    followAnchorRatio: 0.5,
    autoFit: true,
  },
};

/** Matches Map.native.tsx's existing `fitToCoordinates` edge padding, kept as `chrome.extraPadding`'s default so auto-fit framing stays visually consistent with what the app already does for the same "pickup + destination" fit elsewhere, until a real NavigationHUD/TripBottomCard/MapControls reports actual chrome sizes via `setChrome`. */
const DEFAULT_EDGE_PADDING: EdgePadding = { top: 100, right: 50, bottom: 300, left: 50 };

/** Used only before the map has reported its real layout size (see `setViewportSize`) — still a valid viewport to fit against, just not the true one yet. */
const FALLBACK_VIEWPORT = { width: 375, height: 812 };

/** Below this zoom-level change, a routine follow tick isn't considered a meaningful zoom change (avoids re-animating on floating-point-scale speed noise). */
const ZOOM_CHANGE_EPSILON = 0.05;

/**
 * Exponential damping rate (see `CameraAnimation.applyCameraDamping`) applied
 * to routine in-mode follow ticks only — never to a mode/cameraState
 * transition or the first-ever pose, both of which deliberately move to the
 * raw target in full (see `recompute`'s branches). At a ~1s GPS interval
 * (`driverBestNavigation`'s cadence) this reaches ~95% of the way to a fresh
 * target per tick (1 - e^-3 ≈ 0.95) — most of the raw movement/look-ahead
 * prediction still lands, but a single noisy fix is blended rather than
 * applied outright, on top of (not instead of) the existing movement/
 * rotation-threshold gating below. Tuned as a starting value; the Bible
 * specifies "no shaking," not an exact damping constant, so this should be
 * verified/adjusted on a real device (none available in this environment).
 */
const CAMERA_DAMPING_FACTOR = 3;

// ---------------------------------------------------------------------------
// Map handle — a minimal structural type for what this controller needs
// from a mounted `react-native-maps` `MapView` ref. Deliberately not typed
// against the `react-native-maps` package itself: the rest of this codebase
// already treats the ref as untyped/`any` (see Map.native.tsx's lazy
// `require('react-native-maps')`, for Expo Go compatibility) — this
// interface is a narrow, safer alternative to `any` without adding a hard
// dependency on that package's type declarations.
// ---------------------------------------------------------------------------

export interface CameraControllerMapHandle {
  animateCamera: (
    camera: { center: LatLng; heading: number; pitch: number; zoom: number },
    options: { duration: number }
  ) => void;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mapHandle: CameraControllerMapHandle | null = null;
let unsubscribeStore: (() => void) | null = null;
let viewportSize = { ...FALLBACK_VIEWPORT };

/** UI chrome AutoFitEngine reserves space for — see `setChrome`. Starts equivalent to the flat default every auto-fit used before chrome-awareness existed, so behaviour doesn't change until a real component reports actual sizes. */
let chrome: AutoFitChrome = { ...DEFAULT_CHROME, extraPadding: DEFAULT_EDGE_PADDING };

let lastAppliedPose: CameraAnimationState | null = null;
let lastAppliedMode: NavigationMode | null = null;
let lastAppliedCameraState: NavigationState['cameraState'] | null = null;
let lastSnapshot: RelevantSnapshot | null = null;

// ---------------------------------------------------------------------------
// Public API — the (future) NavigationMap component's integration surface
// ---------------------------------------------------------------------------

/**
 * Attaches the live MapView handle this controller should drive. Safe to
 * call every time the map (re)mounts. Immediately (re)applies the current
 * navigation state so the map frames correctly the moment it's ready,
 * rather than waiting for the next store change.
 */
export function attachMap(handle: CameraControllerMapHandle): void {
  mapHandle = handle;
  if (!unsubscribeStore) {
    unsubscribeStore = useNavigationStore.subscribe(handleStoreChange);
  }
  lastSnapshot = null; // force the upcoming call to treat this as a change
  handleStoreChange();
}

/** Detaches the map handle and resets animation bookkeeping. Call on unmount. */
export function detachMap(): void {
  mapHandle = null;
  lastAppliedPose = null;
  lastAppliedMode = null;
  lastAppliedCameraState = null;
  lastSnapshot = null;
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
}

/**
 * Reports the MapView's real rendered size (from its `onLayout`), so
 * auto-fit zoom calculations use the actual viewport instead of the
 * fallback constant. Ignored if given a non-positive size.
 */
export function setViewportSize(size: { width: number; height: number }): void {
  if (size.width > 0 && size.height > 0) {
    viewportSize = size;
  }
}

/**
 * Updates the UI chrome AutoFitEngine reserves space for (safe area, bottom
 * sheet height, floating buttons, navigation banner height, map controls
 * width — see `AutoFitChrome`). Merges onto the existing chrome rather than
 * replacing it wholesale, so e.g. a bottom sheet resize doesn't require
 * re-supplying safe-area insets. Intended caller: a future
 * NavigationHUD/TripBottomCard/MapControls reporting its own measured size.
 */
export function setChrome(partial: Partial<AutoFitChrome>): void {
  chrome = { ...chrome, ...partial };
}

/** The camera pose this controller last actually applied, or null before the first one. For diagnostics/debug overlays only — nothing in the engine reads this to make decisions. */
export function getCurrentPose(): CameraAnimationState | null {
  return lastAppliedPose;
}

// ---------------------------------------------------------------------------
// Store subscription
// ---------------------------------------------------------------------------

interface RelevantSnapshot {
  mode: NavigationMode;
  cameraState: NavigationState['cameraState'];
  driverLocation: LatLng | null;
  pickup: LatLng | null;
  destination: LatLng | null;
  heading: number | null;
  speed: number | null;
}

function toSnapshot(state: NavigationState): RelevantSnapshot {
  return {
    mode: state.mode,
    cameraState: state.cameraState,
    driverLocation: state.driverLocation,
    pickup: state.pickup,
    destination: state.destination,
    heading: state.heading,
    speed: state.speed,
  };
}

function latLngEqual(a: LatLng | null, b: LatLng | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function snapshotsEqual(a: RelevantSnapshot | null, b: RelevantSnapshot | null): boolean {
  if (a === null || b === null) return false;
  return (
    a.mode === b.mode &&
    a.cameraState === b.cameraState &&
    latLngEqual(a.driverLocation, b.driverLocation) &&
    latLngEqual(a.pickup, b.pickup) &&
    latLngEqual(a.destination, b.destination) &&
    a.heading === b.heading &&
    a.speed === b.speed
  );
}

/**
 * Phase 6A (Camera Runtime Activation) verification-only logging — prints
 * every NavigationStore update CameraController receives while a map is
 * attached. Extended in Phase 6.5 (Camera Runtime Verification, Task 7) to
 * add `heading`/`speed`/`cameraState` and a `timestampMs` — that phase's own
 * checklist ("Confirm every runtime update logs: Mode, GPS, Heading, Speed,
 * Route, ETA, Camera state") named three fields the Phase 6A version didn't
 * carry yet; `timestampMs` lets a reader measure real GPS-update/recompute
 * cadence from the log instead of guessing from wall-clock console
 * timestamps. Fires before the snapshot-equality gate below, so it logs
 * every store change, not just ones that end up moving the camera — this is
 * what makes it useful for confirming "no update is dropped" separately
 * from "did the camera actually move." `__DEV__`-gated, matching the
 * precedent set by `NavigationProvider`'s `logTransitionsInDev()` (Phase
 * 5.5B) — instrumentation only, no behaviour change.
 *
 * Phase 7: throttled to at most once per 500ms — GPS ticks as fast as
 * 1/sec (driverBestNavigation) made this a steady Metro console spam
 * source with no verification value beyond the first line in any given
 * window; still well under GPS's own cadence, so no update pattern is lost.
 */
const RUNTIME_LOG_THROTTLE_MS = 500;
let lastRuntimeLogAtMs = 0;

function logRuntimeUpdateInDev(state: NavigationState): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - lastRuntimeLogAtMs < RUNTIME_LOG_THROTTLE_MS) return;
  lastRuntimeLogAtMs = now;
  console.log('[CameraController] runtime update', {
    timestampMs: Date.now(),
    mode: state.mode,
    cameraState: state.cameraState,
    gps: state.gpsState.status,
    heading: state.heading,
    speed: state.speed,
    route: state.route ? { id: state.route.id, etaSeconds: state.etaSeconds } : null,
    etaSeconds: state.etaSeconds,
    driverPosition: state.driverLocation,
  });
}

function handleStoreChange(): void {
  if (!mapHandle) return;
  const state = useNavigationStore.getState();
  logRuntimeUpdateInDev(state);
  const snapshot = toSnapshot(state);
  if (snapshotsEqual(snapshot, lastSnapshot)) return;
  lastSnapshot = snapshot;
  recompute(state);
}

// ---------------------------------------------------------------------------
// Target pose resolution
// ---------------------------------------------------------------------------

/**
 * Where the camera should look for a follow/arrival mode — driving modes
 * project the raw fix forward (Bible: "Camera follows NOT the current GPS.
 * Instead predict future movement... This removes shaking"); arrival modes
 * focus a fixed point instead (the pickup/destination pin, not the vehicle).
 */
function resolveFollowCenter(mode: NavigationMode, state: NavigationState): LatLng | null {
  switch (mode) {
    case NavigationMode.DRIVER_TO_PICKUP:
    case NavigationMode.TRIP_IN_PROGRESS: {
      if (!state.driverLocation) return null;
      const speed = state.speed ?? 0;
      const heading = state.heading ?? 0;
      const lookAhead = calculateLookAheadDistance(speed);
      const anchorOffset = calculateForwardOffset(speed, CAMERA_PROFILES[mode].followAnchorRatio);
      const totalForwardMeters = lookAhead + anchorOffset.forwardMeters;
      return calculateLookAheadPoint(state.driverLocation, heading, totalForwardMeters).point;
    }
    case NavigationMode.ARRIVED_PICKUP:
      return state.pickup;
    case NavigationMode.ARRIVED_DROPOFF:
      return state.destination;
    default:
      return state.driverLocation ?? state.pickup ?? state.destination ?? null;
  }
}

function followOrArrivalPose(mode: NavigationMode, state: NavigationState): CameraAnimationState | null {
  const profile = CAMERA_PROFILES[mode];
  const center = resolveFollowCenter(mode, state);
  if (!center) return null;

  const speed = state.speed ?? 0;
  const bearing = profile.bearingSource === 'heading' ? normalizeHeading(state.heading ?? 0) : 0;
  const pitch = dynamicPitchForMode(profile, speed);
  const zoom = profile.zoom === 'dynamic' ? dynamicZoomForSpeed(speed) : profile.zoom;

  return {
    center,
    bearing,
    pitch,
    zoom,
    padding: DEFAULT_EDGE_PADDING,
    timestampMs: Date.now(),
  };
}

/**
 * The single function that turns full navigation state into one target
 * camera pose (or null, meaning "no camera opinion right now").
 *
 * Precedence: PREVIEW/MATCHING/TRIP_COMPLETED are unconditional per the
 * Bible's table (mode alone decides — nothing currently keeps `cameraState`
 * in sync with mode transitions, so a stale `cameraState` must never
 * override these three). IDLE/OFFLINE have no camera opinion. For the
 * remaining "actively driving/arriving" modes, `cameraState` layers in as a
 * genuine user-facing override: FREE_EXPLORE pauses everything (the user is
 * mid-gesture), FIT_ROUTE/OVERVIEW let a screen request either fit view at
 * any point during the drive (Bible's closing "Camera State Manager"
 * section) — anything else falls through to that mode's own follow/arrival
 * behaviour.
 */
function computeTargetPose(state: NavigationState): CameraAnimationState | null {
  if (state.mode === NavigationMode.PREVIEW || state.mode === NavigationMode.MATCHING) {
    return fitPreview(state.pickup, state.destination, state.route, viewportSize, chrome);
  }
  if (state.mode === NavigationMode.TRIP_COMPLETED) {
    return fitCompleted(state.driverLocation, state.destination, viewportSize, chrome);
  }
  if (state.mode === NavigationMode.IDLE || state.mode === NavigationMode.OFFLINE) {
    return null;
  }

  if (state.cameraState === 'FREE_EXPLORE') return null;
  if (state.cameraState === 'FIT_ROUTE') {
    return fitPreview(state.pickup, state.destination, state.route, viewportSize, chrome);
  }
  if (state.cameraState === 'OVERVIEW') {
    return fitCompleted(state.driverLocation, state.destination, viewportSize, chrome);
  }

  return followOrArrivalPose(state.mode, state);
}

// ---------------------------------------------------------------------------
// Gating + apply
// ---------------------------------------------------------------------------

/**
 * Blends `from` toward `target` using `CameraAnimation.applyCameraDamping`
 * (position + zoom + pitch as plain per-axis damping, bearing via
 * `interpolateBearing` so it still takes the shortest arc) — the "predict ->
 * camera -> animation" pipeline's smoothing stage, layered on top of (not
 * instead of) the movement/rotation-threshold gating that already decides
 * *whether* to react at all. `applyCameraDamping(0, 1, factor, dt)` derives
 * a single 0-1 blend weight for this tick (frame-time independent), reused
 * for every axis rather than re-deriving the exponential formula per field.
 */
function dampPose(from: CameraAnimationState, target: CameraAnimationState, dampingFactor: number, deltaSeconds: number): CameraAnimationState {
  const t = applyCameraDamping(0, 1, dampingFactor, deltaSeconds);
  return {
    center: {
      latitude: lerp(from.center.latitude, target.center.latitude, t),
      longitude: lerp(from.center.longitude, target.center.longitude, t),
    },
    bearing: interpolateBearing(from.bearing, target.bearing, t),
    zoom: lerp(from.zoom, target.zoom, t),
    pitch: lerp(from.pitch, target.pitch, t),
    padding: target.padding,
    timestampMs: Date.now(),
  };
}

function recompute(state: NavigationState): void {
  if (!mapHandle) return;

  const target = computeTargetPose(state);
  if (!target) return;

  const isFirstApplication = lastAppliedPose === null;
  const transitioned = lastAppliedMode !== state.mode || lastAppliedCameraState !== state.cameraState;
  // A recenter is a specific transition sub-case (mode unchanged, camera
  // intent returning from FREE_EXPLORE to FOLLOW_DRIVER — see
  // NavigationStore.recenter()) that the Bible calls out as its own named
  // behaviour ("the camera smoothly returns to FOLLOW_DRIVER"), distinct
  // from a full mode change — it should feel snappier than e.g. entering
  // DRIVER_TO_PICKUP fresh, not identical to it.
  const isRecenter =
    transitioned && lastAppliedMode === state.mode && lastAppliedCameraState === 'FREE_EXPLORE' && state.cameraState === 'FOLLOW_DRIVER';

  let appliedPose: CameraAnimationState;
  let shouldApply: boolean;
  let durationMs: number;

  if (isFirstApplication) {
    // No prior pose to animate from — snap directly to the target rather
    // than tweening from an arbitrary/undefined starting camera.
    appliedPose = target;
    shouldApply = true;
    durationMs = 0;
  } else if (transitioned) {
    // Entering a new mode or camera intent deserves a deliberate, eased
    // transition (Bible/Architecture.md: DRIVER_TO_PICKUP's camera "eases
    // in smoothly on entry rather than jumping") — not the snappier
    // routine-follow duration used for in-mode GPS ticks below, and moving
    // to the raw target rather than a damped blend of the old mode's stale
    // pose (damping is for steady-state follow noise, not a deliberate
    // intent change).
    appliedPose = target;
    shouldApply = true;
    durationMs = isRecenter ? RECENTER_DURATION : ARRIVAL_DURATION;
  } else {
    const from = lastAppliedPose as CameraAnimationState;
    const distanceMovedMeters = distanceMeters(from.center, target.center);
    const headingDelta = Math.abs(shortestBearing(from.bearing, target.bearing) - from.bearing);
    const zoomDelta = Math.abs(target.zoom - from.zoom);

    const movementThreshold = calculateMovementThreshold(from.zoom);
    const rotationThreshold = calculateRotationThreshold(state.speed ?? 0);

    shouldApply =
      shouldAnimate(distanceMovedMeters, movementThreshold) ||
      shouldRotate(headingDelta, rotationThreshold) ||
      zoomDelta > ZOOM_CHANGE_EPSILON;
    durationMs = calculateAnimationDuration(distanceMovedMeters, state.speed ?? undefined);

    // Gating above still runs against the raw target (unchanged) — only the
    // pose actually sent to the map is damped, so a single noisy fix that
    // does clear the threshold arrives smoothed rather than as a full jump.
    const deltaSeconds = Math.max(0, (target.timestampMs - from.timestampMs) / 1000);
    appliedPose = dampPose(from, target, CAMERA_DAMPING_FACTOR, deltaSeconds);
  }

  if (!shouldApply) return;

  // `target.padding` isn't sent here: react-native-maps' `animateCamera`
  // camera object has no padding field (only `fitToCoordinates` does) —
  // padding already did its job inside `autoFitPose`'s zoom calculation, so
  // by this point it's fully baked into `target.zoom`.
  mapHandle.animateCamera(
    { center: appliedPose.center, heading: appliedPose.bearing, pitch: appliedPose.pitch, zoom: appliedPose.zoom },
    { duration: durationMs }
  );

  // Publishes what the camera is now doing back into the store —
  // NavigationState.bearing/zoom/pitch existed but nothing wrote them before
  // Phase 7, so NavigationCompass's needle (reads `bearing`) was permanently
  // frozen at 0°. Read-only from every other consumer's perspective: this is
  // the one place camera pose becomes store data.
  useNavigationStore.setState({ bearing: appliedPose.bearing, zoom: appliedPose.zoom, pitch: appliedPose.pitch });

  lastAppliedPose = appliedPose;
  lastAppliedMode = state.mode;
  lastAppliedCameraState = state.cameraState;
}

// TODO(NavigationMap): call `attachMap(mapRef.current)` from `onMapReady`,
// `setViewportSize({ width, height })` from `onLayout`, and `detachMap()` on
// unmount. Once GPSManager is wired into NavigationStore (Architecture.md
// Rollout plan step 4), `driverLocation`/`heading`/`speed` updates will flow
// into this controller automatically via the store subscription above — no
// change to this file will be needed for that wiring to take effect.
