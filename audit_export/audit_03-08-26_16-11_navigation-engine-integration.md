# Navigation Engine Integration — Migration Report

**Date:** 2026-08-03
**Scope:** Wire the existing Navigation Engine (`src/navigation/NavigationEngine/`) into the application per `2GO Navigation Engine Bible.md` / `AGENTS.md`'s "Do NOT create new navigation implementations" mandate, eliminating duplicate GPS/Camera/Route/AutoFit/Marker/HUD logic wherever it could be done **without changing UI behaviour or introducing regressions**.
**Method:** Read every navigation-adjacent screen in full (`app/(tabs)/navigate.tsx`, `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`, `RidePlannerSheet.tsx`), cross-referenced against the prior GPS audit (`audit_export/audit_03-08-26_11-58_gps-subscription-audit.md`), then migrated only the piece that could be moved onto the engine with a **provably identical** result — the fetch/decode/cache half of routing. Camera and HUD were investigated in equal depth but deliberately **not** touched this pass; see "Remaining work" for why, in detail.

---

## Summary

| Responsibility (Bible/AGENTS.md) | Status before this pass | Status after this pass |
|---|---|---|
| GPS | Already fully consolidated onto `GPSManager` (Phase 3.5) | Unchanged — verified still zero direct `Location.*` call sites |
| **Routes** (Directions fetch, polyline decode, caching) | 4 screens/components called `getDirections` directly, each keeping its own local route state | **Consolidated** — all 4 now call `RouteEngine.fetchRoute`; zero direct `getDirections` call sites remain outside `mapsApi.ts` (the sanctioned REST wrapper) and `RouteEngine.ts` (the sanctioned engine caller) |
| Markers | Already shared via the one `Map` component (`AnimatedVehicleMarker`/`NavigationArrowMarker`) | Unchanged — no screen has its own marker implementation to eliminate |
| Camera | 3 screens each call `mapRef.current.animateCamera(...)` directly with hand-tuned pitch/zoom/altitude | **Not migrated this pass** — see Remaining work |
| Auto Fit | 1 screen (`navigate.tsx`) calls `fitToCoordinates` directly for its own preview-fit | **Not migrated this pass** — see Remaining work |
| HUD | 3 screens each render their own bespoke turn-banner/speed/compass/bottom-card UI | **Not migrated this pass** — see Remaining work |

---

## Files updated

### Engine (additive only — no behaviour change to existing engine consumers)

- **`src/navigation/NavigationEngine/types.ts`** — added `RouteData.distanceText?`/`durationText?`: the provider's original human-readable strings (e.g. Google's `"5.2 km"`/`"15 mins"`). Needed so migrated screens can show **exactly** the text they showed before, instead of a re-derived approximation from the numeric fields.
- **`src/navigation/NavigationEngine/RouteEngine.ts`** — `toRouteData` now populates the two new fields from the underlying `DirectionResult`.

### Screens/components migrated onto `RouteEngine.fetchRoute`

- **`app/(tabs)/navigate.tsx`** — `calculateRoute()` now calls `fetchRoute` instead of `getDirections`. Local `routeCoordinates`/`navigationSteps`/`routeDistance`/`routeEta` state, the turn-by-turn step-advance effect, the heading-up camera effect, and the `fitToCoordinates` call are **all untouched** — they still consume the exact same shapes they did before, via a small adapter (see below).
- **`app/(driver)/trip.tsx`** — same pattern: the destination-route effect now calls `fetchRoute`; the fare-distance GPS tracker (`trackGpsPoint`), camera effects, and bottom trip card are untouched.
- **`app/(driver)/navigation.tsx`** — same pattern: `calculateRoute()` (pickup route) now calls `fetchRoute`; waiting timer, arrival/start-trip handlers, camera effects, and passenger card are untouched.
- **`src/features/passenger/components/RidePlannerSheet.tsx`** — both call sites (the live route-preview effect, and the fire-and-forget pre-warm call in `handleBookRide`) now call `fetchRoute`; `rideStore.setRouteData(...)` receives the same 5 arguments in the same shapes as before.

**The adapter, applied identically in all three `app/` screens:** `RouteEngine`'s `RouteStep` carries flat numeric fields (`distanceMeters`, `durationSeconds`) instead of Google's `{text, value}` pairs, and its `instruction` is already HTML-stripped (RouteEngine owns "Polyline decoding"-adjacent cleanup; these screens used to strip the HTML themselves at render time — stripping already-plain text is a harmless no-op, so that existing render-time `stripHtml()` call was left in place, not removed). Each screen maps `route.steps` back into the exact `DirectionStep` shape it already used, so the rest of the file — state types, JSX, the `<Map routeSteps={...}>` prop — needed **zero** further changes. `route.distanceText`/`durationText` (falling back to a numeric reformat only in the unreachable case they're absent) replace `route.distance.text`/`route.duration.text` verbatim.

### Everything else in those 4 files (camera, turn-preview UI, waiting timers, fare tracking, passenger cards, auto-follow logic) is byte-for-byte unchanged.

---

## Files removed

**None.** No file was deleted this pass. (Nothing became fully dead code — every migrated file still owns real logic RouteEngine doesn't, and the "Remaining work" section below is exactly the reason no screen's camera/HUD code could yet be safely deleted.)

---

## Duplicate logic eliminated

Before this pass, **4 separate places** called Google Directions directly and each kept its own copy of: request construction, polyline decoding, and step mapping. Per AGENTS.md ("Never duplicate route calculations anywhere else") and the Bible ("Route Engine owns: Google Directions API, Polyline decoding... Never duplicate route calculations anywhere else"), this was the single most concrete, most confidently-fixable violation in the codebase — and it is now fixed:

- `app/(tabs)/navigate.tsx`
- `app/(driver)/navigation.tsx`
- `app/(driver)/trip.tsx`
- `src/features/passenger/components/RidePlannerSheet.tsx`

All four now go through `RouteEngine.fetchRoute`, which itself calls the one sanctioned REST wrapper (`src/lib/google/mapsApi.ts`) — never `fetch()` directly. As a side effect, all four now also benefit from `RouteEngine`'s 5-minute route cache (e.g. `navigate.tsx`/`navigation.tsx` re-fetching the same pickup route on a re-render will now short-circuit instead of hitting the network again) — a strict improvement, not a behaviour change, since the *data* returned is identical either way.

**Not eliminated (confirmed still centralized, nothing to do):** GPS (already exclusively `GPSManager`, re-verified via a fresh repo-wide grep — zero direct `Location.*` call sites outside it) and markers (already exclusively the shared `Map` component's `AnimatedVehicleMarker`/`NavigationArrowMarker`).

---

## Remaining work

This is the honest accounting the task asked for. Three responsibilities are **built** (`CameraController.ts`, `AutoFitEngine.ts`, the `src/components/navigation/` HUD components) but **not yet wired into any screen** — and I did not force that wiring in this pass. Reasoning, so this can be picked up deliberately rather than assumed forgotten:

### Camera (`app/(tabs)/navigate.tsx`, `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`)

All three call `mapRef.current.animateCamera(...)` directly with screen-local hand-tuned values (pitch 45°, zoom 17, altitude 500, plus a bearing-fallback-to-route-bearing trick when GPS heading is unreliable near-stationary). `CameraController.ts` already implements an engine-owned equivalent for the same modes, but its tuning (e.g. `DRIVER_TO_PICKUP` zoom 17.5, `TRIP_IN_PROGRESS` dynamic 45-55° pitch, movement/rotation jitter thresholds, look-ahead projection) is **not numerically identical** to what these three screens do today, and I have no way to run the app on a device/simulator to confirm the motion *feels* the same. Swapping the camera call sites is exactly the kind of change the task's own instructions gate behind "only after confirming feature parity" — since I cannot confirm that here, I left it alone rather than risk the single most safety/UX-sensitive part of the app (a driver actively navigating).

**To finish this:** wire `NavigationMap`/`CameraController` into one of these screens (start with `app/(tabs)/navigate.tsx` — explicitly the lower-stakes "dev/testing" screen per `AGENTS.md`'s folder comment), manually verify the camera motion side-by-side against current behaviour on a device, tune `CameraController`'s `DRIVER_TO_PICKUP`/`TRIP_IN_PROGRESS` profiles to match if needed, then repeat for `navigation.tsx` and `trip.tsx`.

### Auto Fit (`app/(tabs)/navigate.tsx`)

Its `calculateRoute()` still calls `mapRef.current.fitToCoordinates(...)` directly for the pre-navigation route preview. `AutoFitEngine.fitPreview` is the engine equivalent but depends on `CameraController` being wired first (see above) to actually apply the computed pose.

### HUD (all three `app/` screens)

Each renders its own bespoke turn-banner / speed readout / compass button / bottom card — richer and visually different from the new generic `NavigationTurnBanner`/`NavigationSpeedWidget`/`NavigationCompass`/`NavigationBottomCard` (e.g. the driver screens' bottom cards show passenger name/rating/call/chat/fare, which the generic `NavigationBottomCard` deliberately does not — that data isn't `NavigationStore`'s to own). Swapping these for the generic components **would** change what's on screen, directly contradicting "Do not change UI behaviour." Left as-is.

**To finish this:** either extend the generic components with slot props for the driver-specific pieces (passenger card, fare, call/chat), or keep these screens' bespoke cards and only replace their *data sources* (turn instruction, distance-to-maneuver) with engine reads once `RouteEngine` gains per-step remaining-distance (see next item) — the visual design stays, only the plumbing underneath changes.

### Known engine gap surfaced during this pass

`RouteEngine.computeRouteProgress` reports whole-route remaining distance, not distance-remaining-*within-the-current-step*. All three screens' "distance to next turn" countdown is computed locally (`calculateDistanceMeters` to `step.endLocation`) because there's no engine equivalent yet — this was already flagged as a gap when `NavigationTurnBanner.tsx` was built, and still applies here. Not fixed in this pass (out of scope — a `RouteEngine` enhancement, not a migration).

### Screens not investigated this pass

`PassengerHome.tsx`, `DriverDashboard.tsx`, `LocationSearchModal.tsx`, `LocationAutocomplete.tsx`, `MapPickerModal.native.tsx` were not part of this audit. A repo-wide grep confirms none of them call `getDirections` directly (route-fetching was fully covered by the 4 files above); they do use `Map`'s own camera-follow/fit-to-markers behaviour (via the `disableInternalCamera`-gated effects added for `NavigationMap`), which is a different, lower-stakes category (planning/booking screens, not active turn-by-turn navigation) — left out of scope for this pass rather than assumed fine.

---

## Verification performed

- `npx tsc --noEmit` — clean after every individual file edit and at the end of the full pass.
- `npx eslint` on every touched file — 0 errors; warning count identical before/after (`git stash` comparison against the pre-session baseline) confirming no new lint issues were introduced.
- Repo-wide grep for `getDirections(` — confirms exactly 2 remaining matches (`mapsApi.ts`'s definition, `RouteEngine.ts`'s sanctioned call), zero elsewhere.
- Repo-wide grep for GPS APIs (`watchPositionAsync`/`getCurrentPositionAsync`/`startLocationUpdatesAsync`) — confirms still exactly the 2 expected matches (`GPSManager.ts`, and `useCurrentLocation.ts` which itself only calls through `GPSManager`).
- **Not performed (cannot be, in this environment):** running the app on a device/simulator to visually confirm the migrated screens render and navigate identically. The route-fetch migration is reasoned to be data-identical (same underlying REST call, same decode codec, adapter shapes verified against every read site in each file) — but this has not been eyeballed on a running app. Recommend a manual smoke test of all four migrated flows (standalone navigate, driver-to-pickup, active trip, ride planner preview) before merging.
