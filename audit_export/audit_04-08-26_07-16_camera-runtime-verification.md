# Phase 6.5 — Camera Runtime Verification Report

**Date:** 2026-08-04
**Scope:** Verify the Camera Runtime behaves correctly under live navigation, before any camera-feel tuning begins. Verification only — no camera-feel changes, no `CameraAnimation.ts`/`NavigationMath.ts` edits, no zoom/pitch algorithm changes.
**Method:** Read `AGENTS.md`, `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`, and this session's own Phase 6A/6B reports before analysis. Then read `CameraController.ts`, `NavigationProvider.tsx`, `GPSManager.ts`, `NavigationStore.ts`, `NavigationModes.ts`, `CameraAnimation.ts`, `NavigationHooks.ts`, `types.ts`, and `app/(driver)/navigation.tsx` in full, and grepped every real call site of every camera-state action (`followDriver`/`recenter`/`fitRoute`/`overview`/`enterFreeExplore`) across the whole app. **No device or simulator is available in this environment** (same constraint every phase report in this series has recorded) — every finding below is a static/code trace, explicitly labeled where it's derived rather than measured.

**One code change made this phase**, justified in full under Task 7/Deliverable 5: `CameraController.ts`'s existing dev-only log (added in Phase 6A) was missing three of the seven fields this phase's own Task 7 checklist names (`heading`, `speed`, `cameraState`) and had no timestamp for rate measurement. Extended it to add exactly those four fields — no other line in `CameraController.ts`, and no line in any other file, changed. This is instrumentation, not camera behavior: the log call sits in the same place, fires under the same conditions, and moves nothing.

---

## 1. GPS → Camera sequence diagram (Task 1)

```
GPSManager (foreground watcher, driverBestNavigation profile: 1000ms / 1m)
  -> Location.watchPositionAsync callback -> handleRawLocation(raw)
  -> processRawFix(raw): two hard-reject gates run FIRST
       - accuracy worse than 30m (profile's maxAcceptableAccuracyMeters)  -> REJECTED, dropped, never emitted
       - implied speed > 55 m/s (impossible jump/glitch)                  -> REJECTED, dropped, never emitted
     (fixes that clear both gates get a EXCELLENT/GOOD/FAIR/POOR quality tag,
      but are NOT rejected for a low tier — see Task 5 below)
  -> emit('LOCATION_UPDATED', { fix })                                    <- synchronous, in-process pub/sub
  -> NavigationProvider's onFix listener (app/_layout.tsx, mounted once)
  -> useNavigationStore.getState().setGpsFix(fix)                         <- synchronous Zustand `set()`
  -> Zustand notifies every subscriber synchronously, same tick, incl.:
  -> CameraController.handleStoreChange()                                 <- the ONE store subscription (see §6)
       -> logRuntimeUpdateInDev(state)   [dev-only, this phase's extension]
       -> snapshot-equality gate (mode/cameraState/driverLocation/pickup/
          destination/heading/speed) -> recompute(state) if any differ
       -> computeTargetPose(state) -> a CameraProfile-driven pose
       -> movement/rotation/zoom-delta gating decides shouldApply
       -> mapHandle.animateCamera(...)                                    <- the ONE animateCamera call site
  -> NavigationMap's animateCamera wrapper -> Map's imperative handle
  -> react-native-maps MapView.animateCamera (real camera moves)
```

**Confirmed: no update is dropped between GPSManager and CameraController**, while a map is attached. Every step from `emit('LOCATION_UPDATED', ...)` through Zustand's subscriber notification is a synchronous, same-JS-tick function call chain (verified by reading `GPSManager.ts`'s `emit`, `NavigationProvider.tsx`'s `onFix` listener, and `NavigationStore.setGpsFix`/Zustand's `set` in turn) — nothing async, batched, or debounced sits between a fix arriving and `CameraController.handleStoreChange()` running. `logRuntimeUpdateInDev` fires unconditionally at the top of `handleStoreChange` (before the snapshot-equality gate), so it logs every store change CameraController receives — including ones that don't end up moving the camera — which is what makes "no update dropped" independently verifiable from "did the camera actually move" (a separate, deliberate gate — see §4/§5).

One caveat, by design not defect: `handleStoreChange` early-returns `if (!mapHandle) return;` — while no screen has `<NavigationMap>` mounted (e.g. the Transporter is on `DriverDashboard`, not `navigation.tsx`), GPS fixes still flow into `NavigationStore` (Phase 5B, unchanged), but `CameraController` never runs its body for them at all — correctly, since there's no map to drive.

---

## 2. Camera state transition report (Task 3)

Task 3 names a sequence — `OVERVIEW → FOLLOW_DRIVER → FREE_EXPLORE → RECENTER → ARRIVAL` — that mixes three separate pieces of engine vocabulary (`CameraState`, `RecenterState`, and `NavigationMode`'s arrival modes). Mapping each named step onto the real, unmodified code and checking whether it's actually reachable from a live screen today:

| Named step | Real engine concept | Reachable today? | Evidence |
|---|---|---|---|
| `OVERVIEW` | `CameraState = 'OVERVIEW'` | **Yes** — it's `NavigationStore`'s initial default (`initialState.cameraState`). On `app/(driver)/navigation.tsx`, this is genuinely exercised: `NavigationMap`'s `attachMap()` effect (a child) runs before the screen's own `followDriver()` effect (a parent), so the very first pose `CameraController` computes is a real `fitCompleted(driverLocation, destination, ...)` — confirmed in Phase 6A's own report. | `NavigationStore.ts` initial state; `CameraController.computeTargetPose` `cameraState === 'OVERVIEW'` branch. |
| `FOLLOW_DRIVER` | `CameraState = 'FOLLOW_DRIVER'` | **Yes** — `followDriver()` (navigation.tsx's mount effect, added Phase 6A) and `recenter()` (navigation.tsx's compass button) both set it. | Grep: exactly 2 live call sites app-wide, both on `navigation.tsx`. |
| `FREE_EXPLORE` | `CameraState = 'FREE_EXPLORE'` | **No — dead.** `enterFreeExplore()` has **zero call sites anywhere in the app.** No pan/pinch gesture handler calls it; `NavigationMap` doesn't forward `onPanDrag`/`onRegionChangeComplete` at all. Already flagged as a gap in Phase 6A's report (§6, item 1) — confirmed still true, unchanged. | Repo-wide grep for `.enterFreeExplore(` — 0 matches. |
| `RECENTER` | Ambiguous — see below | **No — dead, and mislabeled in the phase brief.** `'RECENTER'` is a member of the `CameraState` union type, but **no action in the entire codebase ever sets `cameraState` to `'RECENTER'`** — `recenter()` (the action with that name) actually sets `cameraState: 'FOLLOW_DRIVER'`, not `'RECENTER'`. The string literal is unreachable dead code in the type. The Bible's actual "Recenter" *concept* — a floating button that appears after a pan/pinch and returns to following — is modeled by the separate `recenterState` field (`'idle'/'available'/'recentering'`), but that field is only ever set to `'available'` by `enterFreeExplore()`, which (per the row above) is never called — so `recenterState` also never leaves its initial `'idle'` value in the running app today. | `NavigationStore.ts`: `recenter()` body sets `cameraState: 'FOLLOW_DRIVER'`; grep for `cameraState: 'RECENTER'` — 0 matches anywhere. |
| `ARRIVAL` | Not a real state name | **Partially — via `NavigationMode`, not `CameraState`.** There is no `CameraState` or mode literally named `ARRIVAL`. The closest real concept is `NavigationMode.ARRIVED_PICKUP`/`ARRIVED_DROPOFF`, each with its own dedicated `CAMERA_PROFILES` entry (zoom-in, reduced/no rotation, north-up settle) reached through ordinary mode transitions — **and those transitions are genuinely wired and dispatched**: `arrivedAtPickup()` from `navigation.tsx`'s `handleArrived`, `arrivedAtDropoff()` from `trip.tsx`'s `handleSliderComplete` (both pre-existing, Phase 5C). | `CameraController.ts` `CAMERA_PROFILES[ARRIVED_PICKUP]`/`[ARRIVED_DROPOFF]`; `NavigationModes.ts` transition table; grep confirms both dispatch call sites exist. |

**Missing transitions, reported as requested by Task 3:** `FREE_EXPLORE` and `RECENTER` (as a `cameraState` value) are both unreachable — no code path in the shipped app can ever produce them. This isn't a regression from Phase 6A/6B (both were already true before either phase, and 6A's own report already flagged the `FREE_EXPLORE` half); Phase 6.5 is the first pass to confirm the `RECENTER`-as-`cameraState` half is *also* dead, and that the two are actually the same underlying gap (no gesture-to-camera-intent wiring exists at all) rather than two separate ones.

---

## 3. Route update report (Task 4)

Traced `setRoute(route)` (called from `navigation.tsx`'s `calculateRoute()` after a successful `fetchRoute()`, Phase 5D) through to `CameraController`.

**Finding — a real gap, currently dormant on the one live screen:** `CameraController`'s `RelevantSnapshot` (the object `snapshotsEqual` gates `recompute()` on) tracks `mode`, `cameraState`, `driverLocation`, `pickup`, `destination`, `heading`, `speed` — **it does not include `route`.** `setRoute(route)` triggers a Zustand `set()`, which does fire `handleStoreChange()` (so it's logged — see §1), but if none of the seven snapshotted fields changed in that same call, `snapshotsEqual` returns `true` and `recompute()` is skipped entirely. A freshly-published route is stored correctly (`NavigationStore.route` is genuinely current), but **publishing it does not, by itself, trigger a camera recompute** — the new route is only picked up on the *next* recompute triggered by something else (in practice, the next GPS-driven `driverLocation` change, ~1s later at `driverBestNavigation`'s cadence).

**Why this doesn't currently affect `app/(driver)/navigation.tsx`:** that screen runs in `DRIVER_TO_PICKUP` mode, whose `CameraProfile.autoFit` is `false` — its camera pose comes from `followOrArrivalPose`, which never reads `state.route` at all. The gap is real but inert for the one screen the engine currently owns.

**Where it would actually bite:** `computeTargetPose`'s `fitPreview(...)` branch (`PREVIEW`/`MATCHING` mode, or `cameraState === 'FIT_ROUTE'`) *does* pass `state.route` into the auto-fit bounds calculation. If a route were published while `mode`/`cameraState`/`driverLocation`/`pickup`/`destination`/`heading`/`speed` all happened to stay the same in that call, the auto-fit shot would frame only pickup+destination and silently miss the polyline's actual bulge — not "a stale route rendered," but a real "new route arrived, camera didn't react" gap. This path isn't exercised by any live screen today (`PREVIEW`/`MATCHING` are Customer-side modes, and Architecture.md already records "Passenger/customer side untouched"), so it's dormant, not currently user-visible — reported here, not fixed, per this phase's verification-only scope.

**No stale route is ever *used*** — every recompute that does run reads `state.route` via the full live `NavigationState` passed into `computeTargetPose`/`fitPreview` (not a cached copy), so once a recompute happens for any reason, it always sees the current route. The gap is specifically "a route publish doesn't independently trigger the recompute that would consume it," not "an old route gets used after a new one arrives."

---

## 4. Runtime timing report (Task 2 / Deliverable 5)

**Derived from the code's own constants (`GPSManager.ts`'s `PROFILE_OPTIONS`, `CameraAnimation.ts`'s thresholds) — not measured on a device.** Recommend the user capture real numbers from the extended dev log (§ code change) during an actual drive; the `timestampMs` field added this phase makes that a simple diff between consecutive `[CameraController] runtime update` lines.

| Quantity | Derived value | Basis |
|---|---|---|
| GPS update rate (`app/(driver)/navigation.tsx`'s `driverBestNavigation` profile) | ~1 fix/sec while moving ≥1m; slower while stationary or between qualifying moves | `PROFILE_OPTIONS.driverBestNavigation`: `timeIntervalMs: 1000, distanceIntervalMeters: 1` |
| Fixes CameraController *receives* (`handleStoreChange` runs, logs) | 1:1 with every accepted GPS fix, whenever a map is attached | Zustand `subscribe` fires once per `set()` call, unconditionally (§1) |
| Fixes that trigger an actual `recompute()` | Effectively 1:1 with accepted fixes on this screen, since a genuinely new coordinate almost always changes `driverLocation` (part of the snapshot) | `snapshotsEqual` compares `driverLocation` by value |
| Fixes that trigger an actual `animateCamera()` call (the visible camera movement) | Fewer than the recompute rate — gated by movement/rotation/zoom-delta thresholds | See next two rows |
| Movement threshold to re-animate, at `DRIVER_TO_PICKUP`'s zoom 17.5 | ≈ 4.24 m | `calculateMovementThreshold(17.5)` = `max(3, 3 × 2^(20−17.5) × 0.25)` = `max(3, 3 × 5.657 × 0.25)` ≈ 4.24 |
| Rotation threshold to re-animate | 30° while stationary, tightening linearly to 3° at ≥5 m/s (~18 km/h) | `calculateRotationThreshold(speed)` = `3 + (1 − normalize(speed,0,5)) × 27` |
| Practical effect | At typical city driving speed (≥~4.24 m/s ≈ 15 km/h), a 1-second GPS interval alone covers enough ground to clear the movement threshold most fixes, so `animateCamera` fires close to once per second. Below that speed (crawling, stop-and-go), consecutive fixes are more likely to fall under threshold and get skipped — intentional jitter suppression, not a bug. | `shouldAnimate`/`shouldRotate` gating in `CameraController.recompute` |
| Animation duration per applied move | 150 ms floor, `FOLLOW_DURATION` (1000 ms) baseline scaled by distance (up to 3×) and inversely by speed (down to 0.6×), 3000 ms ceiling; mode/cameraState transitions instead use the flat `ARRIVAL_DURATION` (1200 ms) | `calculateAnimationDuration`; `recompute`'s `transitioned` branch |
| **Duplicate recomputes** | **None found**, given the single-subscription guarantee already verified in Phase 6A/6B (`attachMap`'s `if (!unsubscribeStore)` guard) — one `handleStoreChange` invocation per `set()` call, no double-firing possible from this codebase's current wiring. | Re-verified this phase by re-reading `attachMap`/`detachMap` |
| **Missed recomputes** | **None**, other than the by-design early-return while no map is attached (§1) | Synchronous call chain, no batching |

---

## 5. Verify GPS quality handling (Task 5)

| Condition | What actually happens | Safe? |
|---|---|---|
| Poor accuracy (worse than `driverBestNavigation`'s 30m ceiling) | Hard-rejected inside `scoreFixQuality` before a `GPSFix` is even constructed — never emitted, never reaches `NavigationStore` or `CameraController` at all. | **Yes** — invisible upstream filtering, by construction. |
| Accepted but low-tier quality (`FAIR`/`POOR` — passed the hard gates but scored poorly) | Reaches `NavigationStore`/`CameraController` exactly like any other fix. **`CameraController` never reads `GPSFix.quality`** — it's not part of `RelevantSnapshot`, and `computeTargetPose` doesn't consult it. The only protection a low-quality-but-accepted fix gets is the same movement/rotation-threshold gating every fix gets (§4) — incidental noise suppression, not quality-aware handling. | **Functionally safe (no crash, no wild jump beyond what thresholds already bound), but not quality-aware** — flagged as a gap, not a defect. |
| Lost GPS (signal drops while a foreground subscription is nominally still active — e.g. entering a tunnel) | **`GPSManager` has no foreground watchdog/timeout.** `setStatus('lost')` is only ever called from the *background* task's error callback or a `start()` failure — there's no mechanism that detects "no fixes have arrived in N seconds while foreground-tracking." `currentStatus` simply stays `'active'` indefinitely from the last good fix. Since `CameraController`'s snapshot doesn't include `gpsState` either, it has no explicit reaction regardless — but because no *new* `driverLocation` value arrives, `recompute()` also simply stops being triggered, so the camera holds its last good pose rather than jumping or erroring. | **Safe by emergent behavior (freezes, doesn't crash or jump), not by designed handling.** No "GPS lost" indicator exists anywhere in the UI to tell the driver why the camera stopped moving (`NavigationHUD` isn't mounted — Phase 6A §6). |
| Recovered GPS | Ordinary fix processing resumes; no special-case "recovery" path exists or is needed, since nothing was torn down. | **Yes.** |
| Heading unavailable (`fix.heading === undefined`, e.g. stationary/indoors) | `NavigationStore.heading` becomes `null`. `followOrArrivalPose`'s `bearing = ... normalizeHeading(state.heading ?? 0)` falls back to `0` (north-up) rather than throwing or propagating `NaN`. | **Yes**, with a UX note: the camera bearing snaps to north instead of holding the last known heading — a legitimate design choice, not a bug, but worth knowing before camera-feel tuning. |
| Speed unavailable | `state.speed ?? 0` is used consistently everywhere it's read (`resolveFollowCenter`, `dynamicZoomForSpeed`, `dynamicPitchForMode`, `calculateRotationThreshold`) — falls back to stationary-speed behavior. | **Yes**, no crash path found. |

---

## 6. Memory leak report (Task 6, Deliverable 6)

Re-verified the specific "leave → re-enter" cycle Task 6 asks about (not just a single mount/unmount, already covered in Phase 6A/6B):

```
Mount #1 (navigate to app/(driver)/navigation.tsx)
  -> NavigationMap's effect: attachMap() -> unsubscribeStore was null -> subscribes -> sets unsubscribeStore
  -> navigation.tsx's own GPS effect: GPSManager.acquire('foreground','driverBestNavigation') -> consumerCount 0->1

Unmount (navigate away / currentTrip goes null)
  -> NavigationMap's effect cleanup: detachMap() -> unsubscribeStore() called, then nulled; mapHandle and all
     pose bookkeeping (lastAppliedPose/lastAppliedMode/lastAppliedCameraState/lastSnapshot) reset to null
  -> navigation.tsx's GPS effect cleanup: unsubscribeFix() (GPSManager listener removed) + GPSManager.release()
     -> consumerCount 1->0 -> GPSManager.stop() -> OS subscription torn down, diagnostics/smoothing state reset

Mount #2 (re-enter the screen)
  -> NavigationMap's effect runs fresh: attachMap() -> unsubscribeStore is null again (reset above) ->
     the guard `if (!unsubscribeStore)` is true -> exactly ONE new subscription created, not two
  -> navigation.tsx's GPS effect: acquire() again -> consumerCount 0->1 -> GPSManager.start() again
```

| Check | Result |
|---|---|
| `detachMap()` on leave | **Pass** — unconditional in the effect's cleanup. |
| Store unsubscribe on leave | **Pass** — `unsubscribeStore()` called and nulled. |
| GPS listener released on leave | **Pass** — `unsubscribeFix()` + `GPSManager.release()`, pre-existing and unchanged. |
| `attachMap()` on re-entry subscribes exactly once | **Pass** — the `if (!unsubscribeStore)` guard is the entire mechanism; since `detachMap()` reliably nulls it, re-entry always starts from a clean slate rather than accumulating. |
| No leaks across repeated leave/re-enter cycles | **Pass**, by trace — each cycle's subscribe count and consumer count return to exactly their starting values (0) before the next cycle begins. |
| Side note (not a leak) | Each re-entry restarts the OS-level GPS watcher from scratch (since `release()` fully stops it when `consumerCount` hits 0) — expected, not a bug, but means a driver rapidly bouncing in and out of the screen will see a brief `'acquiring'` status each time rather than instant continuity. |

---

## 7. Development log verification (Task 7)

Before this phase's change, `logRuntimeUpdateInDev` (Phase 6A) printed `mode`, `gps`, `route`, `etaSeconds`, `driverPosition` — **missing `heading`, `speed`, and `cameraState`**, three of the seven fields Task 7 names by name. Extended this phase (the one code change — see top of report) to add exactly those three, plus `timestampMs` for the rate measurements in §4. Current fields: `timestampMs`, `mode`, `cameraState`, `gps`, `heading`, `speed`, `route`, `etaSeconds`, `driverPosition` — covers all seven of Task 7's named items (Mode, GPS, Heading, Speed, Route, ETA, Camera state) plus one extra (timestamp) added for this phase's own timing-verification need.

**No duplicate logs:** confirmed by the same single-subscription guarantee as §6 — one `handleStoreChange` invocation per Zustand `set()` call, one `logRuntimeUpdateInDev` call per invocation (it's the first line in the function, unconditional). Re-verified `tsc --noEmit` (exit 0) and `eslint` (0 findings) on the modified file after this change.

---

## 8. Remaining runtime issues before camera tuning (Deliverable 7)

In priority order — none of these were introduced by this phase; all are pre-existing gaps this phase's tracing surfaced or re-confirmed:

1. **Route publishes don't independently trigger a recompute** (§3) — `RelevantSnapshot` doesn't include `route`. Dormant on `navigation.tsx` today (follow mode doesn't consult route), but would silently under-fit an auto-fit shot on any future `PREVIEW`/`MATCHING`/`FIT_ROUTE` screen. Fix (not made this pass, per verification-only scope): add `route` (or a cheap identity/id check) to the snapshot.
2. **`FREE_EXPLORE`/`RECENTER` are entirely unreachable** (§2) — no gesture handler exists anywhere that calls `enterFreeExplore()`. This is the same gap Phase 6A's report already flagged (§6, item 1); Phase 6.5 additionally confirms the `recenter()` action's *name* doesn't correspond to any `cameraState` it actually produces, which is worth resolving alongside the gesture wiring rather than separately.
3. **No foreground GPS-loss detection** (§5) — `GPSManager` has no watchdog for "the subscription is nominally alive but fixes have stopped arriving." The camera degrades safely (freezes) but the driver gets no "GPS lost" signal anywhere in the UI, because no GPS-status UI is mounted on this screen either.
4. **`GPSFix.quality` is computed but never consulted by the camera** (§5) — `FAIR`/`POOR` fixes get the same treatment as `EXCELLENT` ones once they clear GPSManager's hard-reject gates. The existing movement/rotation thresholds happen to provide some incidental protection, but that's not the same as the camera actually reacting to signal quality.
5. **No live route-progress tracking** — unchanged since Phase 5's report: `setRoute` seeds `currentStep`/`etaSeconds`/`distanceMeters` once, from the route's own totals, at fetch time; `RouteEngine.computeRouteProgress` (per-fix remaining-distance/active-step) is still never called. Not camera-specific, but feeds the ETA/route data the camera log now also surfaces.
6. **`app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` remain outside the engine** — unchanged since Phase 6B; camera verification in this report applies only to `app/(driver)/navigation.tsx`, the one screen the engine currently owns.

None of these block camera-feel tuning from starting — they're either dormant on the one live screen (#1, #4), pre-existing and separately scoped (#2, #3, #5, #6) — but #1 and #2 in particular are worth closing before a future phase builds camera-feel behavior on top of `cameraState` transitions that don't reliably fire yet.

---

## 9. Success criteria checklist

| Criterion | Result |
|---|---|
| Camera receives every GPS update | **Pass** — §1, synchronous chain, dev-log confirms (once run on device). |
| No duplicate subscriptions | **Pass** — §6, guard re-verified, including the leave/re-enter cycle specifically. |
| Correct camera state transitions | **Partial pass** — `OVERVIEW`/`FOLLOW_DRIVER`/arrival-via-mode are correctly wired and reachable; `FREE_EXPLORE`/`RECENTER` are not reachable by any code path today (§2, §8 item 2). |
| Route changes trigger recompute | **Fail, currently dormant** — §3: publishing a route does not independently trigger a recompute; only reads correctly once a recompute happens for another reason. Not user-visible on the one live screen, but a real gap. |
| Clean attach/detach | **Pass** — §6. |
| No memory leaks | **Pass** — §6, including the specific re-entry scenario Task 6 asked about. |
| Runtime ready for professional camera behavior | **Not yet, with two named blockers** (#1 and #2 in §8) — the data-plumbing and lifecycle are sound (GPS→store→controller→map is provably lossless and leak-free), but two of the five named camera-state transitions can't currently fire at all, which a "professional" camera (one that reacts to user gestures and re-fits routes as they change) needs before feel-tuning would have anything real to tune. |

---

## 10. Readiness score

**72 / 100** (down slightly from Phase 6B's 80/100 readiness-for-ownership score — a different axis: 6B measured "is there exactly one camera owner," which is still true; this phase measures "does that owner correctly react to everything it should," which surfaced two real gaps).

Rationale: the runtime's plumbing is genuinely solid — GPS-to-camera delivery is lossless and synchronous by construction, the single-subscription/no-leak guarantees hold under the specific leave/re-enter cycle this phase tested, and GPS-quality edge cases (poor accuracy, lost signal, missing heading/speed) all degrade safely with no crash path found. The score isn't higher because two of Task 3's five named camera-state transitions (`FREE_EXPLORE`, `RECENTER`) are entirely dead code paths today, and Task 4's route-update trigger has a real, if currently dormant, gap. Neither is a Phase 6A/6B regression — both predate this verification pass — but both should close before camera-feel tuning invests effort in behavior that depends on `cameraState` transitions that don't reliably occur yet.
