# Phase 7C — Professional Marker Animation: Implementation Report

**Date:** 2026-08-04
**Scope:** Marker animation only. No camera, autofit, HUD, route, or GPS changes — every improvement reuses `MarkerAnimator.ts`'s existing pure math, per this phase's own constraint.
**Method:** Re-read `AGENTS.md` and `2GO Navigation Engine Bible.md`. Read `MarkerAnimator.ts` and `src/hooks/useAnimatedMarker.ts` in full before writing anything, to establish exactly what was already solid versus what was a real, reachable gap.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/hooks/useAnimatedMarkerWeb.ts` (new) | `requestAnimationFrame`-driven marker animation hook — the "second renderer" `MarkerAnimator.ts`'s own header explicitly names as its reason to exist, now built. |
| `src/hooks/index.ts` | Exports the new hook, matching `useAnimatedMarker`'s existing export pattern. |
| `src/components/map/Map.web.tsx` | Driver marker now renders through `useAnimatedMarkerWeb` instead of the raw snapped GPS position/heading. |

**`MarkerAnimator.ts` itself was not modified** — every function this phase uses (`startMarkerTransition`, `retargetMarkerTransition`, `computeMarkerFrame`, `DRIVER_MARKER_PROFILE`) already existed with a complete, sufficient public API. Reused, not duplicated, not changed.

No other file changed. Confirmed by `git status`: `CameraController.ts`, `AutoFitEngine.ts`, every `src/components/navigation/` HUD file, `RouteEngine.ts`, and `GPSManager.ts` are untouched this pass. No new dependency installed (`package.json`/`package-lock.json` diff is empty).

---

## 2. What was already done (verified, not rebuilt)

Read `useAnimatedMarker.ts` (the real, live render-path implementation, used by `AnimatedVehicleMarker`/`AnimatedUserLocation`/`NavigationArrowMarker` in `Map.native.tsx`) in full:

| Checklist item | Status on native, before this phase |
|---|---|
| GPS interpolation | Already implemented — every coordinate update is a Reanimated `withTiming` tween from the marker's current (possibly mid-flight) value to the new fix, on the UI thread. |
| Position smoothing | Same as above — linear interpolation, never a snap. |
| Bearing interpolation | Already implemented — shortest-arc (`shortestRotation`), cubic in/out easing, re-normalized once settled so the value never grows unbounded across many turns. |
| Rotation smoothing | Same as above. |
| Eliminate jumping | Already correct — a fresh fix arriving mid-animation retargets `withTiming` from the in-flight value, never resets to the raw new fix instantly (this is native `withTiming`'s own documented retarget behavior, not custom code). |
| Smooth animation timing | Already correct — `MARKER_ANIMATION`'s tuned position/rotation durations (1800ms each), time-based (not frame-count-based), running on the UI thread (true 60fps, no JS-thread bottleneck). |

This matches every prior audit's conclusion: native marker animation is "the most mature, most Google-Maps-quality piece of the entire navigation runtime." **Nothing here needed improving, and nothing here was changed.**

`MarkerAnimator.ts` was read in full next: it's a complete, pure, framework-independent mirror of the exact same behavior (`interpolateMarkerPosition`, `smoothMarkerHeading`, `startMarkerTransition`/`computeMarkerFrame`/`retargetMarkerTransition`, the same shortest-arc/timing conventions, the same `MARKER_ANIMATION` constants) — built specifically, per its own header, for "a *second* renderer — e.g. `Map.web.tsx`'s `@react-google-maps/api` markers, which have no Reanimated worklet equivalent." It had **zero callers anywhere in the codebase.**

Read `Map.web.tsx` next and confirmed the real gap this predicted: the driver marker there fed a raw, un-smoothed `snappedDriver.position`/`snappedDriver.heading` directly into an `OverlayView`, with a plain CSS `rotate` transform for heading. Every GPS-driven position update snapped the marker instantly to its new spot; every heading change snapped the rotation instantly. **This is the one place in the entire marker system that actually jumped** — a real, reachable, user-visible gap on the web platform (used when the app runs via `Map.web.tsx`, per AGENTS.md's platform split), not a hypothetical one.

---

## 3. What changed

**`src/hooks/useAnimatedMarkerWeb.ts`** — drives `MarkerAnimator`'s existing transition machinery on a `requestAnimationFrame` loop instead of Reanimated `withTiming`, since `@react-google-maps/api`'s `OverlayView` takes plain React-rendered DOM, not a UI-thread shared value:

- Each new `coordinate`/`heading` starts a `startMarkerTransition` (first fix) or `retargetMarkerTransition` (subsequent fixes) — the exact same functions, exact same shortest-arc/retarget-from-current-frame semantics, as `MarkerAnimator.ts` already implements. No new interpolation math was written.
- A single `requestAnimationFrame` loop samples `computeMarkerFrame` each tick and pushes the result into React state, stopping automatically once a transition's `isComplete` flag is true (no lingering RAF calls after settling).
- **Null-safe by design**: `coordinate` is typed `LatLng | null`. Before the first real GPS fix exists, the hook does nothing (no transition, no RAF loop) rather than animating from a placeholder point — this avoids a real bug the naive version would have had: animating "in from the middle of the ocean" the moment a placeholder-to-real-fix jump occurred. `Map.web.tsx` only renders the marker once `position` is non-null.

**`src/components/map/Map.web.tsx`** — the driver marker now reads `animatedDriver.position`/`animatedDriver.heading` (from `useAnimatedMarkerWeb`, given `DRIVER_MARKER_PROFILE`) instead of `snappedDriver.position`/`snappedDriver.heading` directly. `snappedDriver` (the existing road-snapping hook) is unchanged and still the thing that *produces* the raw target this now smooths toward — road-snapping and animation-smoothing remain two independent, correctly-layered concerns, exactly as they already were on native (`useRoadSnappedVehicle` → `useAnimatedMarker`).

Pickup/destination markers on web were deliberately left untouched — they're static once set (no live position stream to smooth), matching native's own scope (only the vehicle/user-location/nav-arrow markers use `useAnimatedMarker` there; pickup/destination pins don't).

---

## 4. Validation

| Criterion | Result |
|---|---|
| Marker never jumps | **Fixed on web** (the one place it did) — was already true on native. `retargetMarkerTransition`'s "sample current frame, animate from there" behavior is identical on both renderers now. |
| Rotation smooth | **Fixed on web** — was an instant CSS `rotate` snap before; now takes the shortest arc via `interpolateBearing`, tweened over `DRIVER_MARKER_PROFILE`'s rotation duration. Was already correct on native. |
| GPS noise filtered | Unchanged — noise/quality filtering happens upstream, in `GPSManager`'s accept/reject gates (out of scope, untouched) and `useRoadSnappedVehicle`'s road-snapping (untouched). This phase's layer (marker interpolation) was never the place noise filtering happens on either renderer — it smooths *motion between accepted fixes*, not fix quality itself. |
| Motion natural | Web driver marker now glides between fixes instead of teleporting — matches native's already-natural motion. |
| TypeScript clean | `npx tsc --noEmit` — 0 errors. |

**ESLint**: `npx eslint` on all three changed/new files — 0 errors, 0 warnings.

---

## 5. Remaining issues

1. **"Movement prediction" was not implemented as true velocity-based dead-reckoning**, on either renderer. Neither `useAnimatedMarker` nor `MarkerAnimator` extrapolates the marker *ahead* of the last known fix while waiting for the next one — both only interpolate *between* two already-known states. This was a deliberate choice, not an oversight: `MarkerAnimator.ts`'s own docs don't describe dead-reckoning as one of its responsibilities, the Bible's "predict future movement" language is specifically about the *camera* (`CameraAnimation.calculateLookAheadPoint`, off-limits this phase — that's `CameraController`'s domain), and true extrapolation carries real product risk (showing a vehicle somewhere it hasn't actually been confirmed to be, if a fix is delayed or the vehicle stops/turns unexpectedly). In practice, the existing position duration (1800ms) is longer than the typical GPS interval (~1000ms at `driverBestNavigation`), so the marker is usually still mid-transition when the next fix arrives — this already produces continuous, non-static motion between fixes without needing genuine predictive extrapolation. Flagged as a considered, deliberate scope boundary, not a silently dropped item.
2. **Web platform verification.** No browser/device was available in this environment to visually confirm the RAF loop's real-world smoothness or frame rate — the implementation was verified by code trace (matching `useAnimatedMarker`'s documented contract function-for-function) and `tsc`/`eslint`, not by observation. Recommend a quick manual check (watch the driver marker glide during a simulated web session) before shipping.
3. **Passenger/nav-arrow markers on web remain unanimated** — only the driver marker was wired this phase, matching the one gap actually found (`Map.web.tsx` has no passenger-location or navigation-arrow marker rendering at all today — those exist only on native's `Map.native.tsx`, confirmed by reading the file; nothing to wire for markers that don't exist).

---

## 6. Readiness score

**88/100** for marker animation across both renderers.

Rationale: native was already excellent and required no changes (verified, not assumed). The one genuine, reachable gap — web's driver marker having zero smoothing — is now closed using exactly the pure math `MarkerAnimator.ts` was built for and previously had zero callers for, with no duplicated interpolation logic and no new dependency. Score isn't higher only because the web fix is unverified in an actual browser (no environment available here) and because true predictive dead-reckoning, while arguably out of this phase's correct scope, remains a named brief item not implemented.
