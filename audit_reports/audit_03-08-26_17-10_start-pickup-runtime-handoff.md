# Phase 5.5B — Start Pickup Runtime Handoff

**Date:** 2026-08-03
**Scope:** Connect `handleStartPickup()` (`app/(driver)/navigation.tsx`) to the Navigation Runtime via an existing `NavigationStore` action, dev-mode transition logging, and a read-only verification of whether `CameraController`/`AutoFitEngine`/`NavigationHUD` actually receive the resulting update. Per explicit scope: no camera redesign, no `CameraController` ownership, no `CameraAnimation` changes, no visual camera behaviour changes.
**Method:** Read `AGENTS.md`, `2GO Navigation Engine Bible.md` (referenced via AGENTS.md), `NavigationEngine/Architecture.md`, `audit_03-08-26_16-45_navigation-runtime-integration.md`, `audit_03-08-26_16-53_start-pickup-execution-trace.md`, and the Phase 5.5A conversation before writing any code. Read `NavigationStore.ts`, `NavigationModes.ts`, `safeTransition.ts`, `CameraController.ts`, `AutoFitEngine.ts`, `NavigationHooks.ts`, `NavigationHUD.tsx`, `NavigationProvider.tsx`, `NavigationEvents.ts` in full before deciding which action to dispatch.

---

## Files modified

- **`app/(driver)/navigation.tsx`** — `handleStartPickup()` now dispatches `safeTransition(() => navigation.driverToPickup(driverLocation ?? undefined))` before its existing local `setIsNavigating(true)`/`setIsAutoFollow(true)` calls (unchanged).
- **`src/navigation/NavigationEngine/providers/NavigationProvider.tsx`** — added `logTransitionsInDev()`, a dev-only (`__DEV__`-gated) subscription to `navigationEventBus`'s existing `MODE_CHANGED`/`TRANSITION_REJECTED` events, wired up in a second mount-once `useEffect`. No new event type, no `NavigationStore` change — it observes events the store already emits.

Not modified: `CameraController.ts`, `AutoFitEngine.ts`, `CameraAnimation.ts`, `NavigationHUD.tsx`, `NavigationStore.ts`, `NavigationModes.ts`, any `src/components/navigation/*` file.

---

## 1. Runtime handoff report — why `driverToPickup()`

The prior execution-trace audit (§3) established a fact this phase had to design around: by the time a driver sees "Start Pickup", `NavigationStore.mode` is **already** `DRIVER_TO_PICKUP` — that transition happens earlier, at Accept time, in `DriverDashboard.handleAcceptRequest` (`preview()` → `requestMatch()` → `driverToPickup()`). `NAVIGATION_MODE_TRANSITIONS[DRIVER_TO_PICKUP]` (`NavigationModes.ts:95`) is `[ARRIVED_PICKUP, IDLE]` — no self-loop. So in the common case, dispatching `driverToPickup()` again from `handleStartPickup` is a no-op: `safeTransition` catches the resulting `NavigationTransitionError` and logs a warning, exactly as designed.

This is still the correct action to call, for two reasons:
1. It's the only existing action that can (re-)reach `DRIVER_TO_PICKUP` — the brief's own instruction ("reuse the existing `NavigationStore` actions... do not invent new navigation modes") rules out adding a new self-loop edge or a new action just to make this button's press "do something" unconditionally.
2. It's a genuine recovery path, not a dead call: if the Accept-time dispatch never landed (a remount between Accept and this screen, a race between the accept mutation and the `safeTransition` call in `DriverDashboard`, etc.), `mode` could still be `MATCHING` or `IDLE` when Start Pickup is pressed. In that case this dispatch is what actually moves the store to `DRIVER_TO_PICKUP` and fires `MODE_CHANGED` for the first time. The common case (already correct) and the recovery case (not yet correct) are handled by the identical line of code, which is the point of `safeTransition` existing at all.

No new navigation mode was created. No screen-facing action signature changed.

## 2. NavigationStore transition report

| Scenario | Current mode | Requested | Transition table result | Outcome |
|---|---|---|---|---|
| Common path (Accept-time dispatch already succeeded) | `DRIVER_TO_PICKUP` | `DRIVER_TO_PICKUP` | Not in `NAVIGATION_MODE_TRANSITIONS[DRIVER_TO_PICKUP]` | `NavigationTransitionError` thrown inside `applyTransition`, caught by `safeTransition`, `console.warn`'d, swallowed. `mode` unchanged. `TRANSITION_REJECTED` emitted on `navigationEventBus` (from `NavigationStore.ts:116-121`, unchanged code). |
| Recovery path (Accept-time dispatch never landed) | `MATCHING` or `IDLE` | `DRIVER_TO_PICKUP` | `MATCHING → DRIVER_TO_PICKUP` is legal; `IDLE → DRIVER_TO_PICKUP` is not | If mode was `MATCHING`: transition succeeds, `MODE_CHANGED` emitted, `modeHistory` appended, `driverLocation` set. If mode was `IDLE` (a deeper desync than this phase can repair): still safely rejected by `safeTransition`, not a crash — a state this far off is a pre-existing bug in the Accept-time dispatch, out of this phase's scope. |

Every dispatch — accepted or rejected — funnels through `applyTransition` (`NavigationStore.ts:107-131`), the sole function permitted to decide `mode`. `safeTransition` was not bypassed at this or any other call site touched in this phase.

## 3. Subscriber notification report + dev logging

`navigationEventBus.emit('MODE_CHANGED', ...)` / `emit('TRANSITION_REJECTED', ...)` already fire unconditionally inside `applyTransition`, independent of who's listening (`NavigationEvents.ts`) — this was true before this phase and is unchanged. What this phase adds is the first real *subscriber*: `NavigationProvider`'s new `logTransitionsInDev()`, mounted once at the app root, `__DEV__`-gated, printing e.g. `[NavigationStore] MATCHING -> DRIVER_TO_PICKUP` or `[NavigationStore] rejected: DRIVER_TO_PICKUP -> DRIVER_TO_PICKUP` to the Metro console for every transition attempted anywhere in the app — not just from this button. Satisfies Task 2's "log every transition in development mode" engine-wide rather than as a one-off `console.log` inside `handleStartPickup`.

## 4. Runtime event diagram (what actually happens now)

```
Start Pickup pressed
  -> handleStartPickup()
  -> safeTransition(() => navigation.driverToPickup(driverLocation))
       -> NavigationStore.driverToPickup()
       -> applyTransition(currentMode, history, DRIVER_TO_PICKUP)
            -> assertValidTransition
                 accepted -> navigationEventBus.emit('MODE_CHANGED', ...)
                             -> NavigationProvider's dev logger prints it   <- NEW, real subscriber
                             -> CameraController: NOT subscribed (no attachMap call anywhere — see §5)
                             -> AutoFitEngine: never invoked directly; only reachable via CameraController.recompute -> not reached
                             -> NavigationHUD: not mounted, but its selectors (useNavigationMode, etc.)
                                are plain Zustand hooks — no manual subscribe step, so if it
                                *were* mounted right now it would re-render correctly, automatically
                 rejected -> navigationEventBus.emit('TRANSITION_REJECTED', ...) -> same fan-out as above
  -> setIsNavigating(true) / setIsAutoFollow(true)   (unchanged local UI state, drives the
                                                       screen's own legacy camera useEffect)
```

## 5. Validation report

| Item | Result |
|---|---|
| Start Pickup executes | Pass — unchanged from Phase 5.5A's fix; button enables correctly once a route loads |
| NavigationStore receives the action | Pass — `driverToPickup()` is called on every press, verified by code trace |
| safeTransition accepts/rejects correctly | Pass — traced against `NAVIGATION_MODE_TRANSITIONS`; both outcomes degrade safely, no throw escapes `handleStartPickup` |
| Subscribers receive updates | Partial — `navigationEventBus` fires for every transition (accepted or rejected) unconditionally; **the new dev logger receives it** (verified: it's a real `.on()` subscription). `CameraController` does **not** receive it — see below. |
| CameraController receives runtime events | **Fail, by pre-existing design, unchanged this phase.** `CameraController.ts:230-235` — `unsubscribeStore = useNavigationStore.subscribe(handleStoreChange)` is created only inside `attachMap()`. Grep-confirmed (`attachMap` appears only in `CameraController.ts` and `NavigationMap.tsx`): no screen anywhere in the app mounts `<NavigationMap>`, so `attachMap` is never called, so this subscription **does not exist yet** — not gated-and-ignoring, literally not subscribed. This is the same finding as the prior audit (§6) and is *explicitly out of scope for this phase* ("Do NOT attach ownership") — recorded here as a verified fact, not silently assumed fixed. |
| AutoFitEngine receives runtime events | **Fail, same root cause.** `AutoFitEngine` has no subscription of its own (confirmed in `Architecture.md` and by reading the file) — it's pure functions called only from `CameraController.computeTargetPose`, which is only reached from `recompute()`, which is only reached from `handleStoreChange()`, which requires the subscription above to exist. Since that subscription doesn't exist, `AutoFitEngine` is not invoked, for this dispatch or any other, right now. |
| NavigationHUD receives runtime events | **Structurally ready, not currently mounted.** Unlike `CameraController`, `NavigationHUD` and its children read state via plain Zustand selector hooks (`NavigationHooks.ts`) — e.g. `useNavigationMode()`, `useEtaSeconds()`. These re-render automatically the instant the store changes, with no manual `subscribe`/`attach` step required. Grep-confirmed no screen renders `<NavigationHUD>`. If it were mounted today, it would correctly reflect this dispatch's result with zero additional wiring — the gap here is purely "not mounted," not "not wired." |
| No runtime errors | Pass — `npx tsc --noEmit` clean; every rejected transition is caught by `safeTransition`, never thrown to the caller |
| No duplicate dispatches | Pass — `handleStartPickup` calls `driverToPickup()` exactly once per press; no effect or retry logic wraps it |
| No CameraController ownership taken | Pass — `attachMap` not called from this phase's changes or anywhere else; verified by grep |
| No camera behaviour changes | Pass — the legacy per-screen `animateCamera` `useEffect` in `navigation.tsx` (driven by `isNavigating`/`isAutoFollow`, unchanged) remains the only thing moving this screen's map |

`npx tsc --noEmit` — clean, exit 0, after all edits.

## 6. Remaining work before CameraController takes ownership

1. **No screen mounts `<NavigationMap>`** — until one does and calls `attachMap`, `CameraController` (and therefore `AutoFitEngine`) cannot observe *any* store change, not just this one. This is the single blocking item for Phase 6, unchanged by this phase and consistent with every prior audit's finding.
2. **No screen mounts `<NavigationHUD>`** (or any of `src/components/navigation/*`) — structurally ready per §5, purely a mounting decision for a future phase.
3. The Accept-time dispatch chain (`DriverDashboard.handleAcceptRequest`) is still the sole source of truth for reaching `DRIVER_TO_PICKUP` in the common case; this phase's `handleStartPickup` dispatch is a safety net, not a replacement. If that chain's own reliability is ever in question, it should be audited directly rather than papered over from this screen.
4. `driverLocation` passed into this phase's `driverToPickup()` call duplicates the live position `NavigationProvider`'s GPS forwarding (`setGpsFix`) already keeps current — harmless (same value, same field) but worth noting so a future reader doesn't assume it's the only writer of `NavigationStore.driverLocation`.

## 7. Readiness score

**55/100** (up from Phase 5's 45/100). The trip-lifecycle dispatch chain, `safeTransition` guard, and event-bus fan-out are now exercised end-to-end from a real button press with dev-mode visibility into every transition — genuine progress on the Bible's "single source of truth" goal. Score isn't higher because two of the three named subscribers (`CameraController`, `AutoFitEngine`) still cannot observe any of this — not a defect introduced or left by this phase, but a correctly-scoped, still-open prerequisite (mounting `<NavigationMap>`) that Phase 6 must resolve before any camera-feel work can begin.
