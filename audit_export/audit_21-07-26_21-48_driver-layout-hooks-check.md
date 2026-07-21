# Audit — Rules-of-Hooks Check: `app/(driver)/trip-summary.tsx` & `app/(driver)/_layout.tsx`

**Date:** 21-07-26 21:48
**Scope:** Read-only. Verify hook order, early returns, and conditional hooks in the two files named by the error report. No code changed.

---

## 1. `app/(driver)/trip-summary.tsx`

### 1.1 Every hook, in exact source order

| # | Line | Hook | Notes |
|---|------|------|-------|
| 1 | 17 | `useDriverStore()` | Zustand store hook (`const { lastTripSummary, finishTrip } = useDriverStore();`) — internally a React hook (`useSyncExternalStore`) |
| 2 | 24 | `useEffect(...)` | Redirect guard for a missing `lastTripSummary` |

There are no other hooks. `handleDone` (line 19) is a plain function, not a hook.

### 1.2 Any early return BEFORE all hooks?

**No.** The only early return is at **line 31**:

```tsx
if (!lastTripSummary) return null;
```

It sits **after** both hook calls (line 17 and lines 24–29). Every render path executes both hooks before this return, so the hook count is identical on every render. No rules-of-hooks violation exists in this file.

### 1.3 Exact code of the `useEffect` guard (lines 24–29)

```tsx
useEffect(() => {
    if (!lastTripSummary) {
      finishTrip();
      router.replace('/(tabs)');
    }
  }, [lastTripSummary]);
```

### 1.4 Was the previous fix applied correctly?

**Yes.** The file has the correct post-fix shape:

1. All hooks run unconditionally at the top (lines 17, 24).
2. The `useEffect` guard handles the "no summary" case as a side effect (redirect + `finishTrip()`), not as a render-time bail-out before hooks.
3. The `return null` bail-out (line 31) comes only after all hooks, which is legal — returning early after all hooks have run is fine.
4. Destructuring of `lastTripSummary` fields (line 33) happens after the null guard, so no crash on a null summary.

Minor, non-breaking observation (not an error): `finishTrip` is used inside the effect but omitted from the dependency array (`[lastTripSummary]`). Zustand action references are stable, so behavior is correct; it would only trip the `exhaustive-deps` lint rule.

---

## 2. `app/(driver)/_layout.tsx`

### 2.1 Every hook, in exact source order

**None.** The file contains **zero hook calls**. No `useState`, no `useEffect`, no store hooks, no custom hooks.

### 2.2 Conditional hooks or early returns before hooks?

**No.** There are no conditionals and no early returns of any kind — the component body is a single `return` of a `<Stack>`.

### 2.3 Full file contents (22 lines, verbatim)

```tsx
import { Stack } from 'expo-router';
import React from 'react';

/**
 * Driver route group layout
 * Contains navigation and trip screens for active rides
 */
export default function DriverLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#E7F1F9' },
            }}
        >
            <Stack.Screen name="navigation" />
            <Stack.Screen name="trip" />
            <Stack.Screen name="trip-summary" />
        </Stack>
    );
}
```

---

## 3. Does DriverLayout contain the violation the stack points to?

**No.** There is no `if (something) { useState(...) }` pattern, no conditional hook, and no early return before hooks anywhere in `DriverLayout` — the component calls no hooks at all, so it is *incapable* of producing a "change in the order of Hooks" / "rendered more/fewer hooks than expected" error by itself.

### Why the stack names DriverLayout anyway

React error component stacks list the **ancestor tree** of the component that threw. Expo Router renders every screen in the `(driver)` group as a child of `DriverLayout`'s `<Stack>`, so `DriverLayout` appears as a frame in the stack for any hook error thrown by **`navigation.tsx`, `trip.tsx`, or `trip-summary.tsx`** (or any component those screens render). The frame is the wrapper, not the offender.

### Where to look next

Both audited files are clean, so the violation must live in a child of this layout. Prime suspect given the current working tree: **`app/(driver)/trip.tsx` is modified in git status** (as is `trip-summary.tsx`, now verified clean). `navigation.tsx` is the other candidate. Neither was inspected — out of the requested read-only scope.

---

## Verdict

| Question | Answer |
|---|---|
| Hook-order violation in `trip-summary.tsx`? | No — 2 hooks, both unconditional, early return only after them |
| Previous fix applied correctly? | Yes |
| Hook-order violation in `_layout.tsx` (DriverLayout)? | Impossible — zero hooks in the file |
| Conditional hook / pre-hook return in either file? | None found |
| Likely real source of the error | A child screen of the (driver) Stack — check `trip.tsx` (modified, uncommitted) and `navigation.tsx` |
