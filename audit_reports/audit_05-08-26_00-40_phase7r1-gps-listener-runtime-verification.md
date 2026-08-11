# Phase 7R.1 — Runtime Verification (GPS Listener Isolation)

**Date:** 2026-08-05
**Type:** Runtime verification. No fix implemented, per explicit instruction.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`, `audit_05-08-26_00-23_phase7r-start-pickup-regression-audit.md` (the prior audit this verifies).

---

## Methodology — why this isn't a device-captured log, and what it is instead

**No device or simulator is available in this environment** (consistent with every prior audit in this repo). A live on-device run — accept a real request, watch the driver screen, tap Start Pickup, read Metro's console — was not possible here. Two things were done instead, and both are reported honestly as what they are:

1. **A direct-execution runtime harness** (the primary evidence for Part 4/5 below): a temporary Node script (`npx tsx`) that imported the **real, unmodified** `GPSManager.ts`, `NavigationStore.ts`, and `RouteProgressTracker.ts` from this repo — only `expo-location`, `expo-task-manager`, and `react-native`'s `Platform` were mocked (the native-module boundary Node can't cross), zero engine logic was stubbed — and registered two `onFix` listeners whose bodies are copied verbatim from `NavigationProvider.tsx:87-110` and `navigation.tsx:68-76`, in the same registration order the real app uses. This is genuine code execution of the actual functions under test, not a prediction or a written-out simulation. The full captured output is in Part 4 below. The three scratch scripts used for this were deleted after use (`diag-runtime-check{,-2,-3}.ts`) — they are not part of the app.
2. **The requested `__DEV__`-gated logging was also added to the three real files** (`GPSManager.ts`, `NavigationProvider.tsx`, `app/(driver)/navigation.tsx`), exactly as Part 3 specifies, so a live run on an actual device (if one becomes available) will produce the requested timeline directly from the running app. `GPSManager.emit()`'s dev-mode branch now wraps each listener in try/catch and logs before/after/caught-exception per listener, per Part 3's explicit instruction ("Never stop dispatching remaining listeners") — this is scoped to `__DEV__` only; the production code path (the bare `for...of` loop with no isolation) is untouched. `npx tsc --noEmit` is clean after these edits.

Where "confirmed by runtime evidence" is written below, it refers to (1) — actual execution of the real functions, today, in this environment.

---

## Part 4 — Verify

### 1. Does NavigationProvider receive GPS fixes? 2. Does `applyGpsFixWithProgress` complete? 3. Does `checkAndReroute` complete?

**Yes to all three, every time, in every scenario tested.** Harness run 3 (full integration, real `NavigationProvider`-position listener body) — two scenarios, 3 fixes each:

```
========== SCENARIO A: no route yet ==========
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.4067, longitude: 28.2871 }
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.407, longitude: 28.287499999999998 }
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.4073, longitude: 28.2879 }
RESULT [A: no route yet]: navigationProviderRan=3 navigationScreenRan=3 threw=false

========== SCENARIO B: route already set ==========
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.4067, longitude: 28.2871 }
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.407, longitude: 28.287499999999998 }
navigation.tsx.onFix: driverLocation would be set to { latitude: -15.4073, longitude: 28.2879 }
RESULT [B: route already set]: navigationProviderRan=3 navigationScreenRan=3 threw=false
```

Scenario B is the one that matters — it's the only condition under which `applyGpsFixWithProgress`/`checkAndReroute` actually run (both are gated on `state.route` existing). Across 3 consecutive fixes with a route active, `applyGpsFixWithProgress` (→ real `computeRouteProgress`) and `checkAndReroute` both completed without throwing, every time.

Separately, `computeRouteProgress` (`RouteEngine.ts:326-341`) was run directly against 7 inputs, including every plausible edge case: well-formed route on/off path, empty `path`, single-point `path`, empty `steps`, `distanceMeters: 0`, and driver exactly at the route origin (the state immediately after Accept, before any movement):

```
OK  — well-formed route, position on path       -> { distanceRemainingMeters: 200, ... }
OK  — well-formed route, position off path       -> { distanceRemainingMeters: 68.4..., ... }
OK  — route.path has 0 points                    -> { distanceRemainingMeters: 200, ... }
OK  — route.path has 1 point                     -> { distanceRemainingMeters: 200, ... }
OK  — route.steps is empty                       -> { distanceRemainingMeters: 200, ... }
OK  — route.distanceMeters is 0                   -> { distanceRemainingMeters: 0, fractionComplete: 1 }
OK  — fresh route just after Accept, driver AT origin -> { distanceRemainingMeters: 200, ... }
```

**Zero throws across every case tested.** `computeRouteProgress` is defensively written (`snapToPath` returning `null` is handled with `snapped ? ... : 0`; `findActiveStepIndex` returns `Math.max(0, steps.length - 1)` = `0` for an empty array rather than indexing out of bounds; `route.distanceMeters === 0` is checked before the division that would otherwise produce it).

### 4. Does `navigation.tsx` receive the same GPS fix? 5. Does `driverLocation` continue updating?

**Yes.** Same evidence as above: `navigationScreenRan` matched `navigationProviderRan` exactly (3/3) in both scenarios — the listener in `navigation.tsx`'s registration position ran for every single fix, with no gaps, in the presence of the real, unmodified `NavigationProvider`-position logic running immediately before it each time.

### 6. Does `calculateRoute` execute? 7. Does `routeCoordinates` become non-empty? 8. Is the Start Pickup button disabled? 9. If disabled, exactly why / which variable?

Not independently re-verified at runtime this pass — `calculateRoute()` itself is unchanged by Phase 7 (confirmed in the prior audit's diff check) and depends only on `driverLocation` (§4-5 above: confirmed still updating) and `RouteEngine.fetchRoute` (a live Google Directions network call, `RouteEngine.ts` — untouched by Phase 7, not exercised in this harness since it requires a real API key and network access). The `__DEV__` logging added to `navigation.tsx` (`calculateRoute triggered`, `routeCoordinates.length` on success, and the `disabled` expression's exact inputs on every change) is in place for a live run to answer these three directly if the symptom is reproduced on a device.

---

## Part 5 — Deliverables

### 1. Runtime log timeline

See Part 4 above — the two full captured harness transcripts (mechanism test and full-integration test) are the actual runtime evidence gathered this pass.

**Mechanism test** (listener 1 deliberately throws, to confirm the *isolation* question in isolation from whether the real code happens to throw):
```
--- Emitting fix #1 ---
listener1 (NavigationProvider-position) invoked for fix #1, coordinate= { latitude: -15.4067, longitude: 28.2871 }
getCurrentFix() itself threw (exception escaped emit()): Simulated exception inside NavigationProvider.onFix
after fix #1: listener1Ran=1 listener2Ran=0
--- Emitting fix #2 (driver moved) ---
listener1 (NavigationProvider-position) invoked for fix #2, coordinate= { latitude: -15.4068, longitude: 28.2872 }
getCurrentFix() itself threw (exception escaped emit()): Simulated exception inside NavigationProvider.onFix
after fix #2: listener1Ran=2 listener2Ran=0
=== SUMMARY ===
{ listener1Ran: 2, listener2Ran: 0, hypothesisConfirmed: true }
```

### 2. Whether the hypothesis is confirmed or rejected

**Split verdict — the prior audit's finding needs revision, not a flat confirm/reject:**

- **The mechanism is CONFIRMED, with real runtime evidence.** `GPSManager.emit()`'s production code path genuinely has no per-listener isolation: when the listener registered in `NavigationProvider`'s position throws, the listener registered in `navigation.tsx`'s position (after it, same dispatch) **never runs, for that fix or any subsequent one** — demonstrated directly against the real, unmodified `GPSManager.ts`, not inferred.
- **The trigger is REJECTED, under every condition tested.** The prior audit's specific claim — that `NavigationProvider`'s new Phase 7 code (`applyGpsFixWithProgress`/`checkAndReroute`) is *currently* the thing throwing and starving `navigation.tsx`'s listener — did not reproduce. Run end-to-end with the real, verbatim bodies of both handlers, across a route-not-yet-set scenario and a route-already-set scenario (the only condition where the new code path even runs), across 3 fixes each, with a well-formed route and with 6 further pathological `RouteData` shapes fed directly to `computeRouteProgress` — **nothing threw.**

**Practical conclusion:** the button-disabling hazard described in the prior audit is a real, latent, still-unfixed architectural gap (§6 of that audit, unchanged) — but there is no runtime evidence, after actually trying to trigger it, that it is what's *currently* causing a Start Pickup failure under normal use. If the reported symptom is real and reproducible, either (a) it depends on a condition not reproduced here — a genuinely malformed `RouteData` reaching the store through some path other than `RouteEngine.fetchRoute`, a slow/hung network reroute interacting with rapid re-mounts, or something screen-lifecycle-related rather than data-shape-related — or (b) the root cause is elsewhere entirely (e.g. the secondary `CameraController` finding from the prior audit's §7, or something outside this GPS pipeline altogether). The `__DEV__` logging now live in the three real files is the next lever: it will show directly, on an actual device/simulator run, whether `applyGpsFixWithProgress`/`checkAndReroute` ever log a caught exception in practice.

### 3. Exact exception (if any)

None occurred with real code under any tested condition. (The mechanism test's exception was intentionally synthetic, to test listener isolation independent of whether the real code throws — see Part 4, §1-3.)

### 4. Exact listener that fails (if any)

None, under tested conditions. In the synthetic mechanism test, the listener registered in `NavigationProvider`'s position was made to throw by design, and did — that test's purpose was solely to confirm `GPSManager.emit()`'s isolation behavior, not to claim the real listener fails.

### 5. Root cause

Unresolved as "the" cause of the reported symptom. What is confirmed:
- `GPSManager.emit()` (`GPSManager.ts:145-152`, production path) has no per-listener fault isolation — a real, verified defect, independent of whether anything currently exploits it.
- The specific Phase 7 code the prior audit named as the likely trigger (`NavigationProvider.tsx:87-110` → `RouteProgressTracker.applyGpsFixWithProgress`/`checkAndReroute` → `RouteEngine.computeRouteProgress`) does not throw under any condition reproduced in this pass.

What remains open: whether the reported "Start Pickup unresponsive" symptom is (a) not currently reproducing (the pre-existing "never-enables" gap documented back in the Aug 3 audit, independent of Phase 7), (b) triggered by a condition outside what this harness could reach without a device (real network timing, backgrounding, a malformed route from a different code path), or (c) caused by something this pass didn't target (e.g. the `CameraController` re-entrant `setState` finding, prior audit §7).

### 6. Minimal fix (not implemented, per instruction)

Unchanged from the prior audit's recommendation, since the mechanism itself is now runtime-confirmed regardless of today's trigger: wrap each listener invocation inside `GPSManager.emit()`'s production loop in its own `try/catch` (log-and-continue), matching what the `__DEV__`-only branch added this pass already does. This closes the hazard at its source with a few-line, low-risk change, independent of ever fully identifying today's specific trigger.
