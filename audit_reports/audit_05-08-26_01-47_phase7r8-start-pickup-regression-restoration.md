# Phase 7R.8 — Start Pickup Regression: Restoration Audit

**Date:** 2026-08-05
**Type:** Read-only regression restoration audit. No fix implemented, per explicit instruction.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`, and the full Phase 7R investigation series already in `audit_export/`:
`audit_05-08-26_00-23_phase7r-start-pickup-regression-audit.md` (7R),
`audit_05-08-26_00-40_phase7r1-gps-listener-runtime-verification.md` (7R.1),
`audit_05-08-26_00-58_phase7r2-route-state-lifecycle-audit.md` (7R.2),
`audit_05-08-26_01-30_phase7r3-route-initialization-execution-trace.md` (7R.3),
`audit_05-08-26_02-05_phase7r5-ride-lifecycle-state-machine-audit.md` (7R.5).

---

## 0. What this pass adds, and why the prior five didn't find it

Every one of 7R through 7R.5 diffed the working tree against `git diff HEAD`, where `HEAD` = commit `80f4097` ("implemented Navigation Engine"). They treated `80f4097` as "the pre-Phase-7 baseline" and searched exhaustively for what Phase 7 (the UI-polish pass on top of the already-built engine) broke. Across five rounds of static tracing and two rounds of direct runtime execution (real `GPSManager`, real `RouteEngine`, real `computeRouteProgress`), **nothing in the Phase 7 diff was found to actually break the chain** — every function traced (`calculateRoute`, `fetchRoute`, the GPS listener dispatch, the ride-lifecycle state machine) was confirmed intact, leaving one unresolved variable each time: *"does `driverLocation` ever become non-null on a real device?"* — a question none of them could answer without one.

This pass goes one commit further back, per this task's Part 3 instruction: the developer's confirmed-working state predates the Navigation Engine's existence entirely — commit `bae3beb`, **"Before implementing navigation engine."** `80f4097` is not the last known working state; it is the *first* Navigation Engine commit, already several steps removed from `bae3beb`. Diffing `bae3beb` → `80f4097` (a diff none of the five prior passes ran) surfaces a concrete, structural regression the whole prior series missed by construction — not a maybe, a verified code difference.

---

## Part 4 — Regression timeline

| Commit | What changed | Touches GPS ownership? | Touches driverLocation seeding? | Touches Start Pickup gating? |
|---|---|---|---|---|
| `bae3beb` (last known working) | Baseline. `navigation.tsx` and `DriverDashboard.tsx` each own an independent `Location.watchPositionAsync` subscription, each preceded by its own `Location.getCurrentPositionAsync()` immediate seed. | N/A (pre-engine) | **Yes — seeded synchronously on every mount** | No |
| `80f4097` ("implemented Navigation Engine") | Introduces `GPSManager.ts` (sole GPS owner), `NavigationStore.ts`, `NavigationProvider.tsx`, `CameraController.ts`, etc. Migrates `navigation.tsx`/`DriverDashboard.tsx` off direct `expo-location` calls onto `GPSManager.acquire()`. **`NavigationProvider.tsx` becomes the sole writer of `NavigationStore.driverLocation`, via a passive `onFix` listener registered on mount — with no seed call.** `DriverDashboard.tsx`'s own migration *does* add an explicit `GPSManager.getLastFix()` seed after `acquire()` (preserving its old behavior); `navigation.tsx`'s migration does not carry an equivalent seed forward because it no longer owns `driverLocation` at all — it now reads `NavigationStore.driverLocation`, which only `NavigationProvider` writes. | **Yes — consolidated onto `GPSManager`** | **Yes — the immediate-seed guarantee is dropped for the `NavigationStore`-sourced copy of `driverLocation`** | Not directly — the gating expression itself (`disabled={isCalculating \|\| (!routeCoordinates.length && !routeError)}`) is unchanged, byte-identical in every commit from `bae3beb` through today |
| Phase 7 (`80f4097` → current working tree, all five 7R passes already cover this in detail) | UI polish: `NavigationMap`, `CameraController` camera-follow/auto-fit, marker animation, turn banner, lane guidance, road name, arrival time, per-listener dev-only isolation added to `GPSManager.emit`, `RouteProgressTracker` (`applyGpsFixWithProgress`/`checkAndReroute`) wired into `NavigationProvider`'s existing listener. | No (GPS ownership already settled at `80f4097`) | No (the seeding gap from `80f4097` is untouched — still absent) | No (gating expression still unchanged) |
| Phase 7R.4 (undocumented mid-series migration, referenced by 7R.5 as already applied) | `navigation.tsx` drops its own local `driverLocation`/`routeCoordinates` state entirely, switching to `useDriverLocation()`/`useActiveRoute()` selectors reading `NavigationStore` directly. | No | No — this makes the screen **fully dependent** on `NavigationProvider`'s unseeded listener, where before this migration the screen could at least theoretically fall back on its own local GPS mirror | No |

**Answering Part 4's specific checklist for the one commit that matters most (`80f4097`):**
- Navigation initialization? Yes — engine bootstrapped for the first time.
- GPS ownership? **Yes — moved from three independent per-screen subscriptions to one shared `GPSManager` singleton.**
- Route initialization? No — `RouteEngine`/`fetchRoute` logic carried over unchanged.
- Driver location? **Yes — this is the regression (see Part 5).**
- Ride lifecycle? No — `driverStore.acceptRequest`/`tripStatus` machinery unchanged (confirmed independently by 7R.5).
- Button state? No — the `disabled` expression itself is untouched across every commit checked.
- NavigationMap? N/A at this commit (added later, Phase 6A).
- Camera initialization? Yes, but inert until Phase 6A wired it up (not this button's dependency).
- RouteEngine? No — carried over unchanged.
- NavigationStore? Yes — created; this is where the lost seed manifests as `driverLocation: null` persisting.

---

## Part 5 — The first break

### Exact regression

**File:** `src/navigation/NavigationEngine/providers/NavigationProvider.tsx` (new file, introduced in `80f4097`)
**Function:** the GPS-forwarding `useEffect` (current working tree: lines 86–130)
**What's missing, exact line:** there is no call anywhere in this effect (or anywhere else in `NavigationProvider.tsx`) to `GPSManager.getLastFix()` or `GPSManager.getCurrentFix()` to seed `NavigationStore.driverLocation` at mount time. The effect only does:

```ts
const unsubscribeFix = GPSManager.onFix((fix) => { /* ... */ });
```

— register-and-wait. `NavigationStore.driverLocation` stays at its `initialState` value (`null`, `NavigationStore.ts:44`) until the *next* fix the shared `GPSManager` watcher happens to emit after this listener is registered.

### Why it worked before (`bae3beb`)

`app/(driver)/navigation.tsx`'s own `startTracking()` (baseline, lines ~64–104) called, in order:
```ts
const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }).catch(() => null);
if (initial) { setDriverLocation(initial.coords); ... }
subscription = await Location.watchPositionAsync({ ... }, (location) => { setDriverLocation(location.coords); ... });
```
Every single mount of this screen independently guaranteed a fresh, immediate GPS read (`getCurrentPositionAsync`) *before* ever depending on the continuous watcher's first callback. `driverStore.currentLocation` also seeded the local `useState` initial value (`useState(currentLocation)`) as a second fallback. `DriverDashboard.tsx` had the identical pattern independently (confirmed: `git show bae3beb:src/features/driver/DriverDashboard.tsx` also calls `Location.getCurrentPositionAsync` before its own `watchPositionAsync`). **Two independent, redundant immediate-seed paths existed pre-engine — belt and suspenders.**

### Why it stopped working (`80f4097` onward)

Consolidating GPS onto `GPSManager` was correct per the Bible ("Only ONE GPS watcher exists"), but the consolidation did not carry the *seeding* behavior forward uniformly:
- `DriverDashboard.tsx`'s migration explicitly preserved it: `await GPSManager.acquire(...); const existingFix = GPSManager.getLastFix(); if (existingFix) { setDriverLocation(...) }` (current file, lines 93–108).
- `NavigationProvider.tsx` — which subsequently became the *only* writer of the `NavigationStore.driverLocation` that `navigation.tsx` now reads (post-7R.4) — was never given the equivalent seed call. It was written purely as a forwarding listener.

So today, `navigation.tsx`'s Start Pickup button depends on `NavigationStore.driverLocation`, which depends entirely on `NavigationProvider` having already received at least one `LOCATION_UPDATED` event *since NavigationProvider mounted* (i.e., since app cold start) — with no fallback read of whatever fix, if any, is already cached in `GPSManager.getLastFix()` at the moment the driver's screen actually needs it. In the common path (driver already online on `DriverDashboard`, GPS already flowing, `NavigationProvider` already listening from cold start) this self-heals quickly once the next tick arrives — consistent with 7R.1's runtime-verified finding that the listener mechanism itself is not broken. But it removes the old code's *guarantee*: any gap between "screen wants `driverLocation`" and "the shared watcher's next tick arrives" — a cold GPS chip, a simulator with a static/non-moving mock location (where `distanceIntervalMeters`-gated ticks may not fire again after the first), a brief window right after the driver goes online, or `NavigationProvider` mounting after tracking has already started and missing the fix that was current at that moment — now has no fallback. Before, that gap didn't exist because `getCurrentPositionAsync` was called fresh, synchronously, on every mount, independent of any other screen's state.

This is the first Navigation-Engine-era commit where "driver location may take an indeterminate amount of time to become non-null, with no seed and no diagnostic signal" became true of the code that gates Start Pickup — and every subsequent phase (7A–7F, 7R.4) built directly on top of `NavigationProvider` as the sole source of truth without ever revisiting this gap, which is exactly why five rounds of Phase-7-scoped tracing kept arriving at the same unresolved dead end.

### Confidence score

**Medium-high (not certain — no device available to confirm the symptom reproduces specifically because of this gap, consistent with every prior pass's stated limitation).** What is certain, verified by direct diff against the actual last-known-working commit (not inferred): the immediate-seed guarantee existed in `bae3beb` in two independent places, and is absent from the single place (`NavigationProvider.tsx`) that now exclusively owns the value the Start Pickup button's `disabled` expression transitively depends on. This is a real, structural loss of robustness introduced exactly at the commit that created the Navigation Engine — not a Phase 7 UI-polish regression, which is why the Phase 7-scoped audits (7R–7R.5) could not find it no matter how many times they re-traced the same post-engine code.

---

## Secondary findings carried forward (still open, confirmed still present in the current tree this pass)

1. **`GPSManager.emit()` has no per-listener fault isolation in production** (`GPSManager.ts:145-171`) — only `__DEV__` builds get try/catch-wrapped dispatch. A throwing listener still silently starves every listener registered after it in production. (7R §6, runtime-confirmed as a real mechanism by 7R.1; not confirmed as currently firing.)
2. **`CameraController.recompute()` writes back into the store it's subscribed to**, synchronously, from inside its own `subscribe` callback (`CameraController.ts:587`) — a one-way-data-flow violation, confirmed still present, not self-looping, not confirmed as currently throwing. (7R §7.)
3. **`DriverDashboard.handleAcceptRequest`'s three `navigation.*` mode-transition calls are chained inside one `safeTransition`** (`DriverDashboard.tsx`) — if `NavigationStore.mode` is ever not exactly `IDLE` at accept time, all three silently no-op together while `driverStore.currentTrip`/`tripStatus` proceed regardless, desyncing the two stores with no user-visible signal. (7R.5, secondary finding.)
4. **The silent `catch` around `GPSManager.acquire()`** in both `navigation.tsx:80-82` and `DriverDashboard.tsx:109-112` gives zero observability into a real permission/services failure — indistinguishable from "GPS just hasn't produced a fix yet." (7R.3.)

None of these four are re-litigated in depth here — they're accurately documented in the referenced prior passes and remain accurate against the current working tree (spot-checked this pass, unchanged).

---

## Part 6/7 — Restoration plan (not implemented, per instruction)

**Smallest possible fix**, keeping every engine component (`NavigationStore`, `RouteEngine`, `CameraController`, `AutoFitEngine`, `NavigationMap`, `GPSManager`) exactly as-is:

Add one seed call inside `NavigationProvider.tsx`'s existing GPS effect, before or alongside registering the `onFix` listener:

```ts
const existingFix = GPSManager.getLastFix();
if (existingFix) {
  useNavigationStore.getState().setGpsFix(existingFix);
}
```

This mirrors exactly the pattern `DriverDashboard.tsx` already uses (current file, lines 101-108) and restores the pre-engine guarantee (`bae3beb`'s `getCurrentPositionAsync`-before-`watchPositionAsync` seed) at the one place that now needs it — without touching `GPSManager`, `NavigationStore`'s shape, `RouteEngine`, `CameraController`, or any screen. It is a read of an already-cached value (`getLastFix()` is synchronous, no new permission prompt, no new network/GPS call), so it cannot introduce a new failure mode; it can only fill the gap when a fix already exists but arrived before `NavigationProvider` had reason to care.

Independently, the four secondary findings above have their own minimal fixes already on record in 7R/7R.3/7R.5 (per-listener `try/catch` in `GPSManager.emit`'s production path; move `CameraController`'s `setState` out of its own subscriber callback; split `handleAcceptRequest`'s chained `safeTransition` into individually-guarded calls; `__DEV__`-log the silent `acquire()` catch) — none required to restore Start Pickup specifically, all worth doing in a follow-up fix pass.

---

## Deliverables summary (Part 7 of the prompt)

1. **Last known working implementation:** commit `bae3beb`, "Before implementing navigation engine."
2. **First broken implementation:** commit `80f4097`, "implemented Navigation Engine" — specifically the introduction of `NavigationProvider.tsx` as the unseeded sole writer of `NavigationStore.driverLocation`.
3. **Exact file:** `src/navigation/NavigationEngine/providers/NavigationProvider.tsx`.
4. **Exact function:** the GPS-forwarding `useEffect` (current lines 86-130), specifically its `GPSManager.onFix(...)` registration with no preceding `getLastFix()`/`getCurrentFix()` seed.
5. **Exact line:** absence, not presence — compare `bae3beb`'s `app/(driver)/navigation.tsx` (`getCurrentPositionAsync` call preceding `watchPositionAsync`, ~line 70) against `NavigationProvider.tsx`'s effect, which has no equivalent.
6. **Exact regression:** the immediate-seed guarantee for `driverLocation` (present twice, independently, pre-engine) was not carried forward into the single new owner of that value post-engine.
7. **Why it worked before:** every mount independently forced a fresh GPS read before depending on the watcher's first callback.
8. **Why it stopped working:** `NavigationProvider` (the new sole writer of the store field `navigation.tsx` now depends on) only listens for future fixes; it never reads whatever fix is already cached in `GPSManager` at the moment it starts caring.
9. **Minimal restoration patch:** one `getLastFix()` seed call inside `NavigationProvider.tsx`'s existing effect (shown above) — not implemented in this pass, per instruction.
10. **Confidence score:** medium-high — the structural gap is verified by direct diff against the real last-known-working commit; that it is *the* full explanation for the reported symptom (versus a contributing factor alongside the four secondary findings) cannot be confirmed without a device or simulator, consistent with the limitation stated in every prior pass in this series.
