# Phase 5 — Navigation Runtime Integration Report

**Date:** 2026-08-03
**Scope:** Wire the already-built Navigation Engine (`src/navigation/NavigationEngine/`, `src/components/navigation/`) into the running app — mount `NavigationProvider`, forward `GPSManager` fixes into `NavigationStore`, dispatch the existing mode-transition actions from the real driver lifecycle, and publish fetched routes into the store. Per explicit product decision this pass, **no screen's rendered `<Map>` or camera code was touched** — `CameraController`/`AutoFitEngine`/`NavigationMap`/`NavigationHUD` remain unmounted; deciding which screen renders them first is deferred to a future phase.
**Method:** Read every engine file in full, `AGENTS.md`, `2GO Navigation Engine Bible.md`, `Architecture.md`, and both prior audits (`audit_03-08-26_16-11_navigation-engine-integration.md`, `audit_03-08-26_16-22_phase4-5-navigation-runtime-audit.md`) before writing any code, per this phase's own "Read first" instruction. Implementation plan reviewed and approved by the user before any file was changed.

---

## Summary

| Phase | Status |
|---|---|
| 5A — Mount `NavigationProvider` | **Done** — mounted once in `app/_layout.tsx`, wrapping the whole app tree |
| 5B — Connect `GPSManager` → `NavigationStore` | **Done** — `NavigationProvider` forwards every fix/status change; required adding 3 new store setters that didn't exist (see "Gap found" below) |
| 5C — Connect driver lifecycle | **Done** — all 9 mode-transition edges the driver flow can reach are now dispatched from the real screens, guarded against illegal-transition edge cases |
| 5D — Connect `RouteEngine` | **Done** (partial, by design) — fetched routes are published into `NavigationStore.route`/`currentStep`/`etaSeconds`/`distanceMeters`; live per-fix `RouteProgress` tracking was explicitly not implemented (see "Remaining gaps") |
| 5E — Connect `CameraController` | **Not done this pass** — deferred by explicit user decision; verified already-correct and unchanged |
| 5F — Connect `AutoFitEngine` | **Not done this pass** — same as above |
| 5G — Connect Navigation HUD | **Not done this pass** — same as above |

---

## Gap found before any wiring was possible

`NavigationStore.ts`'s public action surface (`NavigationActions` in `types.ts`) had **mode-transition actions only** — `preview`, `driverToPickup`, `arrivedAtPickup`, ... `followDriver`, `recenter`, etc. There were **no setters for GPS/route data** (`driverLocation`, `heading`, `speed`, `gpsState`, `route`) despite the store declaring those fields and initializing them to `null`/`IDLE`. Phase 5B ("forward GPSManager updates into NavigationStore") was literally impossible without adding them.

Added a new, separate, **non-screen-facing** interface `NavigationDataActions` (`types.ts`) with three methods — `setGpsFix`, `setGpsStatus`, `setRoute` — implemented in `NavigationStore.ts`. Deliberately **not** added to `hooks/useNavigation.ts` (the screen-facing hook): only `NavigationProvider` (GPS) and the two route-fetching driver screens (route) call them, via `useNavigationStore.getState()` directly — the same pattern `CameraController.ts` already uses internally.

## Second gap found: illegal-transition risk

`NavigationStore`'s initial `mode` is `IDLE`, not `OFFLINE`. Several of the mode-transition actions the driver lifecycle needs to call (e.g. `goOnline()` from `IDLE`) throw `NavigationTransitionError` synchronously if the store isn't in the exact mode the edge requires — a real risk given the store's mode and the driver's actual session state can legitimately diverge (first app open, remounts, an accept racing a poll tick). Added `src/navigation/NavigationEngine/safeTransition.ts` — a one-function helper every new dispatch in this pass goes through, catching only `NavigationTransitionError` (`console.warn`, no crash) and re-throwing anything else. This was not optional: an unguarded illegal transition would have crashed the calling screen (React error boundary), directly violating "never break a working feature."

---

## Files modified

### Engine (additive only)

- **`src/navigation/NavigationEngine/types.ts`** — added `NavigationDataActions` interface (`setGpsFix`, `setGpsStatus`, `setRoute`).
- **`src/navigation/NavigationEngine/NavigationStore.ts`** — implemented the three actions above; widened the file's internal `NavigationStore` type to include them.
- **`src/navigation/NavigationEngine/safeTransition.ts`** (new) — the illegal-transition guard described above.
- **`src/navigation/NavigationEngine/providers/NavigationProvider.tsx`** — replaced the TODO body: subscribes to `GPSManager.onFix`/`onStatusChange` in a mount-once `useEffect`, forwards every event into `NavigationStore` via the two new setters, unsubscribes on unmount. Deliberately does **not** call `GPSManager.acquire`/`start`/`applyScenario` — it only listens, so it can never create a second GPS subscription or fight a screen's own `acquire('foreground', 'driverBestNavigation')` call/accuracy profile.

### App wiring

- **`app/_layout.tsx`** — mounts `<NavigationProvider>` once, wrapping the entire app (inside `GestureHandlerRootView`, around `SafeAreaProvider`) — exactly one runtime instance, never per-screen.
- **`src/features/driver/DriverDashboard.tsx`** — `handleToggleOnline` now also dispatches `navigation.goOnline()`/`goOffline()` (guarded) after a successful driverStore call; `handleAcceptRequest` now dispatches `preview(pickup, destination)` → `requestMatch()` → `driverToPickup(driverLocation)` (guarded, one block) after a successful accept — reaching `DRIVER_TO_PICKUP` via the state machine's own existing edges, not a new one.
- **`app/(driver)/navigation.tsx`** — `calculateRoute()` now also calls `NavigationStore.setRoute(route)` after a successful fetch; `handleArrived` dispatches `arrivedAtPickup()` on `confirmArrival()` success; `handleStartRide` dispatches `startTrip()` on `beginTrip()` success.
- **`app/(driver)/trip.tsx`** — the destination route-fetch effect now also calls `setRoute(route)`; `handleSliderComplete` dispatches `arrivedAtDropoff()` then `completeTrip()` on `completeTrip()` (driverStore) success.
- **`app/rating/driver.tsx`** — `handleSubmit` and `handleSkip` both dispatch `reset()` (`TRIP_COMPLETED → IDLE`) alongside the existing `finishTrip()` call, closing the loop back to "available."

`cancelTrip()` (driverStore) was confirmed dead code before touching anything — zero call sites anywhere in the app (grep-verified) — so nothing was wired to mirror it.

### Not modified

`CameraController.ts`, `AutoFitEngine.ts`, `NavigationMap.tsx`, `NavigationHUD.tsx` and the rest of `src/components/navigation/` — read in full, confirmed already correctly wired to `NavigationStore` and to each other (`NavigationMap.tsx` already calls `attachMap`/`detachMap`/`setViewportSize` in its own effect). No screen's `<Map>` or hand-rolled camera `useEffect`s were touched.

---

## Data flow (now real, where it was previously entirely inert)

```
GPSManager (unchanged — still the exclusive GPS owner)
  -> onFix(fix) / onStatusChange(status)
  -> NavigationProvider (mounted once, app/_layout.tsx)
  -> NavigationStore.setGpsFix(fix) / setGpsStatus(status)      <- NEW
  -> NavigationStore.driverLocation / heading / speed / gpsState
     are now LIVE for the first time since the engine was built

RouteEngine.fetchRoute(...) (unchanged — still the exclusive route-fetch owner)
  -> called from app/(driver)/navigation.tsx & trip.tsx, as before
  -> NavigationStore.setRoute(route)                             <- NEW
  -> NavigationStore.route / currentStep / currentInstruction /
     distanceMeters / etaSeconds are now LIVE

Driver screens' existing handlers (accept / start pickup / arrive /
start trip / complete / rate-or-skip)
  -> safeTransition(() => navigation.<action>())                 <- NEW
  -> NavigationStore.mode advances through the real state machine
```

## Runtime lifecycle (now dispatched, in order, from the real driver flow)

```
IDLE
  -> (DriverDashboard.handleAcceptRequest) preview() -> requestMatch() -> driverToPickup()
DRIVER_TO_PICKUP
  -> (navigation.tsx.handleArrived, on confirmArrival() success) arrivedAtPickup()
ARRIVED_PICKUP
  -> (navigation.tsx.handleStartRide, on beginTrip() success) startTrip()
TRIP_IN_PROGRESS
  -> (trip.tsx.handleSliderComplete, on completeTrip() success) arrivedAtDropoff() -> completeTrip()
TRIP_COMPLETED
  -> (rating/driver.tsx.handleSubmit / handleSkip) reset()
IDLE
```

`goOnline()`/`goOffline()` (`DriverDashboard.handleToggleOnline`) map onto the `IDLE <-> OFFLINE` edge independently of the trip lifecycle above.

---

## Validation checklist (from the phase brief)

| Item | Result |
|---|---|
| NavigationProvider mounted once | **Pass** — `app/_layout.tsx`, single mount point, wraps whole tree |
| GPSManager updates NavigationStore | **Pass** — verified by code trace; no device available to observe live fixes (see Verification below) |
| NavigationStore mode changes correctly | **Pass** — every new dispatch checked by hand against `NAVIGATION_MODE_TRANSITIONS` |
| Driver Accepted triggers DRIVER_TO_PICKUP | **Pass** — `preview → requestMatch → driverToPickup` chain in `handleAcceptRequest` |
| Trip Started triggers TRIP_IN_PROGRESS | **Pass** — `startTrip()` in `handleStartRide` |
| RouteEngine receives requests | **Pass** — unchanged, already true before this pass |
| RouteEngine publishes routes | **Pass** — `setRoute(route)` added at both existing fetch call sites |
| CameraController receives updates | **Not applicable this pass** — no map mounted (deferred by decision) |
| AutoFitEngine executes | **Not applicable this pass** — same |
| Navigation HUD renders | **Not applicable this pass** — same |
| No duplicate GPS subscriptions | **Pass** — `NavigationProvider` only listens (`onFix`/`onStatusChange`), never `acquire`/`start` |
| No duplicate NavigationProvider instances | **Pass** — single mount in root layout |
| No crashes | **Pass**, `tsc --noEmit` clean (exit 0); every new dispatch guarded by `safeTransition` |

---

## Remaining gaps before Camera Feel work (Phase 6)

1. **No screen renders `<NavigationMap>` yet** — `CameraController`/`AutoFitEngine`/`NavigationHUD` are connected in code but still never attached to a live `MapView`. This is the single blocking item before any camera-feel work can start, and was explicitly deferred this pass rather than risking a live driver's camera behaviour without device verification.
2. **No live `RouteProgress` tracking** — `setRoute` seeds `currentStep`/`etaSeconds`/`distanceMeters` once, at fetch time, from the route's own totals. `RouteEngine.computeRouteProgress` (per-fix remaining-distance/ETA/active-step) is still never called — both prior audits already flagged this as a pre-existing engine gap, unchanged by this pass.
3. **No rerouting** — `RouteEngine.shouldReroute`/`evaluateReroute` still have zero callers.
4. **Passenger/customer side untouched** — `NavigationState.actor`/`customerLocation` are not populated; this phase's own lifecycle diagram was driver-only.
5. **`NavigationProvider` doesn't yet translate mode into a GPS accuracy scenario** (`GPSManager.applyScenario`) — deliberately cut this pass to avoid fighting each screen's own `acquire()` call; a future pass should decide who owns that call once a screen is actually driven by the engine's camera.

## Regressions

None found. Every change this pass is additive (a new setter call, a new guarded dispatch) alongside existing, untouched logic — no screen's rendered output, camera behaviour, or existing store (`driverStore`) logic was modified. `tsc --noEmit` is clean.

## Verification performed

- `npx tsc --noEmit` — clean, exit code 0, after all edits.
- Every new `safeTransition(...)` call site manually checked against `NAVIGATION_MODE_TRANSITIONS` (`NavigationModes.ts`) for whether it's a legal edge from the mode the driver flow is actually in at that point.
- Grep confirms no new direct `Location.*`/`animateCamera`/`fitToCoordinates`/`getDirections` call sites were introduced.
- Grep confirms `GPSManager.acquire`/`start`/`applyScenario` are not called anywhere in the new `NavigationProvider` code (doc-comment mention only).
- `cancelTrip()` confirmed to have zero call sites before deciding not to wire it.
- **Not performed (no device/simulator available in this environment):** running the app to observe a live GPS fix reach `NavigationStore.driverLocation`, or to click through the full driver lifecycle and watch `NavigationStore.mode` advance in the debugger/devtools. Recommend the user smoke-test one full driver trip (Accept → Start Pickup → Arrive → Start Trip → Complete → Rate/Skip) after this lands — behaviourally this should be entirely invisible (no screen reads from `NavigationStore` yet), so the only observable signal of a problem would be a new `console.warn` from `safeTransition` indicating a dispatch fired from an unexpected mode.

## Readiness score

**45 / 100** (up from the prior audit's 28/100).

Rationale: GPS, mode/lifecycle, and route-publish are now genuinely live — `NavigationStore` is no longer permanently inert, which was the single largest blocker the prior audit identified. Camera, Auto Fit, and HUD remain fully built but still not attached to any live `MapView`, by explicit decision this pass — that's the correct, lowest-risk order (data plumbing before a user-visible camera swap), but it's also why the score isn't higher: three of the Bible's six ownership areas (Camera, Auto Fit, HUD) are unchanged from "built, disconnected." The next phase's first job is exactly the decision this pass deferred: which screen renders `<NavigationMap>` first, verified on a real device before any driver-facing camera change ships.
