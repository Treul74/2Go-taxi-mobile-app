/**
 * GPSManager — the ONLY place in the entire app allowed to create a
 * location subscription.
 *
 * Per the Bible's "GPS Rules" and AGENTS.md's "GPS Rules": only one GPS
 * watcher exists for the whole application. No screen, hook, or component
 * may call `Location.watchPositionAsync` / `Location.getCurrentPositionAsync`
 * / `Location.startLocationUpdatesAsync` directly — everything goes through
 * the functions exported here. A repo-wide audit (see
 * audit_export/audit_03-08-26_11-58_gps-subscription-audit.md) found 7
 * screens/hooks/components doing exactly that; this hardening pass is what
 * that audit exists to fix, and all 7 have been migrated to call GPSManager.
 *
 * This module owns:
 *  - Foreground tracking (`Location.watchPositionAsync`)
 *  - Background tracking (`Location.startLocationUpdatesAsync` +
 *    `TaskManager.defineTask`, via the `expo-task-manager` package)
 *  - One-shot reads (`getCurrentFix`, for "recenter"/"use my location"
 *    buttons that don't want a standing subscription)
 *  - Heading updates, speed updates, bearing smoothing
 *  - Accuracy profiles (named accuracy/power tradeoffs, see `GPSProfile`)
 *  - Location quality scoring (EXCELLENT/GOOD/FAIR/POOR/REJECTED per fix —
 *    see "Location quality scoring" below for the documented algorithm)
 *  - Permission management (foreground + background, with OS
 *    location-services checks)
 *  - Lifecycle: `start`/`stop`/`pause`/`resume`/`restart`, all serialized so
 *    overlapping calls can never leave two subscriptions alive
 *  - Reference counting (`acquire`/`release`) for the case where more than
 *    one consumer wants tracking active at once (e.g. `useCurrentLocation`
 *    is used both directly and via `useSnappedLocation` in the same tree)
 *  - Diagnostics (`getDiagnostics`) and a typed event bus (`on`) — see their
 *    own sections below
 *  - Scenario-based profile switching (`applyScenario`) for battery
 *    optimization, without duplicating the accuracy/interval tables
 *
 * This module is intentionally a plain, dependency-light singleton (module
 * state, not a class or a Zustand store) — consistent with the rest of the
 * codebase's engine-style modules (see `src/core/spatialEngine.ts`,
 * `src/lib/google/mapsApi.ts`). It does NOT import `NavigationStore` or
 * Zustand: it publishes everything through the typed event bus (`on`) so
 * the future `NavigationProvider` can subscribe and forward values into
 * `useNavigationStore` without GPSManager needing to know the store exists.
 * That wiring is still a separate, later step — not part of this file (see
 * Architecture.md's Rollout plan).
 *
 * Note on the event bus: this duplicates the small pub/sub pattern already
 * used in `NavigationEvents.ts` (a generic `emit`/`on` typed bus) rather
 * than sharing a factory. That's a deliberate, acknowledged trade-off: unifying
 * them into one generic factory would mean this file importing from/being
 * coupled to `NavigationEvents.ts`, which contradicts staying
 * framework/store-independent. ~20 lines of trivial pub-sub plumbing is a
 * cheap price for that independence.
 *
 * ELIMINATED IN THIS PASS: `src/hooks/useCurrentLocation.ts`,
 * `src/features/passenger/components/MapPickerModal.native.tsx`,
 * `src/features/passenger/PassengerHome.tsx`,
 * `src/features/driver/DriverDashboard.tsx`, `app/(driver)/navigation.tsx`,
 * `app/(driver)/trip.tsx`, and `app/(tabs)/navigate.tsx` all called
 * `Location.watchPositionAsync`/`getCurrentPositionAsync` directly. All 7 now
 * go through `acquire`/`release`/`getCurrentFix` below. See the audit report
 * for full detail and the specific behavior-preservation notes per file.
 */

import { calculateDistanceMeters } from '@/lib/distance';
import { normalizeHeading, shortestRotation } from '@/lib/mapAnimation';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { GPSFix, GPSFixQuality, GPSProfile, GPSSignalStatus } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Which OS-level location API is active. Only one of these runs at a time — see "One global watcher" above. */
export type GPSTrackingMode = 'foreground' | 'background';

/**
 * Lifecycle of the subscription itself — distinct from `GPSSignalStatus`
 * (which describes whether *fixes* are currently flowing/good). You can be
 * `tracking` (a subscription is live) while the signal status is `lost`
 * (indoors, no fixes arriving), and you can be `paused` with a perfectly
 * good last-known signal.
 */
export type GPSTrackingState = 'stopped' | 'starting' | 'tracking' | 'paused' | 'error';

export interface GPSPermissionStatus {
  servicesEnabled: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  /** Whether the OS will still show a permission prompt on the next request (false once the user has permanently denied it). */
  canAskAgain: boolean;
}

export type GPSFixListener = (fix: GPSFix) => void;
export type GPSStatusListener = (status: GPSSignalStatus) => void;

export type GPSManagerErrorCode =
  | 'SERVICES_DISABLED'
  | 'PERMISSION_DENIED'
  | 'START_FAILED'
  | 'NOT_TRACKING';

export class GPSManagerError extends Error {
  readonly code: GPSManagerErrorCode;

  constructor(message: string, code: GPSManagerErrorCode) {
    super(message);
    this.name = 'GPSManagerError';
    this.code = code;
  }
}

/** Best-effort guess at which underlying provider is serving fixes. Android-only (`Location.getProviderStatusAsync`); always `'unknown'` elsewhere. */
export type GPSProviderGuess = 'gps' | 'network' | 'passive' | 'unknown';

// ---------------------------------------------------------------------------
// Event bus (Task 5 — GPSManager publishes events instead of depending on
// Zustand/NavigationStore directly)
// ---------------------------------------------------------------------------

export interface GPSManagerEventPayloadMap {
  LOCATION_UPDATED: { fix: GPSFix };
  HEADING_UPDATED: { heading: number };
  SPEED_UPDATED: { speed: number };
  STATUS_CHANGED: { previous: GPSSignalStatus; next: GPSSignalStatus };
  TRACKING_STARTED: { mode: GPSTrackingMode; profile: GPSProfile };
  TRACKING_STOPPED: { reason: 'stopped' | 'paused' };
  BACKGROUND_STARTED: Record<string, never>;
  BACKGROUND_STOPPED: Record<string, never>;
  PERMISSION_CHANGED: GPSPermissionStatus;
}

export type GPSManagerEventType = keyof GPSManagerEventPayloadMap;

export type GPSManagerEvent<T extends GPSManagerEventType = GPSManagerEventType> = {
  type: T;
  payload: GPSManagerEventPayloadMap[T];
  timestamp: number;
};

type AnyGPSHandler = (event: GPSManagerEvent<GPSManagerEventType>) => void;

const gpsHandlersByType = new Map<GPSManagerEventType, Set<AnyGPSHandler>>();

function emit<T extends GPSManagerEventType>(type: T, payload: GPSManagerEventPayloadMap[T]): void {
  const event: GPSManagerEvent<T> = { type, payload, timestamp: Date.now() };
  const handlers = gpsHandlersByType.get(type);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    handler(event as GPSManagerEvent<GPSManagerEventType>);
  }
}

/** Subscribe to a GPSManager event. Returns an unsubscribe function. This is the primary integration surface `NavigationProvider` will use later. */
export function on<T extends GPSManagerEventType>(
  type: T,
  handler: (event: GPSManagerEvent<T>) => void
): () => void {
  let handlers = gpsHandlersByType.get(type);
  if (!handlers) {
    handlers = new Set();
    gpsHandlersByType.set(type, handlers);
  }
  const anyHandler = handler as unknown as AnyGPSHandler;
  handlers.add(anyHandler);
  return () => {
    gpsHandlersByType.get(type)?.delete(anyHandler);
  };
}

/** Sugar over `on('LOCATION_UPDATED', ...)` for callers that just want the fix, not the wrapped event. */
export function onFix(listener: GPSFixListener): () => void {
  return on('LOCATION_UPDATED', (event) => listener(event.payload.fix));
}

/** Sugar over `on('STATUS_CHANGED', ...)` for callers that just want the new status. */
export function onStatusChange(listener: GPSStatusListener): () => void {
  return on('STATUS_CHANGED', (event) => listener(event.payload.next));
}

// ---------------------------------------------------------------------------
// Accuracy profiles
// ---------------------------------------------------------------------------

interface ProfileOptions {
  accuracy: Location.LocationAccuracy;
  timeIntervalMs: number;
  distanceIntervalMeters: number;
  /** A fix whose reported accuracy (meters) is worse than this is rejected — see "Location quality scoring". */
  maxAcceptableAccuracyMeters: number;
}

/**
 * Named accuracy/power tradeoffs (matches `GPSProfile` in types.ts). Tuned
 * per intended use: a Transporter actively navigating needs frequent,
 * high-accuracy fixes; a Customer watching a driver marker on a map needs
 * far less; a background-tracked trip should conserve battery.
 *
 * `driverBestNavigation`'s `distanceIntervalMeters` is `1`, matching the
 * real value used by the 3 driver-navigation screens this profile now
 * serves (`app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`,
 * `app/(tabs)/navigate.tsx`) — tightened from an earlier `3` specifically so
 * migrating them changed nothing about update cadence.
 */
const PROFILE_OPTIONS: Record<GPSProfile, ProfileOptions> = {
  driverBestNavigation: {
    accuracy: Location.Accuracy.BestForNavigation,
    timeIntervalMs: 1000,
    distanceIntervalMeters: 1,
    maxAcceptableAccuracyMeters: 30,
  },
  passengerBalanced: {
    accuracy: Location.Accuracy.Balanced,
    timeIntervalMs: 4000,
    distanceIntervalMeters: 10,
    maxAcceptableAccuracyMeters: 50,
  },
  planning: {
    accuracy: Location.Accuracy.Balanced,
    timeIntervalMs: 10000,
    distanceIntervalMeters: 25,
    maxAcceptableAccuracyMeters: 75,
  },
  backgroundLowPower: {
    accuracy: Location.Accuracy.Low,
    timeIntervalMs: 15000,
    distanceIntervalMeters: 50,
    maxAcceptableAccuracyMeters: 150,
  },
};

// ---------------------------------------------------------------------------
// Battery optimization: scenario -> profile (Task 6)
// ---------------------------------------------------------------------------

/**
 * A tracking *scenario*, deliberately worded independently of
 * `NavigationMode` (NavigationModes.ts) — GPSManager stays decoupled from
 * the trip-lifecycle state machine. The future `NavigationProvider` is
 * responsible for translating e.g. `NavigationMode.DRIVER_TO_PICKUP` into
 * the `'driverNavigation'` scenario and calling `applyScenario` — not the
 * other way around.
 */
export type GPSTrackingScenario = 'planning' | 'driverNavigation' | 'tripCompleted' | 'offline';

/** `null` means "pause tracking entirely" rather than any profile. */
const SCENARIO_PROFILES: Record<GPSTrackingScenario, GPSProfile | null> = {
  planning: 'planning',
  driverNavigation: 'driverBestNavigation',
  tripCompleted: 'passengerBalanced',
  offline: null,
};

/** Pure lookup — does not change any state. */
export function profileForScenario(scenario: GPSTrackingScenario): GPSProfile | null {
  return SCENARIO_PROFILES[scenario];
}

/**
 * Applies the profile a scenario implies, reusing `setProfile`/`start`/
 * `pause` — no accuracy/interval numbers are duplicated here, only
 * orchestration. No-ops if nothing is tracking yet and the scenario isn't
 * `offline` (there's no mode to switch within; a caller must `start()`
 * explicitly at least once first).
 */
export async function applyScenario(scenario: GPSTrackingScenario): Promise<void> {
  const profile = profileForScenario(scenario);
  if (profile === null) {
    await pause();
    return;
  }
  if (!activeMode) {
    return;
  }
  if (isPaused) {
    await start(activeMode, profile);
    return;
  }
  await setProfile(profile);
}

// ---------------------------------------------------------------------------
// Bearing smoothing / filtering constants
// ---------------------------------------------------------------------------

/** 0-1: how much of the gap to the newest heading to close per fix. Lower = smoother, higher = snappier. */
const BEARING_SMOOTHING_FACTOR = 0.35;
/** Below this speed, GPS-reported heading is mostly noise (device isn't reliably moving in a direction) — keep the last smoothed heading instead of chasing it. */
const MIN_SPEED_FOR_HEADING_MPS = 0.5;
/** Rejects fixes implying a physically implausible jump (GPS glitch/teleport), ~198 km/h, generous for any 2Go vehicle type. */
const MAX_PLAUSIBLE_SPEED_MPS = 55;
/** How many recent accepted fixes' accuracy values `averageAccuracyMeters` (diagnostics) averages over. */
const ACCURACY_WINDOW_SIZE = 20;

const BACKGROUND_LOCATION_TASK = '2go-navigation-engine-background-location';

// ---------------------------------------------------------------------------
// Module-level state (the "one global watcher")
// ---------------------------------------------------------------------------

let foregroundSubscription: Location.LocationSubscription | null = null;
let activeMode: GPSTrackingMode | null = null;
let activeProfile: GPSProfile | null = null;
let currentStatus: GPSSignalStatus = 'disabled';
let trackingState: GPSTrackingState = 'stopped';
let isPaused = false;
let lastFix: GPSFix | null = null;
/** Raw (unsmoothed) heading from the most recent accepted fix — diagnostics exposes this as `bearing`, alongside the smoothed `heading`, so the two can be compared. */
let lastRawHeading: number | null = null;

/** Unwrapped (non-mod-360) running heading estimate, so `shortestRotation` can keep smoothing continuous across the 0°/360° boundary — reset on `stop()`/`restart()`, preserved across `pause()`/`resume()`. */
let smoothedHeading: number | null = null;
/** Previous fix's coordinate/timestamp, used to derive speed and to catch implausible jumps when the OS doesn't report speed itself. */
let previousFixForDerivation: { latitude: number; longitude: number; timestamp: number } | null = null;
/** The last accepted fix's resolved speed — used only to judge whether the NEXT fix's implied speed looks like a noisy jump (see "Location quality scoring"). */
let previousResolvedSpeed: number | null = null;

/** How many consumers currently want tracking active — see `acquire`/`release`. */
let consumerCount = 0;

/** Best-effort device-capability guess, refreshed once per `start()`, not per-fix — see `GPSProviderGuess`. */
let lastProviderGuess: GPSProviderGuess = 'unknown';
let lastKnownPermissionStatus: GPSPermissionStatus | null = null;

let acceptedFixCount = 0;
let rejectedFixCount = 0;
let accuracySamples: number[] = [];
let lastUpdateDurationMs: number | null = null;

/** Serializes start/stop/pause/resume/restart/setProfile so overlapping calls (e.g. a rapid re-render or React StrictMode's double-invoke) can never leave two subscriptions alive at once. */
let operationQueue: Promise<void> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// ---------------------------------------------------------------------------
// Background task definition
// ---------------------------------------------------------------------------

// Must run at module load time (top-level), not inside a function — this is
// an expo-task-manager requirement so the task is registered before the OS
// can invoke it, including after the JS engine restarts in the background.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    setStatus('lost');
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations?.[locations.length - 1];
  if (latest) {
    handleRawLocation(latest);
  }
});

// ---------------------------------------------------------------------------
// Location quality scoring (Task 4)
//
// Every accepted fix gets one of EXCELLENT / GOOD / FAIR / POOR. Two hard
// gates reject a fix outright (quality REJECTED, fix dropped, never handed
// to any listener) before the tiered scoring below even runs:
//
//   1. Accuracy worse than the active profile's `maxAcceptableAccuracyMeters`.
//   2. An implied speed from the previous fix exceeding
//      `MAX_PLAUSIBLE_SPEED_MPS` (a physically-impossible jump/teleport).
//
// For everything that clears those two gates, a penalty score accumulates
// from five independent factors, each contributing 0 (perfect) up to its own
// max. The final quality tier is read off the total:
//
//   penalty <= 10  -> EXCELLENT
//   penalty <= 30  -> GOOD
//   penalty <= 55  -> FAIR
//   penalty >  55  -> POOR
//
// Factors (each evaluated independently, then summed):
//  - Accuracy (0/10/25/45): tiered on the reported accuracy radius, meters.
//  - Age (0/8/20/35): how long ago the OS captured this fix vs. now — a
//    large gap usually means a batched/deferred delivery, less useful for
//    live navigation.
//  - Provider (0/15/20/10): Android-only best-effort guess at whether GPS,
//    network, or passive positioning served the fix (GPS trusted most);
//    neutral (10) everywhere the OS doesn't expose this.
//  - Distance jump vs. recent speed (0/10/20): if the implied speed from the
//    previous fix is far above the previous fix's own resolved speed, the
//    jump is suspicious even though it didn't cross the hard-reject ceiling.
//  - Heading stability (0/8/15/25): how far the raw incoming heading is from
//    the already-smoothed heading, evaluated only while moving fast enough
//    for heading to be meaningful at all.
// ---------------------------------------------------------------------------

interface QualityScoreInput {
  accuracyMeters: number | null;
  ageMs: number;
  providerGuess: GPSProviderGuess;
  maxAcceptableAccuracyMeters: number;
  /** Speed implied by distance/time from the previous fix, or null with no previous fix to compare against. */
  impliedSpeedMps: number | null;
  /** The previous accepted fix's resolved speed, or null if there wasn't one. */
  previousSpeedMps: number | null;
  /** Shortest-arc degrees between the raw incoming heading and the current smoothed heading, or null if not evaluated (not moving, or no smoothed heading yet). */
  headingDeltaDegrees: number | null;
}

interface QualityScoreResult {
  quality: GPSFixQuality;
  penalty: number;
  rejected: boolean;
}

function scoreFixQuality(input: QualityScoreInput): QualityScoreResult {
  if (input.accuracyMeters != null && input.accuracyMeters > input.maxAcceptableAccuracyMeters) {
    return { quality: 'REJECTED', penalty: Infinity, rejected: true };
  }
  if (input.impliedSpeedMps != null && input.impliedSpeedMps > MAX_PLAUSIBLE_SPEED_MPS) {
    return { quality: 'REJECTED', penalty: Infinity, rejected: true };
  }

  let penalty = 0;

  const accuracy = input.accuracyMeters;
  if (accuracy == null) penalty += 15;
  else if (accuracy <= 10) penalty += 0;
  else if (accuracy <= 20) penalty += 10;
  else if (accuracy <= 50) penalty += 25;
  else penalty += 45;

  if (input.ageMs <= 2000) penalty += 0;
  else if (input.ageMs <= 5000) penalty += 8;
  else if (input.ageMs <= 10000) penalty += 20;
  else penalty += 35;

  if (input.providerGuess === 'gps') penalty += 0;
  else if (input.providerGuess === 'network') penalty += 15;
  else if (input.providerGuess === 'passive') penalty += 20;
  else penalty += 10;

  if (input.impliedSpeedMps != null && input.previousSpeedMps != null && input.previousSpeedMps > 0.5) {
    const ratio = input.impliedSpeedMps / input.previousSpeedMps;
    if (ratio <= 1.5) penalty += 0;
    else if (ratio <= 3) penalty += 10;
    else penalty += 20;
  }

  if (input.headingDeltaDegrees != null) {
    const delta = Math.abs(input.headingDeltaDegrees);
    if (delta <= 20) penalty += 0;
    else if (delta <= 60) penalty += 8;
    else if (delta <= 90) penalty += 15;
    else penalty += 25;
  }

  let quality: GPSFixQuality;
  if (penalty <= 10) quality = 'EXCELLENT';
  else if (penalty <= 30) quality = 'GOOD';
  else if (penalty <= 55) quality = 'FAIR';
  else quality = 'POOR';

  return { quality, penalty, rejected: false };
}

function recordAccuracySample(accuracy: number | null): void {
  if (accuracy == null) return;
  accuracySamples.push(accuracy);
  if (accuracySamples.length > ACCURACY_WINDOW_SIZE) {
    accuracySamples.shift();
  }
}

function getAverageAccuracy(): number | null {
  if (accuracySamples.length === 0) return null;
  const sum = accuracySamples.reduce((total, value) => total + value, 0);
  return sum / accuracySamples.length;
}

// ---------------------------------------------------------------------------
// Fix processing: quality scoring, speed derivation, bearing smoothing
// ---------------------------------------------------------------------------

function processRawFix(location: Location.LocationObject): GPSFix | null {
  const { latitude, longitude, accuracy, heading, speed } = location.coords;
  const { timestamp } = location;
  const profile = activeProfile ? PROFILE_OPTIONS[activeProfile] : PROFILE_OPTIONS.passengerBalanced;
  const ageMs = Math.max(0, Date.now() - timestamp);

  let impliedSpeedMps: number | null = null;
  if (previousFixForDerivation) {
    const elapsedSeconds = (timestamp - previousFixForDerivation.timestamp) / 1000;
    if (elapsedSeconds > 0) {
      const jumpMeters = calculateDistanceMeters(
        previousFixForDerivation.latitude,
        previousFixForDerivation.longitude,
        latitude,
        longitude
      );
      impliedSpeedMps = jumpMeters / elapsedSeconds;
    }
  }

  const resolvedSpeed = speed != null && speed >= 0 ? speed : impliedSpeedMps ?? undefined;

  let headingDeltaDegrees: number | null = null;
  if (
    heading != null &&
    heading >= 0 &&
    smoothedHeading !== null &&
    resolvedSpeed !== undefined &&
    resolvedSpeed >= MIN_SPEED_FOR_HEADING_MPS
  ) {
    headingDeltaDegrees = shortestRotation(smoothedHeading, heading) - smoothedHeading;
  }

  const scoreResult = scoreFixQuality({
    accuracyMeters: accuracy,
    ageMs,
    providerGuess: lastProviderGuess,
    maxAcceptableAccuracyMeters: profile.maxAcceptableAccuracyMeters,
    impliedSpeedMps,
    previousSpeedMps: previousResolvedSpeed,
    headingDeltaDegrees,
  });

  if (scoreResult.rejected) {
    rejectedFixCount += 1;
    return null;
  }
  acceptedFixCount += 1;
  recordAccuracySample(accuracy ?? null);

  // Bearing smoothing: only trust heading while actually moving (see
  // MIN_SPEED_FOR_HEADING_MPS); exponentially smooth via the shortest arc so
  // it neither jitters nor snaps through the 0°/360° wrap.
  if (heading != null && heading >= 0 && resolvedSpeed !== undefined && resolvedSpeed >= MIN_SPEED_FOR_HEADING_MPS) {
    lastRawHeading = normalizeHeading(heading);
    if (smoothedHeading === null) {
      smoothedHeading = normalizeHeading(heading);
    } else {
      const target = shortestRotation(smoothedHeading, heading);
      smoothedHeading += (target - smoothedHeading) * BEARING_SMOOTHING_FACTOR;
    }
  }

  previousFixForDerivation = { latitude, longitude, timestamp };
  previousResolvedSpeed = resolvedSpeed ?? previousResolvedSpeed;

  return {
    coordinate: { latitude, longitude },
    heading: smoothedHeading !== null ? normalizeHeading(smoothedHeading) : undefined,
    speed: resolvedSpeed,
    accuracy: accuracy ?? undefined,
    timestamp,
    quality: scoreResult.quality,
  };
}

/** A lighter-weight path for one-shot reads (`getCurrentFix`) — reuses `scoreFixQuality` (no duplicated scoring) but deliberately does NOT touch the continuous watcher's smoothing/previous-fix state, so a one-off "recenter" read can never perturb the live bearing-smoothing stream. */
function scoreOneShotFix(location: Location.LocationObject, profile: ProfileOptions): GPSFix | null {
  const { latitude, longitude, accuracy, heading, speed } = location.coords;
  const ageMs = Math.max(0, Date.now() - location.timestamp);

  const scoreResult = scoreFixQuality({
    accuracyMeters: accuracy,
    ageMs,
    providerGuess: lastProviderGuess,
    maxAcceptableAccuracyMeters: profile.maxAcceptableAccuracyMeters,
    impliedSpeedMps: null,
    previousSpeedMps: null,
    headingDeltaDegrees: null,
  });

  if (scoreResult.rejected) {
    rejectedFixCount += 1;
    return null;
  }
  acceptedFixCount += 1;
  recordAccuracySample(accuracy ?? null);

  return {
    coordinate: { latitude, longitude },
    heading: heading != null && heading >= 0 ? normalizeHeading(heading) : undefined,
    speed: speed != null && speed >= 0 ? speed : undefined,
    accuracy: accuracy ?? undefined,
    timestamp: location.timestamp,
    quality: scoreResult.quality,
  };
}

function handleRawLocation(location: Location.LocationObject): void {
  const startedAt = Date.now();
  const fix = processRawFix(location);
  lastUpdateDurationMs = Date.now() - startedAt;

  if (!fix) return; // filtered out — bad accuracy, implausible glitch, or otherwise scored REJECTED

  const previousHeading = lastFix?.heading;
  const previousSpeed = lastFix?.speed;
  lastFix = fix;
  setStatus('active');

  emit('LOCATION_UPDATED', { fix });
  if (fix.heading !== undefined && fix.heading !== previousHeading) {
    emit('HEADING_UPDATED', { heading: fix.heading });
  }
  if (fix.speed !== undefined && fix.speed !== previousSpeed) {
    emit('SPEED_UPDATED', { speed: fix.speed });
  }
}

function setStatus(status: GPSSignalStatus): void {
  if (currentStatus === status) return;
  const previous = currentStatus;
  currentStatus = status;
  emit('STATUS_CHANGED', { previous, next: status });
}

async function refreshProviderGuess(): Promise<void> {
  try {
    const status = await Location.getProviderStatusAsync();
    lastProviderGuess = status.gpsAvailable
      ? 'gps'
      : status.networkAvailable
        ? 'network'
        : status.passiveAvailable
          ? 'passive'
          : 'unknown';
  } catch {
    lastProviderGuess = 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

function permissionStatusEquals(a: GPSPermissionStatus, b: GPSPermissionStatus): boolean {
  return (
    a.servicesEnabled === b.servicesEnabled &&
    a.foregroundGranted === b.foregroundGranted &&
    a.backgroundGranted === b.backgroundGranted &&
    a.canAskAgain === b.canAskAgain
  );
}

function updatePermissionStatus(next: GPSPermissionStatus): void {
  const changed = !lastKnownPermissionStatus || !permissionStatusEquals(lastKnownPermissionStatus, next);
  lastKnownPermissionStatus = next;
  if (changed) {
    emit('PERMISSION_CHANGED', next);
  }
}

/** Read-only snapshot of current permission/service state — does not prompt the user. */
export async function checkPermissions(): Promise<GPSPermissionStatus> {
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  const result: GPSPermissionStatus = {
    servicesEnabled,
    foregroundGranted: foreground.status === Location.PermissionStatus.GRANTED,
    backgroundGranted: background.status === Location.PermissionStatus.GRANTED,
    canAskAgain: foreground.canAskAgain,
  };
  updatePermissionStatus(result);
  return result;
}

/**
 * Prompts for whatever permission `mode` requires (foreground always;
 * foreground + background when `mode === 'background'`, since the OS
 * requires foreground to already be granted before background can be
 * requested). Throws `GPSManagerError` on denial so callers don't have to
 * re-check a boolean before every `start()`.
 */
export async function requestPermissions(mode: GPSTrackingMode): Promise<GPSPermissionStatus> {
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!servicesEnabled) {
    throw new GPSManagerError('Location services are disabled at the OS level.', 'SERVICES_DISABLED');
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    const result: GPSPermissionStatus = {
      servicesEnabled,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskAgain: foreground.canAskAgain,
    };
    updatePermissionStatus(result);
    throw new GPSManagerError('Foreground location permission was denied.', 'PERMISSION_DENIED');
  }

  let backgroundGranted = false;
  if (mode === 'background') {
    const background = await Location.requestBackgroundPermissionsAsync();
    backgroundGranted = background.status === Location.PermissionStatus.GRANTED;
    if (!backgroundGranted) {
      const result: GPSPermissionStatus = {
        servicesEnabled,
        foregroundGranted: true,
        backgroundGranted: false,
        canAskAgain: foreground.canAskAgain,
      };
      updatePermissionStatus(result);
      throw new GPSManagerError('Background location permission was denied.', 'PERMISSION_DENIED');
    }
  }

  const result: GPSPermissionStatus = {
    servicesEnabled,
    foregroundGranted: true,
    backgroundGranted,
    canAskAgain: foreground.canAskAgain,
  };
  updatePermissionStatus(result);
  return result;
}

// ---------------------------------------------------------------------------
// Start / stop / pause / resume / restart / profile switching (Task 2)
// ---------------------------------------------------------------------------

function resetSmoothingState(): void {
  previousFixForDerivation = null;
  previousResolvedSpeed = null;
  smoothedHeading = null;
  lastRawHeading = null;
}

function resetDiagnosticCounters(): void {
  acceptedFixCount = 0;
  rejectedFixCount = 0;
  accuracySamples = [];
  lastUpdateDurationMs = null;
}

async function teardownSubscription(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  const backgroundTaskRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
    () => false
  );
  if (backgroundTaskRunning) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
  }
}

/**
 * Starts the single GPS watcher in `mode` using `profile`'s accuracy/interval
 * settings. If a watcher is already running (any mode/profile), it is
 * stopped first — there is never more than one live subscription. Requests
 * whatever permissions `mode` requires before starting; throws
 * `GPSManagerError` if they're denied or the platform call fails.
 *
 * A no-op (avoids an unnecessary stop/start cycle — Task 2) if tracking is
 * already active with the exact same `mode`+`profile`, unless `force` is set
 * (used internally by `restart()`).
 */
export function start(mode: GPSTrackingMode, profile: GPSProfile): Promise<void> {
  return enqueue(() => performStart(mode, profile, false));
}

async function performStart(mode: GPSTrackingMode, profile: GPSProfile, force: boolean): Promise<void> {
  if (!force && trackingState === 'tracking' && !isPaused && activeMode === mode && activeProfile === profile) {
    return;
  }

  await requestPermissions(mode);
  await teardownSubscription();
  await refreshProviderGuess();

  trackingState = 'starting';
  setStatus('acquiring');
  const options = PROFILE_OPTIONS[profile];

  try {
    if (mode === 'foreground') {
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy,
          timeInterval: options.timeIntervalMs,
          distanceInterval: options.distanceIntervalMeters,
        },
        handleRawLocation
      );
    } else {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: options.accuracy,
        timeInterval: options.timeIntervalMs,
        distanceInterval: options.distanceIntervalMeters,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: '2Go is tracking your trip',
          notificationBody: 'Your location is being used for active navigation.',
          notificationColor: '#26344F',
        },
      });
    }
  } catch (error) {
    activeMode = null;
    activeProfile = null;
    trackingState = 'error';
    setStatus('lost');
    const message = error instanceof Error ? error.message : String(error);
    throw new GPSManagerError(`Failed to start ${mode} location tracking: ${message}`, 'START_FAILED');
  }

  activeMode = mode;
  activeProfile = profile;
  isPaused = false;
  trackingState = 'tracking';
  emit('TRACKING_STARTED', { mode, profile });
  if (mode === 'background') {
    emit('BACKGROUND_STARTED', {});
  }
}

/** Tears down whichever subscription (foreground or background) is currently active and forgets the active mode/profile. Safe to call when nothing is running. For a transient interruption, prefer `pause()` (which remembers mode/profile so `resume()` can restore them). */
export function stop(): Promise<void> {
  return enqueue(performStop);
}

async function performStop(): Promise<void> {
  const wasBackground = activeMode === 'background' && trackingState === 'tracking';
  await teardownSubscription();

  activeMode = null;
  activeProfile = null;
  isPaused = false;
  consumerCount = 0;
  trackingState = 'stopped';
  resetSmoothingState();
  resetDiagnosticCounters();
  setStatus('disabled');

  if (wasBackground) {
    emit('BACKGROUND_STOPPED', {});
  }
  emit('TRACKING_STOPPED', { reason: 'stopped' });
}

/**
 * Tears down the OS subscription but remembers the active mode/profile —
 * `resume()` restarts with exactly those, without the caller needing to
 * pass them again. Unlike `stop()`, does NOT reset bearing-smoothing state
 * or diagnostic counters, since a pause is meant to be a transient
 * interruption (e.g. the app briefly backgrounded), not the end of a
 * tracking session.
 */
export function pause(): Promise<void> {
  return enqueue(performPause);
}

async function performPause(): Promise<void> {
  if (!activeMode || trackingState !== 'tracking') return;
  const wasBackground = activeMode === 'background';
  await teardownSubscription();
  isPaused = true;
  trackingState = 'paused';
  setStatus('disabled');
  if (wasBackground) {
    emit('BACKGROUND_STOPPED', {});
  }
  emit('TRACKING_STOPPED', { reason: 'paused' });
}

/** Resumes a paused session with its remembered mode/profile. No-ops if not currently paused. */
export function resume(): Promise<void> {
  return enqueue(performResume);
}

async function performResume(): Promise<void> {
  if (!isPaused || !activeMode || !activeProfile) return;
  await performStart(activeMode, activeProfile, false);
}

/**
 * Forces a fresh restart of the current mode/profile even though nothing
 * about the configuration changed — for recovering from a degraded state
 * (e.g. a run of POOR-quality fixes) rather than a normal profile switch.
 * Resets bearing-smoothing state (a real fresh start) but deliberately
 * keeps the cumulative accepted/rejected diagnostic counters, since restart
 * is often triggered by — and should remain visible in — exactly those
 * counters. Throws if nothing is currently tracking.
 */
export function restart(): Promise<void> {
  return enqueue(performRestart);
}

async function performRestart(): Promise<void> {
  if (!activeMode || !activeProfile) {
    throw new GPSManagerError('Cannot restart: no active tracking session to restart.', 'NOT_TRACKING');
  }
  resetSmoothingState();
  await performStart(activeMode, activeProfile, true);
}

/**
 * Switches the active profile without changing tracking mode — e.g. a
 * Transporter's app moving from `driverBestNavigation` while actively
 * navigating to `passengerBalanced`-equivalent power saving once a trip
 * ends but the driver stays online. No-ops if `profile` is already active.
 * Throws if nothing is currently tracking (there's no mode to restart into).
 */
export function setProfile(profile: GPSProfile): Promise<void> {
  return enqueue(async () => {
    if (!activeMode) {
      throw new GPSManagerError('Cannot change profile: GPS tracking is not running.', 'NOT_TRACKING');
    }
    if (profile === activeProfile && !isPaused) return;
    await performStart(activeMode, profile, false);
  });
}

// ---------------------------------------------------------------------------
// Reference counting (Task 1 — for consumers that may be mounted
// concurrently, e.g. useCurrentLocation used both directly and via
// useSnappedLocation in the same screen)
// ---------------------------------------------------------------------------

/**
 * Registers interest in tracking being active with `mode`/`profile` and
 * starts it if it isn't already. Pair every `acquire()` with exactly one
 * `release()` (typically in a `useEffect` cleanup) — tracking only actually
 * stops once every consumer has released it.
 */
export async function acquire(mode: GPSTrackingMode, profile: GPSProfile): Promise<void> {
  consumerCount += 1;
  try {
    await start(mode, profile);
  } catch (error) {
    consumerCount = Math.max(0, consumerCount - 1);
    throw error;
  }
}

/** Releases one `acquire()`. Stops tracking once the count reaches zero. Safe to call more times than `acquire()` was — extra calls are no-ops. */
export function release(): void {
  if (consumerCount === 0) return;
  consumerCount -= 1;
  if (consumerCount === 0) {
    void stop();
  }
}

// ---------------------------------------------------------------------------
// One-shot reads
// ---------------------------------------------------------------------------

/**
 * A single fresh reading, for "recenter"/"use my location" style buttons
 * that don't want a standing subscription. Does not touch `mode`/`profile`/
 * the continuous watcher in any way — safe to call regardless of whether
 * `start()`/`acquire()` tracking is active elsewhere. Falls back to the last
 * known device fix if a fresh read fails (e.g. `Accuracy.High` unsatisfied).
 */
export async function getCurrentFix(profile: GPSProfile = 'passengerBalanced'): Promise<GPSFix | null> {
  await requestPermissions('foreground');
  const options = PROFILE_OPTIONS[profile];

  let raw: Location.LocationObject | null = null;
  try {
    raw = await Location.getCurrentPositionAsync({ accuracy: options.accuracy });
  } catch {
    raw = await Location.getLastKnownPositionAsync().catch(() => null);
  }
  if (!raw) return null;

  const fix = scoreOneShotFix(raw, options);
  if (fix) {
    emit('LOCATION_UPDATED', { fix });
  }
  return fix;
}

// ---------------------------------------------------------------------------
// Diagnostics (Task 3)
// ---------------------------------------------------------------------------

export interface GPSDiagnostics {
  mode: GPSTrackingMode | null;
  profile: GPSProfile | null;
  trackingState: GPSTrackingState;
  permissionState: GPSPermissionStatus | null;
  locationServicesEnabled: boolean | null;
  foregroundActive: boolean;
  backgroundActive: boolean;
  currentAccuracyMeters: number | null;
  averageAccuracyMeters: number | null;
  /** Smoothed heading — see `lastRawHeading`/`bearing` below for the unsmoothed value to compare against. */
  heading: number | null;
  /** Raw (unsmoothed) heading from the most recent accepted fix. */
  bearing: number | null;
  speedMetersPerSecond: number | null;
  lastFixTimestamp: number | null;
  fixAgeMs: number | null;
  lastUpdateDurationMs: number | null;
  rejectedFixCount: number;
  acceptedFixCount: number;
  gpsProvider: GPSProviderGuess | null;
}

/** Lightweight, synchronous, reusable — reads cached module state only, never touches the OS. Safe to call as often as a debug overlay wants (e.g. every render). */
export function getDiagnostics(): GPSDiagnostics {
  return {
    mode: activeMode,
    profile: activeProfile,
    trackingState,
    permissionState: lastKnownPermissionStatus,
    locationServicesEnabled: lastKnownPermissionStatus?.servicesEnabled ?? null,
    foregroundActive: trackingState === 'tracking' && activeMode === 'foreground',
    backgroundActive: trackingState === 'tracking' && activeMode === 'background',
    currentAccuracyMeters: lastFix?.accuracy ?? null,
    averageAccuracyMeters: getAverageAccuracy(),
    heading: lastFix?.heading ?? null,
    bearing: lastRawHeading,
    speedMetersPerSecond: lastFix?.speed ?? null,
    lastFixTimestamp: lastFix?.timestamp ?? null,
    fixAgeMs: lastFix ? Date.now() - lastFix.timestamp : null,
    lastUpdateDurationMs,
    rejectedFixCount,
    acceptedFixCount,
    gpsProvider: lastProviderGuess === 'unknown' ? null : lastProviderGuess,
  };
}

// ---------------------------------------------------------------------------
// Simple snapshots
// ---------------------------------------------------------------------------

export function getStatus(): GPSSignalStatus {
  return currentStatus;
}

export function getTrackingState(): GPSTrackingState {
  return trackingState;
}

export function getLastFix(): GPSFix | null {
  return lastFix;
}

export function isTracking(): boolean {
  return activeMode !== null && trackingState === 'tracking';
}

export function getActiveMode(): GPSTrackingMode | null {
  return activeMode;
}

export function getActiveProfile(): GPSProfile | null {
  return activeProfile;
}
