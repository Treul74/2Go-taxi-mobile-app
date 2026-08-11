# Phase 8A.1 — Migrate Customer Trip Screen to Navigation Engine

**Date:** 2026-08-07
**Type:** Migration (code modified). Follows on from `audit_export/audit_07-08-26_19-37_phase8a-navigation-engine-compliance-audit.md`'s #1-priority finding: `app/(customer)/trip.tsx` was fully legacy (zero NavigationEngine imports, raw `<Map autoFollowDriver>`).
**Read first:** `AGENTS.md` ("🔒 Protected Features" section), `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md` — all read in full before any code was touched.

---

## 1. Files modified

| File | Change |
|---|---|
| `app/(customer)/trip.tsx` | Full migration onto the Navigation Engine — see §2. |
| `app/rating/[id].tsx` | Added `safeTransition(() => navigation.reset())` to `handleSubmit`/`handleSkip`, mirroring the existing `app/rating/driver.tsx` pattern — closes the mode-machine lifecycle this migration opens (see §2.4). |
| `src/navigation/NavigationEngine/types.ts` | Added `setDriverLocation` to `NavigationDataActions` — one new method on an existing interface. |
| `src/navigation/NavigationEngine/NavigationStore.ts` | Implemented `setDriverLocation`. |

No other file was changed. `NavigationMap`, `CameraController`, `MarkerAnimator`, `AutoFitEngine`, `GPSManager`, `NavigationProvider`, `NavigationModes`, `RouteEngine`, and every `src/components/navigation/*` component were consumed as-is — none of their internals were touched.

---

## 2. Migration report

### 2.1 Why a new store method was needed (`setDriverLocation`)

`NavigationState.driverLocation`'s own doc comment (`types.ts`) already anticipated this: *"the Transporter's current position — this device's own GPS if `actor === 'transporter'`, otherwise synced from the backend."* The "synced from the backend" producer never existed — `Architecture.md`'s own audit-carried-forward gap (`customerLocation` has no producer) named the same hole for the sibling field. `NavigationDataActions` only had `setGpsFix` (local-device GPS, carries accuracy/quality/speed) — nothing fit a network-delivered `{latitude, longitude}` + heading pair with no `GPSFix` behind it.

`setDriverLocation(location, heading?)` was added as one more `NavigationDataActions` method, same shape/spirit as `setGpsFix`/`setGpsStatus` (an internal setter, called via `useNavigationStore.getState()`, not exposed through `useNavigation()`). This is filling in a producer the store's own types already described, not new engine surface.

### 2.2 Why the mode machine needed a replay helper

`NavigationStore` is a per-device Zustand store — it is **not** shared over the network. The Transporter's own device already drives it in real time (`navigation.tsx`, `trip.tsx`). The Customer's device has never driven its own instance at all. Since `rideStore.activeTrip.status` only ever arrives as a single current value (not a stream of discrete "this just happened" events the way the driver's own screens get discrete button presses), and a Customer could open this screen mid-trip at any status, `advanceNavigationMode()` was written to walk the *local* `NavigationStore.mode` forward one legal edge at a time until it reaches whatever mode `activeTrip.status` implies — re-reading the store after every step so a `safeTransition`-rejected edge is never mistaken for a successful one. This is the same replay pattern `DriverDashboard.handleAcceptRequest` already uses (chained `safeTransition` calls to walk `IDLE -> PREVIEW -> MATCHING -> DRIVER_TO_PICKUP` in one shot) — generalized to also handle resuming from a mode already in progress, since a Customer's app can reopen this screen at any lifecycle point, not only at the start of it.

Status → mode mapping: `driver_assigned`/`arriving -> DRIVER_TO_PICKUP`, `waiting -> ARRIVED_PICKUP`, `in_progress -> TRIP_IN_PROGRESS`, `completed -> TRIP_COMPLETED` (via `ARRIVED_DROPOFF`, walked automatically). `cancelRide()` (Cancel Trip button) now also calls `safeTransition(() => navigation.cancel())` alongside it — `CANCELLABLE_MODES` (`PREVIEW`/`MATCHING`/`DRIVER_TO_PICKUP`/`ARRIVED_PICKUP`) already matches exactly the `canCancel` business rule this screen already enforced (`driver_assigned`/`waiting`), so this is a direct, risk-free parallel, not a new business rule.

### 2.3 What now feeds the engine, and what doesn't

- **`driverLocation` / `heading`**: a new `useEffect` calls `useNavigationStore.getState().setDriverLocation(activeTrip?.driverLocation ?? null, activeTrip?.driverHeading ?? null)` whenever `activeTrip.driverLocation`/`driverHeading` change. This *reads* `rideStore`'s existing realtime-channel-populated fields — `rideStore.applyOrderUpdate` (the actual data source, per `AGENTS.md`'s Protected Features) is untouched. This is a second consumer of a value that already existed, not a new data source.
- **`pickup` / `destination`**: set once, at the moment the mode machine first reaches `PREVIEW` (`navigation.preview(pickup, destination)`, part of the replay chain).
- **No GPS was added.** This screen never called `GPSManager.acquire()` before, and still doesn't — `NavigationProvider` (mounted once at the app root) only *forwards* fixes from an active `GPSManager` subscription; since nothing on the Customer device acquires one, `NavigationStore.driverLocation` on this device is never touched by a phantom local GPS fix — it is driven exclusively by `setDriverLocation` above. Verified by reading `NavigationProvider.tsx` in full before writing this migration.
- **No new Directions/Google API calls.** The legacy screen never fetched or rendered a route polyline either (no `showRoute`/`routeCoordinates` props were ever passed to the old `<Map>`) — this migration doesn't add one. `RouteEngine.fetchRoute()` was deliberately not called from this screen, keeping this migration to "navigation ownership" only, per the task's own scope.

### 2.4 Mode-machine cleanup (`app/rating/[id].tsx`)

Driving this screen's `NavigationStore` for the first time means something now also has to return it to `IDLE` once a trip finishes, or a future `preview()` call from this device would be illegal (`PREVIEW` is only reachable from `IDLE`). The Transporter side already established the pattern for this (`app/rating/driver.tsx` calls `safeTransition(() => navigation.reset())` on both Submit and Skip). The Customer's rating screen (`app/rating/[id].tsx`) had no Navigation Engine usage at all before this pass — the same two calls were added there, in the same two places, closing the lifecycle this migration opens.

### 2.5 UI/visual differences vs. the legacy screen (accepted, not regressions)

- **Destination pin now visible from `DRIVER_TO_PICKUP` onward**, not only once `in_progress`. The legacy `<Map>` only passed `destination` once `activeTrip.status === 'in_progress'`; `NavigationMap` always renders `NavigationState.destination` once set, and it's set at the `PREVIEW` step (early in the replay). This matches the Bible's own `PREVIEW` mode ("Displaying Pickup and Drop-off") and is consistent with how the app now behaves everywhere else the engine is used — not worked around, since doing so would mean fighting the engine's design rather than consuming it.
- **`showPickupAsUserLocation` is gone.** The legacy screen rendered the pickup point as a blue "your location" dot; `NavigationMap` always renders `pickup` as a standard pickup pin (same as the driver screens). Minor, cosmetic.
- **The floating "X min ETA" map badge is gone.** The legacy `<Map eta={...}>` prop drew a small floating badge near the pickup/destination pin. `NavigationMap` has no equivalent prop. The same number is still shown in the bottom trip card's status row (`{activeTrip.estimatedArrival} min`), which was already there and is unchanged — no information was lost, only a duplicate on-map rendering of it.
- **Added:** `NavigationCompass` + `NavigationControls` (recenter button, shown only once the user pans away from follow) as a small top-right overlay, matching the driver screens' pattern. This is new, additive UI, not a replacement of anything that previously existed.

---

## 3. Validation

- ✓ **NavigationMap replaces raw Map** — `app/(customer)/trip.tsx` no longer imports `@/components/map`.
- ✓ **CameraController owns the camera** — no `animateCamera`/`animateToRegion`/`fitToCoordinates` call exists in the file; camera behavior for `DRIVER_TO_PICKUP`/`TRIP_IN_PROGRESS` etc. comes from `CameraController`'s existing per-mode profiles, unchanged.
- ✓ **MarkerAnimator owns marker animation** — `NavigationMap` renders through `src/components/map/Map.*`, which already renders `driverLocation` via `AnimatedVehicleMarker` (confirmed by reading `Map.native.tsx`'s marker imports) — the same interpolation math `MarkerAnimator.ts`'s own header names as its live implementation.
- ✓ **NavigationStore is the source of truth** — `driverLocation`/`heading`/`pickup`/`destination`/`mode` all live in the store; the screen holds no parallel copies (its own local state is limited to `showCancellationModal`, a pure UI toggle unrelated to navigation).
- ✓ **No duplicate camera** — confirmed no `animateCamera`/`animateToRegion`/`fitToCoordinates` in the diff.
- ✓ **No duplicate GPS** — confirmed no `GPSManager.acquire`/`expo-location` import was added; the screen still has zero GPS ownership, exactly as before.
- ✓ **No duplicate route state** — no `fetchRoute()` call was added; `NavigationState.route` stays `null` on this screen, same as before (no route was ever fetched or drawn here).
- ✓ **TypeScript passes** — `npx tsc --noEmit` run after the change, exit code 0, zero errors.

---

## 4. Remaining legacy code (unchanged by this pass — for context only)

Per the prior audit's ranked list (`audit_07-08-26_19-37_...md` §3), still open after this migration:

1. **`src/features/passenger/PassengerHome.tsx` / `RidePlannerSheet.tsx`** — the Customer's booking/preview flow (`PREVIEW`/`MATCHING` modes) still never enters the engine from the Customer's own device before a driver is matched. Out of scope for this pass (explicitly a separate, smaller migration per the prior audit's §11).
2. **`app/(tabs)/navigate.tsx`** — sanctioned dev/testing exception, not a violation (AGENTS.md marks it intentional).
3. **Three isolated `animateToRegion` "recenter" calls** (`DriverDashboard.tsx`, `PassengerHome.tsx`, `MapPickerModal.native.tsx`) — all on idle/no-trip screens, lowest priority, untouched by this pass.

`app/(customer)/trip.tsx` itself is no longer on this list.
