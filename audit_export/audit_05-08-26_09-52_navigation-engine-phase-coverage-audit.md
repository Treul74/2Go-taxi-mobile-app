# Navigation Engine Phase Coverage Audit

**Date:** 2026-08-05
**Type:** Read-only coverage audit. No code modified, no refactor, no redesign — every finding below is a classification of code that already exists, read in full from the current working tree.
**Read first:** `AGENTS.md` (including the "🔒 Protected Features (Regression Protection)" section), `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`.

The systems named in AGENTS.md's Protected Features list (`GPSManager`, `NavigationProvider`, `NavigationStore`, `RouteEngine`, `NavigationMap`, `CameraController`, `AutoFitEngine`, `NavigationHUD`, `MarkerAnimator`) are LOCKED. Nothing below modifies them — this is a classification pass only.

---

## 1. Phase Completion Matrix

| Phase | Completion | Percentage |
|---|---|---:|
| 7A — Professional Camera Follow | Complete | ~95% |
| 7B — Professional AutoFit | Complete | ~90% |
| 7C — Marker Animation | Partial | ~75% |
| 7D — Navigation HUD | Partial | ~80% (components complete; two of the Bible's named pieces are unmounted anywhere in the app) |
| 7E — Route Progress & Rerouting | Complete | ~95% |
| 7F — Performance Optimization | Partial | ~65% |

None of the six phases are "Missing" outright — every phase has real, working implementation. The gaps that exist are narrower than "rebuild this phase": a few specific sub-items, plus one structural gap that cuts across all of them (see §"Architecture Compliance" below).

---

## 2. Feature Matrix

### Phase 7A — Professional Camera Follow

| Feature | Status | File / Function |
|---|---|---|
| Camera follow | **Implemented** | `CameraController.ts` — `followOrArrivalPose()`, `resolveFollowCenter()` (DRIVER_TO_PICKUP/TRIP_IN_PROGRESS branches) |
| Smooth interpolation | **Implemented** | `CameraAnimation.ts` — `interpolateCameraState`, `lerp`, `interpolateZoom`/`interpolatePitch`; applied via `CameraController.dampPose()` |
| Bearing smoothing | **Implemented** | `CameraAnimation.ts` — `interpolateBearing`/`shortestBearing` (camera); `smoothHeading` (raw-fix low-pass, also reused by `GPSManager.ts` and `MarkerAnimator.smoothMarkerHeading`) |
| Rotation smoothing | **Implemented** | `CameraController.ts` — `dampPose()`'s bearing branch uses `interpolateBearing`, gated by `calculateRotationThreshold` |
| Dynamic look-ahead | **Implemented** | `CameraAnimation.ts` — `calculateLookAheadDistance`/`calculateLookAheadPoint`, called from `CameraController.resolveFollowCenter()` |
| Driver anchor positioning | **Implemented** | `CameraAnimation.calculateForwardOffset()` + `CameraProfile.followAnchorRatio` (0.68 for DRIVER_TO_PICKUP/TRIP_IN_PROGRESS, per the Bible's 65-70%) |
| Dynamic zoom | **Implemented** | `NavigationMath.dynamicZoomForSpeed()` (Bible's walking/city/highway/very-fast table), called from `CameraController.followOrArrivalPose()` |
| Dynamic pitch | **Implemented** | `NavigationMath.dynamicPitchForMode()` (Bible's 45-55° driving range) |
| Camera damping | **Implemented** | `CameraAnimation.applyCameraDamping()`, applied in `CameraController.dampPose()` (`CAMERA_DAMPING_FACTOR`) |
| Camera easing | **Implemented** | `CameraAnimation.ts` — `easeIn`/`easeOut`/`easeInOut`/`smoothStep`, used by `interpolateZoom`/`interpolatePitch`/`interpolateCameraState` |
| Rotation anticipation | **Missing** | No function anywhere biases camera bearing toward an *upcoming* route-step's turn direction ahead of the driver reaching it — `CameraAnimation.ts`/`CameraController.ts` only react to the driver's *current* heading, never `RouteStep`/`useNextStep()` data |
| Camera dead-zone | **Partial** | `CameraAnimation.calculateDeadZone()` exists (zoom + GPS-accuracy-aware radius) but is never called from `CameraController.ts` — the actual gating in production is `calculateMovementThreshold`/`calculateRotationThreshold`, a related but distinct mechanism; `calculateDeadZone` itself is dead code today |
| Camera thresholds | **Implemented** | `CameraAnimation.ts` — `calculateMovementThreshold`, `calculateRotationThreshold`, `shouldAnimate`, `shouldRotate`, `ZOOM_CHANGE_EPSILON` (`CameraController.ts`), all wired into `recompute()`'s gating branch |

### Phase 7B — Professional AutoFit

| Feature | Status | File / Function |
|---|---|---|
| Pickup AutoFit | **Implemented** | `AutoFitEngine.fitPreview()` (includes `pickup`) |
| Destination AutoFit | **Implemented** | `AutoFitEngine.fitPreview()`/`fitCompleted()` (include `destination`) |
| Route AutoFit | **Implemented** | `AutoFitEngine.fitPreview()` spreads `route.path` into the fitted point set |
| Dynamic edge padding | **Implemented** | `AutoFitEngine.mergeChromeIntoPadding()` → `CameraAnimation.calculateZoomToFitBounds()` |
| Bottom sheet awareness | **Implemented** | `app/(driver)/navigation.tsx:232-234` (`handleBottomCardLayout` → `setChrome({ bottomSheetHeight })`) |
| Safe-area awareness | **Implemented** | `NavigationMap.tsx:100-102` (`useSafeAreaInsets()` → `setChrome({ safeArea })`) |
| Automatic camera framing | **Implemented** | `CameraController.computeTargetPose()` calls `fitPreview`/`fitCompleted` for PREVIEW/MATCHING/TRIP_COMPLETED/FIT_ROUTE/OVERVIEW |
| Route bounds calculation | **Implemented** | `NavigationMath.computeBounds()` |
| *(not on the audit's checklist, found during review)* Floating-buttons / map-controls chrome | **Partial** | `AutoFitChrome.floatingButtons`/`mapControlsWidth` exist in the model and are additive in `mergeChromeIntoPadding`, but no caller anywhere sets them — they stay at `DEFAULT_CHROME`'s zero values |

### Phase 7C — Marker Animation

| Feature | Status | File / Function |
|---|---|---|
| Driver marker interpolation | **Implemented** | Native: `useAnimatedMarker.ts` (Reanimated `withTiming`, pre-existing). Web: `useAnimatedMarkerWeb.ts` → `MarkerAnimator.computeMarkerFrame`, wired into `Map.web.tsx:73` |
| Bearing interpolation | **Implemented** | `MarkerAnimator.ts` — `computeMarkerFrame()` (native: `useAnimatedMarker.ts`'s own `withTiming` + `shortestRotation`) |
| Rotation smoothing | **Implemented** | Same as above — shortest-arc interpolation on both renderers |
| Movement smoothing | **Implemented** | `MarkerAnimator.interpolateMarkerPosition()` (web); Reanimated `withTiming` on lat/lng (native) |
| GPS jitter filtering | **Implemented** | `GPSManager.ts` — accuracy hard-reject gate + implausible-speed/glitch reject (`scoreFixQuality`, line ~309 comment: "Rejects fixes implying a physically implausible jump... GPS glitch/teleport") before a fix ever reaches a marker |
| Marker animation engine | **Implemented** | `MarkerAnimator.ts` (pure math: `startMarkerTransition`, `computeMarkerFrame`, `retargetMarkerTransition`, per-kind `MarkerProfile`s) — a genuine second engine module, not a stub |
| Passenger marker updates | **Partial** | `PASSENGER_MARKER_PROFILE` is defined in `MarkerAnimator.ts` and the existing `AnimatedUserLocation`/`useAnimatedMarker` already animates the passenger dot on native — but `NavigationStore.customerLocation` (the engine's own field for this) is never written by anything (no producer found anywhere in the codebase); passenger position on the driver's map, where shown, comes from `driverStore`/props, not the engine |
| Route progress marker updates | **Partial** | The driver marker's *position* already reflects live `NavigationStore.driverLocation` (road-snapped via `RouteEngine.snapToRoute` where used); there is no separate marker specifically representing "progress along the route" (e.g. a progress-fraction indicator on the polyline itself) — `useRouteProgressPercent()` exists as a numeric value but nothing renders it as a marker |

### Phase 7D — Navigation HUD

| Feature | Status | File / Function |
|---|---|---|
| Turn Banner | **Implemented** | `NavigationTurnBanner.tsx` |
| Distance Remaining | **Implemented** | `NavigationHUD.tsx`'s `EtaChip` (`useDistanceRemainingMeters`); also `NavigationBottomCard.tsx` |
| ETA | **Implemented** | `NavigationHUD.tsx`'s `EtaChip`, `NavigationArrivalTime.tsx`, `NavigationBottomCard.tsx` (`useEtaSeconds`) |
| Speed widget | **Implemented** | `NavigationSpeedWidget.tsx` |
| Compass | **Implemented** | `NavigationCompass.tsx` |
| Voice toggle | **Partial** | `NavigationVoiceToggle.tsx` exists and renders — explicitly local `useState`, UI-only, no voice/TTS engine anywhere in the codebase (documented as intentional in the file's own header) |
| Lane guidance placeholder | **Implemented (as a placeholder, per its own spec)** | `NavigationLaneGuidance.tsx` — deliberately a fixed generic hint, not real per-lane data (no lane field exists on `RouteStep`); matches exactly what "placeholder" was asked for |
| Recenter button | **Implemented** | `NavigationControls.tsx` (`recenterState === 'available'` → `navigation.recenter()`) |
| Navigation controls | **Implemented** | `NavigationControls.tsx` (recenter + screen-supplied zoom/layers slots) |
| Arrival banner | **Partial** | `NavigationArrivalCard.tsx` is fully built (mode-gated, dispatches `startTrip`/`completeTrip`) but is not rendered by any screen — `navigation.tsx` still shows its own bespoke `RideActionSlider` cards for the equivalent moments instead of this component |
| *(not on the checklist, found during review)* `NavigationBottomCard` | **Partial** | Fully built (Bible-spec collapsed row + address rows) but likewise not mounted by any screen — `navigation.tsx`/`trip.tsx` both still use their own bespoke bottom cards |
| *(found during review)* `NavigationRoadName` | **Implemented** | Not on the checklist but exists and works — heuristic road-name extraction from the current step's instruction text |

### Phase 7E — Route Progress & Rerouting

| Feature | Status | File / Function |
|---|---|---|
| Route progress tracking | **Implemented** | `RouteEngine.computeRouteProgress()`, published via `RouteProgressTracker.applyRouteProgress`/`applyGpsFixWithProgress`, called from `NavigationProvider.tsx`'s `onFix` handler |
| Next maneuver calculation | **Implemented** | `NavigationHooks.useNextStep()`/`useSecondNextStep()` |
| Remaining distance | **Implemented** | `RouteEngine.computeRouteProgress()` → `NavigationStore.distanceRemainingMeters` |
| Remaining ETA | **Implemented** | Same → `NavigationStore.etaSeconds` |
| Off-route detection | **Implemented** | `RouteEngine.shouldReroute()` (30m movement gate + 50m off-route threshold, per the Bible) |
| Intelligent rerouting | **Implemented** | `RouteEngine.evaluateReroute()`, orchestrated by `RouteProgressTracker.checkAndReroute()`, called from `NavigationProvider.tsx` on every qualifying fix |
| Route recalculation | **Implemented** | Same path — `fetchRoute(..., { forceRefresh: true })` on confirmed off-route |
| Progress percentage | **Implemented** | `NavigationHooks.useRouteProgressPercent()` |
| Arrival detection | **Missing (manual only)** | No code anywhere auto-transitions `mode` based on proximity to pickup/destination. `app/(driver)/navigation.tsx` computes `isNearPickup` (`calculateDistanceMeters(...) < 50`) but the value is never read anywhere else — it doesn't gate the UI, doesn't auto-fire `arrivedAtPickup()`, nothing. Every arrival (`arrivedAtPickup`, `arrivedAtDropoff`) is driver-initiated via a slide gesture, never engine-detected |
| Pickup detection | **Missing (manual only)** | Same finding — no automatic "driver is at the pickup point" detection anywhere; it's manual by design today, not merely unfinished automation left half-wired |

### Phase 7F — Performance Optimization

| Feature | Status | File / Function |
|---|---|---|
| GPS throttling | **Implemented** | `GPSManager.ts` — `PROFILE_OPTIONS` per-profile `distanceIntervalMeters`/`timeIntervalMs` |
| Camera throttling | **Implemented** | `CameraController.ts` — `snapshotsEqual()` early-return gate + movement/rotation/zoom thresholds in `recompute()` |
| Marker throttling | **N/A — not applicable** | Markers animate continuously by design (Bible: smooth marker motion); no "throttle" concept applies beyond the GPS-tick rate already gating how often a new target arrives |
| Animation optimization | **Implemented** | Native: Reanimated worklets (`useAnimatedMarker.ts`, true UI-thread, no per-frame JS/React re-render — `tracksViewChanges={false}`-compatible). Web: `requestAnimationFrame` loop (`useAnimatedMarkerWeb.ts`) |
| Memoization | **Partial** | Used where it matters most (`NavigationMap.tsx`'s `routeSteps` `useMemo`, `NavigationTurnBanner.tsx`'s `distanceToManeuverMeters` `useMemo`, `navigation.tsx`'s `isNearPickup` `useMemo`) but not systematic — several derived values elsewhere (e.g. `NavigationRoadName`'s `extractRoadName`) recompute on every render without memoization (cheap enough today not to matter, but not a blanket policy) |
| Render optimization | **Implemented** | `NavigationHooks.ts` — one granular selector per value + `useShallow` for multi-field reads (`usePickupDestination`), so a component only re-renders on the slice it actually reads |
| Subscription cleanup | **Implemented** | `GPSManager.acquire`/`release` reference counting; `CameraController.detachMap()`; every `useEffect` in `NavigationMap.tsx`/`NavigationProvider.tsx` returns a cleanup function |
| Battery optimization | **Partial** | `GPSManager.applyScenario()`/`profileForScenario()` (`'planning'`/`'driverNavigation'`/`'tripCompleted'`/`'offline'`) is fully implemented but **never called from anywhere in the app** — `NavigationProvider.tsx`'s own doc comment confirms this is deliberate-but-unfinished ("Deliberately does NOT call `GPSManager.acquire`/`start`/`applyScenario`... an explicit scope cut"). Every screen just uses a single fixed profile (`driverBestNavigation`) regardless of trip phase |
| Route caching | **Implemented** | `RouteEngine.ts` — `routeCache` `Map` with `ROUTE_CACHE_TTL_MS` (5 min), `getCachedRoute`/`fetchRoute` |
| Performance monitoring | **Partial** | `GPSManager.getDiagnostics()` (accepted/rejected fix counts, average accuracy, fix age, etc.) and `CameraController`'s `__DEV__`-only throttled runtime log exist, but there is no dedicated performance-monitoring surface (overlay, screen, or exported report) that consumes either — both are "available if you go looking," not a monitoring feature |

---

## Architecture Compliance

**GPSManager, NavigationStore, RouteEngine, CameraController, AutoFitEngine, MarkerAnimator** — ownership confirmed clean. No code outside these files computes camera poses, fetches routes, or opens a GPS subscription (repo-wide grep for `Location.watchPositionAsync`/`getCurrentPositionAsync`/`animateCamera` direct-map-ref calls confirms this **except for one screen — see the violation below**).

**NavigationMap, NavigationHUD, NavigationProvider** — ownership confirmed clean where they're actually used.

### Violation found: `app/(driver)/trip.tsx` bypasses the engine entirely for camera/route/UI ownership

This is the single most important finding of this audit. `app/(driver)/navigation.tsx` (the DRIVER_TO_PICKUP screen) was fully migrated onto the engine — `NavigationMap`, `CameraController`, store-sourced `driverLocation`/`route`. **`app/(driver)/trip.tsx` — the TRIP_IN_PROGRESS screen, the Bible's own "most important mode" — was not.** Confirmed by direct inspection:

- Renders the raw `Map` component directly (`import { CompassButton, Map } from '@/components/map'`), not `NavigationMap`.
- Keeps its own local `driverLocation`/`routeCoordinates`/`routeSteps`/`activeStepIndex`/`isAutoFollow` state (`useState`), duplicating exactly what `NavigationStore` already owns.
- Calls `mapRef.current.animateCamera(...)` directly, twice (`trip.tsx:260-271`, `trip.tsx:470`) — the exact call AGENTS.md's Camera Rules and the Bible both explicitly forbid a screen from making ("Screens must never call: animateCamera()... Instead, screens request behaviour from the Navigation Engine").
- Calls `RouteEngine.fetchRoute()` directly and manages the resulting polyline itself, rather than letting `NavigationMap`/`CameraController` own it.
- Renders none of the Phase 7D HUD components (`NavigationHUD`, `NavigationTurnBanner`, `NavigationSpeedWidget`, etc.) — it has its own separately-built turn-preview/speed UI.

Net effect: **every Phase 7A/7B/7C/7D improvement audited above — camera damping, auto-fit, marker interpolation via the engine, the HUD component set — applies to the pickup-navigation screen only. The actual trip-in-progress experience (the screen a Customer is in the vehicle for) still runs on pre-engine, screen-owned code**, unaffected by any of Phase 7's work. This is not a regression (this code predates the engine and still functions), but it is a direct, current violation of AGENTS.md's Navigation Engine Ownership rule and the single largest gap between "the roadmap says this phase is done" and "the whole app actually behaves this way."

This is consistent with — not a new discovery contradicting — `Architecture.md`'s own Rollout plan step 6, which always scoped the migration as "one existing screen at a time... `app/(driver)/navigation.tsx` first... verifying no regression before moving to the next." `trip.tsx` was simply never reached. `app/(tabs)/navigate.tsx` (the dev/testing tool) is unmigrated too, but that one is explicitly out of scope per AGENTS.md's own folder-structure comment ("kept intentionally").

### Secondary compliance note: two orphaned reusable components

`NavigationBottomCard.tsx` and `NavigationArrivalCard.tsx` are correctly built, Bible-compliant, engine-owned components — but zero screens in the app currently render either one (`navigation.tsx` uses its own bespoke `Card`+`RideActionSlider` markup for the equivalent moments instead). Not an ownership violation (nothing duplicates their logic elsewhere), just unused work-in-hand that the next screen migration (see Recommendation below) would naturally consume.

---

## Protected Features Check

Verified, not modified:

- **Passenger Ride Lifecycle / Driver Ride Lifecycle** — `driverStore.acceptRequest`/`tripStatus`, `rideStore` — untouched by anything read this pass; no code path in any file read here writes to either store.
- **Navigation Runtime** (`GPSManager`, `NavigationProvider`, `NavigationStore`, `RouteEngine`, `CameraController`, `AutoFitEngine`, `NavigationMap`, `NavigationHUD`, `MarkerAnimator`) — read in full, confirmed functioning as documented, confirmed unmodified by this pass (read-only tool calls only, no edits made).
- **Start Pickup / Arrived / Start Trip / Complete Trip** — the four action dispatch points in `app/(driver)/navigation.tsx` (`handleStartPickup`, `handleArrived`, `handleStartRide`) and `trip.tsx` (`completeTrip`) were read, not changed.
- **Rating Flow** — out of scope for this audit (no navigation-engine dependency); not touched.

No code was modified in the course of this audit.

---

## 3. Remaining Work

Only items confirmed genuinely missing or unwired — not a rebuild list:

1. **Rotation anticipation** (Phase 7A) — no upcoming-turn-aware bearing bias exists anywhere; would need a new function reading `useNextStep()`'s bearing delta, not present today.
2. **Automatic arrival/pickup detection** (Phase 7E) — `isNearPickup` is computed and discarded; no engine action or screen behavior currently consumes proximity to auto-transition `ARRIVED_PICKUP`/`ARRIVED_DROPOFF`. Today this is a deliberate manual-only design (slide gesture), not a partially-wired feature.
3. **`trip.tsx` migration onto the engine** — not a "missing feature" in the roadmap-item sense, but the largest concrete gap: `NavigationMap`/`CameraController`/`NavigationHUD`/store-sourced route+location are all built and working, just not consumed by this screen.
4. **`GPSManager.applyScenario()` wiring** (Phase 7F) — the battery-optimization scenario switcher is fully implemented and entirely uncalled; no code currently varies GPS profile by trip phase.
5. **`NavigationStore.customerLocation` producer** (Phase 7C) — the field and its `PASSENGER_MARKER_PROFILE` exist; nothing anywhere writes to `customerLocation`.
6. **`AutoFitChrome.floatingButtons`/`mapControlsWidth` producers** (Phase 7B) — the fields exist and are additive in the padding merge; nothing calls `setChrome` with either one.
7. **A performance-monitoring surface** (Phase 7F) — `getDiagnostics()` and the dev runtime log both produce data with no consumer/overlay today.

Everything else on the audited roadmap already exists and works as designed — in particular, do not re-implement camera follow, auto-fit, rerouting, or the HUD component set; all are complete.

---

## 4. Recommended Next Phase

**Migrate `app/(driver)/trip.tsx` onto the Navigation Engine** (`NavigationMap`, `CameraController`, `NavigationHUD`/`NavigationBottomCard`/`NavigationArrivalCard`, store-sourced route/location) — exactly the next, previously-deferred step in `Architecture.md`'s own Rollout plan (step 6, "migrate one existing screen at a time... verifying no regression before moving to the next").

**Justification:** every other gap found in this audit (rotation anticipation, arrival auto-detection, scenario-based battery profiles, `customerLocation`, unmounted chrome fields) is a refinement to a system that's already live and working for the user. The `trip.tsx` gap is different in kind: it means the single mode the Bible calls "the most important... exactly like Google Maps, Yango, Uber" — the one the Customer actually rides through — is currently running entirely outside the engine, getting none of the camera damping, auto-fit, marker-interpolation, or HUD work this whole Phase 7A-7F investment already paid for. It's also the highest-risk unmigrated surface (a direct `animateCamera` screen-ownership violation flagged above) and the most template-ready: `navigation.tsx`'s successful migration is a working, in-repo reference for exactly this move. No other item on the "Remaining Work" list unlocks anywhere near as much already-built value per unit of effort.
