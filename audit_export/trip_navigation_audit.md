# Trip Navigation Audit

Read-only audit. No code was modified.

---

## 1. Ride Action Slider

File: `src/components/ui/RideActionSlider.tsx`

Outer container (line 80):

```tsx
<View className="relative w-full h-14 bg-primary rounded-full justify-center overflow-hidden shadow-sm" style={{ opacity: disabled ? 0.6 : 1 }}>
```

- **Track/container background:** `bg-primary` (NativeWind token — resolves to the app's `primary` color, `#26344F` per `src/constants/theme.ts`). Not `#FE5035` (accent/orange) as the reference screenshots' red slider might suggest — the component itself renders a dark navy track.
- **Thumb circle color:** `bg-white` — the thumb (line 97) is `className="absolute left-1 w-12 h-12 bg-white rounded-full items-center justify-center shadow-md z-10"`. Icon inside the thumb is `#FE5035` (arrow-forward) or `#10B981` (checkmark, on completion) or a loading spinner tinted `#FE5035`.
- **Progress fill color:** `bg-accent/20` (line 88) — a 20%-opacity accent-orange overlay (`className="absolute left-0 top-0 bottom-0 bg-accent/20"`), animated via `translateX.value + THUMB_SIZE + PADDING`.
- **Container height:** `h-14` → **56px** (also hardcoded as `CONTAINER_HEIGHT = 56` at line 21, used to derive `THUMB_SIZE = 56 - 4*2 = 48`).
- **Exact className/style on outer container:**
  - `className="relative w-full h-14 bg-primary rounded-full justify-center overflow-hidden shadow-sm"`
  - `style={{ opacity: disabled ? 0.6 : 1 }}`

Note: the reference screenshots show a solid red/orange slider ("SLIDE TO COMPLETE TRIP" pill). The actual component currently renders a navy (`bg-primary`) track with an orange-tinted fill and orange icon accents, not a solid red pill — there is a visual mismatch between the mockups and the current implementation if a red track was intended.

---

## 2. Navigation Arrow + Speed Overlay

File: `app/(driver)/trip.tsx`

Both overlays are rendered as direct children of the screen's outermost `<View className="flex-1 bg-background">` (lines 295–520) — **siblings of**, not descendants of, the full-screen map layer `<View className="absolute inset-0"><Map .../></View>` (lines 296–314). So both are **outside** the map layer, stacked on top of it in normal render order.

- **NavigationArrow** — lines 316–327:
  ```tsx
  <View pointerEvents="none" style={{ position: 'absolute', bottom: 180, alignSelf: 'center', zIndex: 10 }}>
    <NavigationArrow size={56} rotation={driverHeading} />
  </View>
  ```
  `zIndex: 10`, fixed `bottom: 180`.

- **Speed + speed-limit overlay** — lines 345–401:
  ```tsx
  <View pointerEvents="none" style={{ position: 'absolute', left: 16, bottom: 200, zIndex: 10 }}>
    ...speed circle (bottom: 200 container)...
    ...speed-limit pill...
  </View>
  ```
  `zIndex: 10`, fixed `bottom: 200`.

- **Card-height awareness: none.** Both overlays use hardcoded `bottom` offsets (180 / 200) computed once, at author time, against the *collapsed* card's approximate height. Neither reads `isExpanded`, subscribes to the card's layout (`onLayout`), nor derives its `bottom` from `insets.bottom` or measured card height. The bottom card (lines 404–519) is a separate absolutely-positioned element (`position: 'absolute', bottom: 0, left: 0, right: 0`) that grows substantially when `isExpanded` is `true` (adds passenger row + pickup/dropoff rows + fare pill, roughly 200–250px of extra height). Because the arrow and speed overlays don't react to `isExpanded`, expanding the card will visually overlap or sit behind the taller expanded card — there is no dynamic repositioning logic tying these three elements together today.
  - The compass button overlay (lines 329–343) has the same characteristic (fixed `top: 160`), though it's anchored from the top so it isn't affected by the card's height.

---

## 3. Navigate Tab Navigation Engine

File: `app/(tabs)/navigate.tsx`

- **Navigation engine:** Google Maps Directions REST API via `getDirections()` (`@/lib/google/mapsApi`), rendered through the shared `<Map>` component (`react-native-maps` + `PROVIDER_GOOGLE` on native). Route is fetched once per start/destination pair (`calculateRoute()`, lines 148–172) and re-fit to bounds with `fitToCoordinates`.
- **Road snapping:** Not done directly in `navigate.tsx`. It's delegated to the `<Map>` component: `Map.native.tsx` calls `useRoadSnappedVehicle(driverLocation, driverHeading, routeCoordinates)` internally (line 142 of `Map.native.tsx`) to snap the rendered driver marker onto the route polyline and derive a road-consistent heading. `navigate.tsx` itself only passes raw `driverLocation`/`driverHeading` through as props — it doesn't call the snapping hook itself.
- **Turn-by-turn:** Maintains `navigationSteps: DirectionStep[]` and `activeStepIndex` in local state. A `useEffect` (lines 176–199) computes live distance-to-maneuver via `calculateDistanceMeters()` against `navigationSteps[activeStepIndex].endLocation`, and advances `activeStepIndex` once the driver comes within 30m of the current step's end. The "Next Turn" HUD card (lines 458–482) renders `stripHtml(navigationSteps[activeStepIndex].instruction)`, the maneuver icon (`getManeuverIconName`, `@/lib/maneuverIcon`), and the live distance via `formatManeuverDistance()`.
- **Heading-up camera:** Inside the `watchPositionAsync` callback (lines 99–124). While `isNavigating && isAutoFollow`, it calls `mapRef.current.animateCamera(...)` with `heading: cameraHeading, pitch: NAV_CAMERA_PITCH (45), altitude: NAV_CAMERA_ALTITUDE (500), zoom: NAV_CAMERA_ZOOM (17)`. `cameraHeading` prefers the raw GPS `coords.heading`, but falls back to a bearing computed via `calculateBearing(coords, nextStepEnd)` (`@/lib/routeSnapping`) whenever the GPS heading is null or under 1° (i.e. stationary/low-speed, where GPS heading is unreliable). A separate effect (`handleStartNavigation`, lines 251–276) also seeds an initial camera heading from the route polyline itself (`calculateBearing(routeCoordinates[0], routeCoordinates[1])`) so the map doesn't wait for the first real GPS fix to orient correctly.
- **Location/road-snapping hooks used directly in this file:** `useTurnPreview` (`@/hooks/useTurnPreview`) for the pulse animation + escalating color on the turn-distance readout. GPS tracking itself is raw `ExpoLocation.watchPositionAsync`, not a shared hook. Road snapping (`useRoadSnappedVehicle`) is consumed indirectly through `<Map>`, not imported here.
- **Extraction potential:** The GPS-watch + heading-up-camera-follow block (lines 72–139) and the TBT step-advance block (lines 176–199) are near-duplicates of logic that exists in `app/(driver)/navigation.tsx` (per the comment at line 18, "matched to app/(driver)/navigation.tsx") and, partially, in `app/(driver)/trip.tsx` (see §4). This is a strong candidate to extract into a shared hook (e.g. `useTurnByTurnNavigation({ driverLocation, routeSteps, isNavigating, isAutoFollow, mapRef })` returning `{ activeStepIndex, distanceToManeuverMeters, cameraHeading }`), since the same maneuver-advance and camera-heading-fallback logic is currently hand-copied across at least two/three screens.

---

## 4. Navigation in trip.tsx

File: `app/(driver)/trip.tsx`

- **Turn-by-turn navigation:** No. `trip.tsx` fetches a route (`getDirections`, lines 161–176) purely to draw the polyline (`routeCoordinates`) and compute a rough ETA (`eta={...} min ETA`, derived from straight-line `distance * 2`, line 310) — it never requests or stores `DirectionStep[]`, has no `activeStepIndex`, and renders no "next turn" HUD.
- **Road snapping:** Not directly. `trip.tsx` passes raw `driverLocation`/`driverHeading` into `<Map>` (lines 298–313); any snapping happens inside `Map.native.tsx` via `useRoadSnappedVehicle`, same as `navigate.tsx` — but only for the marker `<Map>` itself renders internally (and `trip.tsx` doesn't use `navigationArrowMode`, so `Map.native.tsx` renders the top-down car marker via `AnimatedVehicleMarker`, not `NavigationArrowMarker`; the on-screen `NavigationArrow` overlay in `trip.tsx` is a separate, unsnapped, screen-fixed element driven straight off raw `driverHeading` state).
- **Route steps:** No — `getDirections()`'s returned `steps` field is discarded; only `.coordinates` is kept (line 171: `setRouteCoordinates(route.coordinates)`).
- **Navigation-related hooks currently used:** `useDriverTelemetryPing` (`@/hooks`, line 52) — pings the backend with location/heading for realtime customer tracking, not used for on-screen navigation UI. That's the only imported hook in this category; GPS tracking is raw `Location.watchPositionAsync` (lines 128–145), and camera-follow (lines 197–211) is hand-rolled inline (fixed `pitch: 45, altitude: 500, zoom: 17`, heading from raw `driverHeading` state with no bearing-fallback for low-speed/stationary cases, unlike `navigate.tsx`'s `calculateBearing` fallback).

---

## 5. Shared Navigation Hooks

Folder: `src/hooks/`

Every hook file present:
- `useAnimatedMarker.ts` — exported via barrel (`src/hooks/index.ts`)
- `useCurrentLocation.ts` — exported via barrel
- `useDriverTelemetryPing.ts` — exported via barrel
- `useSnappedLocation.ts` — **not** exported via barrel; imported directly by consumers
- `useRoadSnappedVehicle.ts` — **not** exported via barrel; imported directly (`@/hooks/useRoadSnappedVehicle`)
- `useTurnPreview.ts` — **not** exported via barrel; imported directly (`@/hooks/useTurnPreview`)
- `useNotificationTapNavigation.ts` — not exported via barrel
- `use-color-scheme.ts` / `use-color-scheme.web.ts` / `use-theme-color.ts` — theming, unrelated to navigation

Navigation-related: `useRoadSnappedVehicle`, `useSnappedLocation`, `useTurnPreview`.

`src/hooks/index.ts` (full contents):
```ts
export { useAnimatedMarker } from './useAnimatedMarker';
export type { AnimatedMarkerCoordinate, UseAnimatedMarkerOptions } from './useAnimatedMarker';
export { useCurrentLocation } from './useCurrentLocation';
export { useDriverTelemetryPing } from './useDriverTelemetryPing';
```
(Note: the three navigation hooks below are real and working, they're just not re-exported from the barrel — every consumer reaches them via their direct file path.)

`src/hooks/useRoadSnappedVehicle.ts` (full contents):
```ts
import { calculateDistanceMeters } from '@/lib/distance';
import { calculateBearing, snapToPath, type LatLng } from '@/lib/routeSnapping';
import { useRef } from 'react';

export interface RoadSnappedVehicle {
  position: LatLng;
  heading: number;
}

/**
 * Minimum movement (meters) between fixes required to trust a
 * position-derived bearing. Below this, GPS jitter dominates the direction,
 * so the previously derived heading is kept instead of letting the marker
 * flicker in place.
 */
const MIN_BEARING_DISTANCE_METERS = 2;

/**
 * Snaps a live vehicle fix onto the active route polyline — instead of the
 * raw GPS point, which can drift off-road — and derives its heading from
 * consecutive snapped positions rather than trusting the device's raw
 * compass heading, which is frequently noisy, stale, or simply absent.
 *
 * Falls back to the raw coordinate/heading when no route is available yet
 * (e.g. before Directions has returned), so callers can pass this straight
 * through to `AnimatedVehicleMarker` unconditionally.
 */
export function useRoadSnappedVehicle(
  rawLocation: LatLng | undefined,
  rawHeading: number | undefined,
  routeCoordinates: LatLng[]
): RoadSnappedVehicle | null {
  const previous = useRef<{ position: LatLng; heading: number } | null>(null);

  if (!rawLocation) {
    previous.current = null;
    return null;
  }

  const snapped = snapToPath(rawLocation, routeCoordinates);
  const position = snapped?.position ?? rawLocation;

  let heading: number;
  if (previous.current) {
    const moved = calculateDistanceMeters(
      previous.current.position.latitude,
      previous.current.position.longitude,
      position.latitude,
      position.longitude
    );
    heading = moved >= MIN_BEARING_DISTANCE_METERS
      ? calculateBearing(previous.current.position, position)
      : previous.current.heading;
  } else {
    // First fix: prefer the road's own direction over a raw heading value,
    // which is frequently 0/stale before the device has a compass fix.
    heading = snapped?.segmentBearing ?? rawHeading ?? 0;
  }

  previous.current = { position, heading };
  return { position, heading };
}
```

`src/hooks/useSnappedLocation.ts` (full contents):
```ts
import { getHex9 } from '@/core/spatialEngine';
import { nearestRoad } from '@/lib/google';
import type { Location } from '@/types';
import { useEffect, useState } from 'react';
import { useCurrentLocation } from './useCurrentLocation';

/**
 * Hook that provides a road-snapped version of the user's current location
 * Optimized for display on maps to ensure marker sits on actual roads
 */
export function useSnappedLocation(enabled: boolean = true) {
    const { location: rawLocation, loading, error, ...rest } = useCurrentLocation();
    const [snappedLocation, setSnappedLocation] = useState<Location | null>(null);
    const [isSnapping, setIsSnapping] = useState(false);

    useEffect(() => {
        if (!rawLocation) {
            setSnappedLocation(null);
            return;
        }

        if (!enabled) {
            setSnappedLocation(rawLocation);
            return;
        }

        async function performSnapping() {
            if (!rawLocation) return;
            setIsSnapping(true);
            try {
                const snapped = await nearestRoad({
                    latitude: rawLocation.latitude,
                    longitude: rawLocation.longitude
                });
                if (snapped) {
                    // Recalculate hex9 for the snapped coordinates
                    const hex9 = getHex9(snapped.latitude, snapped.longitude);

                    setSnappedLocation({
                        latitude: snapped.latitude,
                        longitude: snapped.longitude,
                        address: rawLocation.address,
                        hex9,
                    });
                } else {
                    setSnappedLocation(rawLocation);
                }
            } catch (err) {
                console.error('Failed to snap location to road:', err);
                setSnappedLocation(rawLocation);
            } finally {
                setIsSnapping(false);
            }
        }

        performSnapping();
    }, [rawLocation, enabled]);

    return {
        location: snappedLocation,
        rawLocation,
        loading: loading || isSnapping,
        error,
        ...rest,
    };
}
```

**Are these already used in `navigate.tsx`?**
- `useRoadSnappedVehicle` — used **indirectly**: `navigate.tsx` renders `<Map navigationArrowMode={isNavigating} .../>`, and `Map.native.tsx` calls `useRoadSnappedVehicle` internally to snap/derive heading for whichever marker it renders (`NavigationArrowMarker` when `navigationArrowMode` is true, `AnimatedVehicleMarker` otherwise). `navigate.tsx` never imports or calls the hook itself.
- `useSnappedLocation` — **not used** in `navigate.tsx`. It's currently only consumed by `src/features/passenger/PassengerHome.tsx` (customer side, snapping the customer's own pickup pin onto the nearest road via the Google Roads API). `navigate.tsx` and `trip.tsx` both track the driver's own GPS via raw `ExpoLocation`/`Location.watchPositionAsync`, not this hook.
- `useTurnPreview` — used **directly** in `navigate.tsx` (line 5, `import { useTurnPreview } from '@/hooks/useTurnPreview'`; called at line 313) for the turn-pulse animation and distance-color escalation. Not used anywhere in `trip.tsx`.

**Extraction opportunity:** `useRoadSnappedVehicle` and `useTurnPreview` are already reasonably well-factored as standalone hooks (just not barrel-exported). The gap is one level up: the orchestration logic that *uses* them — GPS watch + heading-up camera follow + TBT step-advance — is duplicated ad hoc between `navigate.tsx` and (a simpler, non-TBT version of) `trip.tsx`, and per the comment in `navigate.tsx:18`, again in `app/(driver)/navigation.tsx`. Consolidating that orchestration into one hook (e.g. `useTurnByTurnNavigation`) would let `trip.tsx` gain TBT support (route steps, active-step advance, heading-up camera with the same low-speed bearing fallback) without re-deriving the logic a third time.

---

## Summary of Notable Gaps

1. Speed/arrow/compass overlays in `trip.tsx` use hardcoded pixel offsets with zero awareness of the bottom card's expanded/collapsed state — expanding the card will overlap them.
2. `RideActionSlider`'s actual track color is navy (`bg-primary`), not the solid red/orange shown in the reference mockups — worth confirming whether the mockup or the component is the source of truth.
3. `trip.tsx` has no turn-by-turn capability at all (no steps, no active-step tracking, no next-turn HUD) despite sharing the same `<Map>` component and GPS-tracking pattern as `navigate.tsx`, which does.
4. Three navigation-relevant hooks (`useRoadSnappedVehicle`, `useSnappedLocation`, `useTurnPreview`) exist but aren't re-exported from `src/hooks/index.ts`; every consumer imports them by direct file path.
5. The GPS-watch + heading-up-camera + TBT-advance orchestration is duplicated across `navigate.tsx`, `app/(driver)/navigation.tsx`, and (partially) `trip.tsx` rather than living in one shared hook.
