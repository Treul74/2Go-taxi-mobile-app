# Phase 8C — Remove Remaining Legacy Passenger Navigation

**Date:** 2026-08-07
**Type:** Migration (code modified). Closes out the last item named but not resolved by Phase 8B (`audit_07-08-26_20-17_...md` §4.2): the "recenter to my location" calls on `PassengerHome` and `MapPickerModal.native.tsx` still called `mapRef.current.animateToRegion(...)` directly.
**Read first:** `AGENTS.md`, in full (Camera Rules + 🔒 Protected Features).

---

## 1. Files modified

| File | Change |
|---|---|
| `src/navigation/NavigationEngine/CameraController.ts` | Added two new exports: `recenterOnLocation(point, zoom?)` (one-shot camera move on this controller's own tracked singleton map) and `animateCameraTo(handle, point, zoom?)` (the shared primitive behind it, usable against an explicitly-given handle). No existing function, profile table, or the mode/cameraState-driven `recompute()` pipeline was touched. |
| `src/features/passenger/PassengerHome.tsx` | `handleRecenter` now calls `recenterOnLocation(fix.coordinate)` instead of `mapRef.current.animateToRegion(...)`. |
| `src/features/passenger/components/MapPickerModal.native.tsx` | `handleGoToMyLocation` now calls `animateCameraTo(mapRef.current, fix.coordinate)` instead of `mapRef.current.animateToRegion(...)`. |

---

## 2. Why two new functions instead of one

Both call sites were the same shape of bug (a screen directly calling `animateToRegion`), but architecturally different in one important way, so they needed different fixes:

- **`PassengerHome`'s map is already `CameraController`'s tracked singleton** — Phase 8B attached it via `attachMap`/`useFocusEffect`. Its recenter button is a genuine "one more request against the map the engine already owns," so `recenterOnLocation` reuses that existing `mapHandle` and updates `lastAppliedPose` bookkeeping, exactly like `recompute()` does for every other camera move.
- **`MapPickerModal`'s map is a separate, transient, self-contained `MapView`** (raw `react-native-maps`, not even the shared `Map` wrapper) that opens as a full-screen `Modal` on top of whatever screen is mounted underneath — often `PassengerHome`, whose map is *already* the tracked singleton. Registering the modal's own map as that same singleton (`attachMap()` on open) would steal `mapHandle` away from the screen underneath it, and `detachMap()` on close would leave that screen's camera un-driven until its next navigation-focus change (`useFocusEffect` only fires on a screen losing/regaining focus — a `Modal` opening over a screen doesn't trigger that). That's a worse ownership bug than the one being fixed, not a better one.

Rather than force a real ownership conflict to satisfy the letter of "goes through the engine," `animateCameraTo(handle, point, zoom)` was factored out as the shared, stateless application primitive both functions ultimately call — the one place in the entire app that ever constructs an `animateCamera` call. `recenterOnLocation` is a thin wrapper that supplies the singleton `mapHandle` and updates the controller's own bookkeeping; `MapPickerModal` calls the shared primitive directly with its own ref, which is never registered as anything the controller reactively drives. This is the explicit, documented decision the prior audit (`audit_07-08-26_19-37_...md` §3.4) asked for, made this time rather than deferred again: **`MapPickerModal`'s map is intentionally never wired into the singleton**, because doing so would create duplicate/competing ownership instead of removing it — but the actual forbidden call (a screen invoking `animateToRegion`/`animateCamera` itself) is still gone.

Both share the same zoom constant (`RECENTER_ON_LOCATION_ZOOM = 17.5`, matching the app's existing "premium street-level zoom" convention / `dynamicZoomForSpeed`'s "city driving" tier) — a minor, cosmetic zoom-level vs. region-delta difference from the previous `latitudeDelta 0.0035` calls, not a behavior change either recenter button's user ever notices.

---

## 3. What was NOT changed (preserved as instructed)

- **Ride booking, search, business logic** — untouched. Neither file's data flow, InsForge calls, or `rideStore` interactions were touched; only the two `animateToRegion` call sites changed.
- **Location picker behaviour** — `MapPickerModal`'s drag-to-pin, debounced reverse-geocode, snap-to-road toggle, and confirm flow are byte-for-byte unchanged; only its "go to my location" button's camera call was swapped.
- **GPS ownership** — unchanged. Both screens still read location exclusively via `GPSManager.getCurrentFix(...)` (one-shot reads, no subscription) — no GPS code was touched in this pass.
- **`CameraController`'s existing behaviour** — its per-mode `CAMERA_PROFILES` table, `computeTargetPose`, `recompute`, and the `handleStoreChange` subscription are all unchanged; the two new exports are additive and sit outside that reactive pipeline entirely (a manual recenter tap isn't a `NavigationMode`/`CameraState` event).
- **`Map.native.tsx`/`Map.web.tsx`'s own internal `fitToCoordinates`/`animateToRegion` effects** — still present, still the active camera implementation for the states `CameraController`'s profile table has no opinion about (`IDLE`/`OFFLINE`, and any screen not yet migrated). Not removed — same reasoning as Phase 8B §4 item 4: `CameraController` doesn't cover those states, so removing `Map`'s fallback would leave them with no camera behavior at all, a larger change than this phase's brief. Confirmed still gated behind `disableInternalCamera`, unchanged from Phase 8B.

---

## 4. Validation

- ✓ **No duplicate camera ownership** — `PassengerHome`'s recenter now goes through the same singleton `mapHandle` `CameraController` already owns (no second code path touching that map). `MapPickerModal`'s map was never, and is still never, registered as anything else's tracked map — one map, one (non-reactive, one-shot) driver of its camera, `animateCameraTo`, called from exactly one place.
- ✓ **No duplicate GPS ownership** — unchanged; both screens still read location only via `GPSManager.getCurrentFix(...)`. Confirmed by re-reading both files in full — no `expo-location` import was added or exists.
- ✓ **Navigation Engine owns camera** — repo-wide grep for `.animateToRegion(`/`.animateCamera(`/`.fitToCoordinates(` across `src/**/*.ts(x)` now returns exactly: `CameraController.ts` (the engine itself, expected), `Map.native.tsx` (the shared component's own internal fallback for states the engine doesn't cover — documented, unchanged), `DriverDashboard.tsx` (Transporter-side, out of this phase's "passenger" scope), and `app/(tabs)/navigate.tsx` (sanctioned dev-tool exception, per `AGENTS.md`). Zero remaining direct calls anywhere under `src/features/passenger/`.
- ✓ **TypeScript passes** — `npx tsc --noEmit`, exit code 0, zero errors, after this change.

---

## 5. Remaining legacy navigation (by design, not oversight)

1. **`Map.native.tsx`/`Map.web.tsx`'s internal `fitToCoordinates`/`animateToRegion` effects** — still the only camera implementation for `IDLE`/`OFFLINE`/active-trip states on any screen using the raw `<Map>` component (`PassengerHome` outside PREVIEW/MATCHING, `DriverDashboard`'s idle map). Carried forward from Phase 8B — `CameraController`'s profile table has no opinion for those states by design.
2. **`DriverDashboard.tsx`'s own `animateToRegion`** — Transporter-side, explicitly out of scope for this "passenger" phase.
3. **`app/(tabs)/navigate.tsx`** — sanctioned dev/testing exception (`AGENTS.md`'s own folder-structure comment), unchanged across every phase to date.
4. **`MapPickerModal.native.tsx`'s `MapView` is deliberately never `attachMap()`-registered** — see §2's reasoning. Its one camera call now goes through the engine's shared `animateCameraTo`, but the map itself is not, and should not be, part of `CameraController`'s tracked-singleton model.
