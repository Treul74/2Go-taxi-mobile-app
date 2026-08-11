# Phase 9D — Camera Runtime Cleanup

**Date:** 2026-08-07
**Type:** Bug fix + internal refactor (code modified). Closes the "animateCamera duration wrapping" observation flagged (not fixed) in `audit_07-08-26_20-17_phase8b-...md` §4.2 and carried forward through every subsequent audit as item 10.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`.

`CameraController.ts`'s per-mode profile table, `computeTargetPose`, gating (`shouldAnimate`/`shouldRotate`/thresholds), damping, and `AutoFitEngine` integration are all **unchanged** — this phase touches only how an already-computed pose reaches the map and how two existing entry points record having applied one.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/components/navigation/NavigationMap.tsx` | Fixed its `attachMap` adapter to unwrap `options.duration` before calling `Map`'s exposed ref, instead of passing the whole options object through. |
| `src/features/passenger/PassengerHome.tsx` | Same fix, in its own identical `attachMap` adapter (Phase 8B). |
| `src/components/map/Map.native.tsx` | One-line fix: `duration || 1000` → `duration ?? 1000` in the exposed `animateCamera` handle, so an explicit `0` (CameraController's "snap, no tween" case) is honored instead of silently becoming a 1000ms animation. |
| `src/navigation/NavigationEngine/CameraController.ts` | Extracted the "apply a pose to the singleton map + record bookkeeping" logic — previously duplicated with a real behavioral gap between `recompute()` and `recenterOnLocation()` — into one shared private function, `applyPose`. |

---

## 2. Root cause: the duration was never actually the bug's location

### 2.1 The bug

`CameraControllerMapHandle.animateCamera(camera, options: { duration: number })` — CameraController.ts has always called this correctly and consistently; that file was never inconsistent internally. The bug was entirely in how two *different* files adapted that typed interface onto `Map.native.tsx`'s actual exposed ref method, which has a different signature: `animateCamera(camera, duration?: number)` — a bare number, not an options object.

Both `NavigationMap.tsx` and `PassengerHome.tsx` wrote the same adapter:
```ts
animateCamera: (camera, options) => {
  mapRef.current?.animateCamera?.(camera, options); // passes the whole { duration } object
}
```
`Map.native.tsx`'s handle then did `mapRef.current.animateCamera(camera, { duration: duration || 1000 })` — where `duration` was actually the whole `{ duration: N }` object (truthy), so this built `{ duration: { duration: N } }` and handed *that* to the real `react-native-maps` `MapView.animateCamera`, which expects `{ duration: number }`. Every CameraController-driven animation, on every screen using `<NavigationMap/>` or `PassengerHome`'s own `attachMap` wiring, has been sending a malformed duration to the native call since Phase 7 — the carefully-computed `ARRIVAL_DURATION`, `RECENTER_DURATION`, and `calculateAnimationDuration(...)` values were never actually reaching the map correctly.

**`app/(tabs)/navigate.tsx` was never affected** — it calls `Map`'s ref directly with a bare number (`mapRef.current.animateCamera({...}, 700)`), which already matched the handle's real contract. Confirmed by reading its two call sites before touching anything, specifically so the fix wouldn't land on the wrong side of the mismatch and break the one caller that was already correct.

### 2.2 The fix

`options.duration` is now unwrapped at both adapter sites before calling `Map`'s ref — the two places that owned the mismatch. `Map.native.tsx`'s handle signature and `app/(tabs)/navigate.tsx` are both untouched in terms of contract; only `NavigationMap.tsx`/`PassengerHome.tsx` changed how they call an interface they were already misusing.

`NavigationMap.tsx`'s local `mapRef` type was also corrected in the same pass: it was declared as `{ animateCamera?: CameraControllerMapHandle['animateCamera'] }` — i.e., typed as if `Map`'s ref took the *options-object* contract, which is why `tsc` never caught the mismatch. It now has its own accurately-typed `MapCameraRef` interface reflecting what `Map.native.tsx` actually exposes (`duration?: number`).

### 2.3 "Camera transition timing" — a direct consequence of §2.1, not a separate issue

Every timing value the audit's "Camera transition timing" finding could plausibly point at (`ARRIVAL_DURATION`, `RECENTER_DURATION`, `calculateAnimationDuration`'s speed-scaled result, and the `isFirstApplication`/`durationMs = 0` "instant snap" case) was already being computed correctly by `CameraController.ts` — none of that logic changed. What was broken is that **none of those values were reaching the native animation call intact**. Fixing §2.1 is what makes them apply for the first time; §2.4 closes the one remaining edge the double-wrap bug had been masking.

### 2.4 The `0`-duration edge case

`recompute()`'s `isFirstApplication` branch deliberately sets `durationMs = 0` ("snap directly to the target rather than tweening from an arbitrary/undefined starting camera"). `Map.native.tsx`'s `duration || 1000` fallback treats `0` as falsy, silently turning a should-be-instant first pose into a 1000ms animation. This was already broken before §2.1's fix too (in a different, malformed way), so it isn't a new regression — but since this phase was already inside this exact line fixing the wrapping bug, and the audit explicitly names "camera transition timing" as in scope, closing it here (`?? ` instead of `||`) was the minimal, directly-relevant thing to do rather than leaving a known-adjacent bug for a future pass to rediscover. `app/(tabs)/navigate.tsx` always passes an explicit non-zero duration (`700`), so this has no effect on it.

---

## 3. Camera ownership consistency / idle camera fallback

`recompute()` (the reactive, mode-driven pipeline) and `recenterOnLocation()` (Phase 8C's one-shot bypass for `IDLE`/`OFFLINE`, where `CAMERA_PROFILES` deliberately has no opinion) each independently called `mapHandle.animateCamera(...)` and independently decided what bookkeeping to update. They'd drifted: `recompute()` published the applied `bearing`/`zoom`/`pitch` back into the store (so `NavigationCompass`'s needle stays live) and updated `lastAppliedMode`/`lastAppliedCameraState`; `recenterOnLocation()` did neither — only `lastAppliedPose`. Concretely, calling `recenterOnLocation()` (e.g. `PassengerHome`'s recenter button, `DriverDashboard`'s continuous follow) left `NavigationState.bearing`/`zoom`/`pitch` stale at whatever `recompute()` last wrote, even though the camera had actually just moved to `bearing: 0`.

Both now funnel through one new private function, `applyPose(pose, durationMs, mode, cameraState)`, which does the native call *and* the store publish *and* the bookkeeping update in exactly one place. `recenterOnLocation()` now reads the current `mode`/`cameraState` from the store and passes them through — which, on reflection, is *more* accurate than the old "leave `lastAppliedMode` untouched" approach, not less: since it records the mode/cameraState that were actually true at the time of the recenter, `recompute()`'s later `transitioned` check (`lastAppliedMode !== state.mode`) still correctly detects any real subsequent mode change (e.g. Accept → `DRIVER_TO_PICKUP`) — verified by tracing both the "never touched, stays null/stale" and "kept accurate" cases produce the same `transitioned = true` result the moment a real transition occurs.

`animateCameraTo()` (the explicit-handle primitive `MapPickerModal` uses for its own, deliberately non-singleton map) is untouched and does **not** route through `applyPose` — it correctly has no store bookkeeping to update, since that map's pose was never meant to be reflected in `NavigationCompass` or anywhere else in the store (Phase 8C's own reasoning, restated in this file's updated doc comment for clarity).

---

## 4. Validation

- ✓ **Camera transitions remain smooth** — no gating, damping, or duration-*selection* logic changed; §2 only fixes duration *delivery*, meaning transitions should now visibly match the durations the engine already intended (an improvement, not a behavior change from what was designed — see §2.3).
- ✓ **No duplicate animation paths** — within `CameraController.ts`, the singleton-map "apply and record" logic exists in exactly one function (`applyPose`) instead of two diverging copies. The one remaining second call site (`animateCameraTo`) is for a structurally different, non-singleton, non-tracked map and was already justified as necessarily separate in Phase 8C — it does not duplicate `applyPose`'s bookkeeping because that bookkeeping doesn't apply to it.
- ✓ **CameraController remains the sole owner** — a repo-wide grep for `.animateCamera(`/`.animateToRegion(`/`.fitToCoordinates(` still returns exactly the same three files as every prior audit (`CameraController.ts`, `Map.native.tsx`'s own internal fallback, `app/(tabs)/navigate.tsx`'s sanctioned exception) plus zero new hits — this phase added no new call site, it corrected two existing adapters' arguments.
- ✓ **TypeScript passes** — `npx tsc --noEmit`, exit code 0, zero errors.

---

## 5. Performance impact

**None measurable, and slightly positive if anything.** No new subscriptions, timers, renders, or store writes were added:
- `applyPose` executes the exact same number of operations `recompute()`'s tail already did (one `animateCamera` call, one `setState`, three variable assignments) — it's the same work, moved into a shared function instead of inlined once. `recenterOnLocation()` now does marginally *more* work per call (one extra `setState` for bearing/zoom/pitch, previously skipped) — this is a few extra object-field writes on an already-infrequent, user-triggered or ~1/sec GPS-tick call, not a hot path.
- The duration-unwrap fix (`options.duration` instead of `options`) is a property access, not a new computation.
- The `?? ` vs `||` change is identical cost.

The only *behavioral* runtime difference a user could perceive is durations now actually applying as designed — camera moves that were, in effect, running on whatever `react-native-maps` does with a malformed/nested duration object should now visibly use the intended `ARRIVAL_DURATION`/`RECENTER_DURATION`/speed-scaled values. This is expected to make transitions *look* more correct, not slower — no verification on a physical device was performed as part of this phase (consistent with every prior phase's own stated caveat).
