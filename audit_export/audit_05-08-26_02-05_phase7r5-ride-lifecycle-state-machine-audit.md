# Phase 7R.5 — Ride Lifecycle State Machine Audit

**Date:** 2026-08-05
**Type:** Read-only execution trace against current (uncommitted) working-tree code, post-Phase-7R.4 migration. No fix implemented, per explicit instruction.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`, and every prior pass in this series (7R through 7R.4 — see `audit_export/audit_05-08-26_*.md`).

**Premise check performed before tracing (see "Premise corrections" below):** the prompt's trace names `driverStore.beginPickup()` and describes "Start Pickup" as a `RideActionSlider` with `disabled`/`loading`/`onComplete` props. Neither is accurate against the current codebase. This is flagged up front, not buried, because tracing a function that doesn't exist would produce a fabricated report — the same discipline applied in 7R.2/7R.3 when their premises also needed correcting mid-trace.

---

## Premise corrections

### 1. There is no `driverStore.beginPickup()`

A repo-wide search for `beginPickup` returns zero results. The real function `DriverDashboard.handleAcceptRequest` (`src/features/driver/DriverDashboard.tsx:166-183`) calls is `driverStore.acceptRequest(id, driverId)` (`src/state/driverStore.ts:301-337`). This is traced in full below.

### 2. "Start Pickup" is a `<Button>`, not a `RideActionSlider`

`app/(driver)/navigation.tsx:419-429` (current, post-7R.4):

```tsx
{!navigationEnabled ? (
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
) : (
    <RideActionSlider
        key={`arrival-${arrivalAttempt}`}
        label="Slide to Arrive"
        onComplete={handleArrived}
        isLoading={isConfirmingArrival}
    />
)}
```

A repo-wide grep for `RideActionSlider` (`src/components/ui/RideActionSlider.tsx`, its `NavigationSlideButton` wrapper, and every screen that renders one) finds exactly three sliders in the whole app, and none of them is labeled "Start Pickup":
- `navigation.tsx:431` — label **"Slide to Arrive"** (renders only *after* Start Pickup has already been pressed — `navigationEnabled` is true).
- `navigation.tsx:475` — label **"Slide to Start Trip"** (the separate Waiting-for-Passenger card).
- `trip.tsx:643` — a different screen entirely (trip-in-progress).

**"Start Pickup" itself has never been a slider in this codebase.** It is, and per `git log`/the file's structure appears to have always been, a `<Button>`. The rest of this trace follows the real control (the Button), and separately inspects the two real `RideActionSlider`s on this screen for completeness, since the prompt's specific questions about `disabled`/`loading`/`onComplete`/pointerEvents/remount-by-`key` are meaningful for those even though they don't apply to the actual "Start Pickup" element.

---

## Trace (real code)

### Step 1 — Passenger requests ride → Driver accepts

Out of scope for this driver-side control (no driver-facing state is set until acceptance) — not re-traced.

### Step 2 — Driver accepts ride

`DriverDashboard.tsx:166-183`:

```tsx
const handleAcceptRequest = async (id: string) => {
    if (!driverAccount) return;
    const trip = await acceptRequest(id, driverAccount.id);
    if (trip) {
        safeTransition(() => {
            navigation.preview(trip.pickup, trip.destination);
            navigation.requestMatch();
            navigation.driverToPickup(driverLocation ?? undefined);
        });
        router.push('/(driver)/navigation');
    } else {
        Alert.alert('Ride unavailable', 'This ride was just taken by another driver.');
    }
};
```

### Step 3 — `driverStore.acceptRequest()` (the real function)

`driverStore.ts:301-337`. The relevant state write is synchronous and atomic:

```ts
set((state) => ({
    incomingRequests: state.incomingRequests.filter((r) => r.id !== id),
    currentTrip: request,
    tripStatus: 'navigating_to_pickup',
}));
```

**Ride status = `'navigating_to_pickup'`, `currentTrip` = the full request object — both set in the same `set()` call, before `handleAcceptRequest` even reaches the `safeTransition`/`router.push` lines below it.** (`passengerName`/`passengerRating`/`customerId` are hydrated slightly later by a fire-and-forget `fetchOrderCustomer(id).then(...)` at `:322-334` — a real but narrow gap: if that promise hasn't resolved yet, `currentTrip.passengerName`/`passengerRating` briefly show whatever `request` already had. This does not affect the Start Pickup button — it has no dependency on those two fields.)

**Verdict: no race, no missing state.** `currentTrip`/`tripStatus` are guaranteed populated correctly before `navigation.tsx` ever mounts.

### Step 4 — `NavigationStore.driverToPickup()` (and the two calls before it)

Back in `handleAcceptRequest`, all three `navigation.*` calls run inside **one** `safeTransition(() => { ... })` — a single synchronous function, one `try/catch`:

```ts
safeTransition(() => {
    navigation.preview(trip.pickup, trip.destination);   // IDLE -> PREVIEW
    navigation.requestMatch();                             // PREVIEW -> MATCHING
    navigation.driverToPickup(driverLocation ?? undefined); // MATCHING -> DRIVER_TO_PICKUP
});
```

Each of these three actions independently calls `applyTransition`, which calls `assertValidTransition(currentMode, to)` (`NavigationModes.ts:166-170`) and **throws synchronously** if the edge isn't legal (`NAVIGATION_MODE_TRANSITIONS`, `NavigationModes.ts:78-116`). `safeTransition` (`safeTransition.ts:15-25`) catches exactly one exception per call — and because all three dispatches are chained inside the *same* function body, **a throw on the first call (`preview`) aborts the other two as well**, not just the one that failed.

This is only correct if `NavigationStore.mode` is exactly `IDLE` at the moment of acceptance (`IDLE -> PREVIEW` is the only legal entry to this chain — see the transition table). That should normally be true: a driver must have gone online (`OFFLINE -> IDLE`, via `DriverDashboard`'s online toggle) before they can see/accept a request at all. **This pass did not find a code path that leaves `mode` at something other than `IDLE` at accept time** — but it also did not find an explicit guard *preventing* one, e.g. if a previous trip's cleanup path returns to `IDLE` through a route this pass didn't fully enumerate, or a remount/hot-reload leaves `NavigationStore` mid-chain. If that ever happens, the failure mode is **completely silent**: `console.warn('[NavigationStore] ignored illegal transition: ...')` in dev, nothing in production-equivalent logs the user would see, and `NavigationStore.mode` simply never reaches `DRIVER_TO_PICKUP` — while `driverStore.currentTrip`/`tripStatus` (Step 3, a separate store with no legality check at all) proceed regardless, and `router.push` still navigates to the screen. This is a real, current-code gap worth flagging (see Deliverable 6), but — per the trace in Step 6 below — **it does not gate the Start Pickup button**, so it is not this audit's answer to "why Start Pickup never activates."

### Step 5 — `navigation.tsx` mounts

Confirmed via Step 3: `currentTrip` and `tripStatus === 'navigating_to_pickup'` are already correct at mount time — no additional race introduced by navigation/routing.

- `tripStatus === 'navigating_to_pickup'` (`navigation.tsx:355`) → the pickup `<Card>` renders. **Confirmed true**, so the Card and its Button are actually on screen (consistent with the symptom being "the button is visible but inert," not "nothing renders").
- `navigationEnabled` (`useNavigationEnabled()`, `NavigationStore.navigationEnabled`) is `false` at this point — it only flips to `true` *inside* `handleStartPickup` (`navigation.tsx:176`, `navigation.setNavigationEnabled(true)`), i.e. it is a **consequence** of Start Pickup succeeding, not a precondition gating it. `!navigationEnabled` being `true` at this stage is exactly what selects the Button branch over the "Slide to Arrive" slider branch (`navigation.tsx:419`) — correct and expected, not part of the block.

### Step 6 — The Button's `disabled` value — this is the actual gate

```tsx
disabled={isCalculating || (!routeCoordinates.length && !routeError)}
```

where (post-7R.4) `routeCoordinates = route?.path ?? []` and `route = useActiveRoute()` reads `NavigationStore.route` directly (`navigation.tsx:57,59`). This is **identical in substance** to the condition 7R.3 traced exhaustively (then screen-local; now store-sourced after 7R.4's migration) and reduces to the same fork:

- `NavigationStore.route` is only ever set by `calculateRoute()`'s `useNavigationStore.getState().setRoute(fetchedRoute)` (`navigation.tsx:143`).
- `calculateRoute()` returns immediately, before reaching that line, if `driverLocation` (now `useDriverLocation()` → `NavigationStore.driverLocation`) is falsy (`navigation.tsx:119`: `if (!driverLocation || !currentTrip) return;`).
- `NavigationStore.driverLocation` is populated exclusively by `NavigationProvider`'s own `GPSManager.onFix` listener (`NavigationProvider.tsx:87-122`), which only receives fixes once *some* consumer has called `GPSManager.acquire(...)` — `navigation.tsx`'s own mount effect does this (`navigation.tsx:79-87`), as does `DriverDashboard.tsx:95` while the driver is online.

Nothing in the ride-lifecycle path this audit traced (Accept → `acceptRequest` → `driverToPickup` → mount → render) touches, blocks, or delays this GPS/route chain. **The Button's disabled state is fully explained by the same unresolved fact every prior pass in this series (7R, 7R.1, 7R.2, 7R.3) already landed on: whether `NavigationStore.driverLocation` ever becomes non-null on a real device, which this pass — like every prior one — cannot verify without one.**

### Step 7 — `handleStartPickup()`

Reached only once the Button is enabled and pressed:

```tsx
const handleStartPickup = async () => {
    safeTransition(() => navigation.driverToPickup(driverLocation ?? undefined));
    navigation.setNavigationEnabled(true);
};
```

`navigation.driverToPickup(...)` here is `DRIVER_TO_PICKUP -> DRIVER_TO_PICKUP` — not a listed self-loop in `NAVIGATION_MODE_TRANSITIONS` (`DRIVER_TO_PICKUP`'s only legal edges are `ARRIVED_PICKUP` and `IDLE`), so under normal conditions (mode already `DRIVER_TO_PICKUP` from Step 4) this throws `NavigationTransitionError`, caught and silently ignored by `safeTransition` — by design, per the existing doc comment at `navigation.tsx:161-169` ("typically a safeTransition-guarded no-op... kept... because it doubles as the recovery path"). `navigation.setNavigationEnabled(true)` runs unconditionally on the next line regardless of whether the line above threw — confirmed no early return / no shared try/catch between the two statements. **This function is correctly reachable and correctly wired; it simply can't be reached while Step 6's condition holds.**

---

## Inspecting the actual control mechanics (Part 3 of the prompt, applied to the real Button — and, for completeness, the two real sliders)

**Button** (`src/components/ui/Button.tsx`):
- `disabled={isDisabled}` where `isDisabled = disabled || loading` (`:100,115`) is passed straight through to the underlying `Pressable`'s native `disabled` prop — React Native's own `Pressable` correctly no-ops `onPress` when `disabled` is true. **No wiring bug**: `onPress={routeError ? calculateRoute : handleStartPickup}` (`navigation.tsx:423`) is a normal prop, genuinely attached, genuinely callable — it is simply never invoked because the native layer blocks the press while `disabled` is true, exactly as designed.
- `loading` (mapped from `isCalculating`) swaps the label for an `ActivityIndicator` (`Button.tsx:120-124`) and also folds into `isDisabled` — consistent, no double-disable bug.
- No `pointerEvents` override anywhere in `Button.tsx` or its call site that would disable touch independently of the `disabled` prop.
- No `key` prop on the Button (unlike the sliders below) — no remount-reset concern applies to it.

**The two real `RideActionSlider`s** (`src/components/ui/RideActionSlider.tsx`), inspected for completeness since the prompt's questions target this component specifically:
- `disabled`/`isLoading` both correctly gate the pan gesture: `Gesture.Pan().enabled(!disabled && !completed && !isLoading)` (`:51`) — a disabled or loading slider's thumb cannot be dragged at the gesture-recognizer level, not just visually (`opacity: disabled ? 0.6 : 1` at `:80` is a separate, consistent visual cue).
- `onComplete` is genuinely invoked, only on a real completed drag (`handleComplete`, `:44-48`, called from the pan gesture's `.onEnd()` once the thumb crosses 90% of the track, `:57-64`) — not short-circuited anywhere.
- `key={`arrival-${arrivalAttempt}`}` / `key={`start-trip-${startTripAttempt}`}` deliberately force a remount **only** when a retry counter increments (i.e. after a failed `confirmArrival`/`beginTrip` — `navigation.tsx:184`/`:199`), which resets the slider's internal `completed`/`translateX` state so the user can try again. This is intentional (matches the existing doc pattern elsewhere in this file) and only fires on a real prior failure, not spuriously.
- Neither of these two sliders is on the code path between Accept and Start Pickup — they render strictly after it (`navigationEnabled === true`) or in a different card (`waiting`/`arrived` tripStatus) entirely.

**Conclusion: no bug exists in either control's mechanics.** The Button (the real "Start Pickup" control) correctly reflects its `disabled` prop; that prop is correctly computed from `NavigationStore.route`; that store field is correctly populated by `calculateRoute()`, gated correctly on `driverLocation`. Every link in this specific chain is intact.

---

## Deliverables (Part 6)

### 1. Exact state value
`NavigationStore.route` — `null` for as long as `calculateRoute()` never completes; consumed as `routeCoordinates = route?.path ?? []` at `navigation.tsx:59`.

### 2. Exact condition
`disabled={isCalculating || (!routeCoordinates.length && !routeError)}` — `navigation.tsx:425`. With `route === null`: `routeCoordinates.length === 0` and (since `calculateRoute` never got far enough to set it) `routeError === false`, so `disabled` evaluates `true`.

### 3. Exact file
`app/(driver)/navigation.tsx` (the Button/its `disabled` expression); upstream cause in the same file's `calculateRoute` (`:118-151`, guard at `:119`) and, further upstream, `src/navigation/NavigationEngine/providers/NavigationProvider.tsx` (the sole writer of `NavigationStore.driverLocation`) and `src/navigation/NavigationEngine/GPSManager.ts` (the sole source of the fixes that listener forwards).

### 4. Exact line
`navigation.tsx:119` — `if (!driverLocation || !currentTrip) return;` — the fork. `currentTrip` is verified non-null by Step 3/5; `driverLocation` is the one remaining unknown.

### 5. Why Start Pickup never activates
The ride-lifecycle path this audit was asked to trace (Accept → `acceptRequest` → mode transitions → screen mount → render) is **verified intact** — `currentTrip`/`tripStatus` are set synchronously and correctly, the Card and Button render, the Button's `onPress`/`disabled` wiring has no bug. Start Pickup fails to activate for the **same reason identified in 7R.3 and unchanged by 7R.4's migration**: `NavigationStore.route` never gets set because `calculateRoute()`'s entry guard never passes, because `NavigationStore.driverLocation` never becomes non-null — a fact this pass, like every prior one in this series, cannot confirm or deny without a real device (permission state, location-services state, and whether `GPSManager.acquire()` ever actually starts a live OS subscription are all outside what static tracing can determine). This audit's contribution is ruling out the ride-lifecycle/state-machine layer as an alternative explanation, not finding a new one.

**Secondary finding (does not gate the button, flagged separately):** `DriverDashboard.handleAcceptRequest`'s three `navigation.*` mode-transition calls are chained inside one `safeTransition`, so if `NavigationStore.mode` is ever not exactly `IDLE` at accept time, all three silently no-op together (one console warning, not three) and `mode` never reaches `DRIVER_TO_PICKUP` — while `driverStore`'s own `currentTrip`/`tripStatus` proceed regardless, since `acceptRequest` has no state-machine legality check at all. This is a real desync risk between the two stores, independent of the Start Pickup investigation.

### 6. Minimal fix (not implemented, per instruction)
Not implemented. If a fix pass follows, in priority order: (a) the same diagnostic gap 7R.3 already identified — silent-catch around `GPSManager.acquire()` — is still the highest-value first step, now doubly so since this pass confirms nothing in the ride-lifecycle layer is masking or contributing to it; (b) separately, splitting `handleAcceptRequest`'s chained `safeTransition` into three individually-guarded calls (or asserting `mode === IDLE` before the chain and logging if not) would surface the secondary desync finding instead of silently dropping two-thirds of a three-step transition on the rare case the first one fails.
