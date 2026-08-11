# Phase 9A — Migrate Driver Dashboard to the Navigation Engine

**Date:** 2026-08-07
**Type:** Migration (code modified). Closes the last item named in `audit_07-08-26_20-29_phase8d-...md` (§9.1/§14 item 1): `DriverDashboard.tsx`'s own `mapRef.current.animateToRegion(...)` call.
**Read first:** `AGENTS.md` (🔒 Protected Features), `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md` — all re-read before any code was touched.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/features/driver/DriverDashboard.tsx` | Full migration of its map layer onto the Navigation Engine. Net **−41 lines** (53 insertions, 94 deletions) — this migration removed code, it didn't add a parallel system. |

No other file was changed. `NavigationMap.tsx`, `CameraController.ts`, `NavigationStore.ts`, and every other engine file are untouched — `recenterOnLocation` (Phase 8C) and the existing `useDriverLocation`/`useFollowMode` selectors were consumed as-is, not extended.

---

## 2. Migration report

### 2.1 What was removed, and why it was safe to remove entirely (not just the animateToRegion call)

The old implementation had **two separate problems**, not one: the obvious one (a direct `mapRef.current.animateToRegion(...)` call inside a GPS fix handler), and a less obvious one — its own hand-rolled "pause following while the driver pans, resume after 5 seconds" state machine (`isAutoFollow`, `lastInteraction`, `isAutoFollowRef`, a `setInterval` polling loop, `handleMapAction`). That second piece was already a **duplicate** of a mechanism the engine has had since Phase 7: `<NavigationMap/>`'s own `onPanDrag` handler already calls `navigation.enterFreeExplore()` on a pan gesture and `navigation.recenter()` after a 7-second timeout (`NavigationMap.tsx`'s `FREE_EXPLORE_AUTO_RECENTER_MS`), writing `cameraState`/`followMode`/`recenterState` into `NavigationStore` — the exact same store fields `NavigationCompass`/`NavigationControls` already read on the driver's other two screens.

Read alone, "replace the animateToRegion call" could have meant keeping `isAutoFollow`/the polling timer and just swapping what fires inside them. That would have left two independent "am I following right now" state machines running side by side (one in `NavigationStore.followMode`, one in this screen's own `isAutoFollow`) — itself a form of duplicate ownership, just one level removed from the camera call. Since `<NavigationMap/>`'s gesture handling already updates `NavigationStore.followMode` regardless of which `NavigationMode` is active (verified by reading `NavigationStore.enterFreeExplore()`/`recenter()` — they're plain state setters with no mode gate), the correct fix was to delete the screen-local duplicate and read `useFollowMode()` instead — one state machine, not two.

### 2.2 Why `CameraController.recenterOnLocation` and not a `CameraProfile` for IDLE/OFFLINE

`CameraController`'s `CAMERA_PROFILES` table has no entry that produces a pose for `IDLE`/`OFFLINE` (`computeTargetPose` returns `null` unconditionally for those two modes, by design — there's no active trip to frame). Adding one would be a `CameraController.ts` change with app-wide blast radius (every screen that currently relies on "IDLE = no camera opinion", not just this one), which is a materially bigger decision than "migrate this Dashboard's camera ownership." Phase 8C already established the narrower, correct primitive for exactly this situation — `recenterOnLocation(point)`, a mode-independent one-shot camera move through the same singleton `mapHandle` `CameraController` already owns. This migration reuses it, called on every fix while `followMode` is true, which reproduces "continuously follow the driver's position" without touching the mode-driven pipeline at all.

### 2.3 The GPS effect shrank because GPS was already being double-handled

The old `onFix` subscription existed for three reasons at once: (1) mirror the fix into local `driverLocation`/`driverHeading` state, (2) call `driverStore.updateLocation()`, (3) drive the camera. `NavigationProvider` (mounted once at the app root, unrelated to this screen) already forwards every `GPSManager` fix into `NavigationStore.driverLocation`/`heading` the moment `GPSManager.acquire()` succeeds anywhere in the app — so reason (1) was already redundant with engine state before this migration touched anything. This screen's GPS effect is now acquisition/release lifecycle only (`GPSManager.acquire('foreground','driverBestNavigation')` on `isOnline`, `release()` on cleanup) — identical in shape to `app/(driver)/navigation.tsx`'s and `trip.tsx`'s own GPS effects. Reasons (2) and (3) became their own small, focused effects reading `driverLocation` from the engine (`useDriverLocation()`) instead of a local mirror — (2) is the same `driverStore.updateLocation` bridge `trip.tsx` already uses (Architecture.md's "Relationship to existing stores"), (3) is §2.2's `recenterOnLocation` effect.

### 2.4 What was deliberately left untouched

- `handleToggleOnline`'s `driverStore.goOnline`/`goOffline` calls and its `safeTransition(() => navigation.goOffline()/goOnline())` mode-machine mirror — byte-for-byte unchanged.
- `handleAcceptRequest`'s `acceptRequest()` call and its `safeTransition(() => navigation.preview/requestMatch/driverToPickup(...))` replay — unchanged. It still reads `driverLocation`, just now sourced from `useDriverLocation()` instead of local state (same value, same call).
- The pending-orders realtime-channel cleanup effect, `RequestCard`/`OnlineToggle`/`DashboardStats` and everything they do — untouched.
- `showUserMarker={false}` was dropped as a prop because `<NavigationMap/>` never passes a separate `userLocation` prop to `Map` at all (confirmed by reading `Map.native.tsx` line 596: the user-location dot only renders when `showUserMarker && !driverLocation && userLocation` — with no `userLocation` ever supplied, that branch is dead regardless of the flag). No visual change.
- The auto-follow "resume" timing moves from a hand-rolled 5000ms to the engine's existing, shared 7000ms (`FREE_EXPLORE_AUTO_RECENTER_MS`) — a minor, non-business-logic UX constant, now consistent with the two other driver screens instead of a third, different value. Not treated as a regression.

---

## 3. Validation

- ✓ **No direct camera calls remain** — confirmed by grep: zero matches for `.animateToRegion(`/`.animateCamera(`/`.fitToCoordinates(` in `DriverDashboard.tsx`.
- ✓ **CameraController owns the Dashboard camera** — the only camera-affecting call left in the file is `CameraController.recenterOnLocation()`; `<NavigationMap/>` owns everything else (pan-gesture-to-FREE_EXPLORE, marker rendering) exactly as it already does on `navigation.tsx`/`trip.tsx`.
- ✓ **NavigationStore remains the single source of truth** — `driverLocation` and `followMode` are both read live from `NavigationHooks` selectors; the screen holds no parallel camera/position state of its own anymore.
- ✓ **Existing dashboard behaviour is unchanged** — continuous camera-follow while online and idle, pausing while the driver pans the map and auto-resuming shortly after (7s vs. the old 5s — see §2.4), driver marker rendering, online/offline toggle, incoming-request accept/decline, and the Accept → `/(driver)/navigation` handoff are all preserved.
- ✓ **TypeScript passes** — `npx tsc --noEmit`, exit code 0, zero errors.

---

## 4. Remaining Dashboard legacy code

**None specific to `DriverDashboard.tsx`.** Every item Phase 8D's compliance audit named for this file (§9.1, §14 item 1) is resolved.

What's left is app-wide, already tracked in the Phase 8D report, and out of this task's scope (a screen-specific camera-ownership migration, not an engine-completeness pass):
- `GPSManager.applyScenario`/battery-optimization profile switching — still built, never called (unrelated to this screen; a GPS-layer gap, not a camera one).
- `customerLocation` still has no producer — unrelated to the Transporter side.
- `NavigationHUD`'s composite component still has zero consumers app-wide — `DriverDashboard` was never a candidate for it (it shows no turn-by-turn HUD, before or after this migration; it never had an active trip to display one for).
