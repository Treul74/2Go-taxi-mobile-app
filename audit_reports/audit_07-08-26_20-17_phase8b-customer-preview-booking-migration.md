# Phase 8B — Customer Preview & Booking Migration

**Date:** 2026-08-07
**Type:** Migration (code modified). Follows Phase 8A.1 (`audit_07-08-26_20-08_...md`), which migrated the Customer's live-trip screen. This phase covers the step before that: `RidePlannerSheet` (pickup/destination selection) and `PassengerHome`'s `idle`/`planning`/`matching` states, the two named legacy gaps in `audit_07-08-26_19-37_phase8a-navigation-engine-compliance-audit.md` §3.2/§11.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md` — both re-read before any code was touched.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/features/passenger/components/RidePlannerSheet.tsx` | Route-fetch effect now also publishes into `NavigationStore.setRoute()` and drives `IDLE -> PREVIEW` via `navigation.preview()`. |
| `src/features/passenger/PassengerHome.tsx` | Attaches its existing raw `<Map>` ref to `CameraController` (via the module's existing `attachMap`/`detachMap`/`setViewportSize`/`setChrome` — none of which were modified); drives `PREVIEW -> MATCHING` via `navigation.requestMatch()`; gates `disableInternalCamera` to PREVIEW/MATCHING only. |

No other file was changed. `CameraController.ts`, `AutoFitEngine.ts`, `RouteEngine.ts`, `NavigationStore.ts`, `NavigationModes.ts`, and every `src/components/navigation/*` component are untouched — all consumed as-is, per the task's "without modifying CameraController" instruction.

---

## 2. Migration report

### 2.1 Why PassengerHome's map needed touching at all

The task's own "Activate" section requires AutoFit/the PREVIEW camera profile to *execute*, not just requires the mode machine to reach `PREVIEW`. `CameraController.recompute()` is a no-op until a map handle is attached (`attachMap`) — that only happens today inside `<NavigationMap/>`. `PassengerHome` cannot swap to `<NavigationMap/>` wholesale: it renders `h3Grid`, simulated nearby vehicles, the search-pulse marker, `arrivalTime` badges, and a live-location dot — none of which `NavigationMap`'s prop surface exposes, and recreating that surface was out of this task's scope ("Migrate: RidePlannerSheet, Preview Mode, Matching Mode" — not "rewrite PassengerHome's map").

Instead, `PassengerHome` now calls `attachMap`/`detachMap`/`setViewportSize`/`setChrome` directly on its own existing `mapRef` — the exact same ~10-line ref-adapter `NavigationMap.tsx` already uses internally, reused rather than duplicated in spirit (it's glue code tying one specific map ref to the controller; every map instance needs its own copy of this glue, the same way `NavigationMap.tsx` has its own). This is calling `CameraController`'s already-existing, already-public integration surface (`attachMap`'s own doc comment names "the (not yet built) NavigationMap component" as *an* intended caller, not the *only* one) — not modifying `CameraController.ts` itself, and not reimplementing any of its pose/gating logic.

**Why `useFocusEffect`, not a plain mount-once `useEffect`:** `CameraController` drives one map at a time (module-level `mapHandle`). Expo Router's stack keeps `PassengerHome` mounted underneath `/(customer)/trip` when that screen is pushed (Phase 8A.1). A plain `useEffect(() => { attachMap(...); return () => detachMap(); }, [])` would attach once on `PassengerHome`'s initial mount and never again — so after a driver is matched, the user is pushed to `/(customer)/trip` (which attaches its own map), and if they navigate back, `trip.tsx` unmounts and calls `detachMap()`, leaving `PassengerHome`'s map permanently un-attached for the rest of that session. `useFocusEffect` (already used elsewhere in this codebase — `MessagesScreen.tsx`) re-attaches every time `PassengerHome` regains focus and detaches when it loses it, so ownership always follows whichever screen the user is actually looking at.

**Why `disableInternalCamera` is gated, not blanket-enabled:** `Map.native.tsx`/`Map.web.tsx` already run their own internal `fitToCoordinates`/`animateToRegion` effects (a legacy, parallel auto-fit implementation — confirmed by reading `Map.native.tsx` lines 440-490). Turning `disableInternalCamera` on unconditionally would also silence `Map`'s "center on my location" (idle) and "follow the driver" (active-trip) behaviours, neither of which `CameraController`'s `IDLE`/`OFFLINE` profile replaces (that profile is deliberately "no camera opinion" — see `CameraController.ts`'s own comment). Since this task's scope is specifically Preview + Matching, `disableInternalCamera={mode === PREVIEW || mode === MATCHING}` hands the camera to the engine only for those two modes and leaves every other state exactly as it already behaved.

### 2.2 RidePlannerSheet — one fetch, two consumers

`RouteEngine.fetchRoute()` is still called exactly once per pickup/destination change (same call site as before). Its result now goes to both `rideStore.setRouteData()` (unchanged — still backs `calculateVehicleFares()` and `PassengerHome`'s own polyline rendering, both explicitly protected) and `useNavigationStore.getState().setRoute()` (new). This is the same "one fetch/GPS source, two stores" shape already established by `app/(driver)/trip.tsx`'s `driverStore.updateLocation` bridge (Architecture.md's "Relationship to existing stores") — not a new pattern.

`navigation.preview(pickup, destination)` fires once, the first time both are set (`IDLE -> PREVIEW`). Calling it again while already in `PREVIEW`/`MATCHING` would be an illegal transition (`NavigationModes.ts`'s table only allows `PREVIEW` from `IDLE`) — so a live-tracked pickup drifting after that point (GPS ticks re-running this effect) instead patches `pickup`/`destination` directly via `useNavigationStore.setState(...)`, keeping `AutoFitEngine`'s bounds accurate without re-dispatching a transition. Clearing pickup or destination unwinds `PREVIEW -> IDLE` via `navigation.cancel()`.

### 2.3 PassengerHome — the PREVIEW/MATCHING boundary

`rideStore.status` only ever takes `'idle' | 'matching' | 'active'` in practice (`'planning'` is declared in the type but never actually dispatched anywhere in the app — confirmed by a repo-wide grep). A new effect keyed on `status`:
- `status === 'matching'` → `navigation.requestMatch()` (`PREVIEW -> MATCHING`). Defensively also fires `navigation.preview()` first if the local mode is still `IDLE` (covers the edge case where `requestRide()`'s status flip somehow outraces `RidePlannerSheet`'s own effect — normally it won't, since both booking and pickup/destination population require the user to have already interacted with the sheet).
- `status` returns to `'idle'`/`'planning'` while mode is `MATCHING` → `navigation.cancel()`. This covers both `handleCancelMatching` (user backs out) and `requestRide()`'s own failure paths (order creation/subscribe failing, which revert `status` to `'idle'` inside `rideStore` — untouched) — the effect reacts to the resulting `status` value either way, without `rideStore.ts` itself needing to know the Navigation Engine exists.

`MatchingOverlay.tsx` needed no changes — confirmed by reading it in full: purely presentational, no map/camera ownership (same finding as the prior audit).

### 2.4 Handoff to Phase 8A.1

Because `PassengerHome` now drives local `NavigationStore` mode as far as `MATCHING` before a driver is matched, `app/(customer)/trip.tsx`'s `advanceNavigationMode()` (Phase 8A.1) typically only has one more edge to walk (`MATCHING -> DRIVER_TO_PICKUP`) instead of replaying the whole chain from `IDLE`. Both phases' replay helpers are defensive against either starting point, so this isn't a hard dependency — just a nice consistency check that the two phases compose correctly.

---

## 3. Validation

- ✓ **Preview Mode uses NavigationStore** — `RidePlannerSheet` calls `navigation.preview()` / patches `pickup`/`destination` on the store directly; no separate local "preview" state was added.
- ✓ **Matching Mode uses NavigationStore** — `PassengerHome` calls `navigation.requestMatch()` on the same `status` transition that already drives `MatchingOverlay`.
- ✓ **RouteEngine remains the only route owner** — no new `fetchRoute`/direct Directions call was added; the existing single call site in `RidePlannerSheet` now also publishes to `NavigationStore.setRoute()`, but nothing fetches a second time.
- ✓ **AutoFit executes automatically** — `PassengerHome`'s map is attached to `CameraController` via its existing public `attachMap`/`setViewportSize`/`setChrome` API (unchanged file), and `disableInternalCamera` stands down the legacy `fitToCoordinates` effect exactly while `CameraController` is driving (PREVIEW/MATCHING) — no manual `fitToCoordinates`/`animateCamera` call was added anywhere in this diff.
- ✓ **Existing booking flow still works** — `requestRide()`, `cancelRide()`, `calculateVehicleFares()`, `setRouteData()`/`clearRoute()`, and every existing `rideStore` action are untouched; the Navigation Engine calls are additive reads/side-effects layered alongside them, not replacements.
- ✓ **TypeScript passes** — `npx tsc --noEmit`, exit code 0, zero errors, after this change.
- ✓ **CameraController.ts not modified** — confirmed by `git diff --stat`; only its existing public functions were called from two screen-level files.

---

## 4. Remaining preview legacy code

1. **`DriverDashboard.tsx`'s own map** (idle/offline, before a request) — still raw `<Map>` with a direct `animateToRegion` recenter call. Out of scope (Transporter-side, not Preview/Matching).
2. **Three isolated `animateToRegion` "recenter" calls** (`PassengerHome.handleRecenter`, `MapPickerModal.native.tsx`, `DriverDashboard.tsx`) — all on screens/states `CameraController`'s `IDLE`/`OFFLINE` profile has no opinion about by design. Named in the prior audit as the lowest-priority, smallest-surface item; untouched by this pass.
3. **`app/(tabs)/navigate.tsx`** — sanctioned dev/testing exception, not a violation (unchanged, per `AGENTS.md`).
4. **`Map.native.tsx`'s own internal `fitToCoordinates`/`animateToRegion` effects** still exist in the component (now dormant during PREVIEW/MATCHING via `disableInternalCamera`, but still the active implementation for `IDLE`/`OFFLINE`/active-trip states on this screen, and for every other screen still on a raw `<Map>`). Not removed — `CameraController`'s own profile table has no opinion for those states, so `Map`'s internal behaviour is still the only implementation covering them; removing it would leave those states with no camera behaviour at all, which is a larger scope change than this phase's brief.
5. **Observation, not fixed (pre-existing, unrelated to this task):** `NavigationMap.tsx`'s `attachMap` adapter passes an `{ duration }` options object as `Map`'s exposed `animateCamera(camera, duration?: number)` second argument, which then re-wraps it as `{ duration: options }` before calling the native `animateCamera`. This double-wrapping already exists on both driver screens (`navigation.tsx`, `trip.tsx`) today and now also applies to `PassengerHome` while `engineOwnsCamera` — flagged here for a future, separate fix in `Map.native.tsx`/`Map.web.tsx`, not addressed in this pass (out of scope, and not something this migration introduced).
