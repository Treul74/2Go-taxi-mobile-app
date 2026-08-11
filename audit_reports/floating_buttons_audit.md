# Floating Buttons Audit — PassengerHome.tsx

Read-only audit. No code was modified while producing this report.
Source: `src/features/passenger/PassengerHome.tsx` (current state on disk).

---

## 1. RECENTER BUTTON (locate icon)

Lines 460–486.

```tsx
{/* Re-center Button (Bottom Right Positioning for better Thumb Reach) */}
<View
  className="absolute right-4"
  style={{
    bottom: isMapDragging ? (insets.bottom + 100) : (status === 'active' ? 360 : 420),
    zIndex: 15
  }}
>
  <View
    className="bg-white p-0.5 rounded-full shadow-lg"
    style={{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 10
    }}
  >
    <IconButton
      icon="locate"
      variant="ghost"
      size="lg"
      onPress={handleRecenter}
      onLongPress={toggleH3DebugMode}
    />
  </View>
</View>
```

- **Outer View size:** not explicitly sized — no `width`/`height`. It's a shrink-wrap positioning box (`absolute right-4` + computed `bottom` + `zIndex: 15`); it sizes to whatever its child (the inner View) measures.
- **Inner View:** `padding: 2px` (`p-0.5`), `background-color: #FFFFFF` (`bg-white`), `border-radius: 9999` (`rounded-full`), shadow: `color #000, offset (0,4), opacity 0.2, radius 8, elevation 10` (both via the `shadow-lg` class and the identical inline `style` — two declarations of the same shadow).
- **IconButton size prop:** `size="lg"` → per [IconButton.tsx](../src/components/ui/IconButton.tsx#L67-L70) `sizeClasses.lg = 'w-12 h-12'` = **48×48px** box, icon glyph size 26. `variant="ghost"` → `bg-transparent`, so the IconButton itself contributes no fill or shadow of its own.
- **Final rendered circle diameter:** inner-View box (48px) + 2px padding on each side = **52px** visible white circle.

---

## 2. MAP STYLE BUTTON (map icon)

Lines 430–446. This one has no separate outer/inner wrapper — a single `Pressable` is both container and touch target.

```tsx
{/* Map Type Toggle */}
<Pressable
  onPress={toggleMapType}
  className="bg-white w-12 h-12 rounded-full items-center justify-center shadow-md"
  style={{
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5
  }}
>
  <Ionicons
    name={mapType === 'standard' ? 'map-outline' : mapType === 'terrain' ? 'layers-outline' : 'globe-outline'}
    size={24}
    color="#26344F"
  />
</Pressable>
```

- **Outer View size:** N/A — there is no separate outer wrapper. This button lives inside the shared "Floating Controls Container" `View` (`absolute right-4 items-center gap-4`, lines 408–414), which itself is unsized/shrink-wrap.
- **"Inner" View (the Pressable itself):** `width: 48px, height: 48px` (`w-12 h-12`), no `padding` class, `background-color: #FFFFFF` (`bg-white`), `border-radius: 9999` (`rounded-full`), shadow: `color #000, offset (0,2), opacity 0.2, radius 3, elevation 5` (`shadow-md` class + inline `style` — same double-declaration pattern as the recenter button, but with different numeric values).
- **Component/size inside:** raw `Ionicons` glyph, `size={24}`, no `IconButton`/`BackButton` wrapper component used at all.
- **Final rendered circle diameter:** **48px** (no padding wrapper — the 48×48 box *is* the visible circle).

---

## 3. BACK BUTTON (arrow-back icon)

Lines 380–405 — current state, reflecting the earlier edit in this session.

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
  <View
    className="bg-white p-0.5 rounded-full shadow-lg"
    style={{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 10,
    }}
  >
    <BackButton
      size="lg"
      style={{ shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 }}
    />
  </View>
</View>
```

- **Outer View size:** not explicitly sized — same shrink-wrap pattern as the recenter button (`absolute left-4` + computed `bottom` + `zIndex: 15`).
- **Inner View:** `padding: 2px` (`p-0.5`), `background-color: #FFFFFF` (`bg-white`), `border-radius: 9999` (`rounded-full`), shadow: `color #000, offset (0,4), opacity 0.2, radius 8, elevation 10` — textually identical to the recenter button's inner View.
- **BackButton size prop:** `size="lg"` → per [BackButton.tsx](../src/components/ui/BackButton.tsx#L8-L11) `SIZES.lg = { box: 56, icon: 26 }` → the `BackButton`'s own `Pressable` renders at **56×56px**, `borderRadius: 28`, with its own `backgroundColor: '#FFFFFF'` baked into `styles.button` ([BackButton.tsx:49-59](../src/components/ui/BackButton.tsx#L49-L59)). Its built-in shadow (`shadowOffset (0,2), shadowOpacity 0.15, shadowRadius 4, elevation 4`) is neutralized for this usage only via the inline `style` override shown above, so the wrapper's shadow is the sole visible shadow.
- **Final rendered circle diameter:** BackButton's own box (56px) + 2px wrapper padding on each side = **60px** visible white circle.

---

## 4. COMPARISON TABLE

| Property | Recenter | MapStyle | Back |
|---|---|---|---|
| Container bg color | `#FFFFFF` (wrapper `bg-white`) | `#FFFFFF` (`bg-white`, single box) | `#FFFFFF` (wrapper `bg-white`) **and** `#FFFFFF` baked into BackButton's own StyleSheet |
| Container padding | `2px` (`p-0.5`) | none (no padding class) | `2px` (`p-0.5`) |
| Container border radius | `9999` (`rounded-full`) | `9999` (`rounded-full`) | `9999` (`rounded-full`) on wrapper; `28px` (`box/2`) on BackButton itself |
| Shadow color | `#000` | `#000` | `#000` |
| Shadow offset | `(0, 4)` | `(0, 2)` | `(0, 4)` (wrapper); BackButton's own offset `(0,2)` zeroed out via style override |
| Shadow opacity | `0.2` | `0.2` | `0.2` (wrapper); BackButton's own `0.15` zeroed out |
| Shadow radius | `8` | `3` | `8` (wrapper); BackButton's own `4` zeroed out |
| Elevation | `10` | `5` | `10` (wrapper); BackButton's own `4` zeroed out |
| Button/icon size prop | `IconButton size="lg"` → 48×48 box, icon 26 | raw `Ionicons size={24}`, box fixed at `w-12 h-12` (48×48) | `BackButton size="lg"` → **56×56** box, icon 26 |
| Total circle diameter px | **52px** (48 + 2×2 padding) | **48px** (no padding) | **60px** (56 + 2×2 padding) |
| NativeWind classes used | `absolute right-4` (outer); `bg-white p-0.5 rounded-full shadow-lg` (inner) | `bg-white w-12 h-12 rounded-full items-center justify-center shadow-md` (single box) | `absolute left-4` (outer); `bg-white p-0.5 rounded-full shadow-lg` (inner) |

---

## 5. WHAT IS DIFFERENT

Comparing the **Back** button against the other two:

- **Circle diameter is the only real visual mismatch left.** Back renders at **60px**, Recenter at **52px**, MapStyle at **48px** — all three are different sizes. Back vs. Recenter (the one it's meant to match) is **8px larger**, because:
  - `BackButton`'s `size="lg"` maps to a **56px** box ([BackButton.tsx:11](../src/components/ui/BackButton.tsx#L11)), while `IconButton`'s `size="lg"` maps to a **48px** box ([IconButton.tsx:70](../src/components/ui/IconButton.tsx#L70)). The `"lg"` name is shared but the two components define different pixel values for it — this is the root cause of the size mismatch, not the wrapper code (which is now textually identical between Back and Recenter).
- **Container/wrapper styling (bg, padding, radius, shadow, zIndex, bottom formula) is now identical** between Back and Recenter — no differences remain there.
- **MapStyle is structurally a different pattern entirely** (single `Pressable` with no separate padded wrapper, no `IconButton`/`BackButton` component, raw `Ionicons`, and a lighter shadow: offset `(0,2)`/radius `3`/elevation `5` vs. `(0,4)`/`8`/`10` for the other two). It was never made to match Back/Recenter and the prompt doesn't ask for that, but it's included above since it was in scope for the audit.
- **The only property left to fix (per the audit scope of Back vs. Recenter) is the size prop mismatch**: `BackButton size="lg"` (56px) needs to visually resolve to the same 48px box `IconButton size="lg"` produces, if true pixel parity is wanted. Everything else (bg, padding, radius, shadow values, zIndex, bottom formula) already matches exactly.
