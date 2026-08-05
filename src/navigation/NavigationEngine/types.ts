/**
 * Core type definitions for the Navigation Engine.
 *
 * This is the single source of truth for navigation-related shapes. Every
 * other file in NavigationEngine/ imports from here instead of redeclaring
 * its own local types. See Architecture.md for how these types compose.
 *
 * NO business logic lives in this file — types and interfaces only.
 */

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Screen-space edge padding, in points, used for camera auto-fit. */
export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Rectangular geographic bounds used to compute an auto-fit viewport. */
export interface LatLngBounds {
  northEast: LatLng;
  southWest: LatLng;
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/**
 * Who the engine is navigating on behalf of. Deliberately distinct from the
 * legacy `UserRole` ('passenger' | 'driver') in src/types/index.ts — per
 * AGENTS.md naming rules, new code uses Customer/Transporter. The engine
 * does not read or write `UserRole`; a mapping lives at the integration
 * boundary (NavigationProvider), not here.
 */
export type NavigationActor = 'customer' | 'transporter';

// ---------------------------------------------------------------------------
// GPS
// ---------------------------------------------------------------------------

/**
 * Per-fix quality score GPSManager assigns to every accepted fix — see its
 * "Location quality scoring" section for the full documented algorithm.
 * `REJECTED` fixes never become a `GPSFix` (GPSManager drops them before
 * they reach a listener); it's included here because the fix-quality
 * concept is binary-plus-tiers (reject, or accept at one of four tiers),
 * and callers reasoning about `GPSFixQuality` should see the whole range.
 */
export type GPSFixQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'REJECTED';

/** A single raw position sample from the device's location provider. */
export interface GPSFix {
  coordinate: LatLng;
  /** Degrees, 0-360, 0 = true north. Undefined if the device can't report it. */
  heading?: number;
  /** Meters per second. */
  speed?: number;
  /** Horizontal accuracy in meters, as reported by the OS. */
  accuracy?: number;
  /** Unix ms timestamp of the fix. */
  timestamp: number;
  /** This fix's quality tier — see `GPSFixQuality` and GPSManager.ts's scoring algorithm. Always one of EXCELLENT/GOOD/FAIR/POOR here, since a REJECTED fix never reaches this type. */
  quality: GPSFixQuality;
}

/** Named GPS accuracy/power tradeoffs. See GPSManager in Architecture.md. */
export type GPSProfile = 'planning' | 'driverBestNavigation' | 'passengerBalanced' | 'backgroundLowPower';

/**
 * Lifecycle of the engine's single location watcher, as a value the store
 * can hold and screens can read — NOT a watcher itself. No file in this
 * pass starts, stops, or reads from `expo-location`; `NavigationProvider`
 * (a later pass) is the only place allowed to drive this value for real.
 */
export type GPSSignalStatus = 'disabled' | 'acquiring' | 'active' | 'lost';

/** The store's GPS-related state slice. Purely data — see GPSSignalStatus doc. */
export interface GPSState {
  status: GPSSignalStatus;
  /** The most recent fix the (future) watcher produced, or null before the first one / while disabled. */
  lastFix: GPSFix | null;
  /** Horizontal accuracy of `lastFix`, meters. Duplicated from `lastFix.accuracy` for convenient selector access. */
  accuracyMeters: number | null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface RouteStep {
  id: string;
  instruction: string;
  /** e.g. 'turn-left', 'turn-right', 'straight', 'merge', 'roundabout'. */
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
  startLocation: LatLng;
  endLocation: LatLng;
  /** Decoded polyline points covering just this step. */
  path: LatLng[];
}

export interface RouteData {
  id: string;
  /** Full decoded polyline for the entire route. */
  path: LatLng[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  /** Duration adjusted for live traffic, when the provider supplies it. */
  durationInTrafficSeconds?: number;
  origin: LatLng;
  destination: LatLng;
  /**
   * The provider's own human-readable distance/duration text (e.g. Google's
   * "5.2 km" / "15 mins"), when available. Screens migrating from a direct
   * `getDirections` call onto `RouteEngine.fetchRoute` use these to show the
   * exact same text they showed before — new engine-native UI
   * (`NavigationTurnBanner` etc.) formats the numeric fields itself
   * (`formatManeuverDistance`) and doesn't need these.
   */
  distanceText?: string;
  durationText?: string;
}

/** Progress of the active driver/vehicle along the current RouteData. */
export interface RouteProgress {
  distanceRemainingMeters: number;
  durationRemainingSeconds: number;
  /** Index into RouteData.steps for the step currently being driven. */
  activeStepIndex: number;
  /** 0-1 fraction of the total route completed. */
  fractionComplete: number;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * High-level camera intents a screen can request. This is the "Camera State
 * Manager" called out in the Bible's closing section — distinct from
 * NavigationMode (trip lifecycle) because a user can pinch/pan into
 * FREE_EXPLORE at any point without changing the underlying trip state.
 */
export type CameraState =
  | 'FOLLOW_DRIVER'
  | 'FREE_EXPLORE'
  | 'FIT_ROUTE'
  | 'RECENTER'
  | 'OVERVIEW';

/**
 * The "Recenter" affordance's lifecycle, per the Bible's closing note: a
 * pinch/pan drops the camera into FREE_EXPLORE and shows a floating
 * Recenter button; tapping it (or an inactivity timeout, in a later pass)
 * smoothly returns to FOLLOW_DRIVER.
 *
 *  - `idle`         — camera is under engine control; no button shown.
 *  - `available`     — the user panned/pinched away; button is shown.
 *  - `recentering`    — the user tapped Recenter; a (future) transition
 *                        back to FOLLOW_DRIVER is in flight.
 */
export type RecenterState = 'idle' | 'available' | 'recentering';

/** The concrete camera parameters the engine computes and applies per mode. */
export interface CameraPose {
  center: LatLng;
  /** Degrees, 0-360. 0 = north-up. */
  bearing: number;
  /** Degrees, 0 (flat) to ~60 (max tilt). */
  pitch: number;
  zoom: number;
  padding: EdgePadding;
}

/**
 * Static camera behaviour profile bound to a NavigationMode (see
 * NavigationModes.ts). Declarative — the engine reads these instead of
 * hardcoding animateCamera() calls per screen.
 */
export interface CameraProfile {
  /** Whether the map rotates to track heading, or stays north-up. */
  rotationEnabled: boolean;
  /** Fixed pitch for this mode, or 'dynamic' to derive from speed (see NavigationMath.ts). */
  pitch: number | 'dynamic';
  /** Fixed zoom for this mode, or 'dynamic' to derive from speed. */
  zoom: number | 'dynamic';
  /** 'north' = bearing always 0. 'heading' = bearing follows actor heading. */
  bearingSource: 'north' | 'heading';
  /** Where the tracked actor sits vertically on screen, 0 (top) - 1 (bottom). Ignored when autoFit is true. */
  followAnchorRatio: number;
  /** When true, the engine computes bounds from pickup/destination/driver instead of following a single point. */
  autoFit: boolean;
}

// ---------------------------------------------------------------------------
// Navigation state (see NavigationModes.ts for the NavigationMode union)
// ---------------------------------------------------------------------------

import type { NavigationMode } from './NavigationModes';

/**
 * The full shape of the global navigationStore (see NavigationStore.ts) —
 * "the store becomes the global source of truth" for every navigation-
 * related value in the app. No screen or other store owns any field below.
 *
 * Field names here are this engine's canonical vocabulary. Where the Bible's
 * "Navigation Store" section uses different words for the same concept, the
 * mapping is: `cameraState` = Bible's `cameraMode`; `mode` = Bible's
 * `navigationState`; `currentStep`/`currentInstruction` = Bible's
 * `activeStep`/`activeInstruction`. Kept as originally named in this engine
 * (established and already covered by tests) rather than renamed to match —
 * see NavigationModes.ts's own reconciliation note for the precedent.
 * `customerLocation`, `gpsState`, `followMode`, `recenterState`, and
 * `navigationEnabled` are additive: the Bible's store field list doesn't
 * mention them, but they don't conflict with it either.
 *
 * Grouped by concern; every field is trip- or session-scoped state only —
 * no GPS watcher, no camera animation, no route fetching happens because
 * this interface exists. Something else (a later pass) is responsible for
 * calling the setters that populate these values.
 */
export interface NavigationState {
  // --- Lifecycle -----------------------------------------------------------

  /** The trip-lifecycle state. See NavigationModes.ts for the full state machine. */
  mode: NavigationMode;
  /** Every mode the state machine has entered, in order, starting with the initial IDLE. Grows on every successful transition — see NavigationStore.ts. */
  modeHistory: NavigationMode[];
  /**
   * Master switch for whether the engine is actively guiding a navigation
   * session (turn-by-turn HUD, camera following, GPS consumption). Distinct
   * from `mode`: `mode` always reflects the trip's lifecycle stage even
   * while paused, whereas this flag can be turned off independently (e.g. a
   * debug/dev screen wants trip state without live navigation behaviour).
   */
  navigationEnabled: boolean;

  // --- Trip endpoints --------------------------------------------------------

  pickup: LatLng | null;
  destination: LatLng | null;

  // --- Live positions --------------------------------------------------------

  /** Who this device's own GPS is authoritative for — see NavigationActor doc. */
  actor: NavigationActor | null;
  /** The Transporter's current position — this device's own GPS if `actor === 'transporter'`, otherwise synced from the backend. */
  driverLocation: LatLng | null;
  /** The Customer's current position — this device's own GPS if `actor === 'customer'`, otherwise synced from the backend (may be unavailable). */
  customerLocation: LatLng | null;
  /** The Transporter's compass/GPS heading, degrees 0-360. Null until a fix with heading data arrives. */
  heading: number | null;
  /** The Transporter's current speed, meters/second. */
  speed: number | null;

  // --- GPS ---------------------------------------------------------------

  gpsState: GPSState;

  // --- Route ---------------------------------------------------------------

  /** The currently active route, or null before one has been calculated. */
  route: RouteData | null;
  /** Fine-grained progress along `route` (see RouteProgress). */
  progress: RouteProgress | null;
  /** The RouteStep currently being driven. */
  currentStep: RouteStep | null;
  /** The human-readable instruction text for `currentStep`, denormalized for direct HUD consumption (mirrors `currentStep.instruction` when set). */
  currentInstruction: string | null;
  /** Estimated time of arrival, seconds, for the remainder of `route`. */
  etaSeconds: number | null;
  /** Total distance of `route`, meters, start to finish. */
  distanceMeters: number | null;
  /** Remaining distance to the current destination, meters. */
  distanceRemainingMeters: number | null;

  // --- Camera --------------------------------------------------------------

  /** High-level camera intent — see CameraState doc. */
  cameraState: CameraState;
  /** The camera's current bearing, degrees 0-360, 0 = north-up. Distinct from `heading`: this is what the camera is doing, which may lag or differ from the Transporter's raw heading. */
  bearing: number | null;
  /** The camera's current zoom level. */
  zoom: number | null;
  /** The camera's current pitch/tilt, degrees. */
  pitch: number | null;
  /** Whether the camera is actively auto-following the Transporter (true when `cameraState === 'FOLLOW_DRIVER'`; false once the user pans/pinches into `FREE_EXPLORE`). */
  followMode: boolean;
  /** Lifecycle of the floating "Recenter" affordance — see RecenterState doc. */
  recenterState: RecenterState;
}

/**
 * The screen-facing action surface. Screens call these instead of touching
 * the map, GPS, or Directions API directly (see the Bible's "Screen
 * Responsibilities" section).
 *
 * Every method below except `transition` is a named, single-purpose wrapper
 * over exactly one edge of `NAVIGATION_MODE_TRANSITIONS` (NavigationModes.ts)
 * — see NavigationStore.ts for the implementation. All of them are validated:
 * calling one while the store isn't in the required source mode throws
 * `NavigationTransitionError` rather than silently corrupting state.
 *
 * `cancel`, `reset`, and `goOnline` all resolve to the same underlying edge
 * (`-> IDLE`) but are kept as distinct, intention-revealing methods so a
 * screen's call site reads as what actually happened product-wise (a
 * cancellation vs. a finished trip resetting vs. a driver coming back
 * online) — see NavigationModes.ts's `CANCELLABLE_MODES` for which of these
 * is legal from which mode.
 */
export interface NavigationActions {
  /** Generic, validated transition primitive. Prefer a named method below where one exists. */
  transition: (to: NavigationMode) => void;

  /** IDLE -> PREVIEW. Records the chosen pickup/destination and previews the route pre-booking. */
  preview: (pickup: LatLng, destination: LatLng) => void;
  /** PREVIEW -> MATCHING. Booking confirmed; broadcasting to Transporters. */
  requestMatch: () => void;
  /** MATCHING -> DRIVER_TO_PICKUP. A Transporter accepted and is en route to the Customer. Optionally records their starting position as `driverLocation`. */
  driverToPickup: (driverLocation?: LatLng) => void;
  /** DRIVER_TO_PICKUP -> ARRIVED_PICKUP. The Transporter has reached the pickup point. */
  arrivedAtPickup: () => void;
  /** ARRIVED_PICKUP -> TRIP_IN_PROGRESS. The Customer is onboard; trip begins. */
  startTrip: () => void;
  /** TRIP_IN_PROGRESS -> ARRIVED_DROPOFF. The Transporter has reached the destination. */
  arrivedAtDropoff: () => void;
  /** ARRIVED_DROPOFF -> TRIP_COMPLETED. The trip has been finalized. */
  completeTrip: () => void;
  /** {PREVIEW, MATCHING, DRIVER_TO_PICKUP, ARRIVED_PICKUP} -> IDLE. A cancellation before/while a trip is underway. */
  cancel: () => void;
  /** TRIP_COMPLETED -> IDLE. Return to idle after a finished trip's summary is dismissed. */
  reset: () => void;
  /** IDLE -> OFFLINE. A Transporter with no active request goes offline. */
  goOffline: () => void;
  /** OFFLINE -> IDLE. A Transporter comes back online. */
  goOnline: () => void;

  /**
   * Camera intents, independent of trip mode transitions. These only ever
   * set plain state (`cameraState`/`followMode`/`recenterState`) — no
   * animation, gesture handling, or math happens here; see NavigationMath.ts
   * / Architecture.md for what a later pass still owes these names.
   */
  followDriver: () => void;
  recenter: () => void;
  fitRoute: () => void;
  overview: () => void;
  /**
   * Records that the user panned/pinched away from the followed camera.
   * Intended to be called by the future gesture-handling code inside
   * NavigationMap/CameraController, not by screens directly — it exists on
   * this surface because the store, not that future component, is the
   * source of truth for `cameraState`/`followMode`/`recenterState`.
   */
  enterFreeExplore: () => void;

  /** Sets the master turn-by-turn/camera-follow switch independent of `mode` — see NavigationState.navigationEnabled doc. */
  setNavigationEnabled: (enabled: boolean) => void;
}

/**
 * Internal, non-screen-facing data setters — populated by `NavigationProvider`
 * (GPS) and the route-fetching screens (route), not exposed via
 * `hooks/useNavigation.ts`. Screens read the resulting data through
 * `NavigationHooks.ts` selectors, never by calling these directly (see that
 * file's own doc comment on why screens shouldn't reach into the engine's
 * internals).
 */
export interface NavigationDataActions {
  /** Forwards one `GPSManager` fix into the store: `driverLocation`, `heading`, `speed`, `gpsState.lastFix`/`accuracyMeters`, and marks `gpsState.status` as `'active'`. */
  setGpsFix: (fix: GPSFix) => void;
  /** Updates `gpsState.status` only — for `GPSManager` status changes that aren't a new fix (e.g. `'acquiring'`/`'lost'`/`'disabled'`). */
  setGpsStatus: (status: GPSSignalStatus) => void;
  /** Publishes a freshly-fetched route: `route`, and (when non-null) seeds `currentStep`/`currentInstruction` from its first step, `distanceMeters`, and `etaSeconds`. Passing `null` clears all four. */
  setRoute: (route: RouteData | null) => void;
  /** Publishes `RouteEngine.computeRouteProgress`'s output: `progress`, `distanceRemainingMeters`, `etaSeconds` (from `durationRemainingSeconds`), and — resolved from the current route's steps by `progress.activeStepIndex` — `currentStep`/`currentInstruction`. Called by `RouteProgressTracker` on GPS ticks, not by screens. */
  setRouteProgress: (progress: RouteProgress) => void;
  /**
   * Performance optimization (Phase 7F): applies exactly what `setGpsFix(fix)`
   * followed by `setRouteProgress(progress)` would, but as a single store
   * commit instead of two. `NavigationProvider` uses this on every GPS tick
   * where a route is already active, instead of calling both actions
   * separately — each separate `set()` call synchronously notifies every
   * store subscriber (`CameraController`'s the one that matters today), so
   * two calls per tick means twice the subscriber work for the same final
   * state. Result is identical either way; only the number of intermediate
   * store commits differs.
   */
  setGpsFixWithProgress: (fix: GPSFix, progress: RouteProgress) => void;
}
