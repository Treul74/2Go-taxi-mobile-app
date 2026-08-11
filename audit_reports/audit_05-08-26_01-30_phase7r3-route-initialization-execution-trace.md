# Phase 7R.3 — Route Initialization Execution Trace

**Date:** 2026-08-05
**Type:** Read-only execution trace against current (uncommitted) working-tree code. No fix implemented, per explicit instruction.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`, and the three prior passes in this series — `audit_05-08-26_00-23_phase7r-start-pickup-regression-audit.md` (7R), `audit_05-08-26_00-40_phase7r1-gps-listener-runtime-verification.md` (7R.1), `audit_05-08-26_00-58_phase7r2-route-state-lifecycle-audit.md` (7R.2).

**Why this pass is not a repeat of 7R.2:** 7R.2 traced this same chain against commit `80f4097` (clean `HEAD`). Since then the working tree has picked up substantial uncommitted changes — `git status` shows `app/(driver)/navigation.tsx`, every file in `src/navigation/NavigationEngine/`, and several new files (`RouteProgressTracker.ts`, `NavigationLaneGuidance.tsx`, `NavigationRoadName.tsx`, `NavigationArrivalTime.tsx`, `NavigationVoiceToggle.tsx`) not present at 7R.2's baseline. Critically, `navigation.tsx` no longer renders its own `<Polyline>` — it now renders `<NavigationMap />`, the engine's shared map component, which reads route data from `NavigationStore`, not from this screen's local state. This changes the shape of the trace materially, so it is re-run in full against the code as it exists right now, not diffed against the old baseline.

**Method:** Static execution trace only — reading the real, current source of every file in the chain and following each variable by hand. No runtime harness this pass (Part 1 of the prompt: trace only, do not implement). Every file/line reference below was read directly, not recalled from a prior audit.

---

## Part 3/4/5 — The trace

### Step 1 — `navigation.tsx` mounts. Does `currentTrip` exist?

`app/(driver)/navigation.tsx:34-43` destructures `currentTrip` from `useDriverStore()`. `navigation.tsx:301-303`:

```tsx
if (!currentTrip) {
    return null;
}
```

This guard sits **after every hook** in the component (comment at `navigation.tsx:297-300` explains why: an early return above a hook would violate the Rules of Hooks once `currentTrip` goes null while the screen is still mounted). Practically: if `currentTrip` is falsy, the screen renders nothing at all — not a partial UI with a stuck button. Since the reported symptoms (disabled button, "... km away", no polyline) describe a screen that **is** rendering its pickup card, `currentTrip` must be truthy for the entire remainder of this trace. Confirmed not the divergence point.

### Step 2 — Does `driverLocation` exist?

This is where the current architecture forks into **two independent copies of "driver location,"** which is the single most important structural fact this pass found:

| Copy | Declared | Populated by | Consumed by |
|---|---|---|---|
| **A. Screen-local** | `navigation.tsx:46-48`, `useState(currentLocation)` | `navigation.tsx`'s own `GPSManager.onFix` listener (`navigation.tsx:66-105`) | `calculateRoute()` (`:126`), the disabled-button expression (`:454`), the `distance`/`"... km away"` fallback text (`:265-267`, `:435`) |
| **B. Engine store** | `NavigationStore.ts:44`, `driverLocation: null` in `initialState` | `NavigationProvider`'s own, separate `GPSManager.onFix` listener (`NavigationProvider.tsx:87-122`), mounted once at the app root (`app/_layout.tsx:234`) | `NavigationMap` via `useDriverLocation()` (`NavigationHooks.ts:46-48`) → the driver marker and (indirectly, see Step 7) the polyline gate |
| **C. `driverStore`** | `src/state/driverStore.ts:154`, `currentLocation: null` initial | `DriverDashboard.tsx`'s own, separate `GPSManager.onFix` listener + `updateLocation()` (also called from `navigation.tsx:72`) | Seeds Copy A's initial `useState` value only |

Both A and B subscribe to the **same** underlying event (`GPSManager`'s `LOCATION_UPDATED`, emitted from `GPSManager.ts:623`), so under normal operation they receive identical fixes and stay in sync. But they are two separate `useState`/store writes, not one shared value — the Bible's "Navigation Store... No screen owns these values" (Bible, "Navigation Store" section) is not fully honored here: `navigation.tsx` still keeps its own local `driverLocation`, `routeCoordinates`, `routeDistance`, `isCalculating`, `routeError` rather than reading these from `NavigationStore`. Nothing in this pass found evidence this causes an actual desync (both listeners fire from the same dispatch loop in `GPSManager.emit`, `GPSManager.ts:145-171`), but it is worth flagging as the reason the three symptoms trace through two parallel — not one single — code paths that merely **happen** to share the same upstream cause.

For the three reported symptoms specifically:
- The disabled button and the "... km away" text are driven entirely by **Copy A** (screen-local).
- The missing polyline is driven entirely by **Copy B** (`NavigationStore`, via `NavigationMap`) — but only because `NavigationStore.route`, not `NavigationStore.driverLocation`, gates the polyline (see Step 7). Copy B's `driverLocation` itself only affects the driver marker, not the polyline.

### Step 3 — Does `calculateRoute()` execute?

`navigation.tsx:169-173`:

```tsx
useEffect(() => {
    if (currentTrip && routeCoordinates.length === 0 && driverLocation) {
        calculateRoute();
    }
}, [currentTrip, driverLocation]); // simplified dependency
```

This effect only calls `calculateRoute()` once **Copy A's** `driverLocation` is non-null. `calculateRoute()` itself (`:125-166`) re-checks the same thing as its first line:

```tsx
const calculateRoute = async () => {
    if (!driverLocation || !currentTrip) return;   // navigation.tsx:126
    if (isCalculating) return;                       // navigation.tsx:132
    ...
```

**This is the fork point.** If Copy A's `driverLocation` is `null`, `calculateRoute()` is either never invoked (the effect's own condition at `:170` fails) or invoked-and-returns-immediately (`:126`) — in both cases nothing past this line ever runs: `fetchRoute` is never called, `setIsCalculating`/`setRouteError` are never touched, and `useNavigationStore.getState().setRoute(...)` (`:153`) is never called.

### Step 4 — If `fetchRoute()` does execute, what does it return?

Traced for completeness (not the blocking point per Step 3, but confirms nothing downstream is independently broken):

`navigation.tsx:143`: `const route = await fetchRoute(driverLocation, currentTrip.pickup);` calls `src/navigation/NavigationEngine/RouteEngine.ts:205-219`. This:
1. Checks the route cache (`getCachedRoute`, `RouteEngine.ts:104-113`) unless `forceRefresh`.
2. Calls `getDirections()` from `@/lib/google` (`mapsApi.ts`) — the sanctioned single entry point per `AGENTS.md`'s Maps APIs rule.
3. Returns `null` if Google returned nothing (`RouteEngine.ts:214`), or a fully-built `RouteData` (`toRouteData`, `RouteEngine.ts:148-172`) otherwise.
4. Throws only if the Maps API key is entirely unconfigured (per this function's own doc comment, `RouteEngine.ts:195-197`) — everything else resolves to `null`, never a rejected promise, matching 7R.2's runtime-verified finding that `getDirections`'s own `try/catch` (unchanged in this pass) already absorbs network failures.

Nothing in `RouteEngine.ts` or `mapsApi.ts` is in this pass's diff scope of concern (neither file appears in `git status`), and their logic is unchanged from what 7R.2 already exercised at runtime. Not the divergence point.

### Step 5 — Does `setRouteCoordinates()`/`setRouteDistance()` execute? What is `routeCoordinates.length` after?

Only reached if `calculateRoute()` got past the Step 3 guard **and** `fetchRoute()` resolved to a non-null `route`:

```tsx
useNavigationStore.getState().setRoute(route);      // navigation.tsx:153 — publishes to NavigationStore (Copy B side)
setRouteCoordinates(route.path);                     // navigation.tsx:155 — Copy A
setRouteDistance(route.distanceText ?? ...);          // navigation.tsx:156 — Copy A
setRouteError(false);                                  // navigation.tsx:157
```

If this block runs, `routeCoordinates.length` becomes `route.path.length` (whatever Google's Directions response decoded to — always ≥ 2 for a real drivable route). If Step 3 never got here, `routeCoordinates` never leaves its initial `[]` (`navigation.tsx:50`).

### Step 6 — Is the button disabled because of this?

`navigation.tsx:454`:

```tsx
disabled={isCalculating || (!routeCoordinates.length && !routeError)}
```

With `routeCoordinates.length === 0` (never populated, Step 5 never ran) and `routeError === false` (never set to `true` either, because `calculateRoute()` returned before reaching its `catch`/`setRouteError(true)` at `:146`/`:162` — it never got that far): `isCalculating` is `false` (never set `true` either, `:137` is also past the guard), so `disabled = false || (true && true) = true`. **Confirmed: the button is disabled, and the only way it reaches this exact combination — `routeCoordinates.length === 0 AND routeError === false` — is the early-return path at `:126`, not a failure inside `fetchRoute`.** A `fetchRoute` failure would set `routeError = true` (`:146`/`:162`) and flip the button to "Retry Route" instead (`:450-457`), which is a *different* visible state from a silently-disabled button. This reproduces 7R.2's finding exactly, now re-confirmed against the current file's unchanged lines.

### Step 7 — Does the Polyline receive `routeCoordinates`? If yes, why doesn't it render? If no, who prevented it?

This step did not exist in 7R.2's trace, because at that baseline `navigation.tsx` rendered its own `<MapView>`/`<Polyline>` directly. It now renders `<NavigationMap />` (`navigation.tsx:321`), which is a different component with a different data source:

`src/components/navigation/NavigationMap.tsx:74`: `const route = useActiveRoute();` → `NavigationHooks.ts:70-72`: `useNavigationStore((s) => s.route)`.

`NavigationMap.tsx:169-170`:
```tsx
showRoute={!!route}
routeCoordinates={route?.path ?? []}
```

These are passed into `Map` (`src/components/map/Map.native.tsx`), whose internal `RoutePolylineLayer` (`Map.native.tsx:60-73`) gates rendering with:

```tsx
if (!showRoute || routeCoordinates.length === 0) return null;   // Map.native.tsx:66
```

So: **the Polyline never receives a non-empty `routeCoordinates` array at all** — it's not that it receives data and silently fails to render; `showRoute` is `false` and `routeCoordinates` is `[]` because `NavigationStore.route` is `null`, because `useNavigationStore.getState().setRoute(route)` (`navigation.tsx:153`) was never called, because `calculateRoute()` returned at Step 3's guard before ever reaching that line. This is a direct, single-hop consequence of the same fork identified in Step 3 — not a second, independent bug in the map layer. `Map.web.tsx` was not separately re-traced this pass since the reported symptom set (a driver on an active pickup) is a native-only path per `AGENTS.md`'s platform split, but its `showRoute`/`routeCoordinates` props come from the identical `NavigationMap.tsx:169-170` call site, so the same conclusion applies.

---

## Deliverables (Part 6)

### 1. Exact function

`calculateRoute` — `app/(driver)/navigation.tsx:125-166`. Specifically its entry guard:

```tsx
if (!driverLocation || !currentTrip) return;   // navigation.tsx:126
```

is the exact point where execution stops relative to the expected chain in Part 3 of the prompt. Everything from `fetchRoute()` (`:143`) through `render Polyline` and `button enabled` is unreached *as a direct, single-cause consequence* of this one guard never passing — not because any of those later steps are individually broken (Steps 4, 5, 7 above each confirm the code past this point is intact and, when reached, behaves correctly).

### 2. Exact line

`app/(driver)/navigation.tsx:126` (the guard that stops the chain) and `app/(driver)/navigation.tsx:170` (`driverLocation` truthy check in the auto-fetch effect — the same fork, checked one call frame earlier).

### 3. Exact state variable

The screen-local `driverLocation` state — `app/(driver)/navigation.tsx:46-48` (`useState<{ latitude: number; longitude: number } | null>(currentLocation)`), referred to as **Copy A** in Step 2's table above. This is the one variable that, if it remains `null`, fully and independently explains all three reported symptoms:
- disabled button ← `routeCoordinates.length === 0 && !routeError` (Step 6)
- "... km away" ← `distance` (`navigation.tsx:265-267`) stays the literal string `'...'` when `driverLocation` is falsy, which is exactly what renders at `:435` (`{routeDistance || \`${distance} km away\`}`) when `routeDistance` is also still `null`
- no polyline ← `NavigationStore.route` is never set because `calculateRoute()` never got far enough to call `setRoute()` (Step 7)

### 4. Root cause

**Not independently verifiable without a device in this pass** (consistent with 7R.1's and 7R.2's conclusion, and this instruction set explicitly excludes runtime instrumentation/fixes). What this pass adds beyond 7R.2: it confirms that under the **current** architecture (post-`NavigationMap`/`NavigationStore` migration), the same single upstream fact — Copy A's `driverLocation` staying `null` — is now sufcient to explain the polyline symptom too, not just the button, because the polyline's gating (`NavigationStore.route`) is itself downstream of `calculateRoute()`, which is gated by Copy A. All three symptoms in Part 2 of the prompt do originate from the same execution path, as the prompt's premise assumed — the path is `driverLocation (Copy A) → calculateRoute() guard → [fetchRoute / setRoute / setRouteCoordinates never called]`.

Why Copy A's `driverLocation` would stay `null` traces to `navigation.tsx:66-105`'s own GPS-acquisition effect, specifically:

```tsx
async function startTracking() {
    try {
        await GPSManager.acquire('foreground', 'driverBestNavigation');   // navigation.tsx:82
        ...
    } catch {
        // Non-critical — location tracking will retry on next mount.      // navigation.tsx:93-95
    }
}
```

This `catch` block is **silent** — no `__DEV__` log, no state update, no user-facing error. If `GPSManager.acquire()` ever rejects here (permission denied, location services disabled, or any other `GPSManagerError`/thrown error from `GPSManager.ts:697-739`'s `requestPermissions`), Copy A's `driverLocation` never becomes non-null via this path, and the *only* other way it could: `GPSManager.getLastFix()` at `:85` returning a cached fix, or the `onFix` listener (`:68-78`) eventually firing from some other consumer's already-active tracking (e.g. `DriverDashboard.tsx:95` already having called `acquire()` with the same profile while the driver was online, before this screen ever mounted). In the common case where the driver went online successfully in `DriverDashboard` first — which the business logic already requires to receive a request at all — GPS should already be flowing by the time `navigation.tsx` mounts, making a silent permission failure here less likely as the everyday cause. But this pass cannot rule it out (revoked permission mid-session, OS-level location toggle turned off between going online and this screen mounting, a deep-link or hot-reload path that reaches this screen without `DriverDashboard` having run its own `acquire()` first) — and critically, **if it does happen, current code gives zero observability into it.** That silence is the one concrete, current-code gap this pass identifies as worth closing, independent of whether it is the actual cause of any specific field report.

### 5. Minimal fix (not implemented, per instruction)

Not implemented. If a fix pass follows: the smallest change with the highest diagnostic value is adding a `__DEV__` log (mirroring the existing Phase 7R.1 logging convention already in this file) inside the empty catch at `navigation.tsx:93-95`, so a real permission/services failure is no longer indistinguishable from "GPS just hasn't produced a fix yet." A second, independent minimal change worth considering separately: `calculateRoute()`'s guard at `:126` currently treats "no `driverLocation` yet" identically to "silently keep waiting forever" — the same `routeError` affordance already used for a failed fetch (`:146`/`:162`) does not have an equivalent for "never got a driver location to route from at all," which is exactly the gap Step 6 identifies as the one way the button can stay disabled with no retry path. Neither change is applied in this pass.
