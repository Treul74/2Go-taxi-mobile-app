# Phase 7 (A–F) — Professional Navigation Experience: Final Consolidated Report

**Date:** 2026-08-04
**Covers:** Phase 7A (Camera Follow), 7B (AutoFit), 7C (Marker Animation), 7D (Navigation HUD), 7E (Route Progress & Rerouting), 7F (Performance Optimization) — one continuous engineering pass on the Navigation Engine, each sub-phase run as its own scoped task with its own read-first/constraints/validation cycle.
**Scope, held constant across all six sub-phases:** `app/(driver)/navigation.tsx` is the only screen touched — it's the one screen already wired onto `NavigationMap`/`CameraController`. `app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` remain untouched, legacy, hand-rolled-camera screens by explicit decision made at the start of this series and never revisited. This is the single largest standing gap across the whole arc — repeated in "Remaining Gaps" below rather than re-litigated per section.
**Method, held constant across all six sub-phases:** `AGENTS.md` and `2GO Navigation Engine Bible.md` (and `Architecture.md` where relevant) re-read before each sub-phase. Every sub-phase's own "do not modify" file list was verified via `git status`/`git diff` after the fact, not just followed by intention. `npx tsc --noEmit` and `npx eslint` run after every meaningful change, not just once at the end.

---

## 1. Executive summary

| Sub-phase | One-line outcome |
|---|---|
| 7A Camera Follow | Wired two previously-dead `CameraAnimation.ts` primitives (`applyCameraDamping`, `RECENTER_DURATION`) into `CameraController` — everything else in the checklist was already correctly implemented and verified, not rebuilt. |
| 7B AutoFit | Confirmed `AutoFitEngine.ts`'s fitting algorithm was already correct/unified/orientation-agnostic; closed the one real gap — chrome inputs (`bottomSheetHeight`/`navigationBannerHeight`) defaulting to zero instead of real measured UI. |
| 7C Marker Animation | Native marker animation was already excellent (untouched). Built `useAnimatedMarkerWeb`, the "second renderer" `MarkerAnimator.ts` was explicitly built for but never had — closed the one real gap: web's driver marker had zero smoothing. |
| 7D Navigation HUD | Completed `NavigationHUD.tsx` (arrival time, road name, lane-guidance placeholder, voice toggle) and mounted the new pieces on `navigation.tsx` without moving anything already placed. |
| 7E Route Progress & Rerouting | Added next/second-maneuver lookahead and a route-percentage selector; fixed a real one-tick lag where a fresh reroute wasn't reflected in distance/duration/current-step until the next ambient GPS tick. |
| 7F Performance | Halved `NavigationStore` subscriber notifications per GPS tick during active navigation (batched fix+progress writes); reduced `Map.native.tsx` re-render churn via two `React.memo` extractions; audited `GPSManager.ts` and every new Phase 7 subscription/timer for leaks — found none needing a fix. |

Every sub-phase's own constraint list (which files were off-limits) was different and was respected in each case — see the compliance matrix in Section 8.

---

## 2. 7A — Professional Camera Follow

**Files touched:** `CameraController.ts` only.

Read `CameraAnimation.ts`/`NavigationMath.ts` in full before writing anything. Found most of the brief already correctly implemented and verified (not rebuilt): lower-third anchor (`calculateForwardOffset`/`followAnchorRatio`), predictive look-ahead (`calculateLookAheadDistance`/`calculateLookAheadPoint`), dynamic zoom/pitch (`dynamicZoomForSpeed`/`dynamicPitchForMode`, correctly inert on `DRIVER_TO_PICKUP` per the Bible's own fixed-value table for that mode), gesture-to-free-explore and auto-return-to-follow (wired in the base Phase 7 pass this series started from).

**Real gap closed:** `applyCameraDamping`, `interpolateBearing`, and `RECENTER_DURATION` all existed with zero callers. Added a `dampPose()` helper in `CameraController.recompute()` that blends the raw computed target toward the previous applied pose (position, shortest-arc bearing, zoom, pitch) — applied only to steady-state follow ticks, never to the first pose or a deliberate mode/camera-state transition, and layered on top of (not replacing) the existing movement/rotation-threshold gating. Also gave "recenter" (`FREE_EXPLORE → FOLLOW_DRIVER`) its own, previously-unused, snappier `RECENTER_DURATION` (600ms) instead of the generic `ARRIVAL_DURATION` (1200ms) every other transition uses.

**Not done, flagged:** on-device tuning of `CAMERA_DAMPING_FACTOR` and the 600ms recenter duration — both are documented starting values, unverified on real hardware.

---

## 3. 7B — Professional AutoFit

**Files touched:** `app/(driver)/navigation.tsx` only. `CameraController.ts`, `AutoFitEngine.ts`, `MarkerAnimator.ts`, `NavigationHUD.tsx`, `RouteEngine.ts`, `GPSManager.ts` were all off-limits this sub-phase and were confirmed untouched.

Read `AutoFitEngine.ts` in full. Confirmed `fitPoints` is the single shared core `fitPreview`/`fitDriverAccepted`/`fitCompleted` all funnel through (no duplicate fitting logic existed to consolidate), that `fitPreview` already includes the route polyline (route never hidden), and that `calculateZoomToFitBounds` computes lat/lng zoom independently — inherently orientation-agnostic, verified against `app.json`'s still-active `"orientation": "portrait"` lock (not exercisable at runtime, but the math doesn't need to change if that ever lifts).

**Real gap closed:** `bottomSheetHeight`/`navigationBannerHeight` in the chrome model were hardcoded at `0` (only `safeArea` was wired, in the base Phase 7 pass). `navigation.tsx` now reports its real turn-banner and bottom-card heights via `onLayout` into `CameraController`'s existing `setChrome()` — the turn-banner slot was restructured to stay mounted (content conditional, container not) so layout events don't go stale when hidden.

**Not done, flagged:** `fitDriverAccepted` still has no live trigger — that wiring lives inside `CameraController.computeTargetPose`, off-limits this sub-phase, and no `NavigationMode` represents "Driver Accepted" as a distinct state (a prior, deliberate architecture decision, not something introduced or fixable here). Every chrome improvement this sub-phase made is consequently unverifiable on the one in-scope screen today, since no `autoFit: true` mode is reachable from it before it unmounts into `trip.tsx`.

---

## 4. 7C — Professional Marker Animation

**Files touched (new):** `src/hooks/useAnimatedMarkerWeb.ts`, `src/hooks/index.ts` (export), `src/components/map/Map.web.tsx`. `MarkerAnimator.ts` itself was not modified — every function this sub-phase used (`startMarkerTransition`, `retargetMarkerTransition`, `computeMarkerFrame`, `DRIVER_MARKER_PROFILE`) already existed with a sufficient public API.

Read `useAnimatedMarker.ts` (native, live, Reanimated-driven) in full and confirmed every checklist item — GPS interpolation, position/bearing smoothing, jump elimination, timing — was already correct there; left entirely untouched. Read `MarkerAnimator.ts` in full and found it was a complete pure-math twin of that same behavior, explicitly built (per its own header) for "a second renderer... e.g. `Map.web.tsx`'s `@react-google-maps/api` markers, which have no Reanimated worklet equivalent," with **zero callers anywhere**.

**Real gap closed:** confirmed by reading `Map.web.tsx` that its driver marker fed raw GPS positions straight into an `OverlayView` with an instant CSS rotate — the one place in the entire marker system that actually jumped. Built `useAnimatedMarkerWeb`, a `requestAnimationFrame`-driven hook calling `MarkerAnimator`'s existing transition functions (no new interpolation math), null-safe so it doesn't animate in from a placeholder point before the first real GPS fix. Wired into `Map.web.tsx`'s driver marker.

**Not done, flagged:** true velocity-based dead-reckoning ("movement prediction" in the literal extrapolation sense) was deliberately not built — not part of either implementation's existing contract, and carries real product risk (showing a vehicle where it hasn't been confirmed to be). Web fix is unverified in an actual browser — none available in this environment.

---

## 5. 7D — Navigation HUD

**Files touched (new):** `NavigationArrivalTime.tsx`, `NavigationRoadName.tsx`, `NavigationLaneGuidance.tsx`, plus `NavigationHUD.tsx` (extended) and `app/(driver)/navigation.tsx` (new pieces mounted). No audit report was written for this sub-phase per explicit request.

`NavigationHUD.tsx` already composed turn banner, ETA/remaining-distance, speed widget, and compass. Built the three missing pieces:
- **`NavigationArrivalTime`** — wall-clock arrival ("3:45 PM"), distinct from the pre-existing ETA chip which shows a *duration* ("12 min") — the two were being conflated (`NavigationBottomCard`'s "Arrival" and "Duration" rows both showed the same duration value; noted but not fixed, since `NavigationBottomCard` is outside "Navigation HUD" per the engine's own established categorization and this sub-phase's own "implement ONLY the Navigation HUD" scope).
- **`NavigationRoadName`** — best-effort current road name, extracted from the active step's own instruction text (no dedicated road-name field exists without touching `RouteEngine.ts`, off-limits) — documented as a heuristic, not authoritative data.
- **`NavigationLaneGuidance`** — UI-only placeholder, matching the same treatment as the voice toggle (no lane data exists anywhere in the engine).

Extended `NavigationHUD.tsx` itself (the reusable composite, not off-limits) to include all of the above plus the voice toggle. On `navigation.tsx`, mounted the three new pieces without moving anything already placed — "preserve existing screen design" honored by construction, not by after-the-fact checking.

---

## 6. 7E — Route Progress & Rerouting

**Files touched:** `NavigationHooks.ts` (new selectors), `RouteProgressTracker.ts`. `RouteEngine.ts` itself was not modified — every function reused (`computeRouteProgress`, `shouldReroute`, `evaluateReroute`) already existed. No audit report was written for this sub-phase per explicit request.

Remaining distance, remaining duration, off-route detection, and rerouting were already wired from the base Phase 7 pass. Closed three real gaps:
- **Next/second maneuver**: `NavigationHooks.ts` had no lookahead past the current step. Added `useNextStep()`/`useSecondNextStep()` — plain index reads into the route's already-computed step list (`activeStepIndex + 1`/`+2`), no new routing math.
- **Route percentage**: was already computed (`RouteProgress.fractionComplete`) but only reachable by digging into the nested progress object. Added `useRouteProgressPercent()` as a convenience selector.
- **Smoother rerouting**: found a real one-tick lag — when a reroute landed, `setRoute()` reset `currentStep` to the fresh route's first step, but distance/duration/current-step weren't recomputed against the *new* route until the next ambient GPS tick (~1s later at `driverBestNavigation`). `checkAndReroute` now calls `applyRouteProgress` immediately after a successful reroute, so progress snaps to correct values in the same moment the new route appears.

---

## 7. 7F — Performance Optimization

**Files touched:** `NavigationStore.ts`, `types.ts`, `RouteProgressTracker.ts`, `NavigationProvider.tsx`, `Map.native.tsx`. No audit report was written standalone for this sub-phase — folded into this final report per request.

**Method:** since this sub-phase's constraint list didn't name specific off-limits engine files (unlike 7A–7E, each of which excluded a different subset), the full engine was in scope for reading — `GPSManager.ts` (hot-path fix processing) and `Map.native.tsx` (marker/route rendering) were read in full to find genuine, safe, behavior-preserving optimizations rather than applying changes speculatively.

### 7F.1 — Reduced `NavigationStore` subscriber notifications (Camera update frequency / Animation performance)

**Found:** since Phase 7's route-progress wiring, every GPS tick with an active route called `setGpsFix(fix)` then `applyRouteProgress(...)` — two separate Zustand `set()` calls, each of which synchronously notifies every store subscriber (`CameraController`'s the one that matters today). During active navigation with a route loaded — the actual "camera follow" state this whole series has been optimizing — `CameraController.handleStoreChange()` was running twice per fix instead of once.

**Fixed:** extracted `gpsFixPatch`/`routeProgressPatch` as pure patch-computing functions inside `NavigationStore.ts` (existing `setGpsFix`/`setRouteProgress` now call them, unchanged behavior), and added one new internal action, `setGpsFixWithProgress`, that applies both patches in a single `set()`. `RouteProgressTracker.applyGpsFixWithProgress` and `NavigationProvider`'s `onFix` handler now use it whenever a route is already active, falling back to plain `setGpsFix` before one exists. **Final state is byte-identical either way** — only the number of intermediate store commits changed.

**Benchmark comparison (structural, not on-device):**

| | Before | After |
|---|---|---|
| `set()` calls per GPS tick, route active | 2 (`setGpsFix`, `setRouteProgress`) | 1 (`setGpsFixWithProgress`) |
| `CameraController.handleStoreChange()` invocations per tick | 2 | 1 |
| Dev-log throttle checks per tick (Phase 7's own `logRuntimeUpdateInDev`) | 2 | 1 |
| Final `NavigationState` after the tick | (baseline) | identical |

### 7F.2 — Reduced `Map.native.tsx` re-render churn (Marker rendering / Map rendering)

**Found:** `NavigationMap` re-renders on every GPS tick (forwarding `driverLocation`/`heading` as `<Map>` props, by necessity — the driver did move). Before this pass, the route polyline/direction-arrows/turn-highlights and the pickup/destination/H3-grid/ETA-badge markers were inline in the same render, so React re-diffed all of them too on every fix even though none of *their* props (route, pickup, destination, H3 grid, ETA) had changed.

**Fixed:** extracted two `React.memo`-wrapped components, `RoutePolylineLayer` and `PickupDestinationLayer` — every prop and every line of JSX moved verbatim, no rendering logic changed. Verified this pattern is already safe in this exact codebase: every existing marker (`AnimatedVehicleMarker`, `AnimatedUserLocation`, `NavigationArrowMarker`, etc.) is already a custom component wrapping a native `Marker`, not a raw `Marker` directly, so react-native-maps already tolerates markers nested inside custom JS components — this extraction doesn't introduce a new pattern, it reuses one already proven in this file. The driver/vehicle/user-location markers, which genuinely depend on `driverLocation`, stay inline and unmemoized (they're supposed to re-render every tick).

**Verified zero regression from the extraction itself:** `npx eslint` on the file before and after this change reports the **exact same 14 problems (4 errors, 10 warnings)** — all four errors and every warning confirmed pre-existing via `git stash` (a `React.forwardRef` missing `displayName`, three hooks called after an early return, some `Array<T>` style warnings, two missing-dependency warnings) — none introduced by this pass.

**Benchmark comparison (structural, not on-device):** a `driverLocation`-only prop change to `NavigationMap` (the ~1Hz steady-state case) previously forced React to re-invoke and re-diff the entire marker/polyline JSX tree (~6 conditional blocks, H3 grid loop, ETA badge) on every tick; now it only re-invokes the still-inline driver/vehicle markers — `RoutePolylineLayer`/`PickupDestinationLayer` bail out via `React.memo` since none of their own props changed. **On-device frame-rate impact is not measurable in this environment** — no device/simulator available — this is a JS-side reconciliation-cost reduction, reported honestly as structural, not benchmarked.

### 7F.3 — GPS filtering performance: audited, no change made

Read `GPSManager.ts`'s hot path (`processRawFix`, `scoreFixQuality`, `handleRawLocation`) in full. Findings: fix processing is already O(1) per fix (a fixed sequence of arithmetic comparisons, no loops over unbounded data); the accuracy-sample window is capped at 20 entries (`ACCURACY_WINDOW_SIZE`), so `recordAccuracySample`'s `.shift()` is bounded and trivial; `emit()` already early-returns when no listener has ever subscribed to an event type, which matters because `HEADING_UPDATED`/`SPEED_UPDATED` are emitted every fix but — grep-confirmed — have **zero listeners anywhere in the app**, so their real cost is already just a `Map.get()` returning `undefined`, not a full dispatch. **No safe, meaningful optimization found; none made.** Reported as a genuine finding, not a gap papered over.

### 7F.4 — Memory usage: audited, no leaks found

Grepped every `setInterval`/`setTimeout`/`requestAnimationFrame`/`.subscribe(`/`addEventListener` introduced across this entire Phase 7A–7F arc: `NavigationMap.tsx`'s `freeExploreTimeoutRef` (cleared on unmount and on every `cameraState` change away from `FREE_EXPLORE`) and `useAnimatedMarkerWeb.ts`'s RAF loop (cleared on unmount, and self-terminates once a transition's `isComplete` flag is true rather than running indefinitely). Both confirmed already correctly cleaned up — no code change needed.

### 7F.5 — Battery usage: no separate change

The dominant battery factor (GPS polling interval/accuracy profile, `driverBestNavigation` = 1s/1m) is a pre-existing, deliberate tradeoff and changing it would be a behavior change (explicitly forbidden this sub-phase). 7F.1's reduction in per-tick JS work (fewer store commits, fewer subscriber notifications) is the only lever available without touching GPS acquisition itself — real-world battery impact from that alone is expected to be small and is not independently measurable without a device.

### 7F.6 — Route recalculation: audited, no change made

`RouteEngine.fetchRoute`'s 5-minute route cache and `checkAndReroute`'s 30m-movement gate (unchanged from Phase 7/7E) already prevent redundant network fetches on every tick. `computeRouteProgress`'s per-tick `snapToPath` call is an O(route-length) scan, but route lengths in this app's city-scale ride-hailing context are expected to be modest (tens to low hundreds of points), and altering the shared `routeSnapping.ts` algorithm (used identically for marker road-snapping) to chase a hypothetical large-route case was judged higher-risk than its likely benefit — not changed, flagged rather than silently skipped.

### 7F validation

| Criterion | Result |
|---|---|
| 60 FPS where possible | Not measurable without a device; native marker animation remains UI-thread (Reanimated), unaffected by any 7F change. |
| Reduced battery usage | Indirect, via 7F.1's reduced per-tick JS work; GPS polling itself unchanged (would be a behavior change). |
| Reduced memory | No leaks found (7F.4); no new allocations of note introduced. |
| No regressions | `tsc --noEmit` clean; `eslint` reports the identical pre-existing issue set on every touched file, confirmed via `git stash` diff, not new ones. |
| TypeScript clean | `npx tsc --noEmit` — 0 errors, confirmed after every edit in this sub-phase. |

### 7F readiness score

**74/100.** Two genuine, verified, zero-behavior-change optimizations landed (reduced store-subscriber churn, reduced Map re-render churn), both with a clear before/after structural argument. Score isn't higher because most of the named checklist items (GPS filtering, battery, route recalculation) were investigated and found already-adequate rather than improved — correct and honest, but not "delivered new work" — and because **none of this is verified on a physical device**, which is the only way "60 FPS," "reduced battery," and "reduced memory" can actually be confirmed rather than argued from code structure.

---

## 8. Constraint compliance matrix

| Sub-phase | Off-limits files | Verified untouched? |
|---|---|---|
| 7A | AutoFitEngine, MarkerAnimator, NavigationHUD, RouteEngine, GPSManager, ride lifecycle | Yes — `git status` confirmed only `CameraController.ts` changed |
| 7B | CameraController, MarkerAnimator, NavigationHUD, RouteEngine, GPSManager, ride lifecycle | Yes — only `navigation.tsx` changed |
| 7C | CameraController, AutoFitEngine, NavigationHUD, RouteEngine, GPSManager, ride lifecycle | Yes — only `useAnimatedMarkerWeb.ts` (new), `hooks/index.ts`, `Map.web.tsx` changed; `MarkerAnimator.ts` reused, not modified |
| 7D | CameraController, AutoFitEngine, MarkerAnimator, RouteEngine, GPSManager, ride lifecycle | Yes — only new HUD components + `NavigationHUD.tsx` + `navigation.tsx` changed |
| 7E | CameraController, AutoFitEngine, MarkerAnimator, NavigationHUD, GPSManager, ride lifecycle | Yes — only `NavigationHooks.ts` + `RouteProgressTracker.ts` changed; `RouteEngine.ts` reused, not modified |
| 7F | Ride lifecycle only (no other files named off-limits); no behavior change, no UI redesign, no new libraries | Yes — `driverStore.ts`/ride-lifecycle files untouched; `package.json`/`package-lock.json` diff empty every sub-phase this series |

No sub-phase touched `trip.tsx` or `navigate.tsx` at any point in the series.

---

## 9. All files modified across 7A–7F

**New files:**
- `src/navigation/NavigationEngine/RouteProgressTracker.ts`
- `src/components/navigation/NavigationVoiceToggle.tsx`
- `src/components/navigation/NavigationArrivalTime.tsx`
- `src/components/navigation/NavigationRoadName.tsx`
- `src/components/navigation/NavigationLaneGuidance.tsx`
- `src/hooks/useAnimatedMarkerWeb.ts`

**Modified files:**
- `app/(driver)/navigation.tsx`
- `src/components/map/Map.native.tsx`
- `src/components/map/Map.web.tsx`
- `src/components/navigation/NavigationHUD.tsx`
- `src/components/navigation/NavigationMap.tsx`
- `src/components/navigation/NavigationTurnBanner.tsx`
- `src/components/navigation/index.ts`
- `src/hooks/index.ts`
- `src/navigation/NavigationEngine/CameraController.ts`
- `src/navigation/NavigationEngine/NavigationEvents.ts`
- `src/navigation/NavigationEngine/NavigationHooks.ts`
- `src/navigation/NavigationEngine/NavigationStore.ts`
- `src/navigation/NavigationEngine/providers/NavigationProvider.tsx`
- `src/navigation/NavigationEngine/types.ts`

**Untouched the entire series (by design, verified repeatedly):** `AutoFitEngine.ts` (only its inputs changed, in 7B — the algorithm itself never did), `MarkerAnimator.ts` (reused, never modified), `RouteEngine.ts` (reused, never modified), `GPSManager.ts` (audited in 7F, found already adequate), every ride-lifecycle/`driverStore` file, `trip.tsx`, `navigate.tsx`.

---

## 10. Cross-cutting validation (all sub-phases)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean (0 errors) after every sub-phase, re-verified at the end of the series. |
| `npx eslint` | 0 errors introduced by this series on any file; every pre-existing warning/error on touched files confirmed via `git stash` comparison, not newly introduced. |
| No new dependencies | `package.json`/`package-lock.json` diff empty across all six sub-phases. |
| No duplicate camera/fitting/marker/routing logic | Every sub-phase reused the named engine module (`CameraAnimation`, `AutoFitEngine`, `MarkerAnimator`, `RouteEngine`) rather than reimplementing its math — verified by grep for duplicate function shapes/second implementations at each sub-phase's own close. |
| Screen design preserved | `navigation.tsx`'s pickup/arrival business-logic card (passenger info, call button, fare, slide-to-arrive/start) was never touched, across all six sub-phases — verified by diff at each step. |

---

## 11. Remaining known gaps (honest, not resolved by this series)

1. **`trip.tsx` and `navigate.tsx` remain entirely outside the engine.** Every camera/autofit/marker/HUD/route-progress/performance improvement in this whole series applies only to `app/(driver)/navigation.tsx`. This was an explicit, standing scope decision, not an oversight — but it means the Bible's "one navigation implementation" goal is still true for one of three driver screens.
2. **`fitDriverAccepted` has no live trigger** (7B) — correct, chrome-aware fitting logic with nothing that ever calls it, because that wiring lives in `CameraController` (off-limits in 7B) and no `NavigationMode` represents "Driver Accepted" as a distinct state.
3. **No true predictive dead-reckoning for markers** (7C) — deliberate scope boundary, not a missed item; existing interpolation-between-known-fixes already produces continuous motion given the position-duration/GPS-interval relationship.
4. **`NavigationBottomCard`'s "Arrival" and "Duration" fields still show the same value** (noticed in 7D, not fixed — out of "Navigation HUD" scope per the engine's own categorization, and the component has zero mount sites today regardless).
5. **Nothing in this entire series has been run on a physical device or simulator.** Every "feels right" judgment (camera damping factor, recenter duration, gesture reliability, reroute thresholds, actual FPS/battery/memory impact) is a documented starting point or a structural code-level argument, not a measurement. This is the single most consequential open item before any of this ships.

---

## 12. Final readiness score

**80/100** for the Navigation Engine on `app/(driver)/navigation.tsx`, across the full 7A–7F arc.

Rationale: this series consistently found that the engine's underlying math (camera, autofit, marker, route) was already well-built from earlier phases, and its own real job was closing specific, verifiable wiring/data gaps rather than rebuilding working systems — a pattern that held across all six sub-phases and kept the actual diff small and low-risk relative to the breadth of the brief. Every sub-phase's own constraints were verified, not just followed. The score is capped well short of "production ready" by two things that no amount of code-level care can substitute for: (1) zero on-device verification across the entire series — real camera feel, real frame rates, real battery draw, and real gesture behavior are all still unmeasured; and (2) two of the app's three driver navigation screens remain completely outside this engine, by standing scope decision, meaning the Bible's central "one navigation implementation" goal is still only one-third realized app-wide.
