# "Start Pickup" Button — Complete Execution Trace

**Date:** 2026-08-03
**Type:** Read-only execution trace. No files modified. Nothing fixed.
**Scope:** `app/(driver)/navigation.tsx`'s "Start Pickup" button, traced from press through every layer the Phase 5 Navigation Runtime Integration touches (`handleStartPickup` → `NavigationStore` → `safeTransition` → subscribers), against the code exactly as it stands after that integration pass.

---

## 1. Does the Start Pickup button receive the press?

**Component:** `Button` from `@/components/ui` (`src/components/ui/Button.tsx`), rendered at [app/(driver)/navigation.tsx:455-464](<app/(driver)/navigation.tsx#L455-L464>):

```tsx
<Button
    variant={routeError ? "accent" : "primary"}
    leftIcon={routeError ? "refresh" : "navigate"}
    onPress={routeError ? calculateRoute : handleStartPickup}
    fullWidth
    disabled={isCalculating || (!routeCoordinates.length && !routeError)}
    loading={isCalculating}
>
    {routeError ? "Retry Route" : "Start Pickup"}
</Button>
```

**Exact `onPress`:** [line 458](<app/(driver)/navigation.tsx#L458>) — `routeError ? calculateRoute : handleStartPickup`. Since `routeError` is (per §9 below) always `false` at runtime, the effective handler is always `handleStartPickup`.

**Is the button disabled?** Conditionally — see §8. `Button.tsx`'s own gate is unconditional regardless of this screen's logic: `Button.tsx:100` — `const isDisabled = disabled || loading;` — then `Button.tsx:115` passes `disabled={isDisabled}` straight to the underlying `Pressable`. React Native's `Pressable` does not invoke `onPress` at all when `disabled` is `true` — this is native RN behavior, not app code, and it fails **silently**: no console output, no exception, nothing. If the button is in a disabled state when tapped, execution stops at this exact point, before any app code runs.

---

## 2. Does `handleStartPickup()` execute?

Definition, [app/(driver)/navigation.tsx:159-163](<app/(driver)/navigation.tsx#L159-L163>):

```tsx
const handleStartPickup = async () => {
    // Just enable navigation mode (camera follow)
    setIsNavigating(true);
    setIsAutoFollow(true);
};
```

No temporary log was inserted (per "do not fix anything yet" — inserting a log is a code change; noted here as *not done*, and reasoned about statically instead). Statically: **if and only if** the button is enabled (§8) when tapped, `handleStartPickup` executes to completion — it contains no branches, no early returns, no `await` that can hang (the `async` keyword here wraps a function with no actual asynchronous operation inside it). Its entire body is two synchronous `setState` calls.

---

## 3. Does `handleStartPickup` dispatch into `NavigationStore`?

**No.** `handleStartPickup`'s full body (above) contains zero references to `useNavigationStore`, `useNavigation()`, `navigation.*`, or `safeTransition` — none of those identifiers appear anywhere in this function. Confirmed by reading the function verbatim and by grep: `useNavigationStore`/`safeTransition` appear elsewhere in this file (imports at [lines 9, 11, 12](<app/(driver)/navigation.tsx#L9-L12>), and inside `calculateRoute` at [line 132](<app/(driver)/navigation.tsx#L132>), `handleArrived` at [line 174](<app/(driver)/navigation.tsx#L174>), `handleStartRide` at [line 182](<app/(driver)/navigation.tsx#L182>)) but never inside `handleStartPickup` itself.

**Why:** `driverToPickup()` — the `NavigationStore` action that actually moves the mode to `DRIVER_TO_PICKUP` — is dispatched earlier in the flow, at **Accept** time, not at Start-Pickup time: [src/features/driver/DriverDashboard.tsx:175-177](src/features/driver/DriverDashboard.tsx#L175-L177), inside `handleAcceptRequest`:

```tsx
navigation.preview(trip.pickup, trip.destination);
navigation.requestMatch();
navigation.driverToPickup(driverLocation ?? undefined);
```

By the time the driver reaches this screen and sees the "Start Pickup" button, `NavigationStore.mode` is therefore already `DRIVER_TO_PICKUP` — that transition already happened, off-screen, before this button was ever rendered. The Phase 5C integration plan treated "Start Pickup" as camera-follow-only local UI state (matching this screen's `handleStartPickup`'s own existing comment, `// Just enable navigation mode (camera follow)`) precisely because `NavigationModes.ts`'s transition table has no separate edge for it — `DRIVER_TO_PICKUP` has no self-loop, and the only edges out of it are `ARRIVED_PICKUP` and `IDLE`. There is currently no `NavigationStore` action this button could legally call that isn't already a no-op (attempting `driverToPickup()` again from a mode that's already `DRIVER_TO_PICKUP` would itself be an illegal transition, since `DRIVER_TO_PICKUP` isn't in its own legal-next-mode list).

---

## 4. Does `safeTransition()` execute?

**No.** Since §3 establishes `handleStartPickup` never calls any `NavigationStore` action, it never calls `safeTransition` either — grep-confirmed zero occurrences of `safeTransition` inside `handleStartPickup`'s body. There is no Current State / Requested State / Allowed / Rejected to report for this button press — the guard is never reached.

---

## 5. Does `NavigationStore` actually change state?

**No, not as a result of this button press.** `useNavigationStore`'s `mode` field is untouched by anything in `handleStartPickup`. For context (not caused by this press): by this point in the flow, `mode` already reads:

```
Previous Mode: MATCHING
       ↓ (driverToPickup(), dispatched earlier in DriverDashboard.handleAcceptRequest)
Next Mode:     DRIVER_TO_PICKUP
```

Pressing "Start Pickup" leaves it exactly there — `DRIVER_TO_PICKUP → DRIVER_TO_PICKUP` (i.e., no change at all, because no transition is attempted).

---

## 6. Do subscribers receive the update?

Moot — §5 established no state change occurs, so nothing fires. For completeness, tracing what each named subscriber is actually doing right now, independent of this button:

- **`NavigationProvider`** ([src/navigation/NavigationEngine/providers/NavigationProvider.tsx](src/navigation/NavigationEngine/providers/NavigationProvider.tsx)) does not subscribe to `mode`/`cameraState` at all — its only subscriptions are `GPSManager.onFix`/`onStatusChange` (forwarding into `setGpsFix`/`setGpsStatus`). It has no code path that reacts to a mode transition either way.
- **`CameraController`** ([src/navigation/NavigationEngine/CameraController.ts:228-235](src/navigation/NavigationEngine/CameraController.ts#L228-L235)) only subscribes to the store (`unsubscribeStore = useNavigationStore.subscribe(handleStoreChange)`) once `attachMap(handle)` has been called by a mounted `<NavigationMap>`. Grep-confirmed: **no screen in the app currently mounts `<NavigationMap>`** (per the prior integration pass's explicit, user-approved decision to defer this), so `attachMap` is never called, `unsubscribeStore` is `null`, and even a real mode change right now would reach `handleStoreChange` only if some other code path called `attachMap` first — it doesn't. `handleStoreChange` itself also short-circuits: `CameraController.ts:324` — `if (!mapHandle) return;`.
- **`AutoFitEngine`** has no subscription of its own — it's pure functions (`fitPreview`/`fitDriverAccepted`/`fitCompleted`) called only from inside `CameraController.computeTargetPose`. Since `CameraController` never recomputes (above), `AutoFitEngine` is never invoked, for this button or anything else right now.
- **`NavigationHUD`** ([src/components/navigation/NavigationHUD.tsx](src/components/navigation/NavigationHUD.tsx)) is a React component, not a subscriber in the pub/sub sense — it only "receives" anything by being rendered, and reading `NavigationStore` via `NavigationHooks` selectors while mounted. Grep-confirmed: no screen renders `<NavigationHUD>` anywhere in the app. It cannot receive this or any other update because it does not exist in the current render tree.

---

## 7. Does any exception occur?

**No exception, anywhere in this path.** Two possible outcomes, no in-between:
- Button disabled → RN's `Pressable` silently declines to invoke `onPress`. No error, no warning, no console output at all.
- Button enabled → `handleStartPickup` runs two synchronous `setState` calls with no possibility of throwing (no external calls, no property access on a possibly-null value, no store dispatch to fail against `NavigationTransitionError`).

Nothing in this path is wrapped in `safeTransition`'s try/catch because §3/§4 establish that helper is never reached from this handler.

---

## 8. Is the Start Pickup button disabled? Every condition, evaluated.

`disabled={isCalculating || (!routeCoordinates.length && !routeError)}` — [line 460](<app/(driver)/navigation.tsx#L460>).

| Condition | Declared | Ever set to `true`? | Runtime value |
|---|---|---|---|
| `isCalculating` | [line 53](<app/(driver)/navigation.tsx#L53>) | **No** — grep-confirmed zero calls to `setIsCalculating` anywhere in this file | always `false` |
| `!routeCoordinates.length` | [line 46](<app/(driver)/navigation.tsx#L46>) | `routeCoordinates` starts `[]`; only becomes non-empty via `calculateRoute()`'s `setRouteCoordinates(route.path)` at [line 134](<app/(driver)/navigation.tsx#L134>), which only runs if `fetchRoute(...)` ([line 123](<app/(driver)/navigation.tsx#L123>)) returns a non-null route | `true` until the first successful route fetch; `false` after |
| `routeError` | [line 54](<app/(driver)/navigation.tsx#L54>) | **No** — grep-confirmed the only occurrence of `setRouteError` in the whole file is its own declaration; nothing ever calls it | always `false` |

Substituting the two dead variables (`isCalculating` always `false`, `routeError` always `false`), the expression collapses at runtime to:

```
disabled = false || (!routeCoordinates.length && true)
         = !routeCoordinates.length
```

**The button's disabled state is entirely a function of whether `calculateRoute()` has ever successfully populated `routeCoordinates` since this screen mounted.** If it has, the button has been enabled ever since and stays enabled (nothing ever re-empties `routeCoordinates` on this screen). If `fetchRoute` has never once returned a non-null route (e.g. `driverLocation` was still `null` when the auto-fetch effect ran, or Google Directions returned no route / errored), the button is disabled right now with **no way to become enabled** — `routeError` can never become `true`, so the `"Retry Route"` branch (which would call `calculateRoute` again on press) can never render either. This exact button therefore has two independent, silent-failure modes, both already present before this integration pass and unchanged by it.

---

## 9. Is `routeError` blocking execution? Current values.

| Variable | Value, right now | Why |
|---|---|---|
| `routeCoordinates` | `[]` until the first successful `fetchRoute`, then that route's `path` (non-empty) permanently after | Set only at [line 134](<app/(driver)/navigation.tsx#L134>); no other writer, no resetter |
| `routeError` | **always `false`** | Declared [line 54](<app/(driver)/navigation.tsx#L54>); `setRouteError` is never called anywhere in this file (grep-confirmed, single match = the declaration) |
| `isCalculating` | **always `false`** | Declared [line 53](<app/(driver)/navigation.tsx#L53>); `setIsCalculating` is never called anywhere in this file (grep-confirmed zero matches) |
| `isNavigating` | `false` until `handleStartPickup` runs (if it ever does), then `true` for the rest of this screen's lifetime | Set only at [line 161](<app/(driver)/navigation.tsx#L161>); no resetter on this screen |
| `isAutoFollow` | `true` initially; toggles `false` on manual map pan/pinch ([line 241](<app/(driver)/navigation.tsx#L241>)), auto-resets to `true` after 5s idle ([lines 228-238](<app/(driver)/navigation.tsx#L228-L238>)); also explicitly set `true` inside `handleStartPickup` itself ([line 162](<app/(driver)/navigation.tsx#L162>)) | Independent of the disabled/press question — only affects the camera-follow `useEffect` at [lines 251-265](<app/(driver)/navigation.tsx#L251-L265>) |

`routeError` is not "blocking" in the sense of actively intervening — it's inert (permanently `false`), which is precisely the problem: it can never flip to `true` to reveal the "Retry Route" recovery path, and it never contributes anything but `false` to the `disabled` expression in §8.

---

## 10. Exact file and line where execution stops

Two distinct, independent break points exist. Which one applies depends on whether `calculateRoute()` has succeeded at least once on this screen mount:

### Break point A — button never receives the press at all
**File:** `app/(driver)/navigation.tsx`
**Line:** 460 (the `disabled` prop) combined with `src/components/ui/Button.tsx:115` (`disabled={isDisabled}` passed to `Pressable`)
**Why:** `routeCoordinates` is still `[]` — `calculateRoute()` (line 115-150) has not yet completed successfully since this screen mounted (its trigger, the `useEffect` at [lines 153-157](<app/(driver)/navigation.tsx#L153-L157>), depends on `driverLocation` being non-null, and/or `fetchRoute` at line 123 returned `null`). Execution never reaches any app-level `onPress` handler — RN's `Pressable` discards the touch internally.

### Break point B — the press is received, but the handler dispatches nothing
**File:** `app/(driver)/navigation.tsx`
**Function:** `handleStartPickup`
**Lines:** 159-163
**Why:** The button is enabled and `onPress` does fire, but `handleStartPickup`'s entire body is `setIsNavigating(true); setIsAutoFollow(true);` — two local `useState` setters. Execution completes normally (no crash, no hang) but never leaves this function: no call to `useNavigationStore`, no call to `useNavigation()`'s actions, no call to `safeTransition`. This matches §3-§7 exactly: the store is never touched, so `NavigationProvider`/`CameraController`/`AutoFitEngine`/`NavigationHUD` have nothing to receive, and the reason none of them are even in a position to receive anything is the separate, already-known fact that none of them are mounted/attached anywhere in the app right now (§6).

Given "Start Pickup" produces **no visible change at all** (not even the button swapping to the "Slide to Arrive" slider, which *would* be visible if Break Point B were reached and `isNavigating` flipped to `true`), the evidence points to **Break Point A** as the one currently in effect: the button is disabled, and the tap is being silently discarded by React Native before any of this file's own code runs.
