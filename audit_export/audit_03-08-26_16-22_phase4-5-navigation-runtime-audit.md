# Phase 4.5 — Navigation Runtime Audit (Camera, Route, AutoFit, HUD, GPS)

**Date:** 2026-08-03
**Type:** Read-only architectural audit. No files were modified, refactored, or implemented as part of this task.
**Method:** Full reads of every engine file (`GPSManager.ts`, `NavigationStore.ts`, `NavigationModes.ts`, `NavigationEvents.ts`, `NavigationHooks.ts`, `hooks/useNavigation.ts`, `providers/NavigationProvider.tsx`, `types.ts`, `CameraAnimation.ts`, `NavigationMath.ts`, `CameraController.ts`, `AutoFitEngine.ts`, `RouteEngine.ts`, `MarkerAnimator.ts`), every `src/components/navigation/*` component, the shared `Map`/`Map.native`/`Map.web` components and marker system (`useAnimatedMarker.ts`, `mapAnimation.ts`, `useRoadSnappedVehicle.ts`, `routeSnapping.ts`), and every screen that touches a map (`app/(tabs)/navigate.tsx`, `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`, `PassengerHome.tsx`, `DriverDashboard.tsx`, `RidePlannerSheet.tsx`, `MapPickerModal.native.tsx`), plus targeted greps across `app/` and `src/` to confirm claims rather than assume them (e.g. whether `NavigationProvider` is mounted anywhere, whether any screen imports `useNavigationStore`).

---

## Headline finding (read this first)

**The Navigation Engine is not connected to the running application at all, in any screen, anywhere.** A repo-wide grep for `useNavigationStore`, `useNavigation(`, and `NavigationProvider` outside the engine's own folder returns **zero matches** in `app/` and zero matches in `src/` outside `src/navigation/NavigationEngine/` itself and the unmounted `src/components/navigation/` components. `NavigationProvider` is not mounted in `app/_layout.tsx` or anywhere else. Concretely, this means:

- `NavigationStore`'s `driverLocation`/`heading`/`speed`/`pickup`/`destination`/`mode`/`cameraState` fields are **permanently at their initial values** (`null`/`IDLE`/`OVERVIEW`) in the running app, forever, because nothing ever calls `preview()`/`driverToPickup()`/`followDriver()`/etc., and GPSManager's fixes are never forwarded into the store.
- `CameraController`, `AutoFitEngine`, and every `src/components/navigation/` component are fully built and internally correct (see Parts 7-8), but **inert** — there is no `<NavigationMap>` mounted anywhere for `attachMap` to receive a real MapView handle, so `CameraController.recompute()` never runs against real data.
- Every camera move the user actually sees today comes from **6 independent, hand-rolled implementations** that predate the engine and were never migrated (see Part 1).

Every other finding in this report should be read in that context: the question is not "does CameraController have bugs" (it doesn't, as far as static analysis can show) — it's "nothing calls it."

---

## PART 1 — Camera Ownership: every place the camera moves today

| # | File | Function/effect | Trigger | Purpose | Should remain? | CameraController should own instead? |
|---|---|---|---|---|---|---|
| 1 | `app/(tabs)/navigate.tsx` | `GPSManager.onFix` callback (inline `animateCamera`) | Every GPS fix, while `isNavigating && isAutoFollow` | Heading-up follow during standalone navigation (pitch 45°, alt 500, zoom 17), bearing falls back to route-bearing-to-next-step when GPS heading is unreliable near-stationary | No | **Yes** — this is exactly `CameraController`'s `DRIVER_TO_PICKUP`/`TRIP_IN_PROGRESS` follow behaviour, already implemented, unused |
| 2 | `app/(tabs)/navigate.tsx` | `calculateRoute()` | Route fetched | `fitToCoordinates` on the new route polyline | No | **Yes** — `AutoFitEngine.fitPreview` |
| 3 | `app/(tabs)/navigate.tsx` | `handleStartNavigation()` | User taps "Start" | One-shot `animateCamera` to an initial route-derived bearing before the first GPS fix arrives | No | Yes — this exact "ease in on entry" need is why `CameraController.recompute()` uses `ARRIVAL_DURATION` on a mode/cameraState transition |
| 4 | `app/(tabs)/navigate.tsx` | `handleClear()` | Clear button | `animateToRegion` back to current location | No | Yes — `navigation.cancel()`/`reset()` would drive this via mode transition |
| 5 | `app/(tabs)/navigate.tsx` | `handleCompassPress()` | Compass tap | `animateCamera({heading:0})` | No | Yes — `NavigationCompass` (built, unused) already calls `navigation.recenter()` for this |
| 6 | `app/(driver)/navigation.tsx` | GPS-fix-driven `useEffect` (`isNavigating && isAutoFollow`) | Every driver/heading state change | Same heading-up follow pattern as #1, no route-bearing fallback (uses raw heading only, defaults 0) | No | Yes |
| 7 | `app/(driver)/navigation.tsx` | `handleCompassPress` (inline) | Compass tap | `animateCamera({heading:0})` | No | Yes |
| 8 | `app/(driver)/trip.tsx` | GPS-fix-driven `useEffect` (`isAutoFollow`) | Every driver/heading/route-step change | Same pattern, WITH the route-bearing fallback (like #1) | No | Yes |
| 9 | `app/(driver)/trip.tsx` | Compass `onPress` (inline) | Compass tap | `animateCamera({heading:0})` | No | Yes |
| 10 | `src/features/passenger/PassengerHome.tsx` | `handleRecenter()` | Recenter button | One-shot `animateToRegion` to a fresh `GPSManager.getCurrentFix()` read | No | Yes — `navigation.recenter()` |
| 11 | `src/features/driver/DriverDashboard.tsx` | `GPSManager.onFix` callback | Every fix, while `isAutoFollow` | Plain `animateToRegion` recenter (no bearing/pitch — this screen shows the driver on a flat overview map, not turn-by-turn) | No | Yes — closest to `CameraController`'s `OFFLINE`/`IDLE` idle-overview case, though that case currently has no camera opinion at all (see Part 7 gap) |
| 12 | `src/features/passenger/components/MapPickerModal.native.tsx` | "go to my location" button | Button tap | One-shot `animateToRegion` | No | Yes — same "recenter" shape |
| 13 | `src/components/map/Map.native.tsx` | 3 internal `useEffect`s (center-on-user, center-on-driver, fit-to-markers) | Prop changes (`userLocation`/`driverLocation`/`pickup`/`destination`) | The shared `Map` component's **own built-in** camera-follow/auto-fit, active by default for every consumer that doesn't pass `disableInternalCamera` | Partially — this is `Map`'s pre-engine fallback behaviour, still legitimately used by every screen above except (in principle) a future engine-integrated one | These effects **are** duplicate camera logic in the strict sense (three more `animateToRegion`/`fitToCoordinates` call sites), but they're the *shared* implementation, not a screen-local one — flagged for awareness, not equivalent severity to #1-#12 |
| 14 | `src/components/map/Map.web.tsx` | 1 internal `useEffect` (fit-to-markers) | `pickup`/`destination` change | Same idea as #13, web-side, **unconditional** (no `driverLocation` gate at all, unlike native) | Same as #13 | Same as #13 |

**Total: 12 screen/component-local camera call sites (#1-#12) + 4 more inside the shared `Map` component itself (#13-#14) = 16 places the camera can move, 0 of which go through `CameraController`.**

`disableInternalCamera` (added during the last integration pass) exists specifically to let a future consumer opt `Map` out of #13/#14 — but since nothing passes it except my own unused `NavigationMap`, #13/#14 are live for every one of #1-#12's screens today, **running in parallel with** each screen's own manual calls. E.g. in `navigate.tsx`, both the screen's own `fitToCoordinates` (#2) and `Map.native.tsx`'s internal one (#13) can fire for the same pickup/destination change — whichever effect runs last wins, silently.

---

## PART 2 — Camera Follow Quality

| Question | Answer |
|---|---|
| Does the camera actually follow the vehicle? | Yes, in the 3 nav screens + `DriverDashboard`, via hand-rolled `animateCamera`/`animateToRegion` on every GPS fix. |
| Does it remain behind the driver? | No — none of the 12 screen-local call sites implement a follow-anchor offset (vehicle at 65-70% down screen). Every one centers the vehicle dead-center. `CameraController`'s `followAnchorRatio`/`calculateForwardOffset`/look-ahead exists specifically to fix this and is unused. |
| Does it rotate smoothly? | The 3 nav screens pass a 700ms duration to each `animateCamera` call, so individual transitions are eased by the native SDK — but each new GPS fix (as often as every 1s per `driverBestNavigation`) restarts a fresh 700ms animation with no jitter/movement-threshold gating, so rapid fixes can produce overlapping/retargeted animations. |
| Does it rotate instantly? | No single call is instant, but back-to-back GPS-triggered calls (see above) can visually resemble stutter under poor GPS conditions since nothing gates "is this fix's heading change big enough to bother re-rotating for." |
| Does it jitter? | Likely, under normal GPS noise — there is no equivalent of `CameraAnimation.calculateRotationThreshold`/`shouldRotate` gating any of the 12 call sites. Every fix triggers a fresh `animateCamera`. |
| Does it snap? | No evidence of an un-eased jump; all calls pass an explicit duration. |
| Does it overshoot? | Not evidenced — these are plain `animateCamera` calls with a duration, no spring/bounce physics involved on either side. |
| Does it lag? | The camera reacts to the **raw** fix position, not a predicted future position — Bible: "Camera follows NOT the current GPS... predict future movement... this removes shaking" is not implemented anywhere in the live app. `CameraController`'s look-ahead (`calculateLookAheadDistance`/`calculateLookAheadPoint`) exists and is unused. |
| Does it recenter too often? | Every GPS fix (up to 1/second) triggers a full `animateCamera` call in all 3 nav screens with zero movement-threshold gating — by the Bible's own standard ("no shaking"), this is the single most likely source of a jittery feel in the live app today. |
| Does GPS jitter move the camera? | Yes — see above, nothing filters small/noisy movements before re-animating. |
| Does the marker rotate separately? | Yes, and correctly: markers rotate via `useAnimatedMarker`'s own Reanimated shortest-arc tween (`shortestRotation`, `@/lib/mapAnimation`), fully independent of whatever the camera happens to be doing. This part is solid. |
| Does the camera rotate separately? | Yes — the screen's own `animateCamera({heading})` calls are independent of the marker's rotation animation. Two independent rotation systems currently coexist (marker via Reanimated, camera via react-native-maps' native camera animation) with no shared timing/easing — they are not guaranteed to visually agree moment-to-moment, though in practice both track the same underlying heading value so they converge to the same place. |
| Does bearing smoothing exist? | Yes, but only **once**, at the GPS layer (`GPSManager`'s `BEARING_SMOOTHING_FACTOR` exponential filter) — every screen and the camera consume this already-smoothed heading. There is no *additional* camera-level smoothing (`CameraAnimation.smoothHeading`/`interpolateBearing` exist, unused). |
| Is interpolation smooth? | Position: linear (`animateCamera`'s native easing, or Reanimated's `Easing.linear` for markers). Not visibly janky, but not the Bible's specified predictive/eased-in-on-entry treatment either. |
| Are animations interruptible? | Yes, implicitly — react-native-maps' `animateCamera` retargets from wherever the camera currently is if called again mid-flight (standard native SDK behaviour), not from a stored "from" pose the app tracks itself. |
| Can two camera animations run simultaneously? | Effectively yes, in the specific sense flagged in Part 1 #13/#14: a screen's own `animateCamera`/`fitToCoordinates` call and `Map`'s internal built-in effect can both fire for the same underlying prop change, racing for the last word. Not two *engine* animations (there's only one non-engine mechanism active per screen), but two *code paths* nonetheless. |
| Does camera ownership change between screens? | Yes, structurally: each of the 3 nav screens keeps its own `mapRef`, its own `isAutoFollow`/`lastInteraction` state, and its own copy of the "resume auto-follow after 5s" timer — three independent, near-identical re-implementations of the same policy (see Part 6 for the exact duplication). |

**Verdict: the current camera is functional but is the pre-engine implementation exactly as it was before this whole project started (Phases 1-4 built a complete replacement; Phase "integration" — the previous task — deliberately declined to wire it in for exactly the regression-risk reasons documented in `audit_03-08-26_16-11_navigation-engine-integration.md`). No camera-follow quality issue found here is new; all of them are pre-existing and are the reason `CameraController` was commissioned in the first place.**

---

## PART 3 — Auto Fit

**Every use of `fitToCoordinates`/`fitBounds` found:**

1. `Map.native.tsx`'s internal effect (`edgePadding: {top:100, right:50, bottom:300, left:50}`, hardcoded, always this value regardless of what's actually on screen).
2. `Map.web.tsx`'s internal effect (same padding values, hardcoded, and — unlike native — **not even gated by whether a driver is present**, so it can fight with a driver-follow scenario on web).
3. `app/(tabs)/navigate.tsx`'s manual call after `calculateRoute()` (`{top:100, right:50, bottom:100, left:50}` — a *different* hardcoded padding than #1/#2, for no evident reason beyond having been written independently).

That is **3 separate, independently-hardcoded auto-fit implementations**, each with slightly different padding constants, none of them derived from anything actually on screen.

| Question | Answer |
|---|---|
| How do pickup & drop-off currently fit? | Via whichever of the 3 implementations above runs for the given screen — always a flat constant padding, never measured. |
| Is the driver centered? | No screen currently auto-fits pickup+destination+**driver** together at all — `AutoFitEngine.fitDriverAccepted` (pickup+driver) and the Bible's "Driver Accepted" moment have zero callers anywhere. |
| Does the route fit? | `navigate.tsx` fits the endpoints, not the full polyline (`fitToCoordinates` is called with `route.coordinates`, so actually yes for that one screen — the *only* one of the 3 that fits the true route shape rather than just two points). |
| Are bottom sheets considered? | **No, nowhere.** All 3 hardcoded paddings are static; none references `trip.tsx`'s bottom card height (which itself varies, 180↔420px, collapsed/expanded) or any other sheet. `AutoFitEngine`'s `AutoFitChrome`/`mergeChromeIntoPadding` is built exactly to fix this and has zero callers. |
| Is the top HUD considered? | No — same reasoning; none of the 3 implementations know the turn-banner exists. |
| Would landscape work? | Not applicable — `app.json` locks `orientation: "portrait"` at the OS level; landscape cannot occur in this app today. |
| Do collapsed/expanded cards affect padding? | No — confirmed above; `trip.tsx`'s own `isExpanded` state never feeds into any fit calculation (there isn't one active while `driverLocation` is present anyway — `Map.native.tsx`'s internal fit effect explicitly skips when a driver is set). |
| Are safe areas respected? | Indirectly, by accident: the hardcoded padding constants (`top:100`, `bottom:300`) happen to be generous enough to usually clear a notch/home-indicator on typical devices, but this is not a safe-area-aware calculation — `AutoFitChrome.safeArea` (built, correct, `useSafeAreaInsets`-shaped) is unused. |
| Duplicated implementations? | **Yes — 3, confirmed above (Part 3's opening list). `AutoFitEngine.ts` is a 4th, correct, unified implementation with zero callers.** |

---

## PART 4 — Driver Marker

| Question | Answer |
|---|---|
| How often does the marker update? | On every accepted GPS fix — up to 1/second at `driverBestNavigation` (`distanceIntervalMeters: 1`). |
| How does rotation work? | `useAnimatedMarker` (`src/hooks/`) drives a Reanimated shared value via `withTiming`, rotating along the shortest arc (`shortestRotation`, `@/lib/mapAnimation`) with cubic in/out easing, default 1800ms. |
| How does interpolation work? | Position: linear `withTiming` between the previous and new coordinate. Heading: shortest-arc `withTiming` as above. Both run on the UI thread (true 60fps, no JS-thread bottleneck). |
| Does the marker rotate independently of the camera? | Yes (see Part 2). |
| Does the camera rotate independently of the marker? | Yes (see Part 2). |
| Is movement smooth? | Yes — this is the one part of the whole navigation runtime that is unambiguously solid, both in design and in practice (Reanimated worklets, not JS-thread `Animated.timing`). |
| Do GPS spikes cause jumps? | No — `useAnimatedMarker` always retargets `withTiming` from the marker's current (possibly mid-flight) animated value, never resets to a raw fix instantly; GPSManager also already rejects implausible-speed fixes before they ever reach a listener (see Part 1's quality-scoring gates). |
| Is movement time-based or frame-based? | Time-based (`withTiming(value, {duration})`), correctly. |
| Can animation be interrupted? | Yes — a newer fix arriving mid-animation retargets cleanly (documented and true; `MarkerAnimator.ts`'s `retargetMarkerTransition`, built in a later phase, models this same behaviour for a hypothetical second renderer but is not itself in the render path — the *real* Reanimated hook already does this natively). |
| Does marker smoothing already exist? | Yes, both at the GPS layer (bearing smoothing in `GPSManager`) and at the render layer (`useAnimatedMarker`'s own tweening) — this is correctly layered, not duplicated. |

**Verdict: no gap found. The marker system is the most mature, most "Google-Maps-quality" piece of the entire navigation runtime, and it predates this whole engine project.** `MarkerAnimator.ts` (engine) is a parallel, currently-unused pure-math twin of the real thing — see Part 8-equivalent note below.

---

## PART 5 — Route Progress

| Question | Answer |
|---|---|
| Who calculates distance/duration remaining? | `RouteEngine.computeRouteProgress` exists and is correct (snaps to path, sums traversed segment lengths, scales duration by fraction complete) — **zero callers**. Every screen instead computes its own local "distance to `step.endLocation`" via `calculateDistanceMeters`, independently, 3 times (`navigate.tsx`, `trip.tsx`, `navigation.tsx` — nearly identical `useEffect` blocks). |
| Who calculates current/next step? | Same story: each of the 3 screens keeps its own `activeStepIndex` state and its own step-advance `useEffect` (advance when within 25-30m of the current step's end — the threshold itself differs slightly between screens: 25m in `navigation.tsx`/`trip.tsx`, 30m in `navigate.tsx`, another small inconsistency from independent authorship). `RouteEngine`'s `findActiveStepIndex` (internal to `computeRouteProgress`) is the engine equivalent, unused. |
| Second-next step? | Not computed anywhere, screen or engine. Genuine gap on both sides. |
| Distance to next maneuver? | Computed locally, 3 times, as above — not from `RouteEngine` (which, as flagged in the previous integration report, doesn't expose *per-step* remaining distance at all today — only whole-route remaining). |
| Arrival ETA? | Two different sources depending on screen: `trip.tsx`/`navigation.tsx` derive it from a **rough heuristic** (`Math.ceil(distanceKm * 2)` minutes — literally "2 minutes per km", not from Google's own duration at all); `navigate.tsx` shows Google's actual `route.duration.text` (now via `RouteEngine`'s `distanceText`/`durationText` passthrough, per the last integration pass). This is a real, pre-existing inconsistency between screens, not introduced by the engine. |
| Who owns rerouting? | **Nobody, anywhere.** `RouteEngine.shouldReroute`/`evaluateReroute` are fully implemented (Bible's exact "moved 30m? off-route? fetch" flowchart) and have zero callers. None of the 3 nav screens ever refetch a route after the initial fetch — if a driver goes off the originally-fetched path, the app will happily keep drawing/following the original polyline forever. |
| Who detects off-route? | Nobody. Same gap as above. |
| Who advances navigation steps? | Each screen, locally and independently (see above). |
| Is there duplicate logic? | **Yes, unambiguously** — 3 near-identical step-advance/distance-to-maneuver effects, differing only in small threshold constants, each reimplementing what `RouteEngine.computeRouteProgress` already does (modulo the per-step-remaining-distance gap noted above). |

---

## PART 6 — Navigation HUD

| Component | Exists in engine (`src/components/navigation/`)? | Duplicated per-screen today? |
|---|---|---|
| Turn Banner | `NavigationTurnBanner` (reads `NavigationStore` directly) | **Yes, 3x** — `navigate.tsx`, `trip.tsx`, `navigation.tsx` each hand-roll their own turn-banner JSX (icon + "NEXT"/"IN" labels), visually similar but not identical (different corner radii, different label casing, `trip.tsx` uses inline `style={}` while the other two use NativeWind `className`). |
| Speed Widget | `NavigationSpeedWidget` | **Yes, 2x** — `navigate.tsx` and `trip.tsx` each render their own speed card; `navigation.tsx` has no speed display at all (inconsistent feature parity between the 3 "same" navigation screens). |
| Compass | `NavigationCompass` | **Yes, 3x**, but genuinely shared underneath: all 3 use the same `CompassButton` (`@/components/map`) — the *button* isn't duplicated, only the positioning/wiring around it (`onPress` calling the screen's own inline `animateCamera`, per Part 1). |
| Bottom Card | `NavigationBottomCard` | **Yes, 2x, and richer than the generic version** — `trip.tsx`'s bottom card (passenger avatar/rating/call/chat/fare/pickup/dropoff, collapsed↔expanded) and `navigation.tsx`'s passenger `Card` are both bespoke and *not* interchangeable with the generic engine component without a real feature gap (see the prior integration report's "Remaining work" section — still accurate, unchanged). |
| Controls | `NavigationControls` | Partially — recenter/zoom exist ad hoc (`showZoomControls` prop on `Map`) but not as a unified floating stack; no screen has a "layers" toggle at all. |
| Arrival Card | `NavigationArrivalCard` | Conceptually yes (`navigation.tsx`'s "Waiting for Passenger" card + slide-to-start, `trip.tsx`'s slide-to-complete) but with real passenger-specific content the generic card doesn't carry. |

**Shared, non-duplicated pieces (a positive finding):** `useTurnPreview` (`src/hooks/`) — the pulse animation and red/amber/primary color escalation — and `getManeuverIconName` (`src/lib/maneuverIcon.ts`) are already correctly centralized and reused identically by all 3 screens. Only the surrounding *markup* is copy-pasted, not this underlying logic.

**Data sources today, all local, none from the engine:**
- Turn instruction/distance: local `activeStepIndex` + local `calculateDistanceMeters` (Part 5).
- Speed: directly from the `GPSManager.onFix` callback's `fix.speed`, converted to km/h inline in 2 of the 3 screens (a 3rd small inconsistency: `navigation.tsx` never even tracks speed).
- ETA/distance stats: split between a rough heuristic and `RouteEngine`'s passthrough text (Part 5).

**Are the new HUD components reusable?** Yes, as built — each is self-contained, reads only `NavigationHooks` selectors, renders `null` gracefully with no data. The gap is entirely "nothing mounts them," not a defect in the components themselves.

---

## PART 7 — CameraController Audit

**Implemented (verified correct by re-reading the full file):**
- `CAMERA_PROFILES` for all 9 `NavigationMode`s, values traceable to the Bible/Architecture.md table.
- `computeTargetPose`'s precedence (mode-forced auto-fit for `PREVIEW`/`MATCHING`/`TRIP_COMPLETED`, `IDLE`/`OFFLINE` no-op, `cameraState` override for `FREE_EXPLORE`/`FIT_ROUTE`/`OVERVIEW`, follow/arrival fallback otherwise).
- Look-ahead + forward-offset follow centering (`resolveFollowCenter`), delegating to `CameraAnimation`.
- Jitter gating (`shouldAnimate`/`shouldRotate`/zoom-epsilon) and duration selection (snap-on-first-apply, `ARRIVAL_DURATION` on transition, `calculateAnimationDuration` otherwise).
- `attachMap`/`detachMap`/`setViewportSize`/`setChrome`/`getCurrentPose` — a complete, clean public surface.
- Delegation to `AutoFitEngine` for every fit-style mode (no duplicated bounds/zoom math — confirmed via the previous phase's refactor).

**Stubbed/incomplete:**
- Nothing inside `CameraController.ts` itself is a stub — every code path has a real body. The "incompleteness" is entirely external (nothing calls `attachMap`, nothing populates the store fields it reads).

**Unused (dead code within an otherwise-complete file):**
- `CameraAnimation.shouldCancelAnimation` is exported and documented as the general "should this in-flight transition restart" primitive, but `CameraController.recompute()` re-derives the same decision inline (its own `transitioned`/threshold logic) rather than calling it — a small, harmless inconsistency worth a future cleanup pass, not a bug.
- `fitDriverAccepted` (in `AutoFitEngine`, callable from `CameraController` in principle) has no call site — `computeTargetPose` never invokes it because nothing in `NavigationModes.ts` represents the Bible's "Driver Accepted" moment as a distinct state (documented, deliberate, per Architecture.md's mode-reconciliation note).

**Missing before this can replace every screen's camera logic:**
1. **A live `<NavigationMap>` mounted somewhere** — the actual blocker. Nothing else in this list matters until this exists.
2. **`NavigationProvider` wired to forward `GPSManager` fixes into `NavigationStore`** (`driverLocation`/`heading`/`speed`/`gpsState`) — without this, `CameraController` would compute poses against permanently-null data even if attached.
3. **Something calling the `NavigationActions`** (`preview`/`driverToPickup`/`startTrip`/etc.) from the real trip lifecycle (`driverStore`/`rideStore` state changes) — today `mode` never leaves `IDLE`.
4. **Tuning verification against current values** — `navigate.tsx`/`trip.tsx`/`navigation.tsx` use pitch 45°/zoom 17/altitude 500 today; `CameraController`'s `DRIVER_TO_PICKUP` profile uses pitch 50°/zoom 17.5 (Bible-exact values, deliberately not matched to the ad hoc screens — flagged already in the prior integration report as the reason camera swap-over wasn't done then).
5. **A movement-threshold answer for the "camera recenters too often" finding in Part 2** — `CameraController` already has this (`calculateMovementThreshold`/`calculateRotationThreshold`), so wiring it in would directly *fix* that finding, not just relocate it — worth calling out as a concrete quality win once connected, not just a parity risk.

---

## PART 8 — AutoFitEngine Audit

**Implemented:** `fitPoints` (core), `fitPreview`, `fitDriverAccepted`, `fitCompleted`, `mergeChromeIntoPadding`, `DEFAULT_CHROME` — all pure, all delegate correctly to `NavigationMath.computeBounds` and `CameraAnimation.calculateZoomToFitBounds`, no internal duplication.

**Unused:** the entire file — zero callers outside `CameraController`, which itself has zero real callers (see Part 7). `fitDriverAccepted` additionally has no caller *inside* `CameraController` either (see above).

**Incomplete:** `AutoFitChrome` is a fully-modeled, correct concept (safe area, bottom sheet height, floating buttons, nav banner height, map controls width, extra padding) — but nothing in the app ever calls `CameraController.setChrome(...)` with real measured values. Even once wired to a screen, auto-fit padding would default to the flat `DEFAULT_EDGE_PADDING`-equivalent constant until a HUD component's `onLayout` reports real sizes — a second, smaller wiring step beyond just mounting `NavigationMap`.

**Can it replace every `fitToCoordinates()` call found in Part 3?**
- The 3 nav screens' fit calls: yes, directly — `fitPreview`/`fitCompleted` cover exactly those shapes (pickup+destination+route; vehicle+destination).
- `Map.native.tsx`/`Map.web.tsx`'s own internal fit effects: **not by calling `AutoFitEngine` from inside those files** (that would reintroduce a second camera-owner inside the "dumb" rendering component, contradicting the Bible) — the correct fix is for every consumer to eventually pass `disableInternalCamera` and let `NavigationMap`/`CameraController`/`AutoFitEngine` own it exclusively, which is exactly what `NavigationMap.tsx` already does for itself. The blocker is the same as Part 7: nothing renders `NavigationMap` in place of a raw `Map` yet.

---

## PART 9 — Google Maps Quality Checklist

| Item | Verdict | Why |
|---|---|---|
| Camera always behind vehicle (65-70% anchor) | **FAIL** | No screen implements a follow-anchor offset; `CameraController.followAnchorRatio`/look-ahead exists, unused (Part 2). |
| Vehicle always faces north while driving, road rotates | **PARTIAL** | The *marker* stays visually fixed relative to the camera bearing in all 3 nav screens (camera bearing = vehicle heading), which achieves the Bible's visual effect today — but only because each screen manually keeps `heading` in the `animateCamera` call in sync with the marker's own heading; there is no single owner guaranteeing this, so it's correct by convention/coincidence across 3 copies of the same code, not by construction. |
| Road rotates instead of marker | **PASS** | True in all 3 nav screens as currently written. |
| Smooth bearing interpolation | **PARTIAL** | Marker: yes (Reanimated). Camera: each fix retriggers a fresh 700ms `animateCamera` with no gating — smooth per-call, but not smoothed *across* calls (Part 2). |
| Smooth pitch transitions | **PASS (trivially)** | Pitch is a constant per screen (45°), never transitions at all — nothing to be non-smooth. |
| Dynamic zoom | **FAIL** | All 3 screens use a fixed zoom (17). `CameraController`/`NavigationMath.dynamicZoomForSpeed` (Bible's walking/city/highway/very-fast table) exists, unused. |
| Dynamic pitch | **FAIL** | Fixed 45° everywhere. `dynamicPitchForMode` exists, unused. |
| Look-ahead camera | **FAIL** | Camera always centers the raw fix, never a predicted point (Part 2). `calculateLookAheadPoint` exists, unused. |
| Predictive turning | **FAIL** | No look-ahead means no predictive turn anticipation either. |
| Smooth recenter | **PARTIAL** | The 5-second "resume auto-follow" pattern works and is smooth per-call, but is copy-pasted 3 times with identical timing constants rather than owned once. |
| Speed-based zoom | **FAIL** | Same as "Dynamic zoom" above. |
| Speed-based pitch | **FAIL** | Same as "Dynamic pitch" above. |
| GPS smoothing | **PASS** | `GPSManager`'s bearing smoothing + quality scoring is real, live, and used by every screen today. |
| Route smoothing | **N/A / not evaluated** | No route-smoothing concept exists in the Bible beyond polyline decoding, which is correct end-to-end. |
| No camera jitter | **FAIL (likely)** | No movement/rotation threshold gates any of the 12 screen-local camera calls (Part 2). |
| No marker jitter | **PASS** | `useAnimatedMarker` + GPS-layer glitch rejection handle this correctly. |
| One camera owner | **FAIL** | 16 independent call sites found (Part 1); `CameraController` has zero real callers. |
| One GPS owner | **PASS** | Fully true — `GPSManager` is the sole owner, verified by two independent greps (this audit and the prior one). |
| One Route owner | **PASS (fetching only)** | `RouteEngine` is the sole *fetch* owner as of the last integration pass. Progress-tracking/rerouting logic is still triplicated at the screen level (Part 5) even though fetching itself is centralized — this is a nuanced but real distinction. |
| One Navigation Runtime | **FAIL** | The engine exists as a complete, parallel, unconsumed system alongside the real, running, pre-engine implementation. There is exactly one runtime *in production use*, and it is not the engine. |

**Score on this checklist: 5 PASS / 5 PARTIAL / 9 FAIL / 1 N/A (of 20).**

---

## PART 10 — Driver Visibility

| Question | Answer |
|---|---|
| Which screens display the driver? | `navigate.tsx`, `trip.tsx`, `navigation.tsx` (the Transporter's own screens, showing themselves), and (from the Customer side) `PassengerHome.tsx` shows nearby/assigned drivers via `Map`'s `vehicles`/`driverLocation` props. |
| Which screens hide the driver? | None outright, but `PREVIEW`/`MATCHING`-equivalent moments in the real app (before a driver is matched) obviously show no driver marker because there isn't one yet — expected, not a defect. |
| Can the driver disappear? | **Yes, transiently.** In all 3 nav screens and `DriverDashboard`, a manual pan/pinch sets `isAutoFollow=false`; the driver marker itself never disappears (it's still drawn), but it can be panned **off-screen** by the user and stays off-screen for up to 5 seconds (the hardcoded resume-auto-follow delay) before the camera snaps back. |
| Can the marker leave the screen? | Yes — see above; this is a direct consequence of there being no auto-fit/keep-visible guarantee independent of the follow-camera resuming. |
| Does AutoFit keep the driver visible? | Not today — `AutoFitEngine` is unused (Parts 3, 8). |
| Does CameraController keep the driver visible? | Not today — unused (Part 7). If wired, `CameraController`'s follow modes would recenter on the driver on every accepted fix once `FREE_EXPLORE`/`FOLLOW_DRIVER` cameraState logic is live, which is a strictly stronger guarantee than the current ad hoc 5-second timer, but only during modes with an active follow (not during `PREVIEW`/`MATCHING`, where nothing centers the driver at all even in the engine's current design — `fitPreview` only includes pickup/destination/route, not a matched-but-not-yet-navigating driver, and `fitDriverAccepted`, which would, has no caller — see Part 3/7). |
| Does rerouting preserve visibility? | N/A — rerouting doesn't exist anywhere yet (Part 5). |
| Does recenter preserve visibility? | Yes — every screen's explicit recenter/compass action (and the 5s auto-resume) does bring the driver back into view; this part works, just not instantly/continuously. |

**Verdict: the driver can go off-screen for up to ~5 seconds after any manual map interaction, on every screen that shows one. Nothing today enforces the Bible's "driver marker MUST ALWAYS remain visible" as a hard invariant — it's an emergent side effect of a resume-follow timer, not a guarantee.**

---

# Deliverables

## 1. Camera Audit Report
See Parts 1-2. **16 independent camera-moving call sites, 0 through the engine.**

## 2. AutoFit Audit Report
See Part 3 + Part 8. **3 independently-hardcoded fit implementations (none chrome-aware), plus a 4th correct-but-unused engine implementation.**

## 3. Navigation HUD Audit Report
See Part 6. **Turn banner (3x), speed widget (2x, inconsistent), bottom card (2x, richer than the engine's generic version) duplicated at the markup level; underlying pulse/color/icon logic already correctly shared via `useTurnPreview`/`getManeuverIconName`.**

## 4. Driver Visibility Audit Report
See Part 10. **Driver can be panned off-screen for up to 5 seconds; no hard "always visible" guarantee exists anywhere, engine or otherwise.**

## 5. Google Maps Comparison
See Part 9. **5 PASS / 5 PARTIAL / 9 FAIL / 1 N/A out of 20 checklist items.**

## 6. Duplicate Camera Logic Report
- 12 screen/component-local `animateCamera`/`animateToRegion`/`fitToCoordinates` call sites (Part 1, rows 1-12).
- 4 more inside the shared `Map` component's own internal effects (Part 1, rows 13-14) — architecturally different (shared, not per-screen) but still literal duplicate camera-moving code paths running in parallel with rows 1-12 on every affected screen.
- 3 independently-hardcoded auto-fit padding constants (Part 3).
- 3 near-identical "resume auto-follow after 5s" timers (Part 2/6).
- 3 near-identical step-advance/distance-to-maneuver effects (Part 5).
- 3 near-identical hand-rolled turn-banner JSX blocks (Part 6).

## 7. Missing Features Report
- Camera: predictive look-ahead, dynamic zoom/pitch by speed, follow-anchor offset, jitter thresholds — all built in `CameraController`/`CameraAnimation`, all unused.
- Route: rerouting/off-route detection (`RouteEngine.shouldReroute`/`evaluateReroute`) — built, zero callers, so functionally **rerouting does not exist in the app today at all**.
- Route: per-step remaining distance (needed for a real "distance to next turn" countdown) — not built anywhere, engine or screen (screens fake it with `calculateDistanceMeters` to the step's fixed endpoint, which isn't the same thing and never reaches exactly 0 in a way that guarantees the step-advance fires cleanly).
- Second-next-step lookahead for the HUD — not built anywhere.
- `NavigationVoice` (Bible-recommended component) — not built at all, any phase.
- Chrome-aware auto-fit padding in practice — the mechanism (`AutoFitChrome`) exists; nothing calls `setChrome` with real values.
- `NavigationProvider` GPS→Store wiring — the single largest missing piece; without it, nothing above can come alive no matter how complete it is in isolation.

## 8. Recommended Build Order

1. **Wire `NavigationProvider` to `GPSManager` and `NavigationStore`** — subscribe to `GPSManager.on('LOCATION_UPDATED', ...)`, forward into the store's `driverLocation`/`heading`/`speed`/`gpsState`. Mount `NavigationProvider` in `app/_layout.tsx`. Nothing else on this list can be meaningfully tested without this.
2. **Wire trip-lifecycle actions** — call `navigation.preview()`/`driverToPickup()`/`startTrip()`/etc. from the existing `driverStore`/`rideStore` status transitions, so `mode` actually moves off `IDLE`.
3. **Pick the lowest-stakes screen first** (`app/(tabs)/navigate.tsx`, per its own "dev/testing" designation in `AGENTS.md`) and replace its `<Map>` with `<NavigationMap>`, removing that screen's local `animateCamera`/`fitToCoordinates` calls. Manually verify camera feel on a device before touching the other two.
4. **Tune `CameraController`'s profiles against the verified-acceptable feel** from step 3 (it doesn't have to match the *old* ad hoc values — it has to feel right, per the Bible).
5. **Repeat step 3 for `app/(driver)/navigation.tsx` and `app/(driver)/trip.tsx`**, one at a time, each independently verified.
6. **Wire `RouteEngine.computeRouteProgress`/`shouldReroute` into `NavigationProvider`**, retiring each screen's local step-advance effect once its data is confirmed to match.
7. **Extend `NavigationBottomCard`/`NavigationArrivalCard` with slots for the driver-specific content** (passenger card, fare, call/chat) identified in Part 6, or accept the bespoke cards permanently and only swap their data source.
8. **Wire `setChrome`/`setViewportSize` from real component layout** (`onLayout` on the turn banner, bottom sheet, etc.) so `AutoFitEngine` padding stops being a guess.
9. Only after all of the above: consider deleting the now-fully-superseded per-screen camera/fit/step-advance code (per the prior integration report's own instruction — remove duplicated logic only after confirmed parity).

## 9. Risk Assessment

| Risk | Severity | Notes |
|---|---|---|
| Wiring `NavigationProvider` incorrectly double-subscribes to `GPSManager` | Low | `GPSManager`'s `acquire`/`release` reference counting and idempotent `start()` were built exactly to make this safe. |
| Camera "feel" regression when swapping any nav screen onto `CameraController` | **High** | Explicitly why the previous integration pass declined to do this; still the single biggest risk in this whole effort — must be verified on a real device, not just by reading code. |
| Introducing rerouting for the first time changes trip behaviour visibly | Medium | Currently the app never reroutes; turning that on is a genuine new behaviour (arguably a bug fix, but user-visible either way) — should be flagged as an intentional change, not bundled silently into a "migration." |
| Bottom-card feature gap (passenger/fare/call/chat) if swapped naively | **High** | Already identified in the prior report; repeated here because it's the most likely place a naive "just wire it in" pass would silently regress a real, currently-working feature. |
| `Map.native.tsx`/`Map.web.tsx`'s internal fit/follow effects firing alongside a newly-wired `CameraController` | Medium | Mitigated by `disableInternalCamera`, but only if every migrated screen remembers to set it — an easy step to forget screen-by-screen. |

## 10. Final Readiness Score

**28 / 100.**

Rationale: every individual engine module (`GPSManager`, `CameraAnimation`, `NavigationMath`, `CameraController`, `AutoFitEngine`, `RouteEngine`, `MarkerAnimator`, the `src/components/navigation/` HUD set) is internally well-built, correctly layered, and largely free of *internal* duplication or stubs — that alone would justify a much higher score for "engine quality in isolation." But readiness is asked for the **Navigation Runtime**, not the engine-in-a-vacuum, and by that measure: GPS is the only one of the six Bible-mandated ownership areas that is actually, verifiably, exclusively owned by the engine in the running app. Camera, Route-progress/rerouting, Auto Fit, and HUD are all still owned by pre-existing, triplicated, ad hoc screen code, with the engine sitting fully-built but completely disconnected beside them. The score reflects "one working GPS pillar out of six," heavily weighted down by the fact that the single most important connective piece — `NavigationProvider` actually forwarding data into `NavigationStore` — does not exist yet, which is what makes every other finished module inert.
