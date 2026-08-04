# Navigation Engine — Architecture

This started as an **architecture-only** pass (folder structure, types,
mode/event vocabulary, a Zustand store skeleton, and the two public
integration points: `NavigationProvider`, `useNavigation`). A second pass
implemented the **navigation state machine for real**: every mode
transition is now validated against `NAVIGATION_MODE_TRANSITIONS`
(NavigationModes.ts) and illegal ones throw `NavigationTransitionError`. A
third pass made the store the **global source of truth** for every
navigation field the Bible specifies. A fourth pass implemented
**`GPSManager.ts`**: a real, working, native GPS abstraction (foreground +
background tracking, permissions, accuracy profiles, bearing smoothing,
speed derivation, subscription cleanup) — the only place in the app allowed
to create a location subscription, though at that point nothing else in the
app actually consumed it yet. A fifth pass — **Phase 3.5, "GPS layer
hardening"** — is what made that true in practice: a full repo audit (see
`audit_export/audit_03-08-26_11-58_gps-subscription-audit.md`) found 7
screens/hooks/components still calling `Location.watchPositionAsync`/
`getCurrentPositionAsync` directly, all 7 were migrated to consume
`GPSManager`, and `GPSManager` itself gained a `pause`/`resume`/`restart`
lifecycle, per-fix quality scoring, a typed event bus, `acquire`/`release`
reference counting, `getDiagnostics()`, and scenario-based profile
switching. See "GPS layer hardening (Phase 3.5)" below for the full detail.
`GPSManager` is still not wired to `NavigationStore` (see "Relationship to
existing stores" and the Rollout plan) — the 7 migrated consumers talk to
it directly and keep their own local component state, same as before their
migration. Camera animation, routing, and auto-fit are still not
implemented — those fields/actions remain inert stubs. Outside
`src/navigation/NavigationEngine/`, this history touches: `app.json` (added
`ios.infoPlist.UIBackgroundModes: ["location"]`, required for background
tracking to survive backgrounding on iOS), `package.json`/
`package-lock.json` (added the `expo-task-manager` dependency background
tracking requires), and — as of Phase 3.5 — the 7 audited GPS call sites
(`src/hooks/useCurrentLocation.ts`,
`src/features/passenger/components/MapPickerModal.native.tsx`,
`src/features/passenger/PassengerHome.tsx`,
`src/features/driver/DriverDashboard.tsx`, `app/(driver)/navigation.tsx`,
`app/(driver)/trip.tsx`, `app/(tabs)/navigate.tsx`) — each migrated to call
`GPSManager` instead of `expo-location` directly, with no change to their
UI or observable navigation behaviour (see the audit report's
"behavior-preserving migration notes" for the handful of deliberate,
flagged exceptions).

## Why this exists

`AGENTS.md` and `2GO Navigation Engine Bible.md` both mandate a single,
global Navigation Engine that owns every navigation behaviour (camera, GPS,
routing, turn-by-turn, auto-fit, arrival detection) so no screen implements
its own. Before Phase 3.5, the app had (at least) three independent,
hand-rolled navigation surfaces (`app/(driver)/navigation.tsx`,
`app/(tabs)/navigate.tsx` — explicitly a dev/testing tool per `AGENTS.md`'s
folder structure comment — and `app/(driver)/trip.tsx`), plus 4 more GPS
call sites the same repo audit turned up, each doing its own camera and/or
GPS work. GPS ownership for all 7 is now consolidated onto `GPSManager` (see
"GPS layer hardening (Phase 3.5)" below); **camera** ownership for these
same screens (`animateCamera`/`animateToRegion`/`fitToCoordinates` calls)
is not — that migration is still future `CameraController` work.

## SOLID breakdown, file by file

| File | Single responsibility | Depends on |
|---|---|---|
| `types.ts` | Shared type vocabulary. No logic. | `NavigationModes.ts` (for the `NavigationMode` type only) |
| `NavigationModes.ts` | The trip-lifecycle state machine: states, the legal-transition table, and its validation functions/error type. Self-contained — no other file decides what's legal. | none |
| `NavigationEvents.ts` | Vocabulary + a concrete pub/sub bus for the two state-machine events (`MODE_CHANGED`, `TRANSITION_REJECTED`). | `NavigationModes.ts` |
| `NavigationMath.ts` | Pure geometry/camera math functions. No store access, no React. | `types.ts`, `src/lib/distance.ts` |
| `GPSManager.ts` | The ONLY file allowed to create a location subscription — enforced by a full repo audit + migration of all 7 call sites found (Phase 3.5). Owns permissions, foreground/background tracking, `pause`/`resume`/`restart`, accuracy profiles + scenario-based switching, bearing smoothing, speed derivation, per-fix quality scoring, diagnostics, `acquire`/`release` reference counting, cleanup. Publishes a typed event bus (`on`), not the store — see its file header for why. | `types.ts` (for `GPSFix`/`GPSFixQuality`/`GPSProfile`/`GPSSignalStatus`), `src/lib/distance.ts`, `src/lib/mapAnimation.ts`, `expo-location`, `expo-task-manager` |
| `NavigationStore.ts` | The one global Zustand store and global source of truth: mode, route, driver/customer location, GPS status, ETA/distance, camera pose, follow/recenter. Routes every mode change through `NavigationModes.assertValidTransition`, emits on `navigationEventBus`. | `types.ts`, `NavigationModes.ts`, `NavigationEvents.ts`, `zustand` |
| `NavigationHooks.ts` | Fine-grained selector hooks for the engine's *own* future components (NavigationHUD, TurnBanner, ...). | `NavigationStore.ts`, `types.ts` |
| `providers/NavigationProvider.tsx` | Lifecycle owner for engine-wide singletons (the one GPS watcher, the event bus instance). Not navigation state. Not yet wired to `GPSManager`. | `NavigationEvents.ts` |
| `hooks/useNavigation.ts` | The only navigation import a screen needs — `NavigationActions` only, nothing else leaks through. | `NavigationStore.ts`, `types.ts` |

Each file has exactly one reason to change:
- A new camera behaviour → `NavigationMath.ts` (open) + `CameraProfile`
  table in this doc (open) — not the store's action bodies.
- A new trip state → `NavigationModes.ts` only.
- A new screen-facing capability → `types.ts` (`NavigationActions`) +
  `NavigationStore.ts` + `hooks/useNavigation.ts` — never a one-off method
  bolted onto a screen.
- A new engine-internal singleton (e.g. a reroute watcher) →
  `NavigationProvider.tsx` only.

This mirrors Open/Closed (behaviour tables extend without touching
consumers), Interface Segregation (`useNavigation` exposes actions;
`NavigationHooks` exposes state slices — screens only ever need the
former), and Dependency Inversion (screens depend on the `NavigationActions`
interface in `types.ts`, never on `NavigationStore`'s internals directly).

## Mode reconciliation: AGENTS.md vs the Bible — resolved in favor of AGENTS.md

The two source documents name/count the trip lifecycle differently. The
first architecture-only pass used the Bible's finer-grained split
(`SEARCHING_DRIVER`/`DRIVER_ACCEPTED` instead of `MATCHING`,
`NAVIGATE_TO_PICKUP`/`WAITING_AT_PICKUP`/`NEAR_DESTINATION`/`COMPLETED`
instead of `DRIVER_TO_PICKUP`/`ARRIVED_PICKUP`/`ARRIVED_DROPOFF`/
`TRIP_COMPLETED`), per AGENTS.md's own "Bible takes precedence on conflict"
rule.

The state-machine implementation pass was commissioned with an explicit,
named list of 9 states — AGENTS.md's list, verbatim. `NavigationModes.ts`
now implements exactly that list:

| Canonical `NavigationMode` | Bible's equivalent (not used) |
|---|---|
| `IDLE` | Idle |
| `PREVIEW` | Preview |
| `MATCHING` | Searching Driver |
| *(no separate state)* | Driver Accepted — collapsed into the `MATCHING -> DRIVER_TO_PICKUP` edge |
| `DRIVER_TO_PICKUP` | Navigate To Pickup |
| `ARRIVED_PICKUP` | Waiting At Pickup |
| `TRIP_IN_PROGRESS` | Trip In Progress |
| `ARRIVED_DROPOFF` | Near Destination |
| `TRIP_COMPLETED` | Completed |
| `OFFLINE` | *(not modeled in the Bible; additive)* |

If a future pass wants the Bible's extra granularity (e.g. a distinct
"driver accepted, camera easing toward them" moment before the Transporter
actually starts driving), extend `NAVIGATION_MODE_TRANSITIONS` with a new
state rather than forking this file.

## State machine implementation

`NavigationModes.ts` owns the full transition table
(`NAVIGATION_MODE_TRANSITIONS`) and two entry points into it:

- `isValidTransition(from, to)` — pure boolean check.
- `assertValidTransition(from, to)` — throws `NavigationTransitionError`
  (carrying `from`, `to`, and `legalNextModes`) if the move isn't in the
  table.

`NavigationStore.ts` never sets `mode` directly. Every action (`preview`,
`requestMatch`, `driverToPickup`, `arrivedAtPickup`, `startTrip`,
`arrivedAtDropoff`, `completeTrip`, `cancel`, `reset`, `goOffline`,
`goOnline`, plus the generic `transition`) funnels through one internal
`applyTransition` helper that:

1. Calls `assertValidTransition` — on failure, emits `TRANSITION_REJECTED`
   on `navigationEventBus` and re-throws, so an illegal call (e.g. calling
   `startTrip()` while `mode` is `IDLE`) throws synchronously out of the
   Zustand `set` call and never mutates state.
2. On success, emits `MODE_CHANGED` and returns the state patch: the new
   `mode`, an appended `modeHistory` entry, and — only when transitioning
   *into* `IDLE` — a reset of trip-scoped fields (`pickup`, `destination`,
   `driverLocation`, `customerLocation`, `heading`, `speed`, `route`,
   `currentStep`, `currentInstruction`, `progress`, `etaSeconds`,
   `distanceMeters`, `distanceRemainingMeters`, `bearing`, `zoom`, `pitch`)
   so a fresh `IDLE` never shows stale data from the previous trip.
   `cameraState`/`followMode`/`recenterState`/`gpsState`/`navigationEnabled`
   deliberately do NOT reset — they describe the engine/device's ongoing
   configuration, not a specific trip.

`cancel`, `reset`, and `goOnline` are intentionally three separate methods
that all resolve to the identical `-> IDLE` edge. They exist as distinct
names so a screen's call site documents *why* it's returning to idle
(a cancellation vs. a finished trip vs. a Transporter coming back online) —
see `CANCELLABLE_MODES` in NavigationModes.ts for exactly which modes
`cancel()` is legal from (calling it from `TRIP_IN_PROGRESS`, for instance,
throws — the business rule is that an in-progress trip can't be cancelled
through this flow).

`modeHistory` (on `NavigationState`) is an append-only log of every mode the
machine has entered, starting with the initial `IDLE`. It exists purely for
introspection/testing — nothing in the engine reads it to make decisions.

## The store as global source of truth: full field ownership

`NavigationStore.ts` now declares and initializes every field the Bible's
"Navigation Store" section lists, plus the additive fields this pass added
(Customer location, GPS status, follow/recenter, an enabled switch). Naming
maps onto the Bible as follows where this engine kept its own established
vocabulary instead of the Bible's exact words:

| This engine | Bible's name | Notes |
|---|---|---|
| `mode` | `navigationState` | trip lifecycle — NavigationModes.ts |
| `cameraState` | `cameraMode` | high-level camera intent, not a live pose |
| `currentStep` | `activeStep` | the RouteStep being driven right now |
| `currentInstruction` | `activeInstruction` | denormalized instruction text for the HUD |
| `route` | `route` | unchanged |
| `etaSeconds` | `ETA` | seconds, not a formatted string |
| `distanceMeters` | `distance` | total route distance |
| `distanceRemainingMeters` | `remaining` | |
| `speed`, `bearing`, `zoom`, `pitch` | same names | live camera/vehicle values, not per-mode profiles (compare `CameraProfile` in types.ts, which is the *declarative* table, not live state) |
| `driverLocation`, `pickup`, `destination` | same names | |

Additive, not in the Bible's list:

| Field | Type | Why it exists |
|---|---|---|
| `customerLocation` | `LatLng \| null` | The Bible's store only tracks one moving point (`driverLocation`). This engine also tracks the Customer's position — needed once a Customer-side device's own GPS feeds this store, or once the backend syncs it to the Transporter's device. |
| `gpsState` | `GPSState` | A typed home for GPS status (`disabled`/`acquiring`/`active`/`lost`) plus the last fix, so screens can show "searching for GPS…" without a real watcher existing yet. |
| `heading` | `number \| null` | The Transporter's raw compass/GPS heading — kept distinct from `bearing` (what the *camera* is doing), matching AGENTS.md's separate "Camera Bearing" and "Driver Heading" responsibilities. |
| `followMode` | `boolean` | Whether the camera is actively auto-following, kept as an explicit flag rather than making callers infer it from `cameraState === 'FOLLOW_DRIVER'`. |
| `recenterState` | `RecenterState` | Lifecycle of the floating Recenter button described in the Bible's closing "Camera State Manager" note (`idle` / `available` / `recentering`). |
| `navigationEnabled` | `boolean` | Master switch for whether the engine is actively guiding a session, independent of `mode` — see types.ts doc on the field. |

Every one of these fields is **data only**. `NavigationStore.ts` initializes
them and gives the four existing camera-intent actions (`followDriver`,
`recenter`, `fitRoute`, `overview`) plus the new `enterFreeExplore` the
ability to set `cameraState`/`followMode`/`recenterState` together — nothing
computes a real camera pose, reads GPS, or calculates a route. Populating
`route`, `driverLocation` (from real GPS), `gpsState`, or a live `bearing`/
`zoom`/`pitch` is later-phase work (see Rollout plan below).

## Camera profiles (from the Bible, per mode)

Declarative reference for what `NavigationMath.dynamicPitchForMode` /
`dynamicZoomForSpeed` and the future `CameraController` component must
produce. Not implemented yet — recorded here so the eventual implementation
has one place to check instead of re-reading the Bible. Mode names updated
to the canonical AGENTS.md list above; rows without a clean 1:1 Bible
equivalent are approximated from the nearest Bible mode.

| Mode | Rotation | Pitch | Zoom | Bearing | Auto-fit |
|---|---|---|---|---|---|
| `PREVIEW` | off | 0° | fit-derived | north | yes (pickup + destination + route) |
| `MATCHING` | off | 0° | fit-derived | north | yes (pickup + destination + nearby drivers) |
| `DRIVER_TO_PICKUP` | on, road rotates | 50° | 17.5 | actor heading | no — follow, actor at 65-70% down screen (camera eases in smoothly on entry rather than jumping) |
| `ARRIVED_PICKUP` | — | — | zoom in slightly | — | focus on passenger pin |
| `TRIP_IN_PROGRESS` | on, road rotates | dynamic (45-55°) | dynamic (see below) | actor heading (arrow fixed) | no — follow |
| `ARRIVED_DROPOFF` | slows | 35° | zoom out slightly | — | destination centered |
| `TRIP_COMPLETED` | off | 0° | zoom out | north | yes (vehicle + destination) |

Dynamic zoom by speed (`NavigationMath.dynamicZoomForSpeed`):

| Speed | Zoom |
|---|---|
| Walking | 18.5 |
| City driving | 17.5 |
| Highway | 16 |
| Very fast | 15 |

## Data flow (once fully wired)

```
GPSManager.start(mode, profile)                          <- IMPLEMENTED
  -> Location.watchPositionAsync / startLocationUpdatesAsync (the one watcher)
  -> accuracy filtering + glitch guard + bearing smoothing (GPSManager, pure)
  -> GPSManager.onFix(fix) fires                          <- IMPLEMENTED

------------------------------- not yet wired -------------------------------

  -> (future) NavigationProvider subscribes via GPSManager.onFix
  -> predictPosition (NavigationMath)
  -> NavigationStore.driverLocation / heading / speed / gpsState updated
  -> distanceFromPath / hasMovedSignificantly (NavigationMath) checked
       -> off-route? -> RouteEngine refetches -> NavigationStore.route updated
                                                -> NavigationEvents: REROUTE_TRIGGERED
  -> CameraController reads NavigationStore + CameraProfile for current mode
  -> computes CameraPose (NavigationMath: computeBounds/applyEdgePadding for
     auto-fit modes, dynamicZoomForSpeed/dynamicPitchForMode for follow modes)
  -> applies exactly one animateCamera() call, internally, never from a screen
```

The line splits what's real today from what's still planned: `GPSManager`
produces clean, filtered, smoothed, quality-scored `GPSFix` values right now
and hands them to any subscriber via its event bus (`on(...)`, or the
`onFix`/`onStatusChange` sugar) — as of Phase 3.5 it has 7 real subscribers
(the migrated screens/hooks/components), it just doesn't have
`NavigationProvider`/`NavigationStore` as a subscriber yet.

Screens only ever call `useNavigation()` actions and render
`src/components/navigation/*` components (not yet created) that read from
`NavigationHooks.ts` selectors.

## GPS layer hardening (Phase 3.5)

This phase's objective was narrow and explicit: make `GPSManager` the
**exclusive** GPS owner across the whole app before any camera work begins,
and harden it for production. Not a new feature phase — no UI changed, no
navigation behaviour changed (beyond the few flagged exceptions below).

### Ownership (the audit + migration)

A full repo grep for `Location.watchPositionAsync`, `getCurrentPositionAsync`,
`startLocationUpdatesAsync`, `stopLocationUpdatesAsync`,
`hasStartedLocationUpdatesAsync`, `TaskManager.defineTask`, and
`TaskManager.isTaskRegisteredAsync` found 7 call sites outside
`GPSManager.ts`:

`src/hooks/useCurrentLocation.ts`,
`src/features/passenger/components/MapPickerModal.native.tsx`,
`src/features/passenger/PassengerHome.tsx`,
`src/features/driver/DriverDashboard.tsx`, `app/(driver)/navigation.tsx`,
`app/(driver)/trip.tsx`, `app/(tabs)/navigate.tsx`.

Full detail (exact APIs/options per file, concurrency notes, and every
behavior-preservation decision) is in
`audit_export/audit_03-08-26_11-58_gps-subscription-audit.md`. All 7 are
migrated; re-running the same grep after migration turns up zero remaining
call sites outside `GPSManager.ts` (confirmed — see Validation below).

Two migration patterns were used, matching how each screen previously used
GPS:
- **Continuous tracking** (`navigate.tsx`, `trip.tsx`, `navigation.tsx`,
  `DriverDashboard.tsx`): `GPSManager.acquire('foreground', 'driverBestNavigation')`
  on mount + `GPSManager.onFix(...)` to keep updating local component
  state, `GPSManager.release()` on unmount. Each of these 4 screens'
  camera-follow logic that used to live *inside* the raw watcher callback,
  closing over `isAutoFollow`/`isNavigating`/route-step state, now reads
  that state through a `useRef` mirror instead of the effect's own
  dependency array — this means toggling auto-follow/navigating no longer
  tears down and recreates the subscription (previously flagged as an
  inefficiency in `audit_export/audit_02-08-26_13-49_navigation-system-architecture.html`,
  now fixed as a side effect of routing through `GPSManager` correctly,
  not a separate change).
- **One-shot reads** (`PassengerHome.tsx`'s recenter button,
  `MapPickerModal.native.tsx`'s "my location" button):
  `GPSManager.getCurrentFix(profile)`, no subscription at all.
- **Multi-consumer** (`useCurrentLocation.ts`): `acquire`/`release`
  reference counting, because `useSnappedLocation` and `RidePlannerSheet`
  both use this hook inside the same mounted screen at once — a plain
  `stop()` on either one's unmount would have killed tracking for the
  other still-mounted consumer.

### Lifecycle

`start(mode, profile)` / `stop()` (from the earlier pass) are joined by:

- **`pause()`** — tears down the OS subscription but remembers
  `mode`/`profile` and does NOT reset bearing-smoothing state or
  diagnostic counters (a transient interruption, not the end of a
  session).
- **`resume()`** — restarts with the remembered `mode`/`profile`; no-op if
  not currently paused.
- **`restart()`** — forces a fresh restart of the *current* `mode`/`profile`
  even though nothing about the configuration changed (for recovering from
  a degraded state, e.g. a run of `POOR` fixes); resets bearing-smoothing
  state but deliberately keeps the cumulative accepted/rejected counters,
  since a restart is often triggered by, and should stay visible in, those
  same counters.
- **`start()` is now idempotent**: calling it with the exact same
  `mode`+`profile` that's already active is a no-op rather than an
  unconditional teardown-and-recreate — directly satisfying "avoid
  unnecessary stop/start cycles" and the mechanism that made the
  `isAutoFollow`-toggle fix above possible.
- All lifecycle operations (`start`/`stop`/`pause`/`resume`/`restart`/
  `setProfile`) are serialized through an internal operation queue, so
  overlapping calls (rapid re-renders, React StrictMode's double-invoke)
  can never leave two subscriptions alive.

### Profiles + battery optimization (Task 6)

The existing `PROFILE_OPTIONS` accuracy/interval table is unchanged in
spirit (one small tuning: `driverBestNavigation`'s `distanceIntervalMeters`
tightened from `3` to `1` to exactly match the real driver screens now
routed through it — see the audit report). Automatic profile switching is
a thin orchestration layer that does not duplicate that table:

```ts
type GPSTrackingScenario = 'planning' | 'driverNavigation' | 'tripCompleted' | 'offline';
```

`profileForScenario(scenario)` is a pure lookup; `applyScenario(scenario)`
calls the *existing* `setProfile`/`start`/`pause` — `offline` pauses
tracking entirely rather than mapping to a `GPSProfile`. `GPSManager`
itself stays decoupled from `NavigationMode` (NavigationModes.ts) by
design — the future `NavigationProvider` is what will translate e.g.
`NavigationMode.DRIVER_TO_PICKUP` into the `'driverNavigation'` scenario
and call `applyScenario`, not the other way around.

### Events (Task 5)

`GPSManager` publishes a typed event bus (`on(type, handler)`) instead of
depending on Zustand/`NavigationStore` directly — it stays
framework-independent, exactly as before, just with a richer vocabulary
than the old ad hoc `onFix`/`onStatusChange` listener sets (which are now
thin sugar over `on('LOCATION_UPDATED', ...)`/`on('STATUS_CHANGED', ...)`):

`LOCATION_UPDATED`, `HEADING_UPDATED`, `SPEED_UPDATED`, `STATUS_CHANGED`,
`TRACKING_STARTED`, `TRACKING_STOPPED`, `BACKGROUND_STARTED`,
`BACKGROUND_STOPPED`, `PERMISSION_CHANGED`.

This is the integration surface `NavigationProvider` will subscribe to
later (Rollout plan step 4) — deliberately not built in this pass. Note:
the bus's `emit`/`on` implementation duplicates the small pattern already
in `NavigationEvents.ts` rather than sharing a generic factory — an
acknowledged, deliberate trade-off to keep `GPSManager` free of any import
from the rest of the engine (see its file header).

### Diagnostics (Task 3)

`getDiagnostics()` is synchronous and reads only cached module state (never
touches the OS), so it's cheap enough for a debug overlay to call on every
render:

`mode`, `profile`, `trackingState`, `permissionState`,
`locationServicesEnabled`, `foregroundActive`, `backgroundActive`,
`currentAccuracyMeters`, `averageAccuracyMeters` (rolling window of the
last 20 accepted fixes), `heading` (smoothed), `bearing` (raw/unsmoothed,
for comparing against `heading`), `speedMetersPerSecond`,
`lastFixTimestamp`, `fixAgeMs`, `lastUpdateDurationMs`, `rejectedFixCount`,
`acceptedFixCount`, `gpsProvider` (Android-only best-effort guess via
`Location.getProviderStatusAsync`; `null` elsewhere).

### Location quality scoring (Task 4)

Every fix that survives two hard-reject gates (accuracy worse than the
active profile's threshold; an implied speed from the previous fix
exceeding the impossible-speed ceiling) is scored `EXCELLENT`/`GOOD`/
`FAIR`/`POOR` from a five-factor penalty sum — the full algorithm,
thresholds, and worked examples are documented directly above
`scoreFixQuality` in `GPSManager.ts` (kept there, not duplicated here, so
the doc and the code can never drift apart). Factors: accuracy, fix age,
provider guess, distance-jump-vs-recent-speed, and heading stability.
`GPSFix.quality` (types.ts) carries the result on every accepted fix.
Rejected fixes never become a `GPSFix` — they're dropped, only
`rejectedFixCount` moves.

A lighter-weight `scoreOneShotFix` path reuses the same `scoreFixQuality`
function (no duplicated scoring logic) for `getCurrentFix()` reads, but
deliberately skips the stateful glitch-guard/bearing-smoothing history so a
one-off "recenter" read can never perturb the continuous watcher's
smoothing state.

### Migration strategy

See "Ownership" above for the concrete per-file approach. The general
strategy applied to every one of the 7 files: read the existing effect/
handler in full first, identify exactly which local state it set and what
it needs from a `GPSFix` to keep setting it, then swap only the
acquisition mechanism (`Location.*` → `GPSManager.*`) while leaving every
line of business logic (camera math, fare-distance accumulation, turn-by-
turn step advancement) untouched. `tsc --noEmit` was run after every single
file to catch mistakes immediately rather than batching changes.

## Relationship to existing stores

`driverStore` and `rideStore` (`src/state/`) continue to own business/order
data: fare, request queue, wallet, order status, trip summary. They are not
being replaced. `NavigationStore` owns only the map/camera/GPS/route
runtime. Concretely, once wired:

- `driverStore.currentLocation` / `driver_current_lat/lng` (DB) is the
  *persisted* driver position used for matching and order records.
  `NavigationStore.driverLocation` is the *live, high-frequency* position
  feeding the camera — sourced from the same GPS watcher (once wired) but
  not written back to `driverStore` on every tick (that would duplicate
  `driverStore`'s own throttled persistence logic).
- `rideStore`'s active trip pickup/destination is the input to
  `navigation.preview(pickup, destination)` — the engine does not
  independently decide pickup/destination, it's told.
- Existing marker/animation building blocks (`useAnimatedMarker`,
  `NavigationArrowMarker`, `src/lib/mapAnimation.ts`) are candidates for the
  future `MarkerAnimator`/`NavigationArrow` components to wrap rather than
  reimplement. `GPSManager.ts` already reuses `normalizeHeading`/
  `shortestRotation` from `src/lib/mapAnimation.ts` for its own bearing
  smoothing rather than redefining shortest-arc math a second time.
- `src/hooks/useCurrentLocation.ts` (Customer-side "current location" hook)
  now consumes `GPSManager` via `acquire`/`release` rather than calling
  `Location.watchPositionAsync` itself (migrated in Phase 3.5 — see "GPS
  layer hardening" below). It's also the one call site where two consumers
  can be mounted at once (`useSnappedLocation` and `RidePlannerSheet` both
  use it inside the same screen), which is exactly why `acquire`/`release`
  reference counting exists rather than plain `start`/`stop`.

## Rollout plan (future phases, not this one)

1. ~~Implement `GPSManager.ts`~~ — done: foreground/background tracking,
   permissions, accuracy profiles, bearing smoothing, cleanup.
2. ~~Audit the repo for direct GPS API usage and migrate every call site to
   `GPSManager`~~ — done (Phase 3.5): 7 found, 7 migrated, 0 remaining
   outside `GPSManager.ts` (verified by re-running the audit grep after
   migration). `GPSManager` also hardened with `pause`/`resume`/`restart`,
   quality scoring, diagnostics, a typed event bus, `acquire`/`release`, and
   scenario-based profile switching. See "GPS layer hardening (Phase 3.5)"
   below.
3. Implement `NavigationMath.ts` bodies + unit tests (pure functions, no
   map dependency — testable in isolation).
4. Wire `GPSManager` into `NavigationProvider`: subscribe via
   `GPSManager.on('LOCATION_UPDATED', ...)` (or the `onFix` sugar) in a
   `useEffect`, forward values into `NavigationStore`
   (`driverLocation`/`heading`/`speed`/`gpsState`), start tracking based on
   `mode` via `GPSManager.applyScenario(...)` (e.g. `'driverNavigation'`
   during `DRIVER_TO_PICKUP`/`TRIP_IN_PROGRESS`, `'offline'` on `OFFLINE`).
   Mount the provider once, likely in `app/_layout.tsx`, behind a check
   that doesn't affect existing screens until they're migrated.
5. Build `src/components/navigation/` (NavigationMap, CameraController,
   NavigationHUD, TurnBanner, ...) consuming `NavigationHooks.ts`.
6. Migrate one existing screen at a time onto the full engine (not just
   GPS — camera, route, mode) — `app/(driver)/navigation.tsx` first, as the
   most direct match, verifying no regression before moving to the next.
7. Only after all navigation screens are migrated, remove the now-dead
   hand-rolled camera code from those screens (their GPS code is already
   gone as of Phase 3.5).
8. Consider migrating `app/(driver)/trip.tsx`'s bespoke `trackGpsPoint`
   fare-distance filter to read `GPSFix.quality` instead of re-deriving its
   own accept/reject rule (flagged in the audit report, not done in Phase
   3.5 — it's fare-integrity logic, not a subscription, and narrower in
   scope than `GPSManager`'s general-purpose quality score).

## Explicitly out of scope for Phase 3.5 (GPS hardening pass)

- `CameraController`, `RouteEngine`, `AutoFitEngine`, `MarkerAnimator` —
  none implemented.
- Wiring `GPSManager` into `NavigationStore` or `NavigationProvider` — it
  exists, is the app's exclusive GPS owner, and works standalone, but
  nothing forwards its fixes into the store yet (see Rollout plan step 4).
- Camera animation of any kind — the 7 migrated screens' existing
  `animateCamera`/`animateToRegion` calls are untouched; only their GPS
  acquisition changed.
- Google Directions/Roads API calls.
- Auto-fit computation.
- UI changes of any kind, or changes to navigation *behaviour* — only how
  each of the 7 files acquires GPS changed, not what they show or do with
  it (see the audit report's per-file notes for the few narrow, explicitly
  flagged exceptions where migrating onto `GPSManager`'s existing
  accuracy-filtering necessarily changes a corner case slightly).
- `src/components/navigation/` UI components (listed in the Bible/AGENTS.md
  as the eventual reusable component set) — not created yet.
