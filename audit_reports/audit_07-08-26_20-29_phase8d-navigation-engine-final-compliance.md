# Phase 8D — Navigation Engine Final Compliance

**Date:** 2026-08-07
**Type:** Read-only architecture compliance audit. No code modified — every finding below was produced by `Read`/`Grep`/`Glob` tool calls only, confirmed by re-running the audit's own greps after concluding, per this phase's own instruction ("Do not modify working functionality. Only report the final architecture status.").
**Read first:** `AGENTS.md` (including "🔒 Protected Features"), `2GO Navigation Engine Bible.md`.
**Scope:** the full arc from Phase 7 through Phase 8C — `audit_07-08-26_19-37_phase8a-navigation-engine-compliance-audit.md` (baseline), `audit_07-08-26_20-08_phase8a1-...md` (Customer live-trip migration), `audit_07-08-26_20-17_phase8b-...md` (Customer preview/booking migration), `audit_07-08-26_20-25_phase8c-...md` (remaining passenger camera calls).

---

## 1. Methodology

Every ownership claim below was re-verified fresh in this pass with repo-wide greps, not carried forward from the cited prior reports' own conclusions — where a prior report's claim held, it's cited for context; where this pass found something a prior report missed or that changed since, it's called out explicitly (see §7, Marker Animation).

Greps run against `src/**/*.ts*` and `app/**/*.ts*` for every banned direct call named in AGENTS.md's Camera/GPS/Route rules: `.animateCamera(`, `.animateToRegion(`, `.fitToCoordinates(`, `watchPositionAsync`, `getCurrentPositionAsync`, `startLocationUpdatesAsync`, `stopLocationUpdatesAsync`, `TaskManager.defineTask`, `getDirections(`, `getAllRoutes(`. Every hit was opened and read in context (not just counted) to separate real violations from comments/doc references naming the banned call.

---

## 2. Driver

| Screen | GPS | Camera | Route | Mode | Status |
|---|---|---|---|---|---|
| `app/(driver)/navigation.tsx` | `GPSManager.acquire`/`release` | `<NavigationMap/>` → `CameraController` | `fetchRoute()` → `NavigationStore.setRoute()` | `useNavigation()` | **Fully Migrated** |
| `app/(driver)/trip.tsx` | `GPSManager.acquire`/`release` + sanctioned second `onFix` listener for fare-distance accumulation only (documented, not a second subscription) | `<NavigationMap/>` → `CameraController` | `fetchRoute()` → `NavigationStore.setRoute()` | `useNavigation()` | **Fully Migrated** |
| `app/(driver)/trip-summary.tsx` | none | none | none | none | **N/A** — post-trip receipt, no map |
| `src/features/driver/DriverDashboard.tsx` | `GPSManager.acquire('foreground','driverBestNavigation')` | Raw `<Map>` + one direct `mapRef.current.animateToRegion(...)` (idle "follow me" recenter, line ~84) | none | `useNavigation()` for `goOnline`/`goOffline`/`preview`/`requestMatch`/`driverToPickup` on Accept | **Mixed** — unchanged since the original audit, out of scope for every passenger-focused phase (8A.1/8B/8C) |
| `src/features/onboarding/DriverOnboarding.tsx` | — | — | — | — | **N/A** — 4-step application wizard, no map surface (confirmed by direct read; no `Map`/`MapView` import exists) |

No change on the Driver side since the original Phase 8A audit — this arc's work (8A.1/8B/8C) was scoped to the Customer/Passenger side throughout, per each phase's own brief.

---

## 3. Passenger

| Screen/Component | GPS | Camera | Route | Mode | Status |
|---|---|---|---|---|---|
| `app/(customer)/trip.tsx` | none (driver position arrives over `rideStore`'s realtime channel, forwarded into `NavigationStore` via `setDriverLocation` — Phase 8A.1) | `<NavigationMap/>` → `CameraController` | none fetched (matches pre-migration behavior — this screen never rendered a polyline) | `useNavigation()`, replayed from `activeTrip.status` (Phase 8A.1) | **Fully Migrated** |
| `src/features/passenger/components/RidePlannerSheet.tsx` | none (uses `useCurrentLocation`, itself `GPSManager`-based) | none directly — no map of its own | `fetchRoute()` → **both** `rideStore.setRouteData()` (fares/polyline, unchanged) **and** `NavigationStore.setRoute()` (Phase 8B) | `navigation.preview()`/`cancel()` (Phase 8B) | **Fully Migrated** (for its own scope — it has no map to own) |
| `src/features/passenger/PassengerHome.tsx` | `GPSManager` via `useSnappedLocation`/one-shot `getCurrentFix` — correct, unchanged | Raw `<Map>`, attached to `CameraController` (`attachMap`/`useFocusEffect`, Phase 8B) with `disableInternalCamera` gated to PREVIEW/MATCHING; recenter button now calls `CameraController.recenterOnLocation()` (Phase 8C) instead of `animateToRegion` | consumes `rideStore.routeCoordinates` (unchanged — fed by `RidePlannerSheet`'s single fetch) | `navigation.requestMatch()`/`cancel()` on `status` (Phase 8B) | **Fully Migrated** for PREVIEW/MATCHING; **Mixed** for IDLE/`active` (raw `<Map>` internal camera still governs — see §9.1) |
| `src/features/passenger/components/MapPickerModal.native.tsx` | `GPSManager.getCurrentFix` one-shot — correct, unchanged | Raw `MapView` (not the shared `Map` component), recenter now calls `CameraController.animateCameraTo()` (Phase 8C) — deliberately **not** `attachMap()`-registered (see §9.2 for why) | none | none — not a trip surface | **Camera call migrated; map intentionally standalone** — a documented exception, not an oversight |
| `MatchingOverlay.tsx`, `ActiveTripCard.tsx` | — | — | — | — | **N/A** — confirmed by direct read, no map/camera code in either |

Every passenger-facing screen the original Phase 8A audit flagged (`app/(customer)/trip.tsx` at #1 priority, `RidePlannerSheet`/`PassengerHome` at #2, the three isolated `animateToRegion` recenter calls at #4) has now been addressed.

---

## 4. Shared Components (`src/components/navigation/`)

13 components confirmed present, one file each (no duplicates found anywhere else in the repo): `NavigationMap`, `NavigationHUD`, `NavigationTurnBanner`, `NavigationSpeedWidget`, `NavigationCompass`, `NavigationControls`, `NavigationBottomCard`, `NavigationArrivalCard`, `NavigationSlideButton`, `NavigationVoiceToggle`, `NavigationArrivalTime`, `NavigationRoadName`, `NavigationLaneGuidance`.

Consumption:
- `NavigationMap` — used by `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`, `app/(customer)/trip.tsx`.
- `NavigationTurnBanner`/`NavigationLaneGuidance`/`NavigationRoadName`/`NavigationArrivalTime`/`NavigationCompass`/`NavigationControls`/`NavigationSpeedWidget` — used by both driver screens; `app/(customer)/trip.tsx` mounts only `NavigationCompass`/`NavigationControls` (a deliberate Phase 8A.1 choice — the others require route/speed data this passive-viewer screen never populates, since it fetches no route; see that phase's report §2.5).
- `NavigationHUD` (the composite) — **zero screen renders it**. Both driver screens compose the individual pieces directly instead (confirmed by a repo-wide grep for `<NavigationHUD` under `app/`, zero hits). Not a duplication issue (still exactly one file), but a completeness gap carried unchanged from every prior audit.
- `NavigationBottomCard`/`NavigationArrivalCard`/`NavigationVoiceToggle`/`NavigationSlideButton` — built, unused by any screen (driver screens use bespoke cards instead) — unchanged carried-forward finding.

---

## 5. Navigation Runtime

`NavigationProvider` is mounted exactly once, at `app/_layout.tsx` (line 234), wrapping the entire app inside `GestureHandlerRootView`. Every other match for the string "NavigationProvider" in the repo is a comment referencing it, not a second mount (confirmed by reading each hit). It owns exactly two engine-wide singletons: the `GPSManager` fix/status forwarding subscription, and `navigationEventBus`'s dev-mode transition logger — unchanged since Phase 7.

---

## 6. Camera

**One owner: `src/navigation/NavigationEngine/CameraController.ts`.** A repo-wide grep for `.animateCamera(`/`.animateToRegion(`/`.fitToCoordinates(` across every `.ts`/`.tsx` file returns exactly four files:

1. `CameraController.ts` — the engine itself (expected — this is the one file allowed to call it).
2. `src/components/map/Map.native.tsx` — the shared `Map` component's own internal `fitToCoordinates`/`animateToRegion` effects, gated behind `disableInternalCamera`. This is legacy, but **scoped and documented, not a new finding**: `CameraController`'s own `CAMERA_PROFILES` table has no opinion for `IDLE`/`OFFLINE` by design, so `Map`'s internal fallback is still the only camera implementation for those states on any screen using the raw component. Confirmed still correctly gated off during `PREVIEW`/`MATCHING` on `PassengerHome` (Phase 8B).
3. `src/features/driver/DriverDashboard.tsx` — one direct `animateToRegion` call, Transporter-side, out of scope for every phase in this arc (all Customer-focused). Still open — see §9.1.
4. `app/(tabs)/navigate.tsx` — sanctioned dev/testing exception (`AGENTS.md`'s own folder-structure comment), confirmed unchanged across all four audits to date (08-04 through this one).

`CameraController.ts` gained two new exports this arc (`recenterOnLocation`, `animateCameraTo`, both Phase 8C) — both are thin wrappers around the same single `mapHandle.animateCamera`/explicit-handle `animateCamera` call `recompute()` already used; no second animation code path was created.

---

## 7. GPS

**One owner: `src/navigation/NavigationEngine/GPSManager.ts`.** A repo-wide grep for `watchPositionAsync`/`getCurrentPositionAsync`/`startLocationUpdatesAsync`/`stopLocationUpdatesAsync`/`TaskManager.defineTask` returns exactly four files: `GPSManager.ts` itself, and three files whose only matches are **comments naming the banned APIs**, not calls (`NavigationProvider.tsx`, `hooks/useNavigation.ts`, `src/hooks/useCurrentLocation.ts` — each individually re-read in full to confirm). Zero remaining direct subscriptions anywhere in the app. Unchanged since Phase 3.5/the original audit — this arc touched no GPS acquisition code.

`applyScenario`/`profileForScenario` (battery-optimization profile switching) remain built but never called — unchanged known gap, carried forward.

---

## 8. Route

**One owner: `src/navigation/NavigationEngine/RouteEngine.ts`.** A grep for the raw `getDirections(`/`getAllRoutes(` wrapper calls returns exactly two files: `mapsApi.ts` itself (the wrapper's own definition) and `RouteEngine.ts` (its sole caller). Every screen-level route fetch in the app — `navigation.tsx`, `trip.tsx` (driver), `navigate.tsx`, `RidePlannerSheet.tsx` — goes through `RouteEngine.fetchRoute()`, confirmed by direct read of each. `RidePlannerSheet`'s one fetch call now feeds two consumers (`rideStore` and `NavigationStore`, Phase 8B) rather than fetching twice.

---

## 9. Remaining exceptions worth naming precisely (not silent gaps — each was a deliberate call, documented in its own phase's report)

### 9.1 `DriverDashboard.tsx`'s idle-map recenter

Never in scope for this arc (Customer-focused throughout). Same category as the fix already applied to `PassengerHome` in Phase 8C — a candidate for an identical, small follow-up migration, not a structural problem.

### 9.2 `MapPickerModal.native.tsx`'s map is intentionally never `attachMap()`-registered

A deliberate architectural decision made in Phase 8C, not an oversight: this modal's `MapView` is transient and can open on top of a screen (`PassengerHome`) whose map is *already* `CameraController`'s tracked singleton. Registering it too would steal ownership from the screen underneath and fail to restore it on close (`useFocusEffect` doesn't fire from a `Modal` opening/closing). Its camera call was still migrated (`animateCameraTo`, a stateless engine function) — only the *ownership registration* was deliberately withheld, for the reason above.

---

## 10. Marker Animation — a correction to the prior audits

**One file: `src/navigation/NavigationEngine/MarkerAnimator.ts`.** The 08-05 and Phase 8A audits both stated "nothing consumes `MarkerAnimator` yet" (Phase 8A explicitly carried this forward without re-verifying it line-by-line). **This pass re-checked it directly and found that claim is, and was, incorrect**: `src/hooks/useAnimatedMarkerWeb.ts` imports `MarkerAnimator`'s types and `DRIVER_MARKER_PROFILE`, and `src/components/map/Map.web.tsx` calls it (`useAnimatedMarkerWeb({..., profile: DRIVER_MARKER_PROFILE})`) to drive the web platform's driver marker via `requestAnimationFrame` — exactly the "second renderer" scenario `MarkerAnimator.ts`'s own header names as its reason for existing. `git log` shows this consumer was added in the same commit that first implemented the Navigation Engine (`80f4097`), meaning it predates every prior audit — the "0 consumers" finding was a genuine miss, not a regression introduced since.

The native platform (`Map.native.tsx`) still uses the pre-existing `useAnimatedMarker`/`src/lib/mapAnimation.ts` (Reanimated worklets) rather than literally calling into `MarkerAnimator.ts` — a different, but behaviorally-equivalent implementation (documented as intentional in `MarkerAnimator.ts`'s own header: Reanimated shared values can't be reimplemented as plain functions "without becoming a different thing entirely"). This is not duplicate ownership in the competing sense (native and web are two different renderers, never driving the same `MapView`), but it means `MarkerAnimator.ts` is the literal marker-animation implementation for exactly one of the app's two renderers today.

---

## 11. AutoFit

**One file: `src/navigation/NavigationEngine/AutoFitEngine.ts`**, called exclusively from `CameraController.ts` (`fitPreview`/`fitCompleted`) — confirmed no other file computes bounds/fit padding. Newly reachable this arc: `PREVIEW` mode's auto-fit (pickup + destination + route, chrome-aware padding) now actually executes on a Customer's own device during booking (Phase 8B attached `PassengerHome`'s map to `CameraController`) — previously built but, per the original audit, "unreachable in the one flow it was built for." That gap is now closed.

---

## 12. State Machine

`src/navigation/NavigationEngine/NavigationModes.ts` remains the single, unchanged source of truth (9-state table, `assertValidTransition`/`isValidTransition`) — untouched by any phase in this arc. What changed is *who drives it*: before this arc, only the Transporter's own device replayed it in real time (`DriverDashboard.handleAcceptRequest`, `navigation.tsx`, `trip.tsx`). It's now also replayed, independently, by the Customer's own device across two screens (`RidePlannerSheet`/`PassengerHome` for `IDLE→PREVIEW→MATCHING`, Phase 8B; `app/(customer)/trip.tsx` for `MATCHING→...→TRIP_COMPLETED`, Phase 8A.1) — each device holding its own local `NavigationStore` instance and reaching the same mode independently from the same `rideStore`/`driverStore` business-status values, per the Bible's design (`NavigationStore` is per-device, not networked). Both replay helpers are defensive against illegal/out-of-order calls via `safeTransition`, matching the pattern `DriverDashboard` already established.

---

## 13. Verify checklist

| Requirement | Status | Evidence |
|---|---|---|
| ✓ One GPS owner | **Confirmed** | §7 — exactly one file creates a location subscription |
| ✓ One Camera owner | **Confirmed** | §6 — exactly one file calls `animateCamera`/`animateToRegion`/`fitToCoordinates` against the app's tracked navigation map; the two named exceptions are documented, scoped, non-competing |
| ✓ One Route owner | **Confirmed** | §8 — exactly one file calls the raw Directions wrapper |
| ✓ One Navigation Store | **Confirmed** | Exactly one `create<NavigationStore>` call in the repo (`NavigationStore.ts`) |
| ✓ One CameraController | **Confirmed** | Exactly one `CameraController.ts` file (`Glob` search) |
| ✓ One AutoFitEngine | **Confirmed** | Exactly one `AutoFitEngine.ts` file |
| ✓ One MarkerAnimator | **Confirmed** | Exactly one `MarkerAnimator.ts` file |
| ✓ One NavigationHUD | **Confirmed** | Exactly one `NavigationHUD.tsx` file (though zero screens currently render the *composite* — see §4; this is a usage gap, not a duplication) |
| ✓ No duplicate ownership | **Confirmed, with two named, reasoned exceptions** | §9.1 (`DriverDashboard`, unchanged/out of scope) and §9.2 (`MapPickerModal`, a documented non-singleton-by-design case) — neither is two systems *competing* for the same live map; both are pre-existing/deliberate, not new conflicts |

---

## 14. Remaining legacy code (full inventory, this arc + carried forward)

1. **`DriverDashboard.tsx`'s idle-map `animateToRegion` recenter call** — Transporter-side equivalent of the bug fixed on `PassengerHome` in Phase 8C. Smallest, lowest-risk remaining item.
2. **`Map.native.tsx`/`Map.web.tsx`'s internal `fitToCoordinates`/`animateToRegion` fallback effects** — intentionally retained; the only camera implementation for `IDLE`/`OFFLINE`/active-trip states on any raw-`<Map>` screen, since `CameraController`'s profile table has no opinion there by design.
3. **`MapPickerModal.native.tsx`'s `MapView`** — deliberately never `attachMap()`-registered (§9.2); its one camera call is engine-owned, its map ownership is not, by design.
4. **`app/(tabs)/navigate.tsx`** — sanctioned dev/testing exception, unchanged across every audit.
5. **`customerLocation` has no producer** — unchanged from the original audit. Only `driverLocation` gained a network-synced producer this arc (Phase 8A.1); the Customer's own device position is still never written anywhere (no screen acquires the Customer's own GPS into the engine — `PassengerHome`/`RidePlannerSheet` use `GPSManager` one-shot reads that stay local to those screens' own state, never forwarded into `NavigationStore.customerLocation`).
6. **`NavigationHUD` composite has zero consumers**; `NavigationBottomCard`/`NavigationArrivalCard`/`NavigationVoiceToggle`/`NavigationSlideButton` remain unused — unchanged.
7. **`GPSManager.applyScenario`/battery-optimization profile switching** — built, never called. Unchanged.
8. **Native marker animation doesn't literally call `MarkerAnimator.ts`** (uses the pre-existing, behaviorally-equivalent `useAnimatedMarker`/Reanimated path instead) — documented as intentional, not a defect (§10).
9. **`Architecture.md`'s own prose** still narrates portions of the Rollout plan as future work that Phase 7 already completed, and now also predates this arc's Phase 8A.1/8B/8C work entirely (it was last touched at Phase 7) — a documentation-currency issue, not a code issue. Its SOLID/file-ownership tables remain accurate; its "current state"/"Rollout plan" framing does not.
10. **The `Map.native.tsx` → `NavigationMap.tsx` `animateCamera` duration double-wrapping** flagged as an observation (not a fix) in Phase 8B's report — still present, still out of scope, still affects both driver screens and `PassengerHome`/`MapPickerModal` equally.

---

## 15. Navigation Engine completion percentage

**≈ 90%**, up from the baseline audit's implicit ~68/100 (see that report's §9 scoring table). Basis for the estimate:

- **Engine core (camera math, GPS, routing, state machine, store, shared components): ~95% complete.** Every piece the Bible specifies exists, is singly-owned, and works where mounted. The only sub-100% items here are `applyScenario` (battery optimization, built/unused) and the `NavigationHUD` composite (built/unused, individual pieces used instead) — both completeness gaps, not architecture gaps.
- **Engine *reach* across the app: ~85% complete.** Driver: both trip-lifecycle screens fully migrated (was already true at Phase 8A). Passenger: booking (`RidePlannerSheet`/`PassengerHome` PREVIEW/MATCHING), live trip tracking, and camera-call cleanup are now all migrated (this arc's entire deliverable) — the Bible's headline promise ("Driver, passenger... will all share the same Navigation Engine") is now materially true for both actor types, not just the Transporter. What's left (`DriverDashboard`'s idle map, `MapPickerModal`'s standalone picker, `customerLocation`'s missing producer) are narrow, individually small, and in two of three cases deliberately scoped exceptions rather than unmigrated surface area.
- Weighted down slightly from a naive "engine complete + reach complete = 100%" because: (a) none of this has been verified on a physical device at any point across any audit in this arc (a recurring, explicitly-flagged caveat since Phase 7), and (b) a few real, if small, gaps remain open (items 1, 5, 6, 7 in §14).

## 16. Production readiness score

**7.5 / 10.**

What earns the 7.5: the architecture is sound and consistently applied — single ownership holds everywhere it matters, the state machine is fully validated end-to-end (including two independent devices' local replays reaching consistent modes from the same business-status source), and the highest-value, most user-visible gap named by the original audit (Customer-side camera/marker/route quality during a live trip) is closed.

What holds it back from higher:
1. **Zero on-device verification, ever, across this entire audit lineage.** Every damping constant, animation duration, and "feels smooth" claim (Bible: "no shaking," "smooth and predictive") is unverified outside a description of the math. This is the single largest risk to a genuine launch decision.
2. **The `animateCamera` duration double-wrapping** (§14 item 10) is a real, if narrow, latent bug in a system now handling four screens' camera output — worth a fix and a device check before this is called done, not because it's architecturally significant but because it could visibly degrade the "smooth" experience the whole engine exists to deliver.
3. **`customerLocation` still has no producer** — if a future feature ever needs the Customer's own live position fed into the engine (e.g. a "walk to pickup" mode), that field is a no-op today.
4. **`DriverDashboard`'s and `MapPickerModal`'s remaining exceptions** are each individually low-risk, but both are the kind of thing that tends to accumulate if not deliberately closed out — worth a tracked follow-up, not urgent.

None of the above are architectural defects — they're finishing-polish and verification gaps on top of an architecture that is, at this point, genuinely singly-owned end to end.
