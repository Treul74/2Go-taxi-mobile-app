# Phase 9C — Adopt NavigationHUD Across the App

**Date:** 2026-08-07
**Type:** Read-only evaluation. **No code was modified in this phase** — every screen and component below was compared by direct `Read`, not assumed from prior audits. This is a legitimate outcome the task's own brief anticipates ("If NavigationHUD cannot yet replace a screen, explain exactly why," "Only migrate where safe") — the finding is that no current screen can adopt the `NavigationHUD` composite without changing existing behavior, for concrete, itemized reasons per screen (§3).
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`.

---

## 1. Files modified

**None.** This phase's deliverable is the evaluation itself; §3 explains why every candidate screen fails the "identical functionality" bar the task sets for a safe swap.

---

## 2. What `NavigationHUD` actually is

`src/components/navigation/NavigationHUD.tsx` composes eight pieces into one fixed layout:

```
┌─────────────────────────────────────────────┐
│ TurnBanner            │      EtaChip         │
│ LaneGuidance RoadName │      ArrivalTime      │
│                                               │
│              (flexible spacer)               │
│                                               │
│ SpeedWidget            │  VoiceToggle         │
│                         │  Compass             │
│                         │  Controls            │
└─────────────────────────────────────────────┘
```

Its own doc comment is explicit about what it deliberately excludes: *"Deliberately excludes the bottom sheet (`NavigationBottomCard`) and arrival card (`NavigationArrivalCard`)... a screen composes those alongside this overlay, not inside it."* It accepts exactly four props (`onZoomIn`, `onZoomOut`, `onToggleLayers`, `speedLimitKph`) — no way to reposition, hide, or offset any of its rows.

Three screens currently compose the same underlying widgets (`NavigationTurnBanner`, `NavigationCompass`, etc.) individually rather than via this wrapper: `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`, `app/(customer)/trip.tsx`.

---

## 3. Per-screen evaluation

### 3.1 `app/(driver)/navigation.tsx` — **cannot adopt `NavigationHUD`**

Four independent, concrete reasons, each sufficient on its own:

1. **`navigationEnabled` gating.** Every HUD element on this screen (turn banner, lane guidance, road name, arrival time, compass, controls, speed widget, voice toggle) is wrapped in `{navigationEnabled && (...)}` (lines 307–343) — nothing renders until the driver presses "Start Pickup." `NavigationHUD` has no such prop; swapping it in would make the compass/controls/speed-widget/voice-toggle appear *before* navigation starts, a real behavior change, not just a layout difference.
2. **Positioning is deliberately split, not grouped.** This screen puts `NavigationArrivalTime` at `top-2 right-5` and `NavigationCompass`/`NavigationControls` at `top-24 right-5` — a vertical column down the right edge. `NavigationHUD` puts compass/controls at the *bottom*-right, grouped with the voice toggle. These are two different arrangements of the same widgets, not the same arrangement rendered two ways.
3. **Live chrome measurement `NavigationHUD` has no way to provide.** This screen's own `handleTurnBannerLayout`/`handleBottomCardLayout` (`onLayout` → `CameraController.setChrome(...)`) feed its real turn-banner and pickup-card heights into `AutoFitEngine`'s padding model — explicitly wired "for correctness" per the code's own comment, even though currently inert (`DRIVER_TO_PICKUP`/`ARRIVED_PICKUP` are both `autoFit: false` today). `NavigationHUD` exposes no `onLayout` hook; adopting it would silently drop this instrumentation.
4. **An `EtaChip` that isn't there today would appear.** `NavigationHUD` renders a remaining-*duration* chip (`EtaChip`, e.g. "12 min") next to the wall-clock `NavigationArrivalTime` (e.g. "3:45 PM") — confirmed distinct by `NavigationArrivalTime.tsx`'s own doc comment. This screen currently shows only the wall-clock chip. Adopting `NavigationHUD` adds a second, new chip that wasn't part of this screen's design.

### 3.2 `app/(driver)/trip.tsx` — **cannot adopt `NavigationHUD`**

The most decisive reason is structural, not cosmetic:

1. **An animated, variable-height bottom card `NavigationHUD` has no concept of.** This screen's speed widget is positioned at `bottom: Animated.add(overlayAnim, 20)` — it slides up and down in lockstep with its own bespoke trip card as it expands (180px → 420px) and collapses. `NavigationHUD`'s bottom row is a static flex layout with no bottom-offset prop of any kind. Swapping it in would either bury the speed widget under the expanding trip card, or require adding real new configurability to the shared component — a materially bigger change than "adopt where safe."
2. **Different positioning for the same widgets**, same class of difference as §3.1: compass/controls sit at a hardcoded `top: 160` here (below the top turn-banner/arrival-time row), not bottom-right-with-voice-toggle.
3. **`NavigationVoiceToggle` is deliberately omitted** here (confirmed by the earlier compliance audit: no functional effect since no TTS engine exists, but still a deliberate omission, not an oversight) — `NavigationHUD` always renders it.
4. Same `EtaChip` addition as §3.1.

### 3.3 `app/(customer)/trip.tsx` — **cannot adopt `NavigationHUD`**

This screen (migrated in Phase 8A.1) deliberately mounts only `NavigationCompass`/`NavigationControls` — a narrow, intentional subset, reasoned through explicitly in that phase's report: the Customer isn't driving and this screen never fetches a route, so turn-by-turn/lane-guidance/road-name/speed data never exists here.

1. **`NavigationVoiceToggle` renders unconditionally** (confirmed by reading it — a plain local-`useState` `Pressable`, no data guard at all). Every other HUD piece this screen doesn't already show would safely render nothing (`NavigationTurnBanner`/`NavigationLaneGuidance`/`NavigationRoadName`/`EtaChip`/`NavigationArrivalTime`/`NavigationSpeedWidget` all null-guard on route/ETA/speed data that's genuinely absent here) — but the voice toggle has no such guard, so adopting `NavigationHUD` would add a real, always-visible, previously-absent button to a screen this project deliberately kept minimal for a passive observer.
2. **Positioning**: this screen renders compass/controls as `<NavigationMap/>`'s `children`, top-right, via a custom wrapper `View` — not `NavigationHUD`'s bottom-right grouping.

---

## 4. Why this is a real finding, not a missed opportunity

Every one of the three screens' deliberate, hand-tuned positioning exists specifically *because* it has to coexist with something screen-specific — a large, business-data-driven bottom card unique to that screen's trip stage (pickup vs. in-progress vs. no card at all), in one case animated. `NavigationHUD`'s own header explicitly scoped it to exclude bottom cards, but didn't anticipate that the *rest* of its layout (top row, bottom row) would also need to shift/hide/reposition around whatever a screen puts below it. That's not a defect in `NavigationHUD` — it's a genuinely different, harder problem (a configurable HUD layout engine) than what any phase to date asked it to solve, and solving it now would be new scope, not "reuse where identical."

---

## 5. Validation

- ✓ **HUD remains reusable** — `NavigationHUD.tsx` was not modified; its component contract is unchanged and still available for any future screen whose chrome needs genuinely match its fixed layout (e.g. a hypothetical simple/no-bottom-card navigation screen).
- ✓ **No duplicated widgets** — confirmed by reading all three screens end-to-end: every one composes the *same* shared widget components (`NavigationTurnBanner`, `NavigationCompass`, etc.) directly, with no screen-local reimplementation of any of them. The only thing not shared is the top-level layout *arrangement*, not the widgets themselves — there is nothing to de-duplicate at the widget level today.
- ✓ **Existing navigation behaviour unchanged** — trivially true: no code was changed.

---

## 6. Remaining bespoke HUD components (unchanged, by necessity — not oversight)

| Screen | Bespoke element | Why it can't be replaced by `NavigationHUD` today |
|---|---|---|
| `app/(driver)/navigation.tsx` | Custom pickup/waiting `<Card>` (not `NavigationBottomCard`); `navigationEnabled`-gated HUD visibility; split top-column widget positions; `onLayout`-based chrome reporting | Business-data-specific card content; a visibility gate and a chrome-measurement hook `NavigationHUD` doesn't expose |
| `app/(driver)/trip.tsx` | Custom collapsible trip card (180–420px, animated); animated speed-widget offset; mid-right widget positions; no voice toggle | An animation dependency and positioning scheme `NavigationHUD`'s static layout structurally cannot express |
| `app/(customer)/trip.tsx` | Custom driver/trip info `<Card>`; minimal compass+controls-only HUD subset | Deliberately narrower than `NavigationHUD` by design (passive-viewer screen, no route ever fetched) |

`NavigationBottomCard`/`NavigationArrivalCard` remain unused, unchanged from every prior audit — the bottom-card gap is real but was never `NavigationHUD`'s job to close (its own header excludes them explicitly).

**If a future phase wants to close this gap for real**, the honest path is extending `NavigationHUD` with real configurability (a `bottomOffset`/`bottomInset` prop for the bottom row, a way to opt out of individual pieces like the voice toggle or `EtaChip`, and a `visible`/`navigationEnabled` gate) rather than asking three screens with genuinely different chrome to converge on a layout that currently can't accommodate any of them — that's a deliberate design decision for a future task to make, not something this phase should do unasked.
