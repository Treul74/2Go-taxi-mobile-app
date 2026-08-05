# Phase 7R — Critical Regression Audit: "Start Pickup" Unresponsive

**Date:** 2026-08-05
**Type:** Read-only execution-trace audit. No files modified, no fix implemented, per explicit instruction.
**Method:** Read `AGENTS.md` and `2GO Navigation Engine Bible.md` in full before tracing. Read every file in the press → handler → store → engine chain against the current working tree, then diffed each one against `HEAD` (commit `80f4097`, "implemented Navigation Engine" — the pre-Phase-7 baseline) via `git diff HEAD -- <file>` to separate "always been this way" from "Phase 7 changed this." Ran `npx tsc --noEmit` (clean, 0 errors) to rule out a build-level break. No device/simulator available in this environment — noted explicitly wherever a finding would benefit from runtime confirmation, consistent with every prior audit in this repo's history.

---

## 0. Premise check — the flow as described doesn't match the flow as coded

Part 3's trace describes: *Slide to Start Pickup → RideActionSlider → onComplete/onSlideComplete → handleStartPickup()*.

This is not what exists in the code, before or after Phase 7. Grep-confirmed (`RideActionSlider` usages, `app/(driver)/navigation.tsx`): "Start Pickup" has **always** been a plain `Button` with an `onPress` handler, not a `RideActionSlider`. The two sliders that do exist on this screen are "Slide to Arrive" ([navigation.tsx:437-442](<app/(driver)/navigation.tsx#L437-L442>)) and "Slide to Start Trip" ([navigation.tsx:481-486](<app/(driver)/navigation.tsx#L481-L486>)) — both come *after* Start Pickup in the lifecycle, not instead of it. This was already true in the pre-Phase-7 baseline commit and is unchanged. Noted so the rest of this trace (which follows the actual `Button`/`onPress` path, not a slider) isn't read as having silently substituted the wrong component.

---

## 1. What Phase 7 actually changed (diff against pre-Phase-7 baseline)

```
git diff --stat HEAD
 app/(driver)/navigation.tsx                        | 163 ++++----
 src/components/map/Map.native.tsx                  | 442 ++++++++++++---------
 src/components/map/Map.web.tsx                     |  23 +-
 src/components/navigation/NavigationHUD.tsx        |  27 +-
 src/components/navigation/NavigationMap.tsx        |  64 ++-
 src/components/navigation/NavigationTurnBanner.tsx |  54 ++-
 src/components/navigation/index.ts                 |   4 +
 src/hooks/index.ts                                 |   2 +
 CameraController.ts                                |  92 ++++-
 NavigationEvents.ts                                 |  12 +-
 NavigationHooks.ts                                  |  39 ++
 NavigationStore.ts                                  |  50 ++-
 providers/NavigationProvider.tsx                    |  46 ++-
 types.ts                                            |  14 +
```

`RouteEngine.ts`, `GPSManager.ts`, `AutoFitEngine.ts`, `MarkerAnimator.ts`, `DriverDashboard.tsx`, `driverStore.ts` — every file the Accept-time dispatch and the button's own render/disabled logic depend on — are **not** in this diff. Unchanged.

---

## 2. Trace: does the press reach `handleStartPickup`, and does it complete?

### A — Does the button receive the press?
[navigation.tsx:426-435](<app/(driver)/navigation.tsx#L426-L435>):
```tsx
<Button
    variant={routeError ? "accent" : "primary"}
    leftIcon={routeError ? "refresh" : "navigate"}
    onPress={routeError ? calculateRoute : handleStartPickup}
    fullWidth
    disabled={isCalculating || (!routeCoordinates.length && !routeError)}
    loading={isCalculating}
>
```
**Byte-identical to the pre-Phase-7 baseline** (confirmed: this hunk does not appear in `git diff HEAD` at all — the diff around it only touches unrelated lines above/below). `Button.tsx`'s own `disabled={isDisabled}` → `Pressable` gate is also untouched.

### B — Is the button disabled?
Same expression as every prior audit found (Aug 3, pre-Phase-7): `disabled = isCalculating || (!routeCoordinates.length && !routeError)`. `isCalculating`/`routeError` are still never set to `true` anywhere in this file (grep-confirmed, zero change). So `disabled` still collapses to `!routeCoordinates.length` — **the button is enabled if and only if `calculateRoute()` has ever successfully populated `routeCoordinates` since mount.** This logic is unchanged by Phase 7. Whether the button is currently stuck disabled therefore depends entirely on whether the *upstream* GPS pipeline that feeds `calculateRoute()` still works — see §4, the actual finding.

### C — Does `handleStartPickup()` execute and complete?
[navigation.tsx:168-183](<app/(driver)/navigation.tsx#L168-L183>) — **also unchanged by Phase 7** (this exact hunk is outside every diff range against `HEAD`):
```tsx
const handleStartPickup = async () => {
    safeTransition(() => navigation.driverToPickup(driverLocation ?? undefined));
    setIsNavigating(true);
};
```
Two statements. No new early return, no new guard clause, no new dependency introduced by Phase 7 anywhere in this function's body.

### D — Does `safeTransition` swallow the dispatch as designed?
[safeTransition.ts](src/navigation/NavigationEngine/safeTransition.ts) — unchanged, not in the diff. Common case (mode already `DRIVER_TO_PICKUP`, set earlier at Accept time in `DriverDashboard.handleAcceptRequest` — unchanged): `driverToPickup()`'s `NAVIGATION_MODE_TRANSITIONS` lookup rejects the self-loop, `applyTransition` throws `NavigationTransitionError` **synchronously inside the updater function passed to Zustand's `set()`, before `set()` mutates state or notifies any listener** — confirmed by reading `NavigationStore.ts:169-190` and Zustand's `set` semantics (the updater runs first; a throw there means `state` is never reassigned and `listeners.forEach` never executes). `safeTransition` catches it, warns, returns. `handleStartPickup` proceeds to `setIsNavigating(true)`.

**Conclusion from A–D: every piece of code the button press itself executes is byte-identical to before Phase 7, and in the ordinary case never even reaches the store's listener-notification machinery.** If the pre-Phase-7 build's button worked, this exact call chain still works today, in isolation. The regression is not in this function — it's in what else is now running on the same screen, continuously, that this function's *result* depends on.

---

## 3. Ruled out: touch interception (Part 4F)

Every newly-mounted Phase 7 overlay on this screen — `NavigationArrivalTime`, `NavigationCompass`, `NavigationControls`, `NavigationSpeedWidget`, `NavigationVoiceToggle`, and the turn-banner content (`NavigationTurnBanner`/`NavigationLaneGuidance`/`NavigationRoadName`) — is gated behind `{isNavigating && (...)}` ([navigation.tsx:312-349](<app/(driver)/navigation.tsx#L312-L349>)). `isNavigating` is `false` until *after* `handleStartPickup` runs, so **none of these views exist in the tree at the moment the driver taps "Start Pickup."** The one unconditionally-mounted new element (the turn-banner container `View` at [navigation.tsx:312](<app/(driver)/navigation.tsx#L312>)) sits at the top of the screen (`px-5 pt-2`, in normal flow) and cannot overlap the bottom card. `NavigationMap`'s own gesture handling (`onPanDrag`) is a native `MapView` event, not a JS overlay — confirmed by reading `Map.native.tsx`; it adds no additional touch-capturing view. **No overlay sits above the Start Pickup button pre-press.** F is not the cause.

## 4. Ruled out: new component render crash (Part 4F / render safety)

Every newly-added component (`NavigationArrivalTime`, `NavigationRoadName`, `NavigationLaneGuidance`, `NavigationVoiceToggle`, and the pre-existing-but-newly-wired `NavigationCompass`/`NavigationControls`/`NavigationSpeedWidget`) was read in full: each is null-safe (`if (!x) return null`), takes no required props on this screen, and reads only optional/nullable store fields. `npx tsc --noEmit` is clean. Nothing here throws on first mount with an empty/partial `NavigationState`. Not the cause.

## 5. Ruled out (for the common path): state-machine rejection (Part 4G)

`NavigationMode`/`CameraState`/`RouteProgress`/`currentStep` are all read-only from this button's own perspective. `driverToPickup()`'s rejection in the common case is the *designed*, harmless, pre-existing outcome (§2D) — identical to how it behaved before Phase 7 (confirmed against the Aug 3 "Phase 5.5B" audit, which documented this exact same rejection path). Not a new regression by itself.

---

## 6. The actual finding — GPSManager's un-isolated listener loop, newly exposed by Phase 7's second `onFix` consumer

### Root cause

**File:** [`src/navigation/NavigationEngine/GPSManager.ts`](src/navigation/NavigationEngine/GPSManager.ts), lines 145-152 (`emit`) — **unchanged by Phase 7**, but now exercised differently:

```ts
function emit<T extends GPSManagerEventType>(type: T, payload: GPSManagerEventPayloadMap[T]): void {
  const event: GPSManagerEvent<T> = { type, payload, timestamp: Date.now() };
  const handlers = gpsHandlersByType.get(type);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    handler(event as GPSManagerEvent<GPSManagerEventType>);
  }
}
```

There is **no per-listener error isolation** — no `try/catch` around `handler(event)`. If any one `onFix` listener throws, the `for...of` loop aborts and **every listener registered after the throwing one is silently skipped for that fix** (and every subsequent fix that hits the same throw). This has been true since GPSManager was built; it was never a problem because, before Phase 7, `LOCATION_UPDATED` had at most one meaningful consumer competing for order.

**What Phase 7 changed:** [`src/navigation/NavigationEngine/providers/NavigationProvider.tsx`](src/navigation/NavigationEngine/providers/NavigationProvider.tsx), lines 87-110 (new this phase — confirmed via `git diff HEAD`) registers a **second** `GPSManager.onFix` listener, and — critically — registers it **before** `app/(driver)/navigation.tsx`'s own listener does, because `NavigationProvider` wraps the entire app at [`app/_layout.tsx:234`](<app/_layout.tsx#L234>) and mounts on cold start, long before the driver ever navigates to the pickup screen. `gpsHandlersByType` is a `Set`, which iterates in insertion order — so on every GPS tick, `NavigationProvider`'s new handler runs **first**, and `navigation.tsx`'s own handler ([navigation.tsx:68-76](<app/(driver)/navigation.tsx#L68-L76>), which is the *only* thing that ever sets the local `driverLocation` state feeding `calculateRoute()` and therefore the Start Pickup button's `disabled` expression) runs **second, in the same un-isolated loop.**

`NavigationProvider`'s new handler now does real, previously-nonexistent work on every fix ([NavigationProvider.tsx:95-109](<src/navigation/NavigationEngine/providers/NavigationProvider.tsx#L95-L109>)):
```ts
const routeBeforeFix = useNavigationStore.getState().route;
if (routeBeforeFix) {
  applyGpsFixWithProgress(fix, routeBeforeFix);   // NEW (Phase 7F) — NavigationStore.setGpsFixWithProgress
} else {
  useNavigationStore.getState().setGpsFix(fix);
}
const state = useNavigationStore.getState();
if (state.route && state.driverLocation) {
  ...
  void checkAndReroute(state.driverLocation, state.route, lastRerouteCheckRef.current);  // NEW (Phase 7E)
}
```
`applyGpsFixWithProgress` → `RouteProgressTracker.ts:35-37` → `RouteEngine.computeRouteProgress` (`RouteEngine.ts:326-341`) runs **synchronously, on the main thread, inside this handler** — and that call is not wrapped in a `try/catch` anywhere in the chain (`checkAndReroute`, by contrast, *is* internally try/caught — see `RouteProgressTracker.ts:69-89` — but `applyGpsFixWithProgress` is not). If `computeRouteProgress` (or `setGpsFixWithProgress`'s own `set()`, which in turn synchronously re-enters `CameraController.handleStoreChange` — see §7 below, which is itself unguarded) throws for *any* reason on a given fix, that exception propagates out of `NavigationProvider`'s listener, up through `GPSManager.emit`'s bare `for...of`, and **`navigation.tsx`'s own `onFix` listener — registered after it — never runs for that fix, or any fix thereafter that hits the same throw.**

### Why this explains "Start Pickup no longer responds"

This screen's local `driverLocation` (the thing that gates `routeCoordinates`, which gates the button's `disabled` prop — §2B) is populated **exclusively** by `navigation.tsx`'s own `onFix` listener. If that listener stops being invoked — because a same-tick, earlier-registered listener now throws — `driverLocation` freezes at whatever it last was (possibly still `null`, if the throw starts happening before the very first successful fix reaches this screen), `calculateRoute()` never (re-)fires successfully, `routeCoordinates` stays `[]` forever, and the button is **permanently disabled** — indistinguishable, from the driver's perspective, from "the button doesn't respond": the tap lands on a `Pressable` with `disabled=true`, which React Native silently drops with no error, no console output, nothing.

This is the same **Break Point A** the pre-Phase-7 audit (`audit_03-08-26_16-53_start-pickup-execution-trace.md`, §10) had already identified as this button's one historical failure mode ("the button is disabled, and the tap is being silently discarded by React Native"). Phase 7 doesn't remove that old fragility — it adds a brand-new, plausible trigger for it that didn't exist in the pre-Phase-7 baseline, by putting a second, unguarded, newly-nontrivial listener ahead of the one this screen depends on, in a dispatch loop that was never designed to isolate listener failures from each other.

### Confidence / what's confirmed vs. not

- **Confirmed by reading the code and diffing against `HEAD`:** the un-isolated `emit()` loop exists and is unchanged; `NavigationProvider`'s second `onFix` listener is new this phase; it is registered before `navigation.tsx`'s; it now does non-trivial synchronous work with an unguarded call (`applyGpsFixWithProgress`) in the middle of that work.
- **Not confirmed in this pass, by design (no fix, no instrumentation added; also no device/simulator available in this environment):** that `computeRouteProgress`/`setGpsFixWithProgress` actually throws under the specific state this screen produces. Every individual line inside `computeRouteProgress` (`RouteEngine.ts:282-341`) was read and looks defensively written for normal route data (no unguarded array index, no division without a zero-check) — so this may require a genuinely malformed `RouteData` (e.g. a route with an empty `steps`/`path` array reaching this code some other way) to actually trip. The mechanism is real and verified; whether it is presently firing on this exact screen is the one thing that would need either a device/simulator or (in a follow-up, fix-authorized pass) temporary logging in `GPSManager.emit`'s loop to confirm.

---

## 7. Second, independent finding — `CameraController` now re-enters the store it's subscribed to

**File:** [`src/navigation/NavigationEngine/CameraController.ts`](src/navigation/NavigationEngine/CameraController.ts), line 587 (`recompute`) — confirmed new this phase via `git diff HEAD` (absent from the pre-Phase-7 baseline entirely):

```ts
useNavigationStore.setState({ bearing: appliedPose.bearing, zoom: appliedPose.zoom, pitch: appliedPose.pitch });
```

`recompute` is only ever called from `handleStoreChange` ([CameraController.ts:384-392](<src/navigation/NavigationEngine/CameraController.ts#L384-L392>)), which *is itself* the callback `attachMap` registered via `useNavigationStore.subscribe(handleStoreChange)` ([CameraController.ts:250](<src/navigation/NavigationEngine/CameraController.ts#L250>)). So on any GPS tick (or mode transition) that moves the camera enough to clear the movement/rotation/zoom threshold, this function **writes back into the same store it is a subscriber of, synchronously, from inside that subscription's own callback** — a nested `set()` call during another `set()`'s listener-notification pass. `NavigationState.bearing/zoom/pitch` were never written anywhere before Phase 7 (per this file's own new doc comment at the call site); this is a genuinely new code path, not a pre-existing one just newly triggered.

Traced through Zustand's `create`/`setState` implementation: because `state` is a single mutable variable closed over by every `set()` call (not a per-call snapshot), a nested `set()` fired from inside an outer `set()`'s listener loop causes any *remaining* listeners in that outer loop to observe the already-doubly-updated state rather than the state as it stood when the outer `set()` was invoked — a `previousState`/`state` inconsistency for any listener that hasn't run yet at the moment of re-entry. In this specific store, it does **not** self-loop infinitely (confirmed: `CameraController`'s own `RelevantSnapshot` — `CameraController.ts:301-309` — deliberately excludes `bearing`/`zoom`/`pitch`, so the nested update doesn't re-trigger `recompute` on itself), and it did not surface as a synchronous throw anywhere read in this pass. It is flagged here as a **confirmed, new, one-way-data-flow violation** — worth fixing on its own architectural merits (a store should not be mutated from inside its own subscriber) — but, unlike §6, it does not currently have a clear mechanism by which it would abort `handleStartPickup` specifically, since the common-case Start Pickup dispatch never reaches `set()`'s listener-notification step at all (§2D). Reported as a secondary, independent finding, not the primary explanation for the reported symptom.

---

## Part 5 — Deliverables

**1. Exact file:** `src/navigation/NavigationEngine/GPSManager.ts` (the mechanism) and `src/navigation/NavigationEngine/providers/NavigationProvider.tsx` (the new trigger).

**2. Exact function:** `emit()` (`GPSManager.ts`) dispatching to the anonymous `onFix` listener registered inside `NavigationProvider`'s mount effect (`NavigationProvider.tsx`), which runs ahead of `app/(driver)/navigation.tsx`'s own `onFix` listener in the same dispatch.

**3. Exact line:**
- `GPSManager.ts:145-152` — the un-isolated `for (const handler of [...handlers]) { handler(event...); }` loop (no `try/catch`).
- `NavigationProvider.tsx:87-110` — the new listener, specifically the unguarded `applyGpsFixWithProgress(fix, routeBeforeFix)` call at line 97.
- Downstream consequence: `app/(driver)/navigation.tsx:431` — the unchanged `disabled` expression that never flips to `false` if `navigation.tsx`'s own `onFix` listener (lines 68-76) stops being invoked.

**4. Root cause:** `GPSManager.emit()` has no per-listener fault isolation. Phase 7 added a second `onFix` consumer (`NavigationProvider`) that now does real, previously-nonexistent, unguarded work on every fix, and — because `NavigationProvider` mounts at the app root before any driver screen exists — that new listener is always invoked *before* `navigation.tsx`'s own listener in the same shared dispatch loop. Any exception in the new code silently starves every listener registered after it, including the one listener this screen's Start Pickup button's enabled state depends on.

**5. Why it worked before Phase 7:** Before this phase, `LOCATION_UPDATED` had effectively one consumer per screen (each driver screen registers its own `onFix` for its own local `driverLocation` state) and nothing running ahead of it that could throw. The un-isolated `emit()` loop was a latent, harmless design gap — there was nothing positioned to exploit it.

**6. Which Phase 7 change introduced the regression:** `NavigationProvider.tsx`'s Phase 7 additions — specifically the Phase 7E/7F wiring of `RouteProgressTracker.applyGpsFixWithProgress`/`checkAndReroute` into the app-root GPS listener (see doc comment at `NavigationProvider.tsx:27-37`, and the diff at `NavigationProvider.tsx:87-110` against the pre-Phase-7 baseline, which had this handler as a single unconditional `useNavigationStore.getState().setGpsFix(fix);` line).

**7. Minimal fix (not implemented, per instruction):** Wrap each individual listener invocation inside `GPSManager.emit()`'s loop in its own `try/catch` (log-and-continue on error) so one listener's failure can never starve the others — this is a one-line-per-iteration change, fixes the hazard at its actual source, and requires no change to `NavigationProvider` or `navigation.tsx` at all. Independently, `CameraController.recompute()`'s new `useNavigationStore.setState(...)` call (§7 above) should be moved out of the store's own subscriber path (e.g. published through a separate, dedicated setter invoked outside the `set()`/notify cycle, or batched) so the engine never writes back into the store it is subscribed to from inside that subscription.
