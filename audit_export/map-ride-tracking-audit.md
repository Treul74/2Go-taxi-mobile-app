# Map / Ride-Tracking Styling Audit

Date: 2026-07-17
Scope: route polyline rendering, car/vehicle marker rendering, existing color
tokens, and blast radius of any styling change — no code was modified as
part of this audit.

---

## 1. Route polyline

**Library:** `react-native-maps` `Polyline` on native, `@react-google-maps/api`
`Polyline` on web — no Google Directions rendering component, no Mapbox.

- **[src/components/map/Map.native.tsx:387-427](../src/components/map/Map.native.tsx#L387-L427)**
  — three stacked layers, all **hardcoded** hex colors, no design token:
  - Base route: `strokeColor="#6C8EF5"` (blue), `strokeWidth={16}`
  - Direction chevrons: `Ionicons` colored `#1F2937`
  - Turn highlights: `strokeColor="#F4C430"` (yellow), `strokeWidth={16}`
- **[src/components/map/Map.web.tsx:216-225](../src/components/map/Map.web.tsx#L216-L225)**
  — single layer, **hardcoded**: `strokeColor: '#FE5035'` (this *is* the
  accent orange, but hardcoded, not `colors.accent`), `strokeWeight: 4`,
  `strokeOpacity: 0.8`.

Native and web are already inconsistent: native's base route is blue
(`#6C8EF5`), web's is accent-orange (`#FE5035`). Neither reads from
`src/constants/theme.ts`.

---

## 2. Car / vehicle marker (passenger live tracking)

- Rendered via **[src/components/map/markers/AnimatedVehicleMarker.tsx](../src/components/map/markers/AnimatedVehicleMarker.tsx)**,
  wrapping a Reanimated-animated `react-native-maps` `Marker`
  (`AnimatedMapMarker` from
  [src/components/map/markers/animatedMarker.ts](../src/components/map/markers/animatedMarker.ts)).
- The icon itself is **[src/components/map/markers/CarMarker.tsx](../src/components/map/markers/CarMarker.tsx)**
  — a static, memoized top-down SVG (not a PNG/image asset), colored by
  `variant` via `VEHICLE_MARKER_COLORS` (economy `#FE5035`, comfort
  `#4F7DFF`, premium `#222222`, offline `#BDBDBD`), or an explicit `color`
  override prop.
- Used in
  **[src/components/map/Map.native.tsx:307-325](../src/components/map/Map.native.tsx#L307-L325)**
  for both the single `driverLocation` marker and the `vehicles[]` array
  (nearby transporters).
- **Web** ([src/components/map/Map.web.tsx:156-171](../src/components/map/Map.web.tsx#L156-L171))
  uses a totally different approach — an inline SVG "kite" path via Google's
  `Marker` `icon`, hardcoded `fillColor: '#4285F4'` (Google Blue), unrelated
  to `CarMarker` / `VEHICLE_MARKER_COLORS`.
- **Position/rotation updates:** the `useAnimatedMarker` hook drives the
  native `coordinate` / `rotation` props on the UI thread via Reanimated,
  interpolating between GPS fixes for smooth gliding plus shortest-path
  rotation. The SVG itself never re-renders (`tracksViewChanges={false}`) —
  only the native marker's position/rotation animate.

---

## 3. Existing color tokens for "vibrant orange"

In **[src/constants/theme.ts:18](../src/constants/theme.ts#L18)** and mirrored
in **[tailwind.config.js:18-21](../tailwind.config.js#L18-L21)**:

- `colors.accent` = `#FE5035` (with `accentLight` `#FF7A64`, `accentDark`
  `#D9412A`) — this is 2Go's brand CTA/highlight orange, already used as the
  accent-orange throughout the app (buttons, destination pin, economy
  vehicle variant, web polyline).

This is the obvious candidate to reuse rather than inventing a new token —
it already does double duty as "destination marker" and "economy car" color
and is the brand's orange. No separate "route orange" or "vibrant orange"
token exists yet.

---

## 4. Blast radius — screens/components sharing this styling

Screens rendering `<Map>` with `showRoute` / `routeCoordinates` (affected by
a polyline color/width change) or a `driverLocation` / `vehicles` marker
(affected by a car marker change):

| Screen | Polyline? | Car marker? |
|---|---|---|
| [app/(customer)/trip.tsx](../app/(customer)/trip.tsx) — passenger live tracking | No (`showRoute` not passed) | Yes — `driverLocation` / `driverHeading` |
| [src/features/passenger/PassengerHome.tsx](../src/features/passenger/PassengerHome.tsx) | Yes, conditionally | Yes (nearby `vehicles`) |
| [app/(driver)/trip.tsx](../app/(driver)/trip.tsx) — driver active trip | Yes | Yes (own vehicle) |
| [app/(driver)/navigation.tsx](../app/(driver)/navigation.tsx) — driver → pickup | Yes | Yes |
| [app/ride/[id].tsx](../app/ride/[id].tsx) | No — still the static SVG map per AGENTS.md known gaps, unaffected | No |

Because `Map.native.tsx` / `Map.web.tsx` are the single shared implementation
(per AGENTS.md, this native/web split must stay intact), **any polyline or
car-marker color/width change made there propagates to all four live screens
at once** — there's no per-screen override today.

Note the pre-existing native/web inconsistency (blue vs. orange polyline,
SVG-car vs. kite-icon car) means a "make it consistent orange" change would
need to touch both files to actually unify behavior, not just one.

No other components duplicate this styling — `CarMarker` /
`VEHICLE_MARKER_COLORS` and the `Polyline` blocks each exist in exactly one
place per platform.

---

## Open decisions before implementing

1. Reuse `colors.accent` (`#FE5035`) for the polyline, or add a new
   dedicated token (e.g. `colors.route`)?
2. Should native's base-route color/width be brought in line with web's, or
   vice versa?
3. Should the web driver marker (Google "kite" icon, `#4285F4`) be replaced
   with the same `CarMarker` SVG treatment used on native, for visual
   parity?
