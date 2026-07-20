# Driver Navigation Screen Audit

**Date:** 2026-07-20
**Type:** Read-only audit — no code was modified.
**Scope:**
- `app/(tabs)/navigate.tsx`
- `app/(driver)/navigation.tsx`
- `app/(driver)/trip.tsx`
- `src/hooks/useCurrentLocation.ts`
- `src/hooks/useDriverTelemetryPing.ts`
- `src/hooks/useRoadSnappedVehicle.ts`
- `src/hooks/useSnappedLocation.ts`

---

## 1. LOCATION UPDATES

**How is driver location currently tracked?**

Each of the three driver-facing screens runs its **own** `expo-location`
tracking effect — there is no shared "driver location" hook used across all
three. All three now request `Location.Accuracy.BestForNavigation`... except
`app/(driver)/trip.tsx`, which is still on `Location.Accuracy.High` (not yet
upgraded — see §7).

| Screen | Initial fix | Watch accuracy | Interval |
|---|---|---|---|
| `app/(tabs)/navigate.tsx` | none (watch only) | `BestForNavigation` | `distanceInterval: 1`, `timeInterval: 1000` |
| `app/(driver)/navigation.tsx` | `getCurrentPositionAsync` | `BestForNavigation` | `distanceInterval: 1`, `timeInterval: 1000` |
| `app/(driver)/trip.tsx` | `getCurrentPositionAsync` | **`High`** (not upgraded) | `distanceInterval: 1`, `timeInterval: 1000` |

None of the three screens use `useCurrentLocation.ts` or
`useSnappedLocation.ts` for driver tracking — each screen manages its own
`driverLocation` / `driverHeading` state directly via
`Location.watchPositionAsync`.

**Which hook handles it?**

No dedicated hook. Tracking is inlined in each screen's own `useEffect`
(`startTracking()` closures in all three files). The only hooks actually
used by the navigation screens are:
- `useDriverTelemetryPing` (`app/(driver)/navigation.tsx`,
  `app/(driver)/trip.tsx`) — pushes the tracked location/heading to the
  backend every 5s, does not itself track location.
- `useRoadSnappedVehicle` (used inside `Map.native.tsx`, not the screens
  directly) — snaps whatever `driverLocation`/`driverHeading` the screen
  passes in onto the active route polyline and derives a road-based heading.

`useCurrentLocation.ts` and `useSnappedLocation.ts` are **not imported by any
of the seven audited files**. They exist for other flows (customer-side
location/address resolution) and are unrelated to driver navigation tracking
today.

**Is `coords.heading` being read anywhere?**

Yes, in all three screens' `watchPositionAsync`/`getCurrentPositionAsync`
callbacks:
- `navigate.tsx:90` — `if (coords.heading !== null) setDriverHeading(coords.heading)`
- `navigation.tsx:77-79, 93-95` — same pattern, both initial fix and watch
- `trip.tsx:67-69, 81-83` — same pattern, both initial fix and watch

All three fall back to the existing `driverHeading` state (initialized to
`0`) when `coords.heading` is `null`, so none of them crash on a missing
heading.

**Is `coords.speed` being read anywhere?**

Only in `app/(tabs)/navigate.tsx` (`navigate.tsx:91-96`), where it is
converted m/s → km/h and clamped to `>= 0`, with an explicit `0` fallback
when `speed` is `null`. Neither `navigation.tsx` nor `trip.tsx` reads
`coords.speed` — neither has a speed display in its UI.

---

## 2. MAP CAMERA

**Is `MapView` using `region` or `camera` prop?**

Neither, directly — `Map.native.tsx` mounts `MapView` with `initialRegion`
only (set once from `driverLocation`/`pickup`/`userLocation`, `Map.native.tsx:281`).
There is no static `camera` prop on `MapView` in any of the three
implementations. Camera control instead happens entirely **imperatively**,
via `mapRef.current.animateCamera(...)`, from both `Map.native.tsx` itself
(auto-follow effects, `Map.native.tsx:204-213`) and from the two navigation
screens directly.

**Is `animateCamera` used anywhere?**

Yes, in three places:
- `Map.native.tsx:148-152` — imperative handle exposes `animateCamera` to
  callers, forwarding to the underlying `MapView.animateCamera`.
- `navigate.tsx:101-110` — called from inside the location-watch callback
  when `isNavigating && isAutoFollow`, with
  `{ center, heading, pitch: 45, altitude: 500, zoom: 17 }`, 700ms duration.
- `navigation.tsx:243-256` — a dedicated `useEffect` keyed on
  `driverLocation`/`driverHeading`/`isNavigating`/`isAutoFollow`, same
  `{ pitch: 45, altitude: 500, zoom: 17 }` shape, 700ms duration.
- `trip.tsx:137-150` — same pattern, but still `{ zoom: 17.5, pitch: 55 }`
  (not aligned to the `45/500/17` convention used by the other two screens).

`navigate.tsx` also calls `mapRef.current.animateToRegion(...)` once, in
`handleClear` (`navigate.tsx:225-231`) — but only for the pre-navigation
"reset to current location" action, not during active turn-by-turn
navigation, so it does not fight with `animateCamera`.

**Is `mapRef` defined and attached to `MapView`?**

Yes in all three screens: `const mapRef = useRef<any>(null)` and
`<Map ref={mapRef} .../>`. `Map.native.tsx` forwards this via
`React.forwardRef` + `useImperativeHandle` (`Map.native.tsx:142-159`),
exposing `animateToRegion`, `animateCamera`, `fitToCoordinates`, and
`getMapRef`. The actual `MapView` ref inside `Map.native.tsx` is a second,
internal `mapRef` (`Map.native.tsx:73`) — the screens never touch the raw
`MapView` instance directly, only the imperative-handle wrapper.

---

## 3. CURRENT MARKER

**What marker is shown for driver position?**

Depends on the `navigationArrowMode` prop passed to `<Map>`
(`Map.native.tsx:303-319`):
- `navigationArrowMode={true}` (both `navigate.tsx` and `navigation.tsx` set
  this while `isNavigating`) → `NavigationArrowMarker`, a filled SVG chevron
  (`react-native-svg` `Path`) in the app's primary color (`#26344F`) with a
  white outline, pointing "up" and rotated by the marker's native `rotation`
  prop.
- `navigationArrowMode={false}` (or omitted, e.g. `trip.tsx` never sets it)
  → `AnimatedVehicleMarker`, a bird's-eye car PNG (`CarMarker`).

In both cases the position/heading fed to the marker is not the raw GPS fix
but the output of `useRoadSnappedVehicle` (`Map.native.tsx:139`), which
snaps onto the route polyline and derives heading from consecutive snapped
positions (falling back to raw heading only for the very first fix).

**Is it a static pin, custom marker, or animated?**

Animated. Both `NavigationArrowMarker` and `AnimatedVehicleMarker` are built
on the same `useAnimatedMarker` hook (`src/hooks/useAnimatedMarker.ts`),
which drives the marker's native `coordinate`/`rotation` props on the UI
thread via Reanimated `withTiming` — position interpolates linearly between
fixes (1800ms) and heading rotates along the shortest arc (1800ms, cubic
easing), so the marker glides and turns smoothly rather than snapping.
Neither marker re-renders its child SVG/PNG per frame
(`tracksViewChanges={false}`), only the native transform changes.

`trip.tsx` never sets `navigationArrowMode`, so it always shows the car
marker, never the arrow — consistent with it being the "trip in progress"
screen rather than a turn-by-turn view (`trip.tsx` has no "Next Turn"
header at all).

---

## 4. NEXT TURN HEADER

**What data populates "Head south" / instruction text?**

Both `navigate.tsx` and `navigation.tsx` get turn-by-turn steps from
`getDirections()` (`src/lib/google/mapsApi.ts`), stored as
`navigationSteps` / `routeSteps` (`DirectionStep[]`). The header text is the
`instruction` field of the current step
(`navigationSteps[activeStepIndex].instruction` /
`routeSteps[activeStepIndex].instruction`), HTML-stripped by a local
`stripHtml()` helper (both screens define their own copy — not shared).
`activeStepIndex` advances in a `useEffect` that compares live driver
position to `step.endLocation` and increments once within a threshold
(`navigate.tsx`: 30m; `navigation.tsx`: 25m — inconsistent threshold between
the two screens).

`trip.tsx` has no turn-by-turn steps at all — it only fetches a route
polyline (`getDirections(...).coordinates`) for the destination leg, no
`steps`, no "Next Turn" header.

**Where does distance to next turn come from?**

Two numbers exist side by side and are not the same thing:
- The header's "In `<distance>`" text uses
  `navigationSteps[activeStepIndex]?.distance?.text` — this is the
  **Google Directions API's step distance** (i.e. the full length of the
  current step), which does **not** shrink as the driver drives through the
  step; it only changes when `activeStepIndex` advances.
- Separately, both screens compute a **live** `distanceToManeuverMeters` via
  `calculateDistanceMeters(driverLocation, step.endLocation)` inside the
  same advance-logic effect. This live number drives the turn-preview pulse
  and the amber/red color escalation (§7 below), but is **not** what's
  displayed as the "In" text — the displayed text is still the static
  step-distance string from the Directions API.

**Is there already a turn icon?**

Yes. Both screens render a small circular icon
(`w-9 h-9`/`w-8 h-8 rounded-full bg-primary/10`) to the left of the
instruction text, using `getManeuverIconName(step?.maneuver)` from
`src/lib/maneuverIcon.ts` to map the Directions API's `maneuver` string
(`turn-left`, `roundabout-right`, `uturn-left`, etc.) to an Ionicons glyph,
wrapped in an `Animated.View` whose `scale` is driven by
`useTurnPreview(distanceToManeuverMeters)` (`src/hooks/useTurnPreview.ts`).
The pulse loops (`Animated.loop(Animated.sequence([...]))`, scale 1 → 1.3 →
1) whenever the driver is within 150m of the maneuver, and the "In" text
color escalates primary → amber (`≤50m`) → red (`≤20m`) via the same hook.
`trip.tsx` has neither a turn icon nor a "Next Turn" header.

---

## 5. SPEED / DISTANCE / ETA BAR

Present only in `app/(tabs)/navigate.tsx` (bottom info bar,
`navigate.tsx:449-469`). `navigation.tsx` has no speed/distance/ETA bar —
its bottom area is the passenger-pickup `Card` (passenger info, pickup
address, distance-to-pickup, fare). `trip.tsx` has its own distinct trip
card (duration timer, distance, earnings) — also not a speed/distance/ETA
bar.

For `navigate.tsx`'s bar specifically:

| Value | Hardcoded or live? | Source |
|---|---|---|
| Speed (`{currentSpeed} KM/H`) | **Live** | `coords.speed * 3.6`, rounded, from the `watchPositionAsync` callback (`navigate.tsx:91-96`); falls back to `0` when `speed` is `null` |
| Distance (`{routeDistance}`) | **Live**, but only updates per-route, not per-tick | `route.distance.text` from `getDirections()` at the time the route was calculated (`navigate.tsx:147`) — does not shrink as the driver progresses along the route, only changes on a fresh `calculateRoute()` call |
| ETA (`{routeEta}`) | **Live**, same caveat as distance | `route.duration.text` from `getDirections()` (`navigate.tsx:148`) — also fixed at route-calculation time, not recomputed as the trip progresses |

None of the three values are literal hardcoded strings/numbers, but
`routeDistance`/`routeEta` are effectively "live at route-calc time, static
thereafter" rather than continuously live — they will not visibly count down
during the drive unless `calculateRoute()` is re-invoked.

---

## 6. WHAT IS ALREADY WORKING

- Live GPS tracking in all three screens via `expo-location`
  `watchPositionAsync`, updating position/heading every ~1s or 1m of
  movement.
- `BestForNavigation` accuracy wired in `navigate.tsx` and `navigation.tsx`
  (not yet in `trip.tsx`).
- Speed read from `coords.speed`, converted to km/h, with a safe `0`
  fallback — in `navigate.tsx` only.
- Heading read from `coords.heading` with a safe `0` fallback in all three
  screens.
- Directions fetched through `getDirections()` (`mapsApi.ts`), producing
  route polyline + turn-by-turn `steps` for `navigate.tsx`/`navigation.tsx`,
  and a plain polyline for `trip.tsx`.
- Step-advance logic (distance-to-step-end threshold) in
  `navigate.tsx`/`navigation.tsx`, auto-advancing `activeStepIndex`.
- Heading-up camera via `animateCamera({ heading, pitch: 45, altitude: 500,
  zoom: 17 }, 700)` in `navigate.tsx` and `navigation.tsx`, gated on
  `isAutoFollow` so manual map drags pause auto-follow for 5s
  (`trip.tsx` still uses the older `{ zoom: 17.5, pitch: 55 }` shape).
- `mapRef` correctly wired end-to-end: screen → `Map` (`forwardRef`) →
  internal `MapView` ref, exposing `animateCamera`/`animateToRegion`/
  `fitToCoordinates`/`getMapRef`.
- Road-snapped driver marker (`useRoadSnappedVehicle`) feeding both the car
  marker and the navigation arrow marker, so the marker rides the polyline
  rather than raw (potentially off-road) GPS.
- Heading-aware `NavigationArrowMarker` (SVG chevron, primary color, white
  outline) shown instead of the car marker whenever `navigationArrowMode` is
  true, with smooth Reanimated-driven position/rotation easing
  (`useAnimatedMarker`).
- Turn-preview pulse (`Animated.loop`/`Animated.sequence`, scale 1↔1.3)
  triggered within 150m of the next maneuver, plus "In" text color
  escalation primary → amber (≤50m) → red (≤20m), via
  `useTurnPreview`/`turnDistanceColor` in both `navigate.tsx` and
  `navigation.tsx`.
- Maneuver-to-icon mapping (`getManeuverIconName`) covering left/right/
  slight/sharp turns, U-turns, roundabouts, merges/forks, with a straight-
  ahead default.
- Auto-follow-resume behavior (5s of no manual interaction re-enables
  camera follow) consistently implemented across all three screens.
- `useDriverTelemetryPing` pushing location/heading to the backend every 5s
  while an order is active, decoupled from render cadence via refs.
- Distance calculations consistently routed through
  `src/lib/distance.ts` (`calculateDistanceMeters`/`calculateDistanceKm`) in
  all three screens now — no remaining inline Haversine implementations in
  the audited files.

---

## 7. WHAT IS MISSING

Mapped to the five upgrade prompts:

**1. Arrow marker**
- `app/(driver)/trip.tsx` never passes `navigationArrowMode` to `<Map>`, so
  it always shows the car marker — there is no "trip in progress" arrow
  state at all (may be intentional, since `trip.tsx` isn't turn-by-turn, but
  it's worth confirming since the driver is still actively moving toward a
  destination).
- No visual distinction on the arrow itself between "on-route" and
  "GPS lost/stale" states — if `coords.heading` goes `null` for an extended
  period, the arrow silently keeps the last known heading with no UI
  indication that heading is stale.

**2. Camera**
- `MapView` still only sets `initialRegion`, never a live `camera` prop —
  all camera control is imperative (`animateCamera`), which matches what
  was implemented, but there's no camera prop-based fallback if
  `animateCamera` fails to fire before first paint (brief default-region
  flash before the first `animateCamera` call resolves).
- `trip.tsx`'s camera effect (`trip.tsx:137-150`) was **not** updated to the
  `pitch: 45 / altitude: 500 / zoom: 17` convention — it still uses
  `zoom: 17.5, pitch: 55` and has no `altitude`. Inconsistent camera feel
  between the pickup-navigation screen and the in-trip screen.
- `Map.native.tsx`'s own internal auto-follow effect
  (`Map.native.tsx:204-213`, driven by `autoFollowDriver`, default `true`)
  still uses `animateToRegion`, not `animateCamera`. `navigate.tsx` and
  `navigation.tsx` both explicitly pass `autoFollowDriver={false}` while
  navigating to avoid this fighting with the screen's own `animateCamera`
  calls — but `trip.tsx` also passes `autoFollowDriver={false}` unconditionally,
  meaning region-based auto-follow is effectively dead code for all three
  screens today (not broken, just redundant/unused).

**3. Speed**
- `app/(driver)/navigation.tsx` and `app/(driver)/trip.tsx` have no speed
  display and do not read `coords.speed` at all. If a speed readout is
  wanted on either screen, both the UI element and the `coords.speed` read
  are missing.
- `app/(driver)/trip.tsx` is still on `Location.Accuracy.High` rather than
  `BestForNavigation` — lower-priority since it's not a turn-by-turn view,
  but inconsistent with the other two screens' tracking accuracy.

**4. Turn icon**
- The "In `<distance>`" text shown in the header is still the **static**
  Directions API step-distance string, not the live
  `distanceToManeuverMeters` value the pulse/color logic already computes —
  so a driver watching the header will see the icon pulse and the number
  turn red while the printed distance itself doesn't visibly count down
  within a step. If a continuously-updating "in 42m" style readout is
  wanted, the header text needs to switch to the live meters value
  (formatted), not `step.distance.text`.
- The two screens each maintain their own copy of `stripHtml()` and a
  near-identical header layout — no shared component, so any future visual
  change has to be made twice (not a bug, just a duplication note).
- `app/(driver)/trip.tsx` has no turn icon, no maneuver data, and no header
  at all — it's a single-leg "drive to destination" screen without
  step-by-step guidance.

**5. Compass**
- No compass/heading indicator exists anywhere in the audited files. There
  is no compass UI element, no "recenter"/"north-up" button, and no reading
  of `MapView`'s own compass (`showsCompass={true}` is set in
  `Map.native.tsx:292`, which renders the native Google Maps compass badge,
  but nothing in any of the three screens surfaces heading as a standalone
  compass widget or lets the driver tap to reset to north-up). If a custom
  in-HUD compass (distinct from the native map compass) is wanted, it does
  not exist yet in any of the three screens.
