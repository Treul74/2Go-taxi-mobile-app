# Phase 6B — Camera Ownership Migration Report

**Date:** 2026-08-04
**Scope:** Make `CameraController` the ONLY thing that ever moves the camera on the one screen the Navigation Engine currently owns (`app/(driver)/navigation.tsx`, migrated in Phase 6A). No camera-feel changes, no interpolation changes, no edits to `CameraAnimation.ts` or `NavigationMath.ts`, no zoom/pitch table changes.
**Method:** Read `AGENTS.md`, `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`, and this session's own Phase 6A report (`audit_03-08-26_23-56_camera-runtime-activation.md`) before writing any code. Repo-wide grep for every camera-movement API named in the phase brief, then read every matching file in full before deciding what to do with each hit.

---

## 1. Files modified

- **`src/components/map/Map.native.tsx`** — one change: `Map`'s own zoom +/- buttons (and the `handleZoom` call they trigger) now only render when `!disableInternalCamera`. This was a real, previously-unguarded second camera-movement path (§2, §3).
- **`src/components/navigation/NavigationMap.tsx`** — removed the now-dead `showZoomControls` prop (it forwarded straight to `Map`'s internal zoom UI, which the fix above permanently disables whenever `NavigationMap` is the caller, since it always passes `disableInternalCamera`). Left a doc comment at the `disableInternalCamera` line explaining why zoom controls aren't offered here.
- **`app/(driver)/navigation.tsx`** — stopped passing the now-removed `showZoomControls` prop to `<NavigationMap />` (one line).

Not modified: `CameraAnimation.ts`, `NavigationMath.ts`, `AutoFitEngine.ts`, `CameraController.ts` (this phase touched zero lines in it — Phase 6A's dev-log addition was the last change), `NavigationStore.ts`, `NavigationModes.ts`, `NavigationProvider.tsx`, `Map.web.tsx`, `Map.tsx`, any other screen (`trip.tsx`, `navigate.tsx`, `DriverDashboard.tsx`, `PassengerHome.tsx`, `MapPickerModal.native.tsx`).

---

## 2. Camera ownership report — every camera-movement call site found (Task 1)

Repo-wide grep for `animateCamera`, `setCamera(`, `animateToRegion`, `fitToCoordinates`, `animateToCoordinate`, `setRegion(`, `cameraRef`, `mapRef` across every `.ts`/`.tsx` file. 16 files matched; the table below covers every real call site (doc-comment/type-only mentions in `types.ts`, `hooks/useNavigation.ts`, `NavigationMath.ts`, `AutoFitEngine.ts`, `CameraAnimation.ts` are prose, not code, and are omitted).

| # | Location | What it does | Reachable from `app/(driver)/navigation.tsx`? |
|---|---|---|---|
| 1 | `CameraController.ts:493` `mapHandle.animateCamera(...)` | The one sanctioned camera call — every `NavigationStore` change funnels through `recompute()`'s gating before reaching here. | Yes — this **is** the owner. |
| 2 | `NavigationMap.tsx` `animateCamera` wrapper passed to `attachMap()` | Pure plumbing: forwards `CameraController`'s call to `Map`'s own imperative handle. Makes no decisions. | Yes — the handle CameraController drives through, not a second decision-maker. |
| 3 | `Map.native.tsx:153-156` `animateCamera` (imperative-handle method) | The terminal actuator: calls the real `react-native-maps` `MapView.animateCamera`. Only ever invoked via #2. | Yes — terminal plumbing, same chain as #1/#2. |
| 4 | `Map.native.tsx:148-151` `animateToRegion` (imperative-handle method) | Same shape as #3, for `animateToRegion`. Not currently called by anything in `NavigationMap`'s path (`CameraController` only calls `animateCamera`). | Exposed but unused from this screen. |
| 5 | `Map.native.tsx:158-161` `fitToCoordinates` (imperative-handle method) | Same shape, for `fitToCoordinates`. Not called by anything in `NavigationMap`'s path. | Exposed but unused from this screen. |
| 6 | `Map.native.tsx:197-207` center-on-`userLocation` effect | Internal auto-camera effect. | **Was** reachable, but gated behind `if (disableInternalCamera) return;` (already correct before this phase — verified, not added by me). |
| 7 | `Map.native.tsx:210-220` center-on-`driverLocation`/`autoFollowDriver` effect | Same. | Same — already correctly gated. |
| 8 | `Map.native.tsx:224-247` fit-to-pickup/destination-markers effect | Same. | Same — already correctly gated. |
| 9 | **`Map.native.tsx:265-280` `handleZoom()` (zoom +/- button handler)** | Reads the live camera via `mapRef.current.getCamera()`, then calls `mapRef.current.animateCamera(...)` directly. | **Yes, and NOT gated by `disableInternalCamera`** — a real, previously-live second camera owner on this exact screen (`showZoomControls` was being passed through). **Fixed this phase** (§3). |
| 10 | `app/(tabs)/navigate.tsx` — `mapRef`, 3× `animateCamera`, 1× `fitToCoordinates`, 1× `animateToRegion` | A full hand-rolled camera implementation (heading-up follow, compass reset, route-fit, recenter). | No — separate screen, `<Map>` used directly, not `<NavigationMap>`. Explicitly the dev/testing tool `AGENTS.md`'s folder-structure comment says to keep as-is. |
| 11 | `app/(driver)/trip.tsx` — `mapRef`, 2× `animateCamera` (heading-up follow effect + compass reset) | Same pattern as the pre-6A `navigation.tsx`. | No — not a `NavigationMap` host; untouched by Phase 6A or 6B. |
| 12 | `src/features/driver/DriverDashboard.tsx` — `mapRef`, `animateToRegion` (auto-follow for the dashboard's own idle/online preview map) | Unrelated to trip navigation — this map shows the Transporter's own position while idle/online, not a route. | No — different screen, different `<Map>` instance, no `NavigationStore`/`CameraController` involvement at all. |
| 13 | `src/features/passenger/PassengerHome.tsx` — `mapRef`, `animateToRegion` (recenter-to-GPS button) | Customer-side. | No — the engine is driver-only so far (Architecture.md: "Passenger/customer side untouched"). |
| 14 | `src/features/passenger/components/MapPickerModal.native.tsx` — `mapRef`, `animateToRegion` ("my location" button) | An address-picker modal, not a navigation/trip surface at all. | No. |
| 15 | `Map.web.tsx:46-92` — `mapRef`, one `fitBounds` effect | Web platform's map primitive. | No — `navigation.tsx` is a native driver screen; `NavigationMap.tsx`'s own comment already notes `Map.web.tsx` doesn't forward an `animateCamera` method (`CameraController`'s calls are a guarded no-op there). Already correctly gated behind `disableInternalCamera` (verified, pre-existing). |

---

## 3. Removed legacy camera list (Task 2/3 — decisions applied)

Only one item required a code change to reach "CameraController is the only owner" on the migrated screen:

- **`Map.native.tsx`'s zoom +/- buttons (`handleZoom`), item #9 above — Removed** (render-gated) for the `disableInternalCamera` case. This was a genuine bug: Phase 6A wired `app/(driver)/navigation.tsx` onto `<NavigationMap>` with `showZoomControls` passed through, meaning pressing the zoom buttons called `mapRef.current.animateCamera(...)` directly against the same underlying `MapView` `CameraController` was simultaneously driving — a real duplicate-owner path that Phase 6A's own audit missed (it only checked `CameraController`'s own gating, not `Map`'s other imperative entry points). Fixed by changing the render condition from `showZoomControls &&` to `showZoomControls && !disableInternalCamera &&`, the exact same pattern already used (correctly) for the three internal `useEffect`s at items #6-8. Consequence: **the zoom +/- buttons no longer render on `app/(driver)/navigation.tsx`** — flagged as a deliberate, minimal visual reduction in service of eliminating a real duplicate-owner bug, not a redesign. `CameraController` has no manual zoom-override action today (`NavigationControls.tsx`'s own doc comment already says so: *"zoom isn't on `NavigationActions`... there's no manual override action today"*), so building a replacement was out of scope for an ownership-only phase — recorded as remaining work (§4).
- Everything else in the table above required **no change**: items #1-3 are the sanctioned owner and its plumbing (Keep); #4-5 are unused, inert imperative-handle methods (Keep — harmless, exposed for potential future callers but nothing calls them from this screen); #6-8 were already correctly gated before this phase (Keep, verified not touched); #10-15 are Keep (temporary) — out-of-scope screens untouched by either Phase 6A or 6B, not `NavigationMap` hosts, no `CameraController` involvement.

`app/(driver)/navigation.tsx` itself needed no further camera-code removal this pass — Phase 6A had already fully stripped its `mapRef`, both direct `animateCamera` call sites, and the local `isAutoFollow`/auto-follow-resume state. This phase's own grep of that file turned up only a doc comment (no live code) mentioning `animateCamera`.

---

## 4. Remaining camera calls (verified out of scope, not touched)

Per Task 3's explicit scope ("Migrate `app/(driver)/navigation.tsx` completely" — one screen), the following remain, deliberately:

1. `app/(tabs)/navigate.tsx` — full legacy camera implementation (dev/testing tool).
2. `app/(driver)/trip.tsx` — heading-up follow effect + compass reset, same shape `navigation.tsx` had before Phase 6A. Next natural migration target per `Architecture.md`'s Rollout plan step 6/7.
3. `src/features/driver/DriverDashboard.tsx` — idle/online preview map auto-follow.
4. `src/features/passenger/PassengerHome.tsx` — customer recenter button.
5. `src/features/passenger/components/MapPickerModal.native.tsx` — location-picker "my location" button.
6. `Map.native.tsx`'s unused `animateToRegion`/`fitToCoordinates` imperative-handle methods (items #4-5) — inert from this screen, left in place since other screens' own direct `<Map>` usage still calls them via their own refs.

None of these can move the camera `NavigationMap`/`CameraController` is driving — they're all separate screens with their own, un-migrated `<Map>` instances and no `NavigationStore` camera involvement.

---

## 5. Runtime verification

### Subscription flow (Task 4)

```
GPSManager (exclusive GPS owner, unchanged)
  -> onFix(fix)
  -> NavigationProvider (mounted once, app/_layout.tsx, unchanged)
  -> NavigationStore.setGpsFix(fix)                              <- driverLocation/heading/speed/gpsState
  -> useNavigationStore.subscribe(handleStoreChange)              <- CameraController's one subscription
  -> CameraController.recompute() -> mapHandle.animateCamera(...) <- the one call site (§2, item 1)
  -> NavigationMap's animateCamera wrapper -> Map's imperative handle -> react-native-maps MapView
```
Verified by trace (re-reading `CameraController.ts`, `NavigationProvider.tsx`, `NavigationMap.tsx`, `Map.native.tsx` in full) and by the grep in §2: after this phase's fix, item #9 was the only other path capable of reaching the real `MapView`'s camera from this screen, and it's now inert.

One parallel, **non-camera** path exists and is expected, not a violation: `app/(driver)/navigation.tsx` still runs its own `GPSManager.onFix` subscription (unchanged since before Phase 6A) to keep local `driverLocation`/`driverHeading` state for the screen's own turn-by-turn card text, distance-to-pickup calculations, and telemetry ping — none of that touches the camera. `GPSManager` is designed for multiple concurrent listeners (Phase 3.5's `acquire`/`release` reference counting); this dual consumption was already flagged as harmless in Phase 5.5B's report and is unchanged here.

### Cleanup (Task 5)

| Check | Result |
|---|---|
| `detachMap()` on unmount | **Pass** — `NavigationMap.tsx`'s mount effect returns `() => detachMap()`, unchanged; fires whenever the screen unmounts (navigate away, or `currentTrip` going null and the screen returning `null`). |
| Store unsubscribe | **Pass** — `detachMap()` calls `unsubscribeStore()` (if set) and nulls it, plus resets every piece of camera bookkeeping (`mapHandle`, `lastAppliedPose`, `lastAppliedMode`, `lastAppliedCameraState`, `lastSnapshot`) — unchanged code, re-verified by reading it this pass. |
| GPS listener released | **Pass**, pre-existing and unchanged — the screen's own GPS effect cleanup calls `unsubscribeFix()` and `GPSManager.release()`. |
| No leaks | **Pass** — every subscription this screen creates (store subscribe via `attachMap`, GPS fix listener via `GPSManager.onFix`) has a matching teardown in the same effect's cleanup. |

### Validation checklist (from the phase brief)

| Item | Result |
|---|---|
| One camera owner | **Pass** — `CameraController.ts:493` is the only live call site reachable from `app/(driver)/navigation.tsx` after the zoom-button fix. |
| One `attachMap()` | **Pass** — unchanged from Phase 6A: one call site, one host screen. |
| One `detachMap()` | **Pass** — same effect's cleanup, unchanged. |
| No duplicate `animateCamera()` | **Pass** — fixed this phase (§3); was failing before (`handleZoom`). |
| No duplicate `fitToCoordinates()` | **Pass** — `AutoFitEngine`/`CameraController` never call it (confirmed, unchanged); `Map.native.tsx`'s own `fitToCoordinates` (item #5) is inert from this screen (not gated by `disableInternalCamera`, but also never called by anything in `NavigationMap`'s path — `CameraController` only ever calls `animateCamera`). |
| CameraController controls every camera update | **Pass**, on `app/(driver)/navigation.tsx` specifically — not repo-wide (§4 lists what's deliberately still outside its authority). |
| No regressions | **Pass**, with one flagged, deliberate exception: the zoom +/- buttons no longer appear on this screen (§3) — a real, intentional behaviour removal, not a bug, made necessary by the ownership requirement. |
| TypeScript clean | **Pass** — `npx tsc --noEmit`, exit 0, after all edits. |
| ESLint clean | **Partial — clean on every line this phase touched; not clean repo-wide.** See note below. |

### ESLint note

`npx eslint` on the four files touched this phase: **0 errors** in `NavigationMap.tsx` and `CameraController.ts`; **0 new errors or warnings** in `app/(driver)/navigation.tsx` (same 9 pre-existing warnings Phase 6A's report already recorded, all unrelated to camera code); **`Map.native.tsx` has 4 pre-existing errors** (`react/display-name`, and three `react-hooks/rules-of-hooks` "Hook called conditionally" errors on the three internal camera `useEffect`s, because they sit after an early `return <MapPlaceholder />` for the missing-API-key/no-native-module case) plus several pre-existing warnings. **Confirmed pre-existing, not introduced by this phase** — `git diff` on this file shows every hunk above the zoom-controls change (the `disableInternalCamera` prop, its default, and the three `if (disableInternalCamera) return;` guards) was already present in the working tree before this session touched the file; this phase's only edit is the last hunk (the zoom-controls render condition), which adds zero new lint findings. In practice these hook-order errors are unlikely to manifest as a real crash (`hasApiKey`/`hasNativeModule`/`MapView` are effectively constant for a given app install, so the hook count doesn't actually vary across renders), but they are a real rule violation and a pre-existing gap in "ESLint clean." Fixing them means restructuring `Map.native.tsx`'s early-return placement relative to its hooks — a component-structure change unrelated to camera ownership, explicitly out of this phase's scope (`Map.native.tsx`/`Map.web.tsx`/`Map.tsx` is a shared primitive used by 6 other screens per §2 — not something to restructure as a side effect of this prompt). Flagged here rather than silently left out of the report.

### Not performed

No device or simulator available in this environment (same constraint recorded in every prior phase report). Recommend the user open `app/(driver)/navigation.tsx` on a real device/simulator after accepting a ride and confirm: the zoom +/- buttons are gone (expected), the map still follows the driver toward pickup exactly as it did right after Phase 6A, and no console warning/error appears from a second camera write racing `CameraController`'s own log line (`[CameraController] runtime update`, Phase 6A).

---

## 6. Readiness score

**80 / 100** (up from Phase 6A's 70/100).

Rationale: the one screen this phase was scoped to (`app/(driver)/navigation.tsx`) now has a single, verified camera owner with no known duplicate-write paths — the repo-wide audit (Task 1) found one real bug (the zoom buttons) that Phase 6A's own activation pass had missed, and it's fixed. The score isn't higher because (a) five other screens still hold their own hand-rolled camera code, entirely untouched by design (§4) — "CameraController is the only owner" is true for one screen, not the app; (b) `Map.native.tsx` carries pre-existing `react-hooks/rules-of-hooks` errors that keep "ESLint clean" from being a full pass repo-wide, even though this phase's own edits are clean; and (c) real-device verification is still outstanding. Camera *feel* (interpolation, zoom/pitch tuning) remains explicitly untouched, as instructed — that's the next phase's job, not this one's.
