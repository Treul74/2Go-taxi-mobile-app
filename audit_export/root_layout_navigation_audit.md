# Audit — Rules-of-Hooks Check: `app/_layout.tsx` & `app/(driver)/navigation.tsx`

**Date:** 21-07-26 22:12
**Scope:** Read-only. Hook order, early returns, conditional hooks. No code changed.
**Filename note:** saved under the user-requested name (per the user's earlier explicit choice to override the AGENTS.md timestamp format for this audit series).
**Related:** `audit_21-07-26_21-48_driver-layout-hooks-check.md`, `audit_21-07-26_21-54_driver-trip-hooks-check.md`, `trip_summary_components_audit.md`.

---

# ⛔ VIOLATION FOUND — `app/(driver)/navigation.tsx`

`DriverNavigationScreen` has an **early return at lines 121–123 with SEVEN hook calls after it**. This is the exact `if (something) return null` ← BEFORE all hooks pattern being hunted, and it fully explains "Rendered fewer hooks than expected" with `DriverLayout` in the stack.

---

## 1. `app/_layout.tsx` (RootLayout) — CLEAN

### 1.1 Every hook, in exact source order

| # | Line | Hook |
|---|------|------|
| 1 | 23 | `useAuthStore((s) => s.hydrated)` |
| 2 | 24 | `useAuthStore((s) => s.hasLoggedInBefore)` |
| 3 | 25 | `useAuthStore((s) => s.authed)` |
| 4 | 26 | `useAuthStore((s) => s.hydrate)` |
| 5 | 27 | `useAuthStore((s) => s.setAuthed)` |
| 6 | 34 | `useState` (`sessionCheck`) |
| 7 | 35 | `useState` (`retryingAccountLoad`) |
| 8 | 37 | `useEffect` (Android system UI background) |
| 9 | 43 | `useEffect` (auth hydrate) |
| 10 | 47 | `useEffect` (session/account check) |
| 11 | 114 | `useEffect` (account-load retry) |
| 12 | 167 | `useRef` (`splashHiddenRef`) |
| 13 | 168 | `useEffect` (min-splash hide) |
| 14 | 193 | `useRef` (`hasLandedOnLaunch`) |
| 15 | 194 | `useEffect` (launch landing redirect) |

### 1.2 Early return before hooks? Conditional hooks?

**None.** The component has exactly one `return` (line 201), after all 15 hooks. The `{!appReady ? <spinner> : <Stack>}` at line 205 is conditional **JSX inside the single return**, which is legal. `return`s inside effect callbacks (e.g. lines 51, 115) are closure returns, not render-path returns.

The file is **302 lines** — over the 100-line threshold, so not reproduced in full here; the uncommitted diff (70 insertions) adds the `'retry'` sessionCheck state, the `retryingAccountLoad` flag, the retry `useEffect` (line 114), and the retry spinner text. **All added hooks are unconditional and above the single return. Hook impact of the diff: none.**

**Verdict: clean.** The modified root layout is NOT the source of the error.

---

## 2. `app/(driver)/navigation.tsx` (DriverNavigationScreen) — ⛔ VIOLATION

### 2.1 Every hook, in exact source order

| # | Line | Hook |
|---|------|------|
| 1 | 26 | `useRouter()` |
| 2 | 27 | `useDriverStore()` |
| 3 | 37 | `useState` (`driverLocation`) |
| 4 | 40 | `useState` (`driverHeading`) |
| 5 | 41 | `useState` (`routeCoordinates`) |
| 6 | 42 | `useState` (`routeDistance`) |
| 7 | 43 | `useState` (`routeEta`) |
| 8 | 44 | `useState` (`routeSteps`) |
| 9 | 45 | `useState` (`activeStepIndex`) |
| 10 | 46 | `useState` (`distanceToManeuverMeters`) |
| 11 | 47 | `useState` (`isNavigating`) |
| 12 | 48 | `useState` (`isCalculating`) |
| 13 | 49 | `useState` (`routeError`) |
| 14 | 50 | `useState` (`isAutoFollow`) |
| 15 | 51 | `useState` (`lastInteraction`) |
| 16 | 52 | `useState` (`elapsedWaitingTime`) |
| 17 | 53 | `useState` (`isConfirmingArrival`) |
| 18 | 54 | `useState` (`arrivalAttempt`) |
| 19 | 55 | `useState` (`isStartingTrip`) |
| 20 | 56 | `useState` (`startTripAttempt`) |
| 21 | 57 | `useRef` (`mapRef`) |
| 22 | 59 | `useDriverTelemetryPing(...)` (custom — 5 internal hooks) |
| 23 | 62 | `useEffect` (GPS tracking subscription) |
| 24 | 113 | `useEffect` (redirect guard) |
| — | **121–123** | ⛔ **EARLY RETURN** — `if (!currentTrip) { return null; }` |
| 25 | 150 | `useEffect` (auto-calculate route) — **AFTER the return** |
| 26 | 205 | `useMemo` (`isNearPickup`) — **AFTER the return** |
| 27 | 220 | `useTurnPreview(distanceToManeuverMeters)` (custom hook) — **AFTER the return** |
| 28 | 224 | `useEffect` (auto-follow resume timer) — **AFTER the return** |
| 29 | 247 | `useEffect` (heading-up navigation camera) — **AFTER the return** |
| 30 | 265 | `useEffect` (step advance / maneuver distance) — **AFTER the return** |
| 31 | 288 | `useEffect` (waiting timer) — **AFTER the return** |

### 2.2 The exact violation (lines 121–123)

```tsx
    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);



    if (!currentTrip) {          // ← line 121
        return null;             // ← line 122  ⛔ 7 hooks still follow below
    }                            // ← line 123
```

Hooks #25–#31 (lines 150, 205, 220, 224, 247, 265, 288) only execute when `currentTrip` is truthy:

- While a trip is active: the component renders **31 hook calls** (36 counting `useDriverTelemetryPing`'s internals).
- The moment `currentTrip` becomes `null` **while the screen is still mounted**: the next render executes only **24 hook calls** and bails at line 122.

React compares hook counts between renders of a mounted component → **"Rendered fewer hooks than expected. This may be caused by an accidental early return statement."** — verbatim the observed error.

### 2.3 Conditional hooks (`if (x) { useState(...) }`)?

No hook is wrapped in an `if` block, but the early return makes hooks #25–#31 **conditionally executed**, which is the same class of violation. Note `useTurnPreview` at line 220 is a custom hook call buried mid-body between plain constants — easy to miss when scanning for `use*` at the top of the file.

### 2.4 Why the stack blames DriverLayout

The error is thrown while React renders the (driver) Stack's child; `DriverLayout` is the nearest named ancestor frame. Consistent with all four previous audits finding the named files clean.

### 2.5 When it actually fires (reproduction path)

`navigation.tsx` stays **mounted underneath** later screens: `handleStartRide` does `router.push('/(driver)/trip')` (push, not replace), and trip pushes/replaces to trip-summary. When the trip ends:

1. Driver taps **Done** on trip-summary → `finishTrip()` sets `currentTrip = null` in `driverStore`.
2. Every mounted subscriber re-renders — including the still-mounted `DriverNavigationScreen` under the stack.
3. Its re-render hits `if (!currentTrip) return null;` after only 24 of 31 hooks → React throws.

Any other path that nulls `currentTrip` while navigation.tsx is mounted (passenger cancellation, order cancelled server-side) triggers the same crash.

### 2.6 Was navigation.tsx recently modified?

**No uncommitted changes** (`git status` — not listed; `git diff` — empty for this file). History: `722dcff` "map navigation direction, discover fixed", `d23ff4e` "Initial commit". The violation ships in already-committed code — it predates today's working-tree changes, which is why it survived while the recently-edited files kept coming up clean.

### 2.7 Contrast with the clean pattern

`trip.tsx` and `trip-summary.tsx` use the same guard **correctly** — their `if (!currentTrip/lastTripSummary) return null;` sits **after the final hook**. In `navigation.tsx` the identical-looking guard was placed mid-file, above 7 hooks.

---

## Verdict

| Question | `app/_layout.tsx` | `app/(driver)/navigation.tsx` |
|---|---|---|
| Hooks | 15, all unconditional | 31 total — **24 before / 7 AFTER an early return** |
| Early return before all hooks? | No (single return, line 201) | **YES — lines 121–123** |
| Conditional hooks? | None | Effectively yes: hooks at lines 150, 205, 220, 224, 247, 265, 288 are skipped when `currentTrip` is null |
| Recently modified? | Yes (uncommitted retry logic — hook-clean) | No — violation is in committed code (`722dcff`) |
| Source of "Rendered fewer hooks than expected"? | No | **YES — root cause identified** |

**The fix (NOT applied — read-only audit):** move the `if (!currentTrip) return null;` guard from lines 121–123 to after the last hook (the waiting-timer `useEffect` ending at line 302), exactly as trip.tsx and trip-summary.tsx already do. The hooks that dereference `currentTrip` (lines 205, 214) already null-guard internally or would need `currentTrip?.` / early exits inside their callbacks — to be verified at fix time.
