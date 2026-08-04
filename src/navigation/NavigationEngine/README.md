# Navigation Engine

The single, global navigation system for 2Go. Every navigation behaviour in
the app — camera, GPS, routing, turn-by-turn, auto-fit, arrival detection —
is owned here. No screen implements any of this independently.

> **Status: mode transitions, the store, and GPS tracking are real and
> exclusively owned. Camera animation and routing are still stubs.**
> `NavigationStore.ts` declares and initializes every field in the Bible's
> Navigation Store spec. `NavigationModes.ts` + `NavigationStore.ts` enforce
> every mode transition for real — an illegal one throws
> `NavigationTransitionError`. `GPSManager.ts` is a fully working, hardened,
> native GPS abstraction — foreground + background tracking, permissions,
> accuracy profiles, bearing smoothing, speed derivation,
> `pause`/`resume`/`restart` lifecycle, per-fix quality scoring
> (EXCELLENT/GOOD/FAIR/POOR/REJECTED), a typed event bus, `acquire`/
> `release` reference counting, and a `getDiagnostics()` snapshot — and, as
> of the Phase 3.5 hardening pass, it is the app's **only** GPS owner: a
> full repo audit found 7 screens/hooks/components calling
> `Location.watchPositionAsync`/`getCurrentPositionAsync` directly, and all
> 7 have been migrated to consume `GPSManager` (see
> `audit_export/audit_03-08-26_11-58_gps-subscription-audit.md`). It is
> still not wired into `NavigationStore`/`NavigationProvider` (see "Current
> limitations") — fixes it produces reach its own event bus and the 7
> migrated consumers directly, not yet `NavigationState`. Camera animation,
> routing, and auto-fit remain unimplemented. See `Architecture.md` for the
> full field-ownership table and rollout plan.

Source of truth for *why* this exists: `2GO Navigation Engine Bible.md` and
the "GO NAVIGATION ENGINE" section of `AGENTS.md` at the project root. If
this README ever conflicts with either of those, they win.

## Folder map

```
src/navigation/NavigationEngine/
  README.md              This file.
  Architecture.md         Deeper design doc — SOLID breakdown, data flow, rollout plan.
  types.ts                 All shared interfaces/types. Import from here, not from a peer file.
  NavigationModes.ts        The NavigationMode enum, the legal-transition table, and its validators/error type.
  NavigationEvents.ts        MODE_CHANGED / TRANSITION_REJECTED event contracts + the concrete event bus.
  NavigationMath.ts           Pure geometry/camera math. No side effects, no store access.
  GPSManager.ts                 The ONLY file allowed to create a location subscription — every other GPS call site in the app has been migrated to consume it. Foreground/background tracking, pause/resume/restart, quality scoring, diagnostics, typed events, scenario-based profile switching.
  NavigationStore.ts           The one global Zustand store (`useNavigationStore`) — the global source of truth for every navigation field.
  NavigationHooks.ts             Internal selector hooks over the store, for the engine's own components.
  providers/
    NavigationProvider.tsx        Owns engine-wide singletons (GPS watcher, event bus). Not yet mounted; not yet wired to GPSManager.
  hooks/
    useNavigation.ts                 The public hook screens call. The only file most screens should import.
```

## How a screen will use this (mode transitions work today; camera/GPS/route calls are still no-ops)

```tsx
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';

function PassengerHome() {
  const navigation = useNavigation();

  const onLocationsSelected = (pickup: LatLng, destination: LatLng) => {
    navigation.preview(pickup, destination); // IDLE -> PREVIEW, validated
  };
  // ...
}
```

Calling a transition method out of order throws instead of silently
corrupting state — e.g. `navigation.startTrip()` while `mode` is `IDLE`
throws `NavigationTransitionError` (see NavigationModes.ts).

The screen never calls `animateCamera()`, `fitToCoordinates()`,
`watchPositionAsync()`, or a Directions API helper itself. It asks the
engine for a behaviour; the engine decides how to render it.

## What NOT to do

- Don't call `Location.watchPositionAsync`, `Location.getCurrentPositionAsync`,
  `Location.startLocationUpdatesAsync`, or `TaskManager.defineTask` from
  anywhere except `GPSManager.ts` — it is the only file allowed to create a
  location subscription (or a one-shot read), and it already guarantees
  exactly one subscription is ever live (`start()` tears down the previous
  one first, regardless of mode/profile — a no-op if the exact same
  mode/profile is already active, so it's cheap to call from an effect that
  re-runs for unrelated reasons). Prefer `GPSManager.acquire(mode, profile)`
  + `release()` over raw `start()`/`stop()` if more than one component might
  want tracking active at the same time (see `useCurrentLocation.ts` for the
  pattern); use `getCurrentFix(profile)` for a single "recenter"/"my
  location" style read instead of a standing subscription.
- Don't call Google Directions / Distance Matrix from a screen — that's
  `src/lib/google/mapsApi.ts`'s job, called only from inside this engine's
  future RouteEngine.
- Don't reimplement Haversine — `NavigationMath.ts` delegates to
  `src/lib/distance.ts`.
- Don't read/write `NavigationStore` state from `driverStore` or `rideStore`
  or vice versa for navigation-owned fields — see Architecture.md
  "Relationship to existing stores" for exactly where the boundary sits.
- Don't add UI components under `src/navigation/` — reusable navigation UI
  (NavigationMap, NavigationHUD, TurnBanner, etc.) belongs in
  `src/components/navigation/` per the Bible, and hasn't been created yet.

## Current limitations

- Mode transitions are real and validated (`NavigationModes.ts` +
  `NavigationStore.ts`). Camera fields (`bearing`, `zoom`, `pitch`) and
  route fields (`route`, `currentStep`, `currentInstruction`, `etaSeconds`,
  `distanceMeters`, `distanceRemainingMeters`) exist, are typed, and are
  settable, but nothing in this pass populates them from a real camera
  animation or Directions API response — they stay at their initial
  `null`/default values until a later pass wires one in. Camera
  (`cameraState`) actions set `cameraState`/`followMode`/`recenterState`
  together but never trigger an actual animation.
- `GPSManager.ts` is fully hardened and is the app's exclusive GPS owner
  (see the audit report), but it is still NOT wired to `NavigationStore` —
  it has no dependency on Zustand or the store by design (see its file
  header), so fixes it emits via its event bus (`on(...)`, or the
  `onFix`/`onStatusChange` sugar) don't reach
  `NavigationState.driverLocation`/`heading`/`speed`/`gpsState` until a
  later pass adds that plumbing (intended to live in `NavigationProvider`).
  The 7 migrated screens/hooks consume `GPSManager` directly and keep their
  own local component state in the meantime, exactly as they did before
  migration.
- `NavigationProvider` is not mounted anywhere (not in `app/_layout.tsx`) and
  does not yet call into `GPSManager`.
- `app/(driver)/trip.tsx`'s `trackGpsPoint` (fare-distance accumulator) runs
  its own independent accept/reject filter on each `GPSFix`, conceptually
  overlapping with `GPSManager`'s quality scoring but narrower in purpose
  (boolean accept/reject for distance accumulation, not a 5-tier score).
  Left as-is — flagged as a candidate to eventually consume `GPSFix.quality`
  instead of re-deriving its own rule, not fixed in this pass.
- `NavigationMath.ts` functions throw `Not implemented` — they exist to lock
  in the API shape, not to be called yet.
- GPS behaviour (permission prompts, foreground/background tracking,
  bearing smoothing, quality scoring, accuracy filtering) could only be
  verified via pure-logic tests against the same math/algorithms in this
  sandbox — `expo-location` transitively imports `react-native`, which can't
  execute outside a real Expo/React Native runtime (device, simulator, or
  dev client). On-device verification of all 7 migrated call sites is still
  outstanding.
