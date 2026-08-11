# Phase 7A — Professional Camera Follow: Implementation Report

**Date:** 2026-08-04
**Scope:** Camera follow feel only. No architecture change — every addition routes through the existing `CameraController` / `CameraAnimation` / `NavigationMath` / `NavigationStore` / `NavigationModes` modules, per this phase's own constraint.
**Method:** Re-read `AGENTS.md`, `2GO Navigation Engine Bible.md`, and `src/navigation/NavigationEngine/Architecture.md` before touching anything (Architecture.md's own header already flags itself as written before `CameraController` existed — treated as design intent, not current-state truth, consistent with this session's Phase 7 report). Read `CameraAnimation.ts` and `NavigationMath.ts` in full to inventory every already-built primitive before writing a single line, per the "use existing, no duplicate camera logic" constraint.

---

## 1. Files modified

**`src/navigation/NavigationEngine/CameraController.ts` — the only file touched this phase.**

No other file changed. Confirmed by `git status`: `AutoFitEngine.ts`, `MarkerAnimator.ts`, every `src/components/navigation/*` HUD file, `RouteEngine.ts`, `GPSManager.ts`, `app/(driver)/trip.tsx`, and `app/(tabs)/navigate.tsx` are untouched. No new dependency was installed (`package.json` unchanged). No UI/JSX file changed — this is a pure math/behavior change inside the engine's existing camera pipeline.

---

## 2. What was already done (verified, not rebuilt)

Before writing any code, `CameraAnimation.ts`/`NavigationMath.ts` were read in full to confirm what the checklist items already had:

| Checklist item | Status before this phase |
|---|---|
| Smooth camera follow | Already implemented — `resolveFollowCenter`/`followOrArrivalPose`, unchanged. |
| Driver anchored in lower third | Already implemented — `calculateForwardOffset` + `followAnchorRatio` (0.68 for `DRIVER_TO_PICKUP`/`TRIP_IN_PROGRESS`), unchanged. |
| Predictive look-ahead based on speed | Already implemented — `calculateLookAheadDistance`/`calculateLookAheadPoint`, unchanged. |
| Dynamic zoom based on speed | Already implemented — `dynamicZoomForSpeed` (`NavigationMath.ts`), wired for any mode whose `CameraProfile.zoom === 'dynamic'` (`TRIP_IN_PROGRESS`). Per the Bible's own per-mode table, `DRIVER_TO_PICKUP` (the mode `navigation.tsx`, the only in-scope screen, actually reaches) has a **fixed** zoom (17.5), not dynamic — this is the Bible's own spec, not a gap, so it was not changed. |
| Dynamic pitch based on navigation mode | Already implemented — `CAMERA_PROFILES`' per-mode `pitch` values (0/50/30/dynamic/35/0) plus `dynamicPitchForMode` for the one dynamic mode, unchanged. |
| Gesture detection → FREE_EXPLORE → automatic return | Wired in the prior Phase 7 pass this session (`NavigationMap.tsx`'s `onPanDrag` → `enterFreeExplore()`, 7s auto-`recenter()` timer) — not part of this phase's diff, verified still intact. |

This phase's actual gap, found by cross-referencing the checklist against real call sites: **`applyCameraDamping`, `interpolateBearing`, and `RECENTER_DURATION` all existed in `CameraAnimation.ts` with zero callers anywhere in the codebase.** The single `animateCamera` call already eases per-tick via a native, duration-based tween — but nothing smoothed the *target itself* tick-to-tick, and "recenter" shared the same flat `ARRIVAL_DURATION` as every other mode transition despite a dedicated, unused, snappier constant existing for exactly that case.

---

## 3. What changed

### Smooth camera damping + smooth bearing interpolation

New `dampPose()` helper in `CameraController.ts`, called only from the steady-state ("routine follow tick") branch of `recompute()` — never on the first-ever pose or a mode/cameraState transition, both of which still snap/ease straight to the raw target (a damped blend of a stale pose into a brand-new mode would look like the camera creeping into place rather than transitioning deliberately).

```ts
function dampPose(from, target, dampingFactor, deltaSeconds): CameraAnimationState {
  const t = applyCameraDamping(0, 1, dampingFactor, deltaSeconds); // one blend weight, reused per axis
  return {
    center: { latitude: lerp(from.center.latitude, target.center.latitude, t), longitude: lerp(...) },
    bearing: interpolateBearing(from.bearing, target.bearing, t), // shortest-arc, not naive degree lerp
    zoom: lerp(from.zoom, target.zoom, t),
    pitch: lerp(from.pitch, target.pitch, t),
    padding: target.padding,
    timestampMs: Date.now(),
  };
}
```

`applyCameraDamping(0, 1, factor, dt)` is reused (not re-derived) to produce a single 0-1 blend weight per tick — `lerp`/`interpolateBearing` are the same exported primitives `CameraAnimation.ts` already ships, so no camera math is duplicated. `CAMERA_DAMPING_FACTOR = 3` is a new, documented, tunable constant (≈95% of the way to a fresh target per ~1s GPS tick — most of the look-ahead prediction still lands, but a single noisy fix is blended rather than applied outright).

Critically, **the existing movement/rotation-threshold gating is unchanged and still runs against the raw target** — damping doesn't affect *whether* the camera reacts (that's still the Phase 6 jitter-rejection logic), only *what pose* it moves to once it's decided to react. This is a second, independent smoothing layer on top of gating, not a replacement for it.

### Smooth recenter

`recompute()` now detects the specific "recenter" transition — mode unchanged, `cameraState` going from `'FREE_EXPLORE'` to `'FOLLOW_DRIVER'` (exactly what `NavigationStore.recenter()` produces) — and uses the previously-unused `RECENTER_DURATION` (600ms) instead of the generic `ARRIVAL_DURATION` (1200ms) every other mode/camera-intent transition uses. This gives recenter its own, snappier, Bible-intended feel ("the camera smoothly returns to FOLLOW_DRIVER") distinct from e.g. first entering `DRIVER_TO_PICKUP`.

### Not changed

- `CameraProfiles`' per-mode zoom/pitch/rotation table — untouched; already matches the Bible verbatim.
- The jitter-gating thresholds (`calculateMovementThreshold`/`calculateRotationThreshold`/`ZOOM_CHANGE_EPSILON`) — untouched.
- The single `animateCamera` call site — still exactly one, still native-duration-driven (no JS-side frame loop was introduced; `CameraAnimation.ts`'s `interpolateCameraState`/`computeCameraInterpolation` machinery, built for a hypothetical per-frame render loop, remains intentionally unused — driving `animateCamera` repeatedly every frame would fight react-native-maps' own native tween rather than smooth it, so building that loop would have made the camera worse, not better; flagged, not silently ignored).

---

## 4. Camera follow report

| Behavior | Result |
|---|---|
| Camera always follows smoothly | Unchanged core follow logic + new per-tick damping layer — should read smoother than before, not just equally smooth. |
| Driver remains in lower third | Unchanged — `followAnchorRatio`/`calculateForwardOffset` untouched. |
| Camera rotates smoothly | `interpolateBearing`-based damping now applied to bearing specifically (shortest-arc, not raw degree lerp), on top of the existing native-eased tween. |
| Camera never jumps | First-application and transition branches still snap/ease to the raw target deliberately (unchanged) — jumps were never expected there. Steady-state ticks now damp rather than jump straight to each new predicted point. |
| Camera never jitters | Existing threshold gating unchanged (still the primary jitter filter); damping is an additive second layer specifically for jitter that clears the threshold but is still noisy tick-to-tick. |
| Gestures temporarily disable follow | Unaffected by this phase — wired in the prior Phase 7 pass (`onPanDrag` → `enterFreeExplore()`), verified still present and untouched. |
| Recenter restores follow | Unaffected mechanically (still `recenter()` → `cameraState: 'FOLLOW_DRIVER'`), now with its own dedicated, snappier transition duration. |

---

## 5. Remaining issues

1. **No device available in this environment.** `CAMERA_DAMPING_FACTOR = 3` and the choice to keep `RECENTER_DURATION` at its pre-existing 600ms value are both documented starting points, not measured ones — the Bible specifies "no shaking," not an exact damping constant. Recommend tuning both on a real device before/shortly after shipping.
2. **Scope-confirmed gap, not addressed this phase:** `app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` remain on their own hand-rolled `animateCamera` code, entirely outside `CameraController` — this phase's brief explicitly excluded them ("Do not touch trip.tsx. Do not touch navigate.tsx."), so the damping/recenter-duration improvements here only benefit `app/(driver)/navigation.tsx`, the one screen already on the engine.
3. **`interpolateCameraState`/`computeCameraInterpolation`/`CameraTransition` remain unused** — this is intentional (see Section 3's "Not changed"), not an oversight, but worth stating explicitly since `CameraAnimation.ts`'s own header comment still describes them as a `CameraController` TODO from an earlier phase. That TODO comment is now stale relative to the deliberate native-tween-only design; a future cleanup pass could update the comment, but doing so wasn't in scope for a camera-follow-feel phase and risks touching unrelated documentation under time pressure — flagged rather than done.
4. **`dynamicZoomForSpeed`/`dynamicPitchForMode` remain inert on the one in-scope screen** — not a defect (Section 2), but worth restating: `navigation.tsx` only ever reaches `DRIVER_TO_PICKUP`/`ARRIVED_PICKUP`, both fixed-value modes per the Bible's table, so the dynamic-by-speed curves this phase's brief names are correctly implemented but not exercised by this screen today. They would activate automatically the moment a screen reaches `TRIP_IN_PROGRESS` with `NavigationMap` mounted — no further engine change needed.

---

## 6. Verification performed

- `npx tsc --noEmit` — clean, 0 errors, after this phase's change.
- `npx eslint src/navigation/NavigationEngine/CameraController.ts` — clean, 0 errors, 0 warnings.
- Grep-confirmed exactly one `mapHandle.animateCamera(` call site (unchanged from before this phase — no second camera-mutation path introduced).
- Grep-confirmed no other engine/screen file changed this pass (`git status`).
- Manually traced `isFirstApplication`/`transitioned`/`isRecenter` branch logic against `lastAppliedPose`/`lastAppliedMode`/`lastAppliedCameraState`'s null-on-first-attach initial state to confirm `isRecenter` can't be miscomputed before a real prior pose exists (it's only read inside the `transitioned` branch, which is unreachable while `isFirstApplication` is true).

**Not verified — requires a real device, none available here:** actual on-screen smoothness of the damped follow vs. the pre-damping feel, whether `CAMERA_DAMPING_FACTOR = 3` reads as "smooth" or "laggy" at real driving speeds, and whether the 600ms recenter duration feels distinctly snappier than the 1200ms transition duration in practice.

---

## 7. Readiness score

**82/100** for camera-follow feel on `app/(driver)/navigation.tsx`.

Rationale: every checklist item in this phase's brief is now either already-correct (verified against the actual Bible table, not assumed) or genuinely wired using existing, previously-dead primitives — no new camera math was invented, no duplicate logic was added, and the single-`animateCamera`-call architecture is unchanged. The score isn't higher because every tuning judgment (damping factor, recenter duration's real-world feel) is still unverified on physical hardware, and because the two other driver navigation screens remain outside this improvement by explicit, correct scope exclusion.
