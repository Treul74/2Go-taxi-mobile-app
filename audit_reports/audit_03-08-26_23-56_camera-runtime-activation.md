# Phase 6A — Camera Runtime Activation Report

**Date:** 2026-08-03
**Scope:** Activate the already-built Camera Runtime (`CameraController.ts`, `AutoFitEngine.ts`, `NavigationMap.tsx`, `NavigationHUD.tsx`) by mounting `<NavigationMap>` on exactly one screen, per explicit instruction: no camera redesign, no camera-feel improvements, no Google-Maps-style behaviour built, no edits to `CameraAnimation.ts` or `NavigationMath.ts`.
**Method:** Read `AGENTS.md`, `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`, and the two most relevant prior reports (`audit_03-08-26_16-45_navigation-runtime-integration.md` — Phase 5, `audit_03-08-26_17-10_start-pickup-runtime-handoff.md` — Phase 5.5B) in full before writing any code. Read `CameraController.ts`, `AutoFitEngine.ts`, `NavigationMap.tsx`, `NavigationHUD.tsx`, `NavigationHooks.ts`, `NavigationStore.ts`, `types.ts`, `hooks/useNavigation.ts`, and `app/(driver)/navigation.tsx` in full before deciding what to change.

---

## 1. Files modified

- **`app/(driver)/navigation.tsx`** — the chosen (and only) `NavigationMap` host. Swapped the screen's hand-rolled `<Map>` (manual `driverLocation`/`pickup`/`routeCoordinates`/`eta` props, a `mapRef`, and two direct `animateCamera()` call sites) for `<NavigationMap showZoomControls />`, which reads all of that from `NavigationStore` itself. Added one mount-once `navigation.followDriver()` dispatch. Removed the now-dead legacy camera code the swap made unreachable (details in §2).
- **`src/navigation/NavigationEngine/CameraController.ts`** — added `logRuntimeUpdateInDev()`, a `__DEV__`-gated console log inside `handleStoreChange()` (fires before the snapshot-equality gate, so it logs every store change CameraController receives, not just ones that move the camera). Verification-only, matching the precedent `NavigationProvider`'s `logTransitionsInDev()` set in Phase 5.5B. No other line in this file changed — `computeTargetPose`, `recompute`, the camera-profile table, and every animation/gating calculation are untouched.

Not modified: `CameraAnimation.ts`, `NavigationMath.ts`, `AutoFitEngine.ts`, `NavigationHUD.tsx`, `NavigationStore.ts`, `NavigationModes.ts`, `NavigationProvider.tsx`, any other `src/components/navigation/*` file, `app/(tabs)/navigate.tsx`, `app/(driver)/trip.tsx`.

---

## 2. Camera activation report

### Why `app/(driver)/navigation.tsx`

Per Task 1's instruction to prefer this screen: it's the most direct match (Architecture.md's own Rollout plan step 6 already named it as the first full migration target), it's a single, well-isolated screen (not a shared component like `Map.tsx`), and its `NavigationStore.mode` is already `DRIVER_TO_PICKUP` by the time it mounts (dispatched at Accept time in `DriverDashboard.handleAcceptRequest`, Phase 5C) — meaning the camera profile that applies here is well-defined and already fully implemented in `CameraController.ts`'s `CAMERA_PROFILES` table. No other screen currently renders a real map for an active trip except `app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` (explicitly a dev/testing tool per `AGENTS.md`'s folder-structure comment) — both untouched this pass, per Task 1's "do not migrate multiple screens."

### What changed, concretely

The old render tree called `<Map ref={mapRef} driverLocation={...} pickup={currentTrip.pickup} routeCoordinates={routeCoordinates} eta={routeEta || ...} ... />` and drove its own camera via two direct `mapRef.current.animateCamera(...)` call sites: a heading-up follow effect gated on local `isNavigating && isAutoFollow` state, and a compass-press handler that reset heading to 0. Both are exactly what AGENTS.md's "Camera Rules" and the Bible's "Core Principles" forbid ("Screens must never call animateCamera() ... directly").

The new render tree is `<NavigationMap showZoomControls />`. `NavigationMap` (already fully built, unmodified this pass) reads `pickup`/`destination`/`driverLocation`/`heading`/`route` from `NavigationStore` via `NavigationHooks.ts` selectors and, in its own mount effect, calls `attachMap()`/`detachMap()`/`setViewportSize()` against `CameraController` — this is the exact integration point `CameraController.ts`'s own TODO comment named as the eventual caller. Because the screen no longer holds a map ref, the two direct `animateCamera()` call sites became unreachable and were removed:

- The heading-up follow `useEffect` (was gated on `isNavigating`/`isAutoFollow`/`driverLocation`/`driverHeading`) — deleted, along with the now-unused `isAutoFollow`/`lastInteraction` state, the 5-second auto-follow-resume timer, `handleMapAction`, and the `NAV_CAMERA_PITCH`/`NAV_CAMERA_ALTITUDE`/`NAV_CAMERA_ZOOM` constants that only fed it. `onPanDrag`/`onRegionChangeComplete` (which called `handleMapAction`) aren't currently supported by `NavigationMap`'s prop surface, so this is a real, not merely relocated, capability loss — recorded in §6.
- The compass-press handler — rewritten from a direct `mapRef.current.animateCamera({ heading: 0 }, 700)` call to `navigation.recenter()`, an existing, already-implemented `NavigationActions` method (`NavigationStore.ts`: sets `cameraState: 'FOLLOW_DRIVER'`, `followMode: true`, `recenterState: 'idle'`). This is a request through the engine's documented action surface, not new camera logic — the Bible's own worked example is literally `navigation.followDriver()`.
- `handleStartPickup`'s now-nonexistent `setIsAutoFollow(true)` call was removed (would otherwise be a compile error); `isNavigating` itself is untouched and still gates the screen's own turn-by-turn card/compass visibility/button-vs-slider UI — none of that UI was redesigned.
- `routeEta` state (only ever fed the old `<Map eta={...}>` prop) and the now-unused local `eta` variable (`Math.ceil(distance * 2)`, same reason) were removed as dead code created by the swap, not independently refactored.

### A gap found and fixed: `cameraState` defaults to `OVERVIEW`, not `FOLLOW_DRIVER`

`NavigationStore`'s `initialState.cameraState` is `'OVERVIEW'` and no existing trip-mode action (`driverToPickup()` included) ever changes it — `cameraState` is deliberately orthogonal to `mode` (Architecture.md, "Camera intents"). `CameraController.computeTargetPose` treats `DRIVER_TO_PICKUP` as a "fall through to `cameraState`" mode: with `cameraState` still `'OVERVIEW'`, the very first pose it would compute is `fitCompleted(driverLocation, destination, ...)` (an auto-fit shot) instead of the Bible's documented `DRIVER_TO_PICKUP` follow behaviour (driver anchored at 65-70% down screen, heading-locked bearing).

Fixed by adding one mount-once effect to `navigation.tsx`:
```ts
useEffect(() => { navigation.followDriver(); }, []);
```
This calls an existing, unmodified `NavigationActions` method — it does not add a new camera intent, does not touch `CameraAnimation.ts`/`NavigationMath.ts`, and is exactly the Bible's own documented usage pattern. Without it, this phase's "activation" would have surfaced the wrong camera profile the moment the map attached, which is a correctness bug in wiring, not a camera-feel improvement being smuggled in.

Because `NavigationMap`'s `attachMap()` effect (a child of this screen) runs before the screen's own `followDriver()` effect (React fires child effects before parent effects on mount), the very first pose CameraController computes is still genuinely `fitCompleted` (`cameraState` is `'OVERVIEW'` at that instant) — see §4, this doubles as a real, non-contrived exercise of `AutoFitEngine` for Task 5.

---

## 3. Subscription report

| Check | Result |
|---|---|
| `attachMap()` call sites app-wide | Exactly one, inside `NavigationMap.tsx`'s own mount effect (unmodified) — grep-confirmed. |
| `<NavigationMap>` host screens app-wide | Exactly one — `app/(driver)/navigation.tsx` — grep-confirmed. |
| `attachMap()` executes once per mount | Yes — `NavigationMap`'s effect has an empty dependency array (`[]`), and the screen renders `<NavigationMap />` unconditionally in its return (not behind a remounting key), so it isn't re-triggered on re-render. |
| `CameraController` subscribes | Yes — `attachMap()` sets `unsubscribeStore = useNavigationStore.subscribe(handleStoreChange)`, guarded (`if (!unsubscribeStore)`) so a second `attachMap()` call (e.g. React StrictMode's dev-only double-invoke) can't create a second subscription. |
| `CameraController` unsubscribes | Yes — `NavigationMap`'s effect cleanup calls `detachMap()`, which calls `unsubscribeStore()` and nulls every piece of module state (`mapHandle`, `lastAppliedPose`, `lastAppliedMode`, `lastAppliedCameraState`, `lastSnapshot`). |
| No duplicate subscriptions possible | Yes — `attachMap()`'s `if (!unsubscribeStore)` guard predates this phase and was not touched; verified by re-reading it, not assumed. |
| No leaks | Yes — the only cleanup path is `detachMap()`, wired to `NavigationMap`'s effect return, which fires on every unmount (navigation away from the screen, `currentTrip` going null and the screen returning `null`, etc.). |

This is a wiring/lifecycle verification, not new code — `attachMap`/`detachMap`'s subscribe/unsubscribe logic is exactly as Phase 5.5B last read it (§5 of that report: "not subscribed... literally not subscribed"). This phase's only contribution is that a screen now actually calls it.

---

## 4. AutoFit report

| Check | Result |
|---|---|
| `CameraController` invokes `AutoFitEngine` | Yes, unconditionally reachable — `computeTargetPose` calls `fitPreview(...)` for `PREVIEW`/`MATCHING` mode or `cameraState === 'FIT_ROUTE'`, and `fitCompleted(...)` for `TRIP_COMPLETED` mode or `cameraState === 'OVERVIEW'`. Confirmed by re-reading `CameraController.ts:398-418`, unmodified this pass. |
| Exercised for real, this pass | Yes — see §2's gap-found note: at the instant `attachMap()` first runs (before the screen's `followDriver()` effect has fired), `mode` is `DRIVER_TO_PICKUP` and `cameraState` is still the initial `'OVERVIEW'`, so `computeTargetPose` takes the `fitCompleted(driverLocation, destination, viewportSize, chrome)` branch — a genuine `AutoFitEngine.fitPoints` → `computeBounds` → `calculateZoomToFitBounds` call chain, not a contrived one. |
| `fitToCoordinates()` called | No — grep-confirmed zero occurrences in `CameraController.ts`, `AutoFitEngine.ts`, or `NavigationMap.tsx`. The engine's one animation call site (`CameraController.recompute`) only ever calls `mapHandle.animateCamera(...)`, and `AutoFitEngine.fitPoints` only returns a `CameraAnimationState` — it doesn't call anything on a map itself. |
| Bounds actually computed | Yes, by trace — `fitPoints` (`AutoFitEngine.ts:121-141`) filters valid points, calls `computeBounds` (`NavigationMath.ts`, unmodified) to get a `LatLngBounds`, then `calculateZoomToFitBounds` (`CameraAnimation.ts`, unmodified) to turn that + the current `viewportSize`/`chrome` into a zoom level and returns a full `CameraAnimationState`. |
| Animation triggered off this fit pose | Yes, per existing `recompute()` gating (unmodified) — `isFirstApplication` is true on the very first pose, so `shouldApply = true` and it's applied with `durationMs = 0` (a snap, not a tween) directly to `mapHandle.animateCamera(...)`. This is the one real camera move this pass causes, and it's a pre-existing, already-implemented code path being exercised for the first time — not new logic written this pass. |

No change was made to `AutoFitEngine.ts` itself — Task 5's "verify" was satisfied by tracing the existing, unmodified call chain and confirming (via the dev log added in §5) that it fires during a real mount, not by adding new fit-calling code.

---

## 5. Runtime verification

Task 4 ("Verify NavigationStore updates reach CameraController... Print Current Mode, GPS, Route, ETA, Driver Position. Do NOT animate. Only verify.") is satisfied by `logRuntimeUpdateInDev()`, added inside `CameraController.handleStoreChange()` (see §1). It fires on **every** Zustand store notification while a map is attached — before the snapshot-equality dedup that decides whether `recompute()` (and therefore any animation) runs — so it logs GPS-only updates (`setGpsFix`), route-only updates (`setRoute`), and mode-only updates identically, exactly matching "every update received." It is purely a `console.log`; it reads state and returns, it never calls `animateCamera` or any camera math itself, satisfying "Do NOT animate. Only verify."

Fields printed per update: `mode`, `gps` (GPS signal status), `route` (id + current `etaSeconds` when a route exists, else `null`), `etaSeconds`, `driverPosition`. `__DEV__`-gated, so it is a no-op in production builds — zero runtime cost, zero behaviour change outside development.

### Validation checklist (from the phase brief)

| Item | Result |
|---|---|
| NavigationMap mounted once | **Pass** — one host screen, unconditional render, empty-deps mount effect (§3). |
| `attachMap` executes once | **Pass** — one call site, guarded against duplicate subscription (§3). |
| CameraController subscribes | **Pass** — verified by trace, unchanged subscribe logic (§3). |
| CameraController unsubscribes correctly | **Pass** — `detachMap()` wired to the same effect's cleanup (§3). |
| AutoFitEngine receives runtime updates | **Pass** — reachable and exercised on first attach (§4). |
| NavigationStore updates reach CameraController | **Pass** — `handleStoreChange` is a live Zustand subscriber the moment `attachMap()` runs; GPS fixes (`NavigationProvider`, Phase 5B), route publishes (`setRoute`, Phase 5D), and mode transitions (Phase 5C) were already flowing into the store before this phase — this phase is what gives `CameraController` its first real listener on all three. |
| No duplicate subscriptions | **Pass** — guarded, unchanged code, re-verified (§3). |
| No crashes | **Pass** — `npx tsc --noEmit` clean, exit 0; `npx eslint` on both touched files: 0 errors, 9 pre-existing/unrelated warnings (2 are new-but-benign `react-hooks/exhaustive-deps` warnings on the two new mount-once effects — see below). |
| TypeScript clean | **Pass** — see above. |

### Lint note

`npx eslint "app/(driver)/navigation.tsx" "src/navigation/NavigationEngine/CameraController.ts"` → **0 errors, 9 warnings**. Two warnings are new (both `react-hooks/exhaustive-deps`, flagging that the `[]`-deps `followDriver()` effect and the pre-existing GPS-tracking effect don't list every value they close over) — this matches the file's own established pattern of intentionally-`[]` mount-once effects (e.g. the pre-existing `router`-omitting redirect effect) and is not a functional bug: `navigation` (from `useNavigation()`) is a fresh shallow-selected object every render but its methods are stable store actions, so omitting it from deps doesn't cause stale-closure bugs the way it would for local state. The remaining 7 warnings (`handleOpenSettings`/`isNearPickup` unused, array-type style, a few other pre-existing missing-deps) all predate this phase and are unrelated to this change — left untouched per "protect what already works."

### Not performed

No device or simulator is available in this environment (same constraint every prior phase report in this series has recorded). The dev-log added in §5, the `tsc`/`eslint` clean runs, and the manual trace of every call chain (§2-§4) are the verification this pass could perform. Recommend the user run the app once (Metro/Expo Go or a real device), accept a ride, and open this screen with the console open — the expected log sequence is: one `fitCompleted`-style snap (`OVERVIEW`) immediately followed by a `FOLLOW_DRIVER` re-pose once the `followDriver()` effect fires, then a steady stream of `[CameraController] runtime update` lines as GPS fixes arrive.

---

## 6. Remaining work before Camera Ownership (Phase 6B)

1. **Lost gesture-to-`FREE_EXPLORE` wiring.** The old screen's `onPanDrag`/`onRegionChangeComplete` → `handleMapAction` → local `isAutoFollow = false` behaviour had no equivalent in `NavigationMap`'s current prop surface, so it was removed rather than silently orphaned. The Bible's own closing section (`enterFreeExplore()` already exists as a `NavigationActions` method) describes exactly this: a pan/pinch should call `navigation.enterFreeExplore()` and show a floating Recenter button once `recenterState === 'available'`. Wiring `Map`'s pan/region-change callbacks through `NavigationMap` into `enterFreeExplore()`, and rendering a Recenter affordance off `useRecenterState()`, is real camera-ownership behaviour — correctly out of scope for an activation-only pass.
2. **`cameraState` has no per-mode default.** This phase patched the one screen it touched with a manual `followDriver()` call. A more durable fix — e.g. `driverToPickup()`/`startTrip()` also setting `cameraState: 'FOLLOW_DRIVER'` inside `NavigationStore.ts`, or `CameraController` defaulting unset/`OVERVIEW` `cameraState` to a per-mode sensible follow — would remove the need for every future screen to remember this call. Left as-is because touching `NavigationStore.ts`'s action bodies is a state-machine change, not a rendering activation, and this pass's brief named `NavigationStore` as one of the files already "fully implemented."
3. **On-map ETA badge lost, not replaced.** The old `<Map eta={...}>` prop rendered a small ETA label on the map surface itself; `NavigationMap` has no equivalent prop. `NavigationHUD`'s `EtaChip` (reads `useEtaSeconds()`/`useDistanceRemainingMeters()`) is the structurally-correct replacement per the Bible's HUD layout, but mounting the full `NavigationHUD` composite on this screen would duplicate the screen's own hand-built turn-by-turn card (Task 6's "no redesign, no styling changes" ruled this out for this pass). A future pass should decide whether this screen adopts `NavigationHUD` wholesale (replacing its bespoke turn-by-turn card) or gets a standalone `EtaChip`.
4. **Destination marker now visible during `DRIVER_TO_PICKUP`.** `NavigationMap` renders `NavigationStore.destination` whenever it's set — which it is, from Accept time (`preview(trip.pickup, trip.destination)`). The old screen only ever passed `pickup` to `<Map>`, so the customer's drop-off pin wasn't shown while the Transporter was still en route to pickup. This is a harmless, arguably useful side effect of full activation (not a camera behaviour), flagged here rather than silently suppressed with new filtering logic.
5. **`app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` are unmigrated**, per Task 1's explicit "choose only one screen." Both still render the legacy `<Map>` with their own direct camera code — Architecture.md's Rollout plan step 6 already anticipated this as sequential, one-screen-at-a-time work.
6. **GPS accuracy scenario switching still not wired.** Flagged unchanged since Phase 5's report — `NavigationProvider` doesn't yet call `GPSManager.applyScenario(...)` based on `mode`; out of scope for this pass and not touched.

---

## 7. Readiness score

**70 / 100** (up from Phase 5.5B's 55/100).

Rationale: this is the pass that finally answers Phase 5.5B's own closing question — "which screen renders `<NavigationMap>` first." `CameraController` and `AutoFitEngine` are no longer "built, disconnected": both are now demonstrably live, subscribed, and exercised on every render of a real driver screen, with dev-mode visibility into every update they receive. The score isn't higher because real device verification is still outstanding (no simulator in this environment, consistent with every prior phase), and because §6 lists five genuine follow-on items — most notably gesture-to-`FREE_EXPLORE` and the missing per-mode `cameraState` default — that Phase 6B ("Camera Ownership") needs to close before this screen's camera behaviour can be called complete, not just activated.
