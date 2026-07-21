# Audit — Components Rendered by `app/(driver)/trip-summary.tsx`

**Date:** 21-07-26 22:07
**Scope:** Read-only. Every component imported and rendered by `trip-summary.tsx`, hunting the "Rendered fewer hooks than expected" violation. No code changed.
**Filename note:** saved under the user-requested name (overriding the AGENTS.md timestamp format at the user's explicit choice).
**Related:** `audit_21-07-26_21-48_driver-layout-hooks-check.md`, `audit_21-07-26_21-54_driver-trip-hooks-check.md` (screens all clean).

---

## 1. Every import in trip-summary.tsx (exact lines)

```tsx
import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
```

Components actually rendered: `SafeAreaView`, `Card`, `View`, `Ionicons`, `Text`, `Button`.
From `src/components/`: **only `Button` and `Card`** (both from `src/components/ui/`). `formatCurrency` is a plain function; `useDriverStore` is the store hook (audited previously); the rest are third-party/library components.

---

## 2. `src/components/ui/Card.tsx`

### Hooks in exact order

| # | Line | Hook |
|---|------|------|
| 1 | 33 | `useSharedValue(1)` (Reanimated) |
| 2 | 35 | `useAnimatedStyle(...)` (Reanimated) |

### Early return before all hooks? Conditional hooks?

**No conditional hooks.** There IS a conditional return at **line 74**:

```tsx
if (onPress) {
    return (
      <AnimatedPressable ... >
        {children}
      </AnimatedPressable>
    );
}

return (
    <View className={baseClasses} style={style} {...props}>
      {children}
    </View>
);
```

**This is legal.** Both hooks (lines 33, 35) execute before the branch on every render, and both branches merely return different JSX — the hook count is identical (2) on every render path. A conditional return *after* all hooks is not a rules-of-hooks violation. `trip-summary.tsx` renders `<Card variant="elevated" ...>` with no `onPress`, so it always takes the second branch anyway, and the prop never changes at runtime here.

**Verdict: clean.**

## 3. `src/components/ui/Button.tsx` (checked specifically as requested)

### Hooks in exact order

| # | Line | Hook |
|---|------|------|
| 1 | 40 | `useSharedValue(1)` (Reanimated) |
| 2 | 42 | `useAnimatedStyle(...)` (Reanimated) |

### Early return before all hooks? Conditional hooks?

**None.** The component has exactly one `return` (line 111), after both hooks and all the plain style-map constants. The `{loading ? <ActivityIndicator/> : <>...</>}` ternary (lines 120–149) is conditional **JSX**, not conditional hooks — mounting/unmounting child components is fine. The NativeWind `className` wrapping introduces no early return in this file; `handlePressIn`/`handlePressOut` are event handlers, not render-path code.

**Verdict: clean.**

## 4. Library components (for completeness)

- `SafeAreaView` (react-native-safe-area-context), `Ionicons` (@expo/vector-icons), `Text`/`View` (react-native): stock library components, unmodified, not plausible sources of a hook-order violation introduced by this project.
- Reanimated's `useAnimatedStyle`/`useSharedValue` are called unconditionally in both Card and Button.

---

## 5. Recent modifications to components used by trip-summary

From `git status --porcelain` (current working tree):

| File | Modified? | Rendered by trip-summary? |
|---|---|---|
| `src/components/ui/Button.tsx` | **No** (unchanged since initial commit `d23ff4e`) | Yes |
| `src/components/ui/Card.tsx` | **No** (unchanged since initial commit `d23ff4e`) | Yes |
| `src/components/ui/Input.tsx` | Yes (this session — optional `leftIconColor` prop) | **No** |
| `src/components/map/Map.tsx` / `Map.native.tsx` | Yes (this session — `isLiveLocation` prop) | **No** |
| `src/features/account/components/ProfileCard.tsx` | Yes | **No** |
| `app/(driver)/trip-summary.tsx` | Yes (the earlier hook-guard fix) | — (the screen itself) |
| `app/(driver)/trip.tsx` | Yes (GPS filter only — audited clean) | — |
| `app/_layout.tsx` | Yes (uncommitted, not yet audited) | — (root layout, ancestor of everything) |

**Neither component that trip-summary renders has been touched since the initial commit.** The last commit touching `src/components` at all (`722dcff`) only changed map files.

---

## Conclusion

| Question | Answer |
|---|---|
| Violation in Card? | No — 2 hooks, both before the conditional return; equal hook count on all paths |
| Violation in Button? | No — 2 hooks, single return, conditional JSX only |
| Violation in any component trip-summary renders? | **None found** |
| Recently modified components in trip-summary's tree? | None — Button/Card untouched since initial commit |

### Where that leaves the error

Every file in trip-summary's render tree — the layout, the screen, Button, Card, and previously trip.tsx + `useDriverTelemetryPing` — is verified clean. Given that, the strongest remaining explanations for "Rendered fewer hooks than expected":

1. **Stale error / Fast Refresh artifact (most likely).** `trip-summary.tsx`'s hook structure was changed by the earlier fix. If the error was observed before that fix, or during a Fast Refresh session while the fixed file hot-swapped into a mounted tree, the message reflects the *old* code. A full restart (kill the app and Metro with cache clear: `npx expo start -c`) is required before trusting any reproduction.
2. **`app/_layout.tsx` is modified and uncommitted** and has not been audited — it is an ancestor of the (driver) stack. If the error reproduces after a clean restart, that file is the next read target, followed by `app/(driver)/navigation.tsx`.
3. If it still reproduces, capture the **full component stack** from the red screen (not just the top frame) — the component named immediately *above* the "Rendered fewer hooks" line is the actual offender, and it will pinpoint the file directly.
