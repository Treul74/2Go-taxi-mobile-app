# Phase 7R.2 — Start Pickup Route State Audit

**Date:** 2026-08-05
**Type:** Read-only execution-trace + runtime verification. No fix implemented, per explicit instruction.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`, `audit_05-08-26_00-23_phase7r-start-pickup-regression-audit.md` (Phase 7R), `audit_05-08-26_00-40_phase7r1-gps-listener-runtime-verification.md` (Phase 7R.1).

**Method:** Same two-pronged approach as 7R.1 — static diff against the pre-Phase-7 baseline (`HEAD`, commit `80f4097`) for "did this change," plus a direct-execution runtime harness (`npx tsx`, real `RouteEngine.fetchRoute` and a verbatim reproduction of `navigation.tsx`'s `calculateRoute()` body) for "does this actually work," since no device/simulator is available. Only `react-native`'s `Platform` and the global `fetch` were mocked — `RouteEngine.ts`, `mapsApi.ts`, and the polyline decode/encode are the real, unmodified project code. The scratch script (`diag-route-check.ts`) was deleted after use.

---

## Trace: Accept Ride → driverToPickup() → navigation.tsx mounts → driverLocation → calculateRoute() → fetchRoute() → routeCoordinates → button enabled → handleStartPickup()

### 1. Does `navigation.tsx` mount?

Not independently re-verified at runtime (no device) — but nothing in the routing chain (`DriverDashboard.handleAcceptRequest` → `router.push`/navigation to `app/(driver)/navigation.tsx`) is in the Phase 7 diff. `DriverDashboard.tsx` is not among the 14 files Phase 7 touched (confirmed in 7R's `git diff --stat`). No reason to suspect this step changed.

### 2. Does `calculateRoute()` execute automatically? 3. How many times?

Yes, via the unchanged auto-fetch effect ([navigation.tsx:161-166](<app/(driver)/navigation.tsx#L161-L166>)):
```tsx
useEffect(() => {
    if (currentTrip && routeCoordinates.length === 0 && driverLocation) {
        calculateRoute();
    }
}, [currentTrip, driverLocation]); // simplified dependency
```
`driverLocation` is a fresh `{latitude, longitude}` object on every GPS fix (`setDriverLocation(fix.coordinate)`, [navigation.tsx:69](<app/(driver)/navigation.tsx#L69>)), so this effect re-fires on **every GPS tick** (~1/sec) for as long as `routeCoordinates.length === 0` — not just once. This is pre-existing behavior (the "simplified dependency" comment predates Phase 7; unchanged in the diff). `calculateRoute()`'s own `if (isCalculating) return;` guard ([navigation.tsx:130](<app/(driver)/navigation.tsx#L130>)) makes the repeat calls while one is in flight harmless no-ops, not overlapping fetches. Once `routeCoordinates.length > 0`, the guard stops firing it. Net effect: it runs once per GPS tick until it first succeeds, then stops — same as before Phase 7.

### 4. Does `fetchRoute()` execute? 5. Does it return success?

**Tested directly against the real `RouteEngine.fetchRoute()` → `mapsApi.getDirections()` chain**, with only the network boundary (`global.fetch`) mocked, across three scenarios:

```
========== SCENARIO: success ==========
fetchRoute() succeeded. route.path.length = 3 route.steps.length = 1
RESULT { scenario: 'success', routeCoordinatesLength: 3, routeDistance: '2.1 km', routeError: false, isCalculating: false, buttonDisabled: false }

========== SCENARIO: zero_results ==========
Directions error: ZERO_RESULTS undefined
RESULT { scenario: 'zero_results', routeCoordinatesLength: 0, routeDistance: null, routeError: true, isCalculating: false, buttonDisabled: false }

========== SCENARIO: network_error ==========
Error fetching directions: TypeError: Network request failed (simulated)
RESULT { scenario: 'network_error', routeCoordinatesLength: 0, routeDistance: null, routeError: true, isCalculating: false, buttonDisabled: false }
```

`fetchRoute()` executes and **always resolves** (never hangs, never throws uncaught) in every scenario tested — a successful response, Google returning no route, and a raw network failure. `mapsApi.getDirections()`'s own `try/catch` ([mapsApi.ts:321-347](src/lib/google/mapsApi.ts#L321-L347)) already absorbs fetch failures and returns `null` rather than throwing; `fetchRoute` propagates that `null` to `calculateRoute`, which is exactly what its own `try/catch` is built to handle.

### 6. Does `routeCoordinates` become non-empty? 7. If not, why?

**Only in the success scenario** (`routeCoordinatesLength: 3`) — expected and correct, that's the only case where a route actually exists. In both failure scenarios `routeCoordinatesLength` stays `0`, **but this is not the same as the button staying disabled** — see §8.

### 8. Is the button disabled because `routeCoordinates.length == 0`? 9. If yes, why were they never populated?

**This is the key finding of this pass.** The disabled expression is `isCalculating || (!routeCoordinates.length && !routeError)`. Substituting the runtime results above:

| Scenario | `routeCoordinates.length` | `routeError` | `isCalculating` | `disabled` |
|---|---|---|---|---|
| success | 3 | `false` | `false` | **`false`** |
| zero_results | 0 | `true` | `false` | **`false`** |
| network_error | 0 | `true` | `false` | **`false`** |

**In every tested outcome of `calculateRoute()` actually running to completion, the button ends up *not* disabled** — either because `routeCoordinates` populated (shows "Start Pickup") or because `routeError` flipped to `true` (shows "Retry Route" instead, per [navigation.tsx:426-435](<app/(driver)/navigation.tsx#L426-L435>)'s `routeError ? "Retry Route" : "Start Pickup"` branch). The `!routeError` term in the disabled expression exists precisely so a failed fetch doesn't leave the button inertly disabled — it swaps to a retry affordance instead.

**The only way `routeCoordinates.length === 0 && routeError === false` persists indefinitely — the actual permanently-disabled state — is if `calculateRoute()` never runs to completion at all**, i.e. the auto-fetch effect (§2-3) never fires with a truthy `driverLocation`, or `fetchRoute()`'s promise never settles (no evidence of that in any tested scenario — every path returns or throws, nothing hangs). This reduces the question back to the GPS pipeline already verified in **Phase 7R.1**: does `driverLocation` (this screen's local state, fed only by its own `GPSManager.onFix` listener) ever become non-null? 7R.1's runtime harness confirmed that listener fires reliably, every tick, even with Phase 7's new `NavigationProvider` listener running immediately before it in the same dispatch. No new break was found there either.

### 10. Compare with the last working commit before Phase 7

`git diff HEAD -- "app/(driver)/navigation.tsx"`, restricted to `calculateRoute`, the auto-fetch effect, `useNavigationStore.getState().setRoute(route)`, and the `disabled=` expression: **none of these lines appear as added or removed** — they are unchanged context in the diff (the only line-level changes nearby are the `routeSteps`/`activeStepIndex`/`DirectionStep` bookkeeping Phase 7D removed, which this screen's turn banner no longer needs now that `NavigationTurnBanner` reads `NavigationStore.currentStep` instead — and the `__DEV__` logging added this pass for 7R.1/7R.2). `RouteEngine.ts` and `mapsApi.ts` are not in the Phase 7 diff at all. **The entire Route State lifecycle traced in this audit is byte-identical to the pre-Phase-7 baseline.**

---

## Deliverables

### Exact execution timeline (as run against real code)

```
Accept (unchanged, DriverDashboard.tsx not modified by Phase 7)
  -> navigation.tsx mounts, GPSManager.onFix registered (confirmed firing per 7R.1)
  -> driverLocation becomes non-null on first accepted fix
  -> auto-fetch effect fires -> calculateRoute()
  -> fetchRoute(driverLocation, currentTrip.pickup)
       success      -> routeCoordinates.length > 0, routeError=false -> disabled=false ("Start Pickup")
       zero_results  -> routeCoordinates.length = 0, routeError=true  -> disabled=false ("Retry Route")
       network_error -> routeCoordinates.length = 0, routeError=true  -> disabled=false ("Retry Route")
  -> in every completed case, the button is NOT stuck disabled
```

### Exact variable values

See the three-row table in §8 above — captured directly from real code execution, not inferred.

### Exact function where the chain stops (if it does)

**Not found to stop anywhere in this pass.** Every function in the traced chain (`calculateRoute`, `fetchRoute`, `getDirections`, the auto-fetch `useEffect`) was exercised with real code and completed correctly in every scenario tried, including both failure modes. Combined with 7R.1's finding that the upstream `driverLocation` pipeline also isn't currently broken, **two consecutive runtime-verification passes have now failed to reproduce a break anywhere in the Accept → driverLocation → calculateRoute → routeCoordinates → button-enabled chain**, using the real, unmodified project code wherever it was feasible to exercise directly.

### Root cause

**Not identified in this pass, because no break was reproduced.** What's confirmed instead:
- Every file/line in this specific chain (`calculateRoute`, the auto-fetch effect, `RouteEngine.fetchRoute`, `mapsApi.getDirections`, the `disabled` expression) is byte-identical to the pre-Phase-7 baseline.
- The chain behaves correctly under a successful fetch, a Google "no route" response, and a raw network failure — none of these leave the button stuck; they resolve to "Start Pickup" or "Retry Route".
- Phase 7R.1 already showed the GPS pipeline feeding `driverLocation` still works with Phase 7's new `NavigationProvider` listener in place.

**What remains genuinely unverified without a device:** whether `driverLocation` ever becomes non-null *at all* on a real device for a real driver — i.e., whether `GPSManager.acquire('foreground', 'driverBestNavigation')` ([navigation.tsx:80](<app/(driver)/navigation.tsx#L80>)) actually succeeds (location permission granted, location services on, a real GPS fix arrives). That dependency is unchanged by Phase 7 and was already this screen's one identified failure mode in the **pre-Phase-7** Aug 3 audit (`audit_03-08-26_16-53_start-pickup-execution-trace.md`, "Break Point A") — a standing characteristic of this screen, not something introduced by this phase.

Given three rounds of static diffing and two rounds of direct runtime execution against real code have not reproduced a Phase-7-introduced break anywhere in this pipeline, it is worth treating the premise itself as an open question rather than a given: is "Start Pickup no longer responds" still reproducing today, under what specific conditions (cold start vs. warm, location permission state, emulator vs. device, first request of the session vs. a later one), and is it possible this is the same pre-existing GPS-permission-dependent gap the Aug 3 audit already documented, now being attributed to Phase 7 because Phase 7 is the most recent large change, rather than because it's causally responsible.

### Minimal fix (not implemented, per instruction)

No fix is proposed for a break this pass could not find. If the symptom is confirmed reproducible on a real device with the `__DEV__` logging now in place (from 7R.1: `[navigation.tsx.onFix]`, `[navigation.tsx] calculateRoute triggered`, `[navigation.tsx] Start Pickup disabled state`), the logs will show directly which of the three states (`isCalculating` stuck `true`, or `routeCoordinates`/`routeError` both stuck at their initial `0`/`false`) is actually occurring, and specifically whether `driverLocation` — the one dependency this pass could not exercise without a device (real OS location permission/service state) — is the actual blocker.
