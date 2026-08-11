# Phase 8A — Global Navigation Engine Compliance Audit

**Date:** 2026-08-07
**Type:** Read-only architecture compliance audit. No code modified, no refactor, no migration.
**Read first:** `AGENTS.md` (including "🔒 Protected Features (Regression Protection)"), `2GO Navigation Engine Bible.md`, `src/navigation/NavigationEngine/Architecture.md`.

## Methodology and a correction to the source docs

Two prior audits already exist and were read as a baseline before this pass touched any code:
`audit_export/audit_04-08-26_23-50_phase7-final-report-7a-to-7f.md` (2026-08-04) and
`audit_export/audit_05-08-26_09-52_navigation-engine-phase-coverage-audit.md` (2026-08-05, the most
recent prior compliance audit). Both are excellent and most of their findings still hold. **One does
not:** the 08-05 audit's headline finding was "`app/(driver)/trip.tsx` bypasses the engine entirely."
Git history shows a commit since then — `03ac631 implemented and fixed driver pickup start` — and a
direct, full read of the current `app/(driver)/trip.tsx` in this pass confirms **that finding is now
stale**: `trip.tsx` has been migrated onto the engine (`NavigationMap`, `useNavigation()`,
`NavigationHooks`, HUD components — detailed below). This is a genuine, verified improvement since
08-05, not an error in that audit — the code changed under it. `src/navigation/NavigationEngine/
Architecture.md` itself is also stale in the same direction: it still narrates Phase 3.5 (GPS-only)
as current and describes camera/route/HUD work as "not yet implemented," when Phase 7A-7F (per the
04-08 report) already built all of it. Treat `Architecture.md`'s prose as a historical log, not a
live status document — its SOLID/file-ownership tables remain accurate, its "current state" framing
does not.

This pass **directly read, in full**, every driver screen (`navigation.tsx`, `trip.tsx`,
`trip-summary.tsx`, `DriverDashboard.tsx`), every passenger/customer screen and component that
touches a map or GPS (`PassengerHome.tsx`, `RidePlannerSheet.tsx`, `MapPickerModal.native.tsx`,
`MatchingOverlay.tsx`, `ActiveTripCard.tsx`, `app/(customer)/trip.tsx`), the dev-tool screen
(`app/(tabs)/navigate.tsx`), and the engine's own integration surface (`NavigationProvider.tsx`,
`NavigationMap.tsx`, `useNavigation.ts`, `CameraController.ts`, `RouteEngine.ts`), plus repo-wide
greps for every legacy pattern named in the brief. For `AutoFitEngine.ts`, `MarkerAnimator.ts`,
`GPSManager.ts`'s internals, `NavigationStore.ts`'s internals, `CameraAnimation.ts`, and
`NavigationMath.ts`, this pass did not re-read every line — it cross-checked their public API against
every call site found live in the files above (all matched exactly what the 08-05 audit documented,
and nothing in the git log since then touches those files), so their status below is carried forward
from the 08-05 audit rather than independently re-verified line-by-line. This is stated plainly so the
one genuinely re-verified change (trip.tsx) isn't confused with the larger set of carried-forward
findings.

---

# 1. Global Navigation Architecture Diagram

```
                              ┌─────────────────────────────┐
                              │   app/_layout.tsx (root)     │
                              │  mounts <NavigationProvider> │
                              │        exactly once          │
                              └───────────────┬───────────────┘
                                              │
                     ┌────────────────────────┼─────────────────────────┐
                     │                        │                         │
                     ▼                        ▼                         ▼
           GPSManager.onFix()      GPSManager.onStatusChange()   navigationEventBus
           (the ONE GPS watcher)                                  (MODE_CHANGED /
                     │                        │                  TRANSITION_REJECTED)
                     ▼                        ▼
        RouteProgressTracker      NavigationStore.setGpsStatus
        (applyGpsFixWithProgress,
         checkAndReroute → RouteEngine)
                     │
                     ▼
        ┌───────────────────────────── NavigationStore (Zustand) ─────────────────────────────┐
        │ mode · cameraState · route · driverLocation · heading · speed · pickup · destination │
        │ etaSeconds · distanceRemainingMeters · currentStep · gpsState · followMode · ...      │
        └───────────────┬───────────────────────────────┬───────────────────┬─────────────────┘
                         │                               │                   │
                         ▼                               ▼                   ▼
              CameraController.ts                NavigationHooks.ts     useNavigation.ts
              (subscribes to store,               (granular selectors    (NavigationActions:
               owns the ONE animateCamera          for UI components)     preview/requestMatch/
               call, via AutoFitEngine +                                  driverToPickup/
               CameraAnimation + NavigationMath)                          arrivedAtPickup/...)
                         │                               │                   │
                         ▼                               ▼                   ▼
              attachMap() / detachMap()          NavigationHUD, NavigationTurnBanner,   Screens call
              (called by NavigationMap)          NavigationSpeedWidget, NavigationCompass,  navigation.X()
                         │                        NavigationControls, NavigationArrivalTime, — never touch
                         ▼                        NavigationRoadName, NavigationLaneGuidance, the store or
              <NavigationMap /> component         NavigationVoiceToggle                      camera directly
              wraps <Map> with                          │
              disableInternalCamera                     ▼
                         │                    Mounted only by:
                         ▼                    app/(driver)/navigation.tsx
              src/components/map/Map.*        app/(driver)/trip.tsx
              (react-native-maps /             ────────────────────────
              @react-google-maps/api)          NOT mounted anywhere else.

═══════════════════════════════ ENGINE BOUNDARY — screens below this line do not cross it ═══

  app/(driver)/navigation.tsx  ──▶ FULLY WIRED (NavigationMap, useNavigation, NavigationHooks,
  app/(driver)/trip.tsx        ──▶ HUD components, RouteEngine.fetchRoute → NavigationStore.setRoute)

  src/features/driver/DriverDashboard.tsx  ──▶ PARTIAL: dispatches navigation.preview/requestMatch/
                                                driverToPickup/goOnline/goOffline (mode machine only);
                                                its own map is raw <Map> + manual animateToRegion
                                                (IDLE/OFFLINE — outside any CameraProfile, by design)

  app/(tabs)/navigate.tsx (dev/testing tool)  ──▶ LEGACY BY DESIGN: raw <Map>, local state,
                                                   direct animateCamera/fitToCoordinates, RouteEngine.
                                                   fetchRoute called directly (not via NavigationStore)

  app/(customer)/trip.tsx (Customer live      ──▶ FULLY LEGACY: raw <Map autoFollowDriver>, zero
  trip tracking — the Bible's own "most           NavigationEngine imports of any kind. Driver
  important mode," Customer-side)                 position comes from rideStore's realtime channel,
                                                    never touches NavigationStore/CameraController/
                                                    AutoFitEngine/MarkerAnimator.

  src/features/passenger/PassengerHome.tsx    ──▶ FULLY LEGACY: raw <Map>, GPSManager used correctly
  src/features/passenger/components/              for one-shot "my location" reads, but camera/route/
  RidePlannerSheet.tsx, MapPickerModal.*           mode machine never touched. RidePlannerSheet calls
                                                    RouteEngine.fetchRoute() directly for its own local
                                                    preview state — never NavigationStore.setRoute().
```

**Reading this diagram:** the engine itself (top block) is real, complete, and internally consistent —
one GPS watcher, one camera owner, one route owner, one store. The problem is not the engine; it's
that only **two of the app's roughly six map-bearing screens** are wired into it. Every other
screen with a map runs its own, older, parallel implementation next to (not through) the engine.

---

# 2. Navigation Ownership Matrix

| Screen | GPS | Camera | Route | Navigation Mode | Verdict |
|---|---|---|---|---|---|
| `app/(driver)/navigation.tsx` | `GPSManager.acquire`, reads `useDriverLocation()`/`useHeading()` | `<NavigationMap/>` → `CameraController` | `fetchRoute()` → `NavigationStore.setRoute()` | `useNavigation()` (`driverToPickup`, `arrivedAtPickup`, `startTrip`) | **Fully Migrated** |
| `app/(driver)/trip.tsx` | `GPSManager.acquire` + a second `onFix` listener for fare-distance accumulation only (business logic, not a second GPS subscription — reuses `GPSManager`'s existing bus) | `<NavigationMap/>` → `CameraController` | `fetchRoute()` → `NavigationStore.setRoute()` | `useNavigation()` (`startTrip`, `arrivedAtDropoff`, `completeTrip`) | **Fully Migrated** *(new since the 08-05 audit — see correction note above)* |
| `app/(driver)/trip-summary.tsx` | none | none | none | none | **N/A** — post-trip receipt screen, no map, correctly has no engine dependency |
| `src/features/driver/DriverDashboard.tsx` | `GPSManager.acquire('foreground','driverBestNavigation')` | Raw `<Map>` + direct `mapRef.current.animateToRegion(...)` (line ~84) for a "follow me while idle" recenter | none | `useNavigation()` for `goOnline`/`goOffline`/`preview`/`requestMatch`/`driverToPickup` (dispatched synthetically on Accept, to satisfy the state machine's legal-edge requirements before landing on `DRIVER_TO_PICKUP` — see §4) | **Mixed** |
| `app/(tabs)/navigate.tsx` (dev/testing tool) | `GPSManager.acquire` (correct) | Raw `<Map>`, direct `mapRef.current.animateCamera(...)` and `.fitToCoordinates(...)` | `fetchRoute()` called directly, result kept in local `useState`, never written to `NavigationStore` | none — no mode transitions dispatched | **Legacy Navigation** *(sanctioned exception — see §6)* |
| `src/features/passenger/PassengerHome.tsx` | `GPSManager.getCurrentFix('passengerBalanced')` one-shot reads (correct) | Raw `<Map>`, direct `mapRef.current.animateToRegion(...)` for a "my location" recenter | none directly (consumes `rideStore`'s route data, set elsewhere) | none | **Legacy Navigation** |
| `src/features/passenger/components/RidePlannerSheet.tsx` | none | none (no map of its own) | `fetchRoute()` called directly, result kept in local component/`rideStore` state, never `NavigationStore.setRoute()` | none — `IDLE`/`PREVIEW` is never entered on this device | **Mixed** — routing goes through the sanctioned engine module, but not through the store/mode machine |
| `src/features/passenger/components/MapPickerModal.native.tsx` | `GPSManager.getCurrentFix('passengerBalanced')` one-shot (correct) | Raw map ref, direct `animateToRegion(...)` for "go to current location" | none | none | **Legacy Navigation** (small, contained — a location-picker modal, not a trip-navigation screen) |
| `app/(customer)/trip.tsx` (Customer live trip tracking) | N/A — driver position arrives over `rideStore`'s realtime channel, not local GPS | Raw `<Map autoFollowDriver>` — `Map`'s own internal camera-follow, `disableInternalCamera` never set | none (`activeTrip.estimatedArrival` is server-populated) | none — zero imports from `NavigationEngine` anywhere in the file | **Fully Legacy** |
| `app/rating/driver.tsx`, `app/rating/[id].tsx`, `app/ride/[id].tsx` (static SVG per AGENTS.md's own Known Gaps), Activity/Wallet/Messages/Account tabs | — | — | — | — | **N/A** — no map/navigation surface; correctly out of scope |

**Legend used above, per the brief's own four buckets:** Fully Migrated = every listed responsibility
goes through the engine. Mixed = some responsibilities do, some don't, on the same screen. Legacy
Navigation = the screen owns its own camera/GPS/route end-to-end. N/A = no navigation surface exists
on the screen to classify.

---

# 3. Remaining Legacy Navigation — ranked by migration priority

1. **`app/(customer)/trip.tsx` — Customer live trip tracking. HIGHEST PRIORITY.**
   This is the Customer-side twin of `app/(driver)/trip.tsx` — the screen a Customer is actually
   looking at during "the most important mode" the Bible names. It has **zero** `NavigationEngine`
   imports. It renders a raw `<Map autoFollowDriver>` (the exact prop `NavigationMap` was built to
   turn off via `disableInternalCamera`), gets driver position from `rideStore`'s realtime channel
   (correct data source — it's a different phone's GPS, not local), but never routes that position
   through `NavigationStore.driverLocation`, `MarkerAnimator`, or `CameraController`. Every one of
   Phase 7's camera-damping/marker-interpolation/auto-fit improvements is invisible on this screen.
   This is now the single largest compliance gap in the app — larger than the (now-closed)
   `trip.tsx` gap the 08-05 audit flagged, because it affects the Customer, not just the Transporter.

2. **`src/features/passenger/PassengerHome.tsx` and `RidePlannerSheet.tsx` — the Customer's entire
   booking/preview flow never enters the state machine.**
   `DriverDashboard.handleAcceptRequest` has to synthetically replay `navigation.preview()` →
   `navigation.requestMatch()` → `navigation.driverToPickup()` in one `safeTransition` block, with a
   comment explaining it's reusing "the same edges a Customer's own booking flow *would*" use — the
   comment's own phrasing concedes the Customer's flow doesn't actually use them. `RidePlannerSheet`
   does call `RouteEngine.fetchRoute()` (correct module), but keeps the result in local/`rideStore`
   state rather than `NavigationStore.setRoute()`, so `PREVIEW` mode's auto-fit camera behavior
   (`fitPreview` — pickup + destination + route, north-up, per the Bible) has a fully-built
   implementation in `CameraController.ts` that no Customer-facing screen has ever triggered.

3. **`app/(tabs)/navigate.tsx` — the dev/testing navigation tool.**
   Direct `animateCamera`/`fitToCoordinates` calls, own `RouteEngine.fetchRoute()` call whose result
   never reaches `NavigationStore`, own local `isNavigating`/`driverLocation`/`routeCoordinates`
   state. **This one is a sanctioned exception, not a violation** — AGENTS.md's own folder-structure
   comment marks it "dev/testing navigation tool, kept intentionally," and the 08-04/08-05 audits
   both confirmed no phase ever targeted it. Listed here for completeness of the legacy-code
   inventory, not as a recommendation to migrate it.

4. **`DriverDashboard.tsx`, `PassengerHome.tsx`, `MapPickerModal.native.tsx` — three isolated
   `animateToRegion` calls, all "recenter to my location" on a screen with no active trip.**
   Each is a single, self-contained camera call on a screen in `IDLE`/`OFFLINE` mode (or no mode
   context at all, in the modal's case) — `CameraController`'s own `CAMERA_PROFILES` table has "no
   camera opinion" for `IDLE`/`OFFLINE` by explicit design, so these don't fight the engine for
   ownership of an active trip. They are, however, literal instances of the exact call AGENTS.md's
   Camera Rules and the Bible's Core Principles both name as forbidden ("Screens must never call:
   animateCamera()... animateToRegion()..."), with no carve-out written down anywhere for "recenter
   button on an idle home map." Lowest priority of the four — small, contained, low risk — but the
   rule as written doesn't actually exempt them, so worth a documented decision either way rather
   than silent tolerance.

**Not legacy — confirmed clean by repo-wide grep, not just spot-checked:**
- **GPS**: `Location.watchPositionAsync`/`getCurrentPositionAsync`/`startLocationUpdatesAsync` —
  found in exactly four files, all engine-legitimate: `GPSManager.ts` itself, `NavigationProvider.tsx`
  (subscribes to `GPSManager`, doesn't call `expo-location`), `useNavigation.ts` (a comment naming the
  banned call, not a call site), and `useCurrentLocation.ts` (confirmed by direct read: imports
  `GPSManager`, calls `GPSManager.acquire`/`onFix`/`getCurrentFix`, only imports the `Location`
  namespace for its `PermissionStatus` enum and `reverseGeocodeAsync`, neither of which is a
  subscription). Zero remaining direct subscriptions outside `GPSManager.ts`.
- **Routing**: `getDirections`/`getAllRoutes` (the raw Google wrapper) — found only inside
  `RouteEngine.ts` and `mapsApi.ts`/its own type/index files. Every screen-level route fetch in the
  app (`navigation.tsx`, `trip.tsx`, `navigate.tsx`, `RidePlannerSheet.tsx`) goes through
  `RouteEngine.fetchRoute()`, never the raw wrapper directly. (`RouteEngine.ts`'s own file-header
  comment claims `RidePlannerSheet.tsx`/`LocationSearchModal.tsx`/`rideStore.ts`/
  `LocationAutocomplete.tsx` still call `getDirections` directly — that comment is now **stale
  documentation**, not a live gap; the grep found no such call in any of those four files today.)
- **Bearing/polyline math**: no duplicate implementation found anywhere outside the engine and the
  pre-existing shared libraries it explicitly reuses (`src/lib/mapAnimation.ts`'s
  `normalizeHeading`/`shortestRotation`, `src/lib/routeSnapping.ts`'s `snapToPath`, both cited by name
  in `CameraController.ts`'s/`RouteEngine.ts`'s own doc comments as intentional reuse, not
  duplication).

---

# 4. Duplicate Ownership Report

**No duplicate GPS, Camera, or Route ownership was found.** Every screen that touches GPS goes
through `GPSManager` (acquire/release or one-shot reads); every screen that fetches a route goes
through `RouteEngine.fetchRoute()`; the two screens that actively drive a camera during navigation
(`navigation.tsx`, `trip.tsx`) both do so exclusively through `CameraController` via `NavigationMap`.

The closest thing to a duplicate-ownership finding is **not duplication of the engine's logic, but
duplication of its *state*** — three legacy screens each keep their own local copy of data
`NavigationStore` already owns, without ever reading from or writing to it:

| File | Function | Reason | Migration recommendation |
|---|---|---|---|
| `app/(tabs)/navigate.tsx` | Module-level `useState` for `routeCoordinates`, `navigationSteps`, `isNavigating`, `driverLocation`, `driverHeading` | Predates the engine; explicitly out of scope per AGENTS.md | None — leave as-is per its sanctioned "kept intentionally" status |
| `src/features/passenger/components/RidePlannerSheet.tsx` | Local component state (and `rideStore.setRouteData`) holding the `fetchRoute()` result | Predates the engine; Customer flow never enters the mode machine (§3.2) | When the Customer flow is eventually migrated, this becomes the natural point to call `NavigationStore.setRoute()` / `navigation.preview()` instead of a parallel local copy |
| `app/(customer)/trip.tsx` | Reads `activeTrip.driverLocation`/`driverHeading` from `rideStore` directly into `<Map>` props | Predates the engine; this is genuinely a *different* data source (network-delivered, not local GPS) so it can't simply call `GPSManager`, but nothing forwards it into `NavigationStore.driverLocation`/`customerLocation` either | The natural fix is for this screen's realtime-channel handler to also call `useNavigationStore.getState().setDriverLocation(...)` (or an equivalent action) alongside its existing `rideStore` write, then switch to `<NavigationMap/>` |

None of these three constitute two systems *fighting* for ownership of the same live camera or GPS
subscription (the failure mode the Bible/AGENTS.md actually warn about) — they're parallel,
non-conflicting copies that simply never got connected. Still worth naming precisely, since "no
duplicate ownership" and "fully single-sourced" are not the same claim.

One second-order item, carried forward from the 08-05 audit and re-confirmed by this pass's own read
of `CameraController.ts`/`RouteEngine.ts`: `NavigationStore.customerLocation` (the field that exists
specifically so a Customer device's own position can feed the engine — `types.ts`,
`MarkerAnimator.PASSENGER_MARKER_PROFILE`) has **no producer anywhere in the codebase**. This isn't a
duplicate-ownership problem (nothing writes a second, competing value) — it's an unused field. Fixing
`app/(customer)/trip.tsx` (item 1 above) is also the natural place to finally give it one.

---

# 5. Driver Navigation Screen Audit — `app/(driver)/navigation.tsx`

**Is this now fully powered by the Navigation Engine? Yes.**

- Renders `<NavigationMap/>` as its only map layer (line 292) — no raw `<Map>`, no manual props for
  driver position/route/camera.
- `driverLocation`, `heading`, `route`, `navigationEnabled` are all read via `NavigationHooks`
  selectors (`useDriverLocation`, `useHeading`, `useActiveRoute`, `useNavigationEnabled`) — the
  screen's own comment (line 51-54) explicitly notes it "no longer keeps its own copy" of anything
  `NavigationProvider`/`calculateRoute` already publish to the store.
- GPS is `GPSManager.acquire('foreground', 'driverBestNavigation')` / `release()` only — no raw
  `expo-location` call, no second subscription; the fix itself is consumed by `NavigationProvider`
  at the app root, not by this screen mirroring it into local state.
- Route: `fetchRoute()` (RouteEngine) → `useNavigationStore.getState().setRoute(fetchedRoute)` — the
  fetched route becomes store data immediately, not a local variable the screen renders from
  directly.
- Mode transitions: every state change (`driverToPickup`, `arrivedAtPickup`, `startTrip`) goes
  through `useNavigation()` action calls, wrapped in `safeTransition` (never a raw store mutation).
- Camera: `navigation.followDriver()` requests `FOLLOW_DRIVER` intent once on mount; `setChrome(...)`
  reports real turn-banner/bottom-card heights into `CameraController`'s chrome model via two
  `onLayout` handlers — this screen never calls `animateCamera` itself.
- HUD: mounts `NavigationTurnBanner`, `NavigationLaneGuidance`, `NavigationRoadName`,
  `NavigationArrivalTime`, `NavigationCompass`, `NavigationControls`, `NavigationSpeedWidget`,
  `NavigationVoiceToggle` — all engine components, none reimplemented locally.

**Does it still own any legacy navigation logic? One narrow item, not really "legacy":** it keeps a
`driverStore.updateLocation(...)` bridge (lines 94-98) that writes the engine's live
`driverLocation` back into `driverStore`'s *persisted* position (used for H3 hex/matching/order
records) — explicitly documented, in both this file and `Architecture.md`, as intentional: the two
stores have different jobs (`NavigationStore` = live camera runtime, `driverStore` = persisted
business state), and this is the one sanctioned bridge point between them, not a second GPS or camera
owner. Not a compliance gap.

---

# 6. Driver Trip Screen Audit — `app/(driver)/trip.tsx`

**Has it been fully migrated? Yes — as of the commit since the 08-05 audit.** Point-by-point,
compared against `navigation.tsx`:

| Aspect | `navigation.tsx` | `trip.tsx` | Same pattern? |
|---|---|---|---|
| Map | `<NavigationMap/>` | `<NavigationMap/>` | Yes |
| GPS | `GPSManager.acquire`/`release`, reads via `NavigationHooks` | Same, plus a second `GPSManager.onFix` listener | Same acquisition pattern; the extra listener is explained below |
| Route | `fetchRoute()` → `setRoute()` | `fetchRoute()` → `setRoute()` | Yes, identical pattern |
| Mode | `useNavigation()` + `safeTransition` | `useNavigation()` + `safeTransition` | Yes |
| Camera | `navigation.followDriver()` on mount | `navigation.followDriver()` on mount | Yes |
| HUD | Full set (8 components) | `NavigationTurnBanner`, `NavigationLaneGuidance`, `NavigationRoadName`, `NavigationArrivalTime`, `NavigationCompass`, `NavigationControls`, `NavigationSpeedWidget` — missing only `NavigationVoiceToggle` | Near-identical; voice toggle omission is cosmetic (voice guidance has no real TTS engine behind it anywhere in the app per the 08-05 audit, so this omission has no functional effect) |

**The one thing preventing this from being a byte-for-byte carbon copy of `navigation.tsx`'s
pattern**, and the reason it's flagged rather than declared perfect: `trip.tsx` keeps a second,
independent `GPSManager.onFix` subscription (lines 172-185) purely to accumulate real GPS-tracked
trip distance for the final fare receipt (`trackGpsPoint`), because `NavigationStore.driverLocation`
is a plain `{lat,lng}` and doesn't carry the accuracy/timestamp `trackGpsPoint`'s glitch-rejection
logic needs. This is correctly documented in the file as "not a second location subscription,
GPSManager remains the sole GPS owner" — and that's accurate, `GPSManager`'s event bus supports
multiple listeners by design. It's flagged here only because Item 8 of `Architecture.md`'s own
Rollout plan already names this exact spot ("migrate `trip.tsx`'s bespoke `trackGpsPoint` fare-distance
filter to read `GPSFix.quality` instead of re-deriving its own accept/reject rule") as a known,
narrower cleanup — still open, not a new finding.

**Everything the 08-05 audit listed as `trip.tsx` violations no longer applies**: it no longer
imports raw `Map` (only `@/components/navigation`'s `NavigationMap`), no longer calls
`mapRef.current.animateCamera` (no `mapRef` for camera purposes exists in the file at all — the two
`animateCamera` mentions the 08-05 audit cited are simply gone), no longer keeps local
`driverLocation`/`routeCoordinates`/`isAutoFollow` state, and now renders the HUD component set. This
is the single most significant change this audit found relative to the last one.

---

# 7. Passenger Navigation Audit

**Verify whether passenger tracking, driver tracking, live trip updates, and map interactions
consume the Navigation Engine: they do not, on every screen checked.**

- **`PassengerHome.tsx`** (Home tab / booking start): raw `<Map>`, `GPSManager` used correctly for
  one-shot "my location" reads (not a subscription — appropriate for a home screen), but one direct
  `animateToRegion` call for the recenter button. No `NavigationStore`/`useNavigation` import at all.
- **`RidePlannerSheet.tsx`** (pickup/destination selection, vehicle picker): calls
  `RouteEngine.fetchRoute()` twice (route preview + optional non-blocking directions fetch) — the
  *module* is correct, but the result never reaches `NavigationStore`, and no `navigation.preview()`/
  `navigation.requestMatch()` is ever dispatched from this device. `PREVIEW`/`MATCHING` modes exist,
  are fully camera-profiled in `CameraController`, and are never entered by a Customer's own phone.
- **`MapPickerModal.native.tsx`** (drag-to-pin address picker, used by both the Customer flow and
  reused by the driver dev-tool `navigate.tsx`): `GPSManager` one-shot read (correct), one direct
  `animateToRegion` for "go to current location."
- **`app/(customer)/trip.tsx`** (live driver tracking during an active trip — the actual "passenger
  tracking, live trip updates" surface the brief asks about by name): **entirely outside the engine**
  — see §3.1, the top-priority finding of this whole audit.
- **`MatchingOverlay.tsx`**, **`ActiveTripCard.tsx`**: pure presentational/overlay components with no
  map or camera ownership of their own (confirmed by direct read — `MatchingOverlay` only opens
  `MapPickerModal`; `ActiveTripCard` takes an `isMapDragging` boolean prop from its parent and touches
  no map API). Correctly out of scope — nothing to migrate here.

**What should migrate into the shared Navigation Engine, in order:**
1. `app/(customer)/trip.tsx` → `<NavigationMap/>`, with the realtime-channel handler also writing
   into `NavigationStore.driverLocation`/`customerLocation` alongside its existing `rideStore` write
   (see §4's table).
2. `RidePlannerSheet.tsx`'s `fetchRoute()` result → `NavigationStore.setRoute()` +
   `navigation.preview(pickup, destination)` once a Customer selects both points, so `PREVIEW` mode's
   already-built auto-fit camera activates on the Customer's own device.
3. The three isolated `animateToRegion` "recenter" calls (§3.4) — lowest priority, smallest surface.

---

# 8. Development / Test Screens

**`app/(tabs)/navigate.tsx`** is the only screen matching this category — a standalone,
point-to-point navigation sandbox, reachable only when `role === 'driver'` (per `app/(tabs)/
_layout.tsx`'s `href` gating), explicitly named in AGENTS.md's own folder-structure comment as
"dev/testing navigation tool, kept intentionally," and explicitly named again in AGENTS.md's Known
Gaps ("Travel mode selector on navigate.tsx is UI-only"). No other file in the app matches "sandbox
map" / "debug screen."

**Does it consume the engine? No — confirmed by direct read.** Raw `<Map>`, `mapRef.current
.animateCamera(...)`/`.fitToCoordinates(...)` calls, `GPSManager` used correctly for GPS (the one
piece of Phase 3.5's migration that *did* reach this screen), `fetchRoute()` called directly with the
result kept in local `useState`, never touching `NavigationStore` or dispatching any mode transition.

**Recommendation: leave it as a testing tool, do not migrate it.** Three reasons, none new to this
audit: (1) AGENTS.md itself marks it intentional, not a gap; (2) both the 08-04 and 08-05 prior audits
independently reached the same conclusion after reading the same file; (3) its entire value as a
sandbox is that it's a standalone point-to-point navigator *not* tied to an active trip's `mode` —
forcing it through the trip-lifecycle state machine (`IDLE → PREVIEW → ... `) would either require
inventing a new mode with no trip behind it, or fighting the state machine's legal-transition table
for a screen that was never meant to represent a real trip. If a future need arises to verify
`CameraController`/`AutoFitEngine` behavior interactively without a real trip, that argues for a
*new*, engine-wired debug screen — not repurposing this one.

---

# 9. 10/10 Navigation Engine Audit — scored against the Bible

| Category | Score | Basis |
|---|---:|---|
| Camera Follow | 9/10 | Fully implemented per the 08-05 audit's detailed function-by-function check (damping, look-ahead, anchor ratio, dynamic zoom/pitch) — re-confirmed live by this pass's own read of `CameraController.ts`. Missing: rotation anticipation (no upcoming-turn bearing bias), unverified on a physical device. |
| AutoFit | 6/10 | The fitting algorithm (`fitPreview`/`fitCompleted`, chrome-aware padding) is complete and correct, confirmed by this pass's read of `CameraController.computeTargetPose`. Scored down hard from the 08-05 audit's implied ~9 for AutoFit-the-algorithm alone, because this audit's own finding is that **no Customer-facing screen ever triggers `PREVIEW`/`MATCHING` mode**, so the auto-fit camera shot the Bible calls "Customer selects pickup and destination... automatically fit" has never actually been seen by a Customer in production. Correct code, unreachable in the one flow it was built for. |
| Navigation Runtime | 8/10 | `NavigationProvider`, `NavigationStore`, the mode state machine (`NavigationModes.ts`'s transition table + `safeTransition`) are all real, working, and correctly the sole source of truth for the two screens that use them. Not higher because two of the app's map screens (customer trip tracking, passenger home/planning) run entirely outside this runtime. |
| Route Engine | 8/10 | Sole owner confirmed by grep (zero direct `getDirections` calls outside `RouteEngine.ts`/`mapsApi.ts`). Caching, progress, rerouting all implemented and wired into `NavigationProvider`. Not higher because two call sites (`navigate.tsx`, `RidePlannerSheet.tsx`) fetch through it correctly but then keep the result in local state rather than `NavigationStore` — the module is singly-owned, the *data* isn't. |
| GPS Engine | 9/10 | Genuinely excellent — confirmed by this pass's own grep, zero remaining direct `expo-location` subscriptions outside `GPSManager.ts`. `applyScenario`/`profileForScenario` (battery optimization) built but never called is the one real gap, carried forward from 08-05. |
| Navigation Store | 8/10 | Full field ownership per the Bible's list plus documented additive fields; the mode machine correctly gates every transition. `customerLocation` has no producer anywhere (§4) — a real, if narrow, gap. |
| Navigation HUD | 7/10 | Every named component exists and works on the two migrated screens. `NavigationBottomCard`/`NavigationArrivalCard` are fully built and rendered by zero screens (both driver screens use bespoke cards instead) — carried forward from 08-05, re-confirmed by this pass's own read of both screens' JSX. |
| Marker Animation | 7/10 (carried forward, not independently re-read this pass) | Native + web both implemented per 08-05's detailed check; `customerLocation`/passenger-marker producer gap (above) means `PASSENGER_MARKER_PROFILE` has nothing to animate today. |
| Passenger Navigation | **2/10** | The lowest score in this audit, and a downgrade from any prior pass's implicit framing. Every passenger-facing map screen this audit read in full — Home, planner, live trip tracking — is unmigrated. `RouteEngine` is used, correctly, for route *data*; nothing else about the engine (camera, mode machine, store, HUD, marker animation) touches the Customer's own device anywhere. The 2, not 0, is for that one correct `RouteEngine` usage. |
| Driver Navigation | 9/10 | Both trip-lifecycle screens (`navigation.tsx`, `trip.tsx`) are now fully migrated — the single biggest positive delta this audit found versus 08-05. `DriverDashboard`'s own map (idle/offline, before a trip) is legacy, but that's arguably correct scope (no `CameraProfile` exists for `IDLE`/`OFFLINE` by design) rather than a driver-navigation gap per se. |
| Shared Reusable Components | 8/10 | `src/components/navigation/` has 13 real components, all functioning where mounted; two (`NavigationBottomCard`, `NavigationArrivalCard`) are unused, not broken. |
| Architecture Consistency | 6/10 | Where the engine is used, it's used exactly as designed (SOLID file ownership holds, per `Architecture.md`'s own table, re-verified against `CameraController.ts`/`RouteEngine.ts` in this pass). The inconsistency isn't internal to the engine — it's that half the app's map screens follow this architecture and half follow a completely different, older one, side by side. |
| Single Source of Truth | 5/10 | True *within* the engine (one GPS watcher, one camera owner, one route owner, one store) — false *across the app*, since three screens (`navigate.tsx`, `RidePlannerSheet.tsx`, `app/(customer)/trip.tsx`) maintain their own parallel truth for data the store already models. |
| Code Reuse | 8/10 | Engine modules consistently reuse pre-existing shared math (`mapAnimation.ts`, `routeSnapping.ts`) rather than reimplementing — confirmed by this pass's own grep finding zero duplicate bearing/polyline implementations anywhere in the app. |
| Scalability | 7/10 | The engine's own design (mode table, camera profile table, event bus) scales cleanly to new modes/actors (the Bible's own "Driver, passenger, and future delivery modules will all share the same Navigation Engine" claim is architecturally true). Scored down because "scalable to a Customer flow" is currently unproven — no Customer flow has ever exercised it. |
| Maintainability | 8/10 | File-by-file single-responsibility ownership (per `Architecture.md`'s SOLID table) makes the engine itself easy to reason about and extend; drags down slightly by `Architecture.md`'s own prose being stale (a maintainability cost for the *next* reader of that doc, distinct from the code's own quality). |

## Overall score: **68/100**

This is not a simple average of the rows above (a raw average would land near 71) — it's weighted down
because **Passenger Navigation's 2/10 is not one gap among many of similar size; it's the single
largest unmet piece of the Bible's stated vision** ("Driver, passenger, and future delivery modules
will all share the same Navigation Engine" — currently true only for Driver). Everything the engine
itself does, it does well. The score reflects that the engine's *reach* across the app it's meant to
serve is roughly half-complete, not that the engine's *quality* is mediocre.

---

# 10. Protected Features Verification

Verified, not modified — every read in this section was a `Read`/`Grep` tool call only:

- **Passenger Ride Lifecycle** — `rideStore.ts` (booking, `activeTrip`, cancellation) — read where
  `app/(customer)/trip.tsx` and `RidePlannerSheet.tsx` consume it; no write path touched.
- **Driver Ride Lifecycle** — `driverStore.ts` (`acceptRequest`, `tripStatus`, `confirmArrival`,
  `beginTrip`, `completeTrip`, `finishTrip`) — read in full via `navigation.tsx`/`trip.tsx`/
  `trip-summary.tsx`'s consumption of it; store internals not opened or edited.
- **Accept Ride** — `DriverDashboard.handleAcceptRequest` (line ~166) — read, not changed. Confirmed
  it correctly calls `acceptRequest()` (business logic) before dispatching the `safeTransition`
  navigation-mode replay — order preserved.
- **Start Pickup / Arrived / Start Trip / Complete Trip** — `navigation.tsx`'s `handleStartPickup`/
  `handleArrived`/`handleStartRide` and `trip.tsx`'s `handleSliderComplete` — read in full, not
  modified. Each still calls its `driverStore` action first and only dispatches the navigation-mode
  transition on success, matching the Locked workflow order in AGENTS.md's Protected Driver Workflow.
- **Rating** — out of scope (no navigation-engine dependency in `app/rating/*`); not opened this pass.
- **Navigation Runtime** (`GPSManager`, `NavigationProvider`, `NavigationStore`, `RouteEngine`,
  `NavigationMap`, `CameraController`, `AutoFitEngine`, `MarkerAnimator`, `NavigationHUD`) — every one
  of these named-protected files that this pass opened was opened with `Read`/`Grep` only. No `Edit`
  or `Write` tool call was made anywhere in this session.

No code was modified in the course of this audit.

---

# 11. Recommended Next Phase

**Migrate `app/(customer)/trip.tsx` onto the Navigation Engine.**

Not `RidePlannerSheet.tsx`, and not a repeat of `trip.tsx`'s already-done migration. Reasoning:

`app/(driver)/trip.tsx`'s migration (confirmed complete by this audit) means the Transporter side of
"the most important mode... exactly like Google Maps, Yango, Uber" is now fully engine-powered. The
Customer sitting in the vehicle, watching the exact same trip on the exact same map, is still on
pre-engine code — raw `<Map autoFollowDriver>`, no camera damping, no engine-owned marker
interpolation, no `NavigationHUD`. This is the single spot in the whole app where the gap between
"what the engine can do" and "what the user actually sees" is most visible and most consequential,
because it's user-facing on the Customer side specifically, not an internal/driver-only surface.

It's also the most template-ready item available: `app/(driver)/trip.tsx`'s just-completed migration
is a working, in-repo reference for almost the identical move — swap `<Map>` for `<NavigationMap/>`,
add the `NavigationStore.driverLocation`/`customerLocation` write into the existing realtime-channel
handler (rather than acquiring GPS — this screen correctly never should), and mount the same HUD
component set `trip.tsx` already mounts. No new engine capability needs to be built — every piece
this migration needs (`NavigationMap`, `CameraController`'s `TRIP_IN_PROGRESS` profile,
`MarkerAnimator`, the HUD components) already exists and already works, verified on the driver side.

This is a bigger lift than migrating `RidePlannerSheet.tsx`'s `PREVIEW` mode (which is one function
call short of done: swap a local `setRouteData` for `NavigationStore.setRoute()` +
`navigation.preview()`), but it's the higher-value target: it closes the Bible's own headline promise
("Driver, passenger... will all share the same Navigation Engine") for the mode where a Customer
actually spends the most time watching a map, not just the one where they spend the least (waiting
for a match).

No implementation was attempted — this is a recommendation only, per the audit's scope.
