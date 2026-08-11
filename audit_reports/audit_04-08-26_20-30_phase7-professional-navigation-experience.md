# Phase 7 — Professional Navigation Experience: Implementation Report

**Date:** 2026-08-04
**Scope:** `app/(driver)/navigation.tsx` only, by explicit user decision (see below). `app/(driver)/trip.tsx` and `app/(tabs)/navigate.tsx` remain legacy, hand-rolled-camera screens — untouched, not part of this phase.
**Method:** Full read of every engine file touched (not just prior audit `.md` files, several of which were already stale relative to the shipped code) before any edit, per this phase's own "Read first" instruction. A concrete plan was drafted, verified line-by-line against the actual source (not just prior audits), and approved by the user before implementation began.

---

## 0. Scope decision

The phase brief frames this as "polish, not architecture," on top of a Navigation Runtime described as "complete." A full code read (not the audit trail) found the runtime's *math* complete but several pieces still entirely unwired — gesture-to-free-explore, auto-return-to-follow, and live route progress had **zero callers anywhere**, and only one of the app's three driver navigation screens (`navigation.tsx`) actually used `NavigationMap`/`CameraController` at all. The user was asked whether to also migrate `trip.tsx`/`navigate.tsx` this phase; the answer was **no** — stay scoped to `navigation.tsx`, the one screen already on the engine. That decision governs everything below.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/navigation/NavigationEngine/types.ts` | Added `setRouteProgress` to `NavigationDataActions`. |
| `src/navigation/NavigationEngine/NavigationStore.ts` | Implemented `setRouteProgress` — resolves `currentStep`/`currentInstruction` from `progress.activeStepIndex` against the active route's steps. |
| `src/navigation/NavigationEngine/NavigationEvents.ts` | Added `ROUTE_RECALCULATED` event (reroute observability, dev-log parity with the existing `MODE_CHANGED`/`TRANSITION_REJECTED` pattern). |
| `src/navigation/NavigationEngine/RouteProgressTracker.ts` (new) | `applyRouteProgress`/`checkAndReroute` — orchestrates `RouteEngine.computeRouteProgress`/`evaluateReroute` on live GPS ticks. |
| `src/navigation/NavigationEngine/providers/NavigationProvider.tsx` | `onFix` now also calls `applyRouteProgress`/`checkAndReroute` when a route + driver position exist; tracks `lastRouteIdRef`/`lastRerouteCheckRef`. |
| `src/navigation/NavigationEngine/CameraController.ts` | `recompute()` now writes `bearing`/`zoom`/`pitch` back into the store after each applied `animateCamera` call. Dev log throttled to 500ms. |
| `src/components/navigation/NavigationMap.tsx` | Gesture-to-free-explore (`onPanDrag` → `enterFreeExplore()`) with a 7s auto-return-to-follow timer; `setChrome({ safeArea })` from `useSafeAreaInsets()`. |
| `src/components/navigation/NavigationTurnBanner.tsx` | Now computes a live distance-to-maneuver from `driverLocation`/`currentStep.endLocation` and drives the existing `useTurnPreview` pulse/color escalation, instead of showing the step's static total distance. |
| `src/components/navigation/NavigationVoiceToggle.tsx` (new) | UI-only voice-guidance toggle, local state, no backing engine (per the brief — voice isn't implemented yet). |
| `src/components/navigation/index.ts` | Exports `NavigationVoiceToggle`. |
| `app/(driver)/navigation.tsx` | Mounts `NavigationTurnBanner`/`NavigationCompass`/`NavigationControls`/`NavigationSpeedWidget`/`NavigationVoiceToggle`; removes the screen-local turn card, `CompassButton`, step-advance effect, and their derived state. The pickup/arrival `Card` + `RideActionSlider` block is untouched, byte-for-byte. |

---

## 2. Camera report (Part 1)

| Item | Before | After |
|---|---|---|
| Lower-third anchor, look-ahead, bearing/zoom/pitch dynamics, jitter gating | Already correct — `CameraController`'s `resolveFollowCenter`/`CameraAnimation` math, unchanged this phase. | Unchanged — this phase added no new camera math. |
| Camera pose visible to the rest of the app | `NavigationState.bearing`/`zoom`/`pitch` declared but never written — `NavigationCompass`'s needle was frozen at 0° forever. | `recompute()` now publishes the applied pose back to the store on every animated tick. Compass is now genuinely bearing-correct. |
| Gesture-to-free-explore | `enterFreeExplore()` had zero call sites anywhere in the app. | Wired: `NavigationMap`'s `onPanDrag` → `enterFreeExplore()`. Confirmed by grep: exactly one call site, in `NavigationMap.tsx`. |
| Automatic return to follow | Did not exist at the engine level. | 7s inactivity timer (Bible's 5-10s range) calls `recenter()`; cleared on any other exit from `FREE_EXPLORE` (manual recenter, mode change, unmount) so it can't double-fire. |
| Recenter button | `NavigationControls`' button existed but was permanently unreachable (`recenterState` never left `'idle'`). | Reachable for the first time — mounted on `navigation.tsx`, now driven by the gesture wiring above. |

**Not touched, by design:** the camera math itself (anchor ratio, look-ahead distance, dynamic zoom/pitch curves, movement/rotation thresholds) — all of it was already correct per the Phase 6.5 verification report, and this phase's brief is UX completion, not re-tuning working math.

---

## 3. AutoFit report (Part 2)

- `setChrome({ safeArea })` now wired from `useSafeAreaInsets()` — previously zero callers anywhere, padding was a flat hardcoded constant.
- **Deliberately not wired this phase:** `bottomSheetHeight`/`navigationBannerHeight` chrome measurement. Verified against `CameraController`'s `CAMERA_PROFILES` and `NavigationModes.ts`'s transition table that `navigation.tsx` can only ever be in `DRIVER_TO_PICKUP` or `ARRIVED_PICKUP` before it unmounts into `trip.tsx` — **both have `autoFit: false`**, so this measurement would have zero visible effect on this screen. Flagged, not silently dropped.
- Pickup/destination/driver+route fit shots (`fitPreview`/`fitCompleted`) themselves were already correct and are unchanged.

---

## 4. Marker animation report (Part 3)

No changes. `useAnimatedMarker` (Reanimated UI-thread interpolation, shortest-arc heading, clean mid-flight retargeting) was already the most mature part of the runtime per every prior audit, and remains untouched. `MarkerAnimator.ts` (the engine's parallel, unused pure-math implementation) remains dead code, out of scope this phase — no live renderer needs it.

---

## 5. Navigation HUD report (Part 4)

| Piece | Before | After |
|---|---|---|
| Turn banner | Screen hand-rolled (local `activeStepIndex`/`routeSteps` state, not store-driven). | `NavigationTurnBanner`, store-driven, now with live per-step distance + the same pulse/color escalation the old card had — not a downgrade. |
| Speed | Not shown at all on this screen. | `NavigationSpeedWidget` mounted. |
| Compass | Screen-local `CompassButton`, fed by a locally-tracked `driverHeading` state, always 0-drift from the actual camera bearing since nothing else read `bearing`. | `NavigationCompass`, store-driven, now genuinely bearing-correct (Section 2). |
| Recenter | Not present as a button anywhere on this screen. | `NavigationControls`, appears only once `recenterState === 'available'` (i.e., after a real gesture). |
| Voice guidance toggle | Did not exist. | New `NavigationVoiceToggle`, UI-only per the brief, local state, no store field (nothing consumes it yet — avoids dead store surface). |
| Pickup/arrival business card | Bespoke, passenger-specific (call button, fare, passenger info, slide-to-arrive/start). | **Untouched** — confirmed via diff, no lines inside that block changed. |

---

## 6. Route progress report (Part 5)

Before this phase, `RouteEngine.computeRouteProgress`/`shouldReroute`/`evaluateReroute` were fully implemented with **zero callers anywhere**, and `NavigationStore` had no setter that could even receive their output — `currentStep`/`currentInstruction` were set once, at fetch time, and never advanced.

Now: `RouteProgressTracker.applyRouteProgress` runs on every GPS fix (while a route + driver position exist), publishing live `progress`/`distanceRemainingMeters`/`etaSeconds`/`currentStep`/`currentInstruction` via the new `setRouteProgress` action. Confirmed by grep: exactly one call site.

**Off-route detection + rerouting is genuinely new, user-visible behavior** — the app has never auto-rerouted before. `checkAndReroute` runs `shouldReroute`'s 30m-movement/50m-off-route gate on every tick and, when triggered, fetches a fresh route and republishes it, emitting `ROUTE_RECALCULATED` for dev-log visibility. Network failures are swallowed (dev-logged only) — a failed reroute fetch falls back to "keep the current route," matching `evaluateReroute`'s own documented contract, and never propagates as an unhandled rejection into a GPS-tick callback.

---

## 7. Performance report (Part 6)

- **Done:** `CameraController`'s dev-only runtime log was firing unconditionally on every store change (up to ~1/sec at `driverBestNavigation`). Throttled to 500ms — still well under GPS's own cadence, so no update pattern is lost, just de-noised.
- **Considered, not done — flagged, not silently dropped:** extracting memoized sub-components inside `Map.native.tsx` to reduce re-render churn from `driverLocation`/`heading` prop changes. `Map.native.tsx` is shared by every map screen in the app (passenger, driver dashboard, ride planner — not just this screen), the actual marker motion is already off the JS thread (Reanimated), and there's no device available in this environment to confirm a rewrite would reduce jank rather than just adding risk to a heavily-shared file. Recommend profiling on a real device before touching it.

---

## 8. Before/after comparison

| Behavior | Before | After |
|---|---|---|
| Compass needle | Frozen at 0° forever | Rotates with real camera bearing |
| Pan/pinch during navigation | Camera fights the user on the next GPS tick (no free-explore) | Camera stands down for 7s, then smoothly resumes following |
| Recenter button | Unreachable (dead `recenterState`) | Appears after a real gesture, works |
| Turn banner | Static per-step total distance | Live countdown to the maneuver, pulse/color escalation |
| Speed / voice toggle | Not shown | Shown |
| Route progress (ETA, remaining distance, current step) | Set once at fetch, frozen | Live, updated every GPS tick |
| Off-route handling | None — app never rerouted | Auto-reroutes past 50m off-path (after 30m of movement) |
| Dev console during navigation | Runtime log every store change (~1/sec) | Throttled to 2/sec max |

---

## 9. Verification performed

- `npx tsc --noEmit` — clean after every step, and clean at the end.
- `npx eslint` on every touched file — **0 errors**. Warning count is a wash versus the pre-change baseline (verified via `git stash`/re-lint): 9 pre-existing warnings before, 11 after, but 8 of those 9 are identical pre-existing warnings untouched by this phase (missing-dep warnings on effects this phase didn't touch, an `Array<T>` style warning, two genuinely-pre-existing unused vars); the 9th (`driverLocation` missing-dep on the now-removed step-advance effect) was deleted along with that effect, and two structurally-identical missing-dep warnings appeared in its place in `NavigationMap.tsx`/`NavigationTurnBanner.tsx` — both deliberately using primitive `lat`/`lng` deps instead of the parent object (the exact same pattern the codebase's own pre-existing `isNearPickup` `useMemo` already uses), not new anti-patterns.
- Grep-verified call-site counts: `enterFreeExplore(` — exactly 1 (new); `setRouteProgress(` — exactly 1 (new); no new `animateCamera`/`fitToCoordinates` call sites anywhere (only the pre-existing, out-of-scope `trip.tsx`/`navigate.tsx`/`Map.native.tsx`/engine-internal sites remain).
- Confirmed via `CAMERA_PROFILES`/`NavigationModes.ts` that the AutoFit chrome trim (Section 3) has no observable effect on this screen's reachable modes.
- Manually diffed the bottom pickup/arrival `Card` block — zero lines changed.

**Not verified — requires a real device, none available in this environment:**
- Actual camera feel (Steps 1-3 add a store write-back only; no camera math changed, so feel should be unaffected, but this is unconfirmed on-device).
- Whether 7s is the right auto-recenter delay.
- Whether `onPanDrag` fires reliably on both iOS and Android without misfiring on programmatic camera moves.
- Compass needle rotation smoothness in practice.
- Turn-banner pulse/color visual parity with the old card, side-by-side.
- Reroute UX/threshold feel — genuinely new behavior with no prior baseline to compare against.

---

## 10. Readiness score

**78/100** for `app/(driver)/navigation.tsx` specifically (not the app-wide Navigation Runtime, which remains at the prior audit's assessment for the two untouched screens).

Rationale: every gap this phase set out to close is now genuinely wired end-to-end — gesture-to-free-explore, auto-return-to-follow, live route progress, a bearing-correct compass, and a full HUD are all reachable from real code paths, not just built-and-inert. Score isn't higher because (a) none of it has been observed on a physical device — every "feels right" judgment (7s timing, gesture reliability, reroute thresholds) is still a documented starting value, not a measured one, and (b) `trip.tsx`/`navigate.tsx` remain fully outside the engine by explicit scope decision, so the app-wide "one navigation implementation" goal from the Bible is still only true for one of three driver screens.
