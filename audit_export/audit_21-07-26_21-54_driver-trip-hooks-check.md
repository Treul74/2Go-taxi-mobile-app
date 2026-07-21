# Audit — Rules-of-Hooks Check: `app/(driver)/trip.tsx`

**Date:** 21-07-26 21:54
**Scope:** Read-only. Hook order, early returns, conditional hooks, and recent changes in `app/(driver)/trip.tsx`. Also inspected `src/hooks/useDriverTelemetryPing.ts` (called by this screen) since a violation inside it would surface in the same component stack. No code changed.
**Related:** follows `audit_21-07-26_21-48_driver-layout-hooks-check.md` (trip-summary + driver layout, both clean).

---

## 1. Every hook in `DriverTripScreen`, in exact source order

| # | Line | Hook | Purpose |
|---|------|------|---------|
| 1 | 20 | `useRouter()` | expo-router navigation |
| 2 | 21 | `useDriverStore()` | Zustand store (destructures `currentTrip`, `tripStatus`, `tripStartTime`, `waitingDuration`, `startTrip`, `completeTrip`, `currentLocation`, `updateLocation`) |
| 3 | 32 | `useState` | `driverLocation` |
| 4 | 35 | `useState` | `driverHeading` |
| 5 | 36 | `useState` | `elapsedTime` |
| 6 | 37 | `useState` | `routeCoordinates` |
| 7 | 38 | `useState` | `isAutoFollow` |
| 8 | 39 | `useState` | `lastInteraction` |
| 9 | 40 | `useRef` | `mapRef` |
| 10 | 45 | `useRef` | `distanceTraveledRef` |
| 11 | 46 | `useRef` | `lastGpsPointRef` |
| 12 | 48 | `useDriverTelemetryPing(...)` | custom hook (5 internal hooks, see §5) |
| 13 | 51 | `useEffect` | start trip on mount |
| 14 | 103 | `useEffect` | GPS tracking subscription |
| 15 | 154 | `useEffect` | fetch route to destination |
| 16 | 172 | `useEffect` | auto-follow resume timer |
| 17 | 190 | `useEffect` | camera follow |
| 18 | 207 | `useEffect` | trip duration timer |
| 19 | 221 | `useEffect` | redirect guard when `currentTrip` is null |

All 19 hook calls are at the top level of the component and execute on **every** render path.

## 2. Any early return before all hooks have run?

**No.** The first `return` statement in the component's render path is the null-guard at **lines 227–229**:

```tsx
if (!currentTrip) {
    return null;
}
```

It comes **after** all 19 hooks (last hook: `useEffect` at line 221). The `return` statements at lines 66–99 are inside the nested `trackGpsPoint` helper function (line 61), and the ones inside effect callbacks (e.g. `if (!orderId) return;` patterns at lines 109, 155, 191, 208) are inside closures — none of them are component-render-path returns, so none affect hook ordering.

## 3. Any conditional hook (`if (something) { useState(...) }`)?

**None.** Every hook call sits unconditionally at the top level. Conditional *logic* exists only **inside** hook callbacks (e.g. the `useEffect` at line 172 sets up its interval only when `!isAutoFollow` — legal, because the `useEffect` call itself is unconditional). `useDriverTelemetryPing(currentTrip?.id, …)` at line 48 passes a conditional **argument**, but the hook call itself is unconditional — also legal.

## 4. What changed recently (uncommitted diff vs HEAD)

`git diff` for this file shows the only change is a rework of the **`trackGpsPoint`** GPS-noise filter (plain helper function, lines 61–100) and its two call sites:

- `lastGpsPointRef`'s type widened from `{ latitude, longitude }` to `{ latitude, longitude, accuracy, timestamp }` (line 46).
- `trackGpsPoint` now takes a full `Location.LocationObject` instead of bare coords, and rejects fixes that are low-accuracy (>50m), too small (<8m), implausibly fast (>120 km/h), or within the combined GPS uncertainty radius.
- Call sites at lines 118 and 133 pass `initial` / `location` instead of `.coords`.

**Hook impact of the diff: zero.** No hook was added, removed, moved, or made conditional.

### The redirect guard vs. the previous state

The guard referenced from the previous audit (lines 221–229) is **unchanged** — it does not appear in the diff at all:

```tsx
// Redirect if no active trip
useEffect(() => {
    if (!currentTrip) {
        router.replace('/(tabs)');
    }
}, [currentTrip]);

if (!currentTrip) {
    return null;
}
```

**No new early return was added above any hook call.**

## 5. Bonus: `src/hooks/useDriverTelemetryPing.ts` (called at line 48)

Also clean. Hooks in order: `useRef` (L20), `useRef` (L21), `useEffect` (L23), `useEffect` (L27), `useEffect` (L31). All unconditional; the `if (!orderId) return;` at line 32 is inside the third effect's callback, not before a hook.

---

## Verdict

| Question | Answer |
|---|---|
| Hook-order violation in `trip.tsx`? | **No** — 19 hooks, all unconditional, single early return only after them |
| Conditional hooks? | None |
| Early return before hooks? | None (first render-path return is line 227, after all hooks) |
| Recent changes affecting hooks? | None — diff only touches the `trackGpsPoint` GPS filter |
| Redirect guard changed? | No — identical to the previously audited version |

**All three driver-stack candidates audited so far — `_layout.tsx`, `trip-summary.tsx`, `trip.tsx` (plus `useDriverTelemetryPing`) — are free of rules-of-hooks violations.** If the hook error persists at runtime, the remaining unaudited candidates in this stack are `app/(driver)/navigation.tsx` and the component trees these screens render (e.g. `Map`, `RideActionSlider`, `Card`). Another possibility worth confirming: the error being **stale** (from before the trip-summary fix) or caused by a **hot-reload artifact** — a full app restart (not fast refresh) is required to clear rules-of-hooks errors triggered by an edited component, because Fast Refresh remounts can report a false hook-count mismatch after a file's hooks change.
