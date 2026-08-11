# Back Button Audit — Full Codebase

Date: 23-07-26
Scope: every back arrow / back button across the app (search terms: `<BackButton`, `arrow-back`, `chevron-back`, `router.back()`, `navigation.goBack()`).

---

## 1. Reusable component definition

### `src/components/ui/BackButton.tsx` (current implementation)

```tsx
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type BackButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<BackButtonSize, { box: number; icon: number }> = {
  sm: { box: 36, icon: 18 },
  md: { box: 44, icon: 20 },
  lg: { box: 56, icon: 26 },
};

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  size?: BackButtonSize;
  style?: StyleProp<ViewStyle>;
}

export function BackButton({ onPress, color = '#26344F', size = 'md', style }: BackButtonProps) {
  const { box, icon } = SIZES[size];
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        { width: box, height: box, borderRadius: box / 2 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name="arrow-back" size={icon} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  pressed: { opacity: 0.7 },
});
```

Already supports `sm`/`md`/`lg` sizing and a custom `color` prop, StyleSheet-based shadow (opacity 0.15, radius 4, elevation 4). This differs slightly from the "standard" found on PassengerHome (shadow opacity 0.2, radius 3, elevation 5; no size variants; no color prop; fixed 48×48 / icon 24).

---

## 2. The de-facto standard (PassengerHome — raw Pressable)

### `src/features/passenger/PassengerHome.tsx:381-408`

```tsx
{/* Back Button - floats above the bottom sheet, returns to Discover */}
<View
  className="absolute left-4"
  style={{
    bottom: isMapDragging
      ? (insets.bottom + 100)
      : (status === 'active' ? 360 : 420),
    zIndex: 15,
  }}
>
  <Pressable
    onPress={() => router.back()}
    className="bg-white w-12 h-12 rounded-full items-center justify-center"
    style={{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 5,
    }}
  >
    <Ionicons name="arrow-back" size={24} color="#26344F" />
  </Pressable>
</View>
```

This is the pattern named in the task as the target standard. Positioning wrapper `View` (absolute/left/bottom/zIndex) must be kept; the inner `Pressable` + `Ionicons` gets replaced by `<BackButton />`.

---

## 3. Screens already using the `<BackButton />` component (compliant call sites — only benefit from the component-level update)

### `app/profile.tsx:76`
```tsx
<BackButton onPress={() => router.back()} />
```
Inside header row: `<View className="flex-row items-center justify-between px-5 py-4">`.

### `src/features/account/AccountScreen.tsx:235`
```tsx
{onBack && <BackButton onPress={onBack} style={{ marginRight: 12 }} />}
```
`onBack` is threaded in from `app/account.tsx:5` → `<AccountScreen onBack={() => router.back()} />`.

### `src/features/auth/ForgotPasswordScreen.tsx:18`
```tsx
<BackButton onPress={() => router.back()} style={styles.backBtn} />
```
`styles.backBtn = { alignSelf: 'flex-start', marginBottom: 24 }` — positioning only, no shadow/circle duplication.

### `src/features/auth/OtpScreen.tsx:155`
```tsx
<BackButton onPress={() => router.back()} style={styles.backBtn} />
```
`styles.backBtn = { alignSelf: 'flex-start', marginBottom: 28 }` — positioning only.

### `src/features/auth/SignupScreen.tsx:204`
```tsx
<BackButton onPress={() => router.back()} style={styles.backBtn} />
```
`styles.backBtn = { alignSelf: 'flex-start', marginBottom: 28 }` — positioning only.

### `src/features/passenger/components/MapPickerModal.native.tsx:218` (fallback/no-map branch)
```tsx
<BackButton onPress={onClose} style={{ marginRight: 15 }} />
```

**All six of the above already match the target API (`onPress` + `style` only) and require no call-site changes — they will automatically pick up the new look once `BackButton.tsx` is updated.**

---

## 4. Screens using `<BackButton />` with props that will disappear (`size`, `color`)

### `src/features/passenger/components/LocationSearchModal.tsx:414`
```tsx
{/* Repositioned Back Arrow - Floating near the bottom/keyboard */}
<BackButton onPress={onClose} size="lg" style={styles.floatingBackButton} />
```
`styles.floatingBackButton = { position: 'absolute', left: 20, bottom: 20, zIndex: 1000 }`.
Currently renders at **56×56** (`lg`). The new fixed-size component is **48×48** — this call site will shrink.

### `src/features/passenger/components/MapPickerModal.native.tsx:240-250` (native-map branch)
```tsx
{/* Floating Back Button - Anchored just above the bottom card, whatever its height */}
<BackButton
  onPress={onClose}
  size="md"
  color="#1A1A1A"
  style={[styles.backButton, { bottom: bottomCardHeight + 12 }]}
/>
```
`styles.backButton = { position: 'absolute', left: 16, zIndex: 100 }`.
Currently **44×44** with icon color `#1A1A1A` (near-black). The new component is fixed **48×48** with icon color `#26344F` (navy) — both the size and the icon tint will change here.

---

## 5. Back arrow NOT using `BackButton` at all (inconsistent implementation)

### `src/features/passenger/components/MatchingOverlay.tsx:193-196`
```tsx
{/* Back arrow, bottom-left of the map area */}
<View className="absolute left-4 z-20" style={{ bottom: COLLAPSED_SHEET_HEIGHT + insets.bottom + 16 }}>
  <IconButton icon="arrow-back" variant="primary" size="lg" onPress={onCancel} />
</View>
```
Uses the **`IconButton`** component (not `BackButton`), `variant="primary"` — renders a **brand-colored circle with a white icon**, not a white circle with a navy icon. This is visually the most divergent back arrow in the app. Task constraints explicitly forbid changing `IconButton.tsx` itself, but this is a *usage site* of `IconButton` functioning as a back arrow, so it falls inside the audit's search terms (`arrow-back`).

---

## 6. Matches that are NOT navigational back buttons (excluded from replacement)

### `src/features/driver/components/OnlineToggle.tsx:134-138`
```tsx
<Ionicons
  name={isOnline ? 'chevron-back' : 'chevron-forward'}
  size={16}
  color="rgba(255,255,255,0.3)"
/>
```
Decorative directional hint inside a slide-to-toggle control ("Slide left to go offline" / "Slide right to go online"), not a navigation action.

### `src/lib/maneuverIcon.ts:16-20`
```ts
if (value.includes('roundabout')) return 'reload-circle-outline';
if (value.includes('merge') || value.includes('fork')) return 'git-merge-outline';
if (value.includes('left')) return 'arrow-back';
if (value.includes('right')) return 'arrow-forward';
return 'arrow-up';
```
Maps turn-by-turn driving directions to icon names for in-trip navigation UI — `'arrow-back'` here means "turn left," unrelated to screen navigation.

### `app/ride/[id].tsx:26` and `app/chat/[id].tsx:98`
```tsx
<Button variant="ghost" onPress={() => router.back()} className="mt-4">Go Back</Button>
```
```tsx
<Pressable onPress={() => router.back()} className="mt-4 px-6 py-2 bg-primary rounded-full">
  <Text className="text-white font-medium">Go Back</Text>
</Pressable>
```
Text-only fallback buttons shown only on a "not found" empty state, not an arrow-icon back button.

### `app/ride/[id].tsx`, `app/chat/[id].tsx`, `app/driver/onboarding.tsx` — native header back button
Configured in `app/_layout.tsx:288-317` with `headerShown: true` and no `headerLeft` override, so these three screens get React Navigation's **native** header back chevron, which is not custom-coded anywhere in this repo (no JSX to replace).

### `src/features/onboarding/DriverOnboarding.tsx`
Calls `router.back()` twice (line 92, in an `Alert` button, and line 268, in step-navigation logic) but renders **no Ionicons/back-arrow icon anywhere in the file** — no visual back button exists here to replace.

---

## Summary table

| # | File | Line(s) | Current implementation | Action needed |
|---|---|---|---|---|
| 1 | `src/components/ui/BackButton.tsx` | 1-63 | Component def: sizes sm/md/lg, `color` prop, shadow opacity 0.15/radius 4/elevation 4 | Rewrite per Part B spec |
| 2 | `src/features/passenger/PassengerHome.tsx` | 381-408 | Raw `Pressable` (the standard) | Replace inner Pressable+Ionicons with `<BackButton />`, keep wrapper `View` |
| 3 | `app/profile.tsx` | 76 | `<BackButton onPress={...} />` | No change needed (already compliant) |
| 4 | `src/features/account/AccountScreen.tsx` | 235 | `<BackButton onPress={onBack} style={{marginRight:12}} />` | No change needed |
| 5 | `src/features/auth/ForgotPasswordScreen.tsx` | 18 | `<BackButton onPress={...} style={styles.backBtn} />` | No change needed |
| 6 | `src/features/auth/OtpScreen.tsx` | 155 | `<BackButton onPress={...} style={styles.backBtn} />` | No change needed |
| 7 | `src/features/auth/SignupScreen.tsx` | 204 | `<BackButton onPress={...} style={styles.backBtn} />` | No change needed |
| 8 | `src/features/passenger/components/MapPickerModal.native.tsx` | 218 | `<BackButton onPress={onClose} style={{marginRight:15}} />` | No change needed |
| 9 | `src/features/passenger/components/LocationSearchModal.tsx` | 414 | `<BackButton ... size="lg" ... />` | **Needs decision** — drop `size` prop (56px → 48px) |
| 10 | `src/features/passenger/components/MapPickerModal.native.tsx` | 240-250 | `<BackButton ... size="md" color="#1A1A1A" ... />` | **Needs decision** — drop `size`/`color` props (44px navy-black → 48px #26344F) |
| 11 | `src/features/passenger/components/MatchingOverlay.tsx` | 193-196 | `<IconButton icon="arrow-back" variant="primary" size="lg" onPress={onCancel} />` | **Needs decision** — swap brand-colored circle for white `BackButton`? |
| — | `src/features/driver/components/OnlineToggle.tsx` | 134-138 | `chevron-back`/`chevron-forward` slider hint | Excluded — not a back button |
| — | `src/lib/maneuverIcon.ts` | 16-20 | `arrow-back` = "turn left" glyph | Excluded — not a back button |
| — | `app/ride/[id].tsx` | 26 | "Go Back" text button, not-found state | Excluded — no arrow icon |
| — | `app/chat/[id].tsx` | 98 | "Go Back" text button, not-found state | Excluded — no arrow icon |
| — | `app/ride/[id].tsx`, `app/chat/[id].tsx`, `app/driver/onboarding.tsx` | n/a | Native React Navigation header back chevron | Excluded — not custom-coded in repo |
| — | `src/features/onboarding/DriverOnboarding.tsx` | 92, 268 | `router.back()` logic only, no icon rendered | Excluded — no visual back arrow |

---

## Open questions before implementing Part B/C

1. **LocationSearchModal.tsx (#9)** and **MapPickerModal.native.tsx (#10)** currently override `size`/`color`. The new `BackButton` spec removes both props entirely (fixed 48×48, fixed `#26344F`). Confirm it's fine to drop these overrides (visual size/color will shift slightly) rather than preserve them another way.
2. **MatchingOverlay.tsx (#11)** uses `IconButton` with a brand-colored (`variant="primary"`) circle as its back arrow, not `BackButton`. It's the most visually inconsistent one found — replacing it with the white `BackButton` is the biggest visual change of the four. Confirm this one should also be converted, since Part 4 says "do not change any other UI on any screen" but this back arrow's whole appearance would change from colored to white.
