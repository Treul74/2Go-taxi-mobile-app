import { Map } from '@/components/map/Map';
import type { MapProps } from '@/components/map/Map';
import { formatManeuverDistance } from '@/lib/distance';
import {
  attachMap,
  detachMap,
  setViewportSize,
  type CameraControllerMapHandle,
} from '@/navigation/NavigationEngine/CameraController';
import {
  useActiveRoute,
  useDriverLocation,
  useHeading,
  useNavigationMode,
  usePickupDestination,
} from '@/navigation/NavigationEngine/NavigationHooks';
import { NavigationMode } from '@/navigation/NavigationEngine/NavigationModes';
import type { LatLng } from '@/navigation/NavigationEngine/types';
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

export interface NavigationMapProps {
  mapType?: MapProps['mapType'];
  /** Rendered in an absolute-fill layer on top of the map — e.g. `NavigationHUD`, `NavigationBottomCard`, `NavigationArrivalCard`. */
  children?: React.ReactNode;
}

/** `NavigationState.pickup`/`destination` are plain coordinates (no address) — `Map`'s props want its `Location` shape, so this fills the required field with an empty string rather than a fake address. */
function toMapLocation(point: LatLng): NonNullable<MapProps['pickup']> {
  return { latitude: point.latitude, longitude: point.longitude, address: '' };
}

/**
 * The engine's map component (Bible: `<NavigationMap mode="pickup" />` —
 * "screens simply say ... and the engine does everything"). Every prop a
 * navigation screen would otherwise have to plumb through by hand (pickup,
 * destination, driver position/heading, route polyline, whether to show
 * the car marker or the turn-by-turn arrow) is instead read straight from
 * `NavigationStore` — a screen just renders `<NavigationMap />`.
 *
 * Reuses the existing `Map` component (`src/components/map/`) rather than
 * mounting `react-native-maps`/`@react-google-maps/api` a second time —
 * that component already owns marker/polyline/H3-grid rendering across
 * both platforms (AGENTS.md: "Keep the Map.native.tsx / Map.web.tsx /
 * Map.tsx split"). `disableInternalCamera` is passed so `Map`'s own
 * built-in camera-follow/auto-fit effects stand down — `CameraController`
 * is the only thing that moves the camera from here on, wired via
 * `attachMap`/`detachMap`/`setViewportSize` (see `CameraController.ts`'s
 * own TODO note, which named this component as its integration point).
 *
 * No business logic: every prop passed to `Map` is either read directly
 * from a `NavigationHooks` selector or a pure type/shape adapter between
 * `NavigationState`'s vocabulary and `Map`'s existing prop shape (e.g.
 * `toMapLocation`, the `routeSteps` mapping below) — no decisions are made
 * here that the engine hasn't already made.
 */
export function NavigationMap({ mapType, children }: NavigationMapProps) {
  const mapRef = useRef<{ animateCamera?: CameraControllerMapHandle['animateCamera'] } | null>(null);

  const mode = useNavigationMode();
  const { pickup, destination } = usePickupDestination();
  const driverLocation = useDriverLocation();
  const heading = useHeading();
  const route = useActiveRoute();

  useEffect(() => {
    attachMap({
      // `Map.web.tsx` doesn't forward an `animateCamera` method (no
      // react-native-maps equivalent exists there) — guarded so
      // CameraController's calls are a safe no-op on web instead of a
      // crash, leaving `Map`'s own web camera behaviour as today's
      // fallback rather than this component requiring a web rewrite.
      animateCamera: (camera, options) => {
        mapRef.current?.animateCamera?.(camera, options);
      },
    });
    return () => detachMap();
  }, []);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewportSize({ width, height });
  };

  const navigationArrowMode =
    mode === NavigationMode.DRIVER_TO_PICKUP || mode === NavigationMode.TRIP_IN_PROGRESS;

  const routeSteps = useMemo<MapProps['routeSteps']>(() => {
    if (!route) return undefined;
    return route.steps.map((step) => ({
      instruction: step.instruction,
      distance: { text: formatManeuverDistance(step.distanceMeters), value: step.distanceMeters },
      duration: { text: `${Math.round(step.durationSeconds / 60)} min`, value: step.durationSeconds },
      startLocation: step.startLocation,
      endLocation: step.endLocation,
      maneuver: step.maneuver,
    }));
  }, [route]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      <Map
        ref={mapRef}
        pickup={pickup ? toMapLocation(pickup) : undefined}
        destination={destination ? toMapLocation(destination) : undefined}
        driverLocation={driverLocation ?? undefined}
        driverHeading={heading ?? 0}
        showRoute={!!route}
        routeCoordinates={route?.path ?? []}
        routeSteps={routeSteps}
        navigationArrowMode={navigationArrowMode}
        mapType={mapType}
        autoFollowDriver={false}
        disableInternalCamera
        // `Map`'s own zoom +/- buttons drive the camera directly via its
        // ref, bypassing CameraController — never requested here (Phase 6B:
        // "CameraController must be the ONLY camera owner"). CameraController
        // has no manual zoom-override action today (see
        // NavigationControls.tsx's doc comment); a future pass can add a
        // `NavigationControls` zoom button wired through it instead.
      />
      {children && <View style={StyleSheet.absoluteFill}>{children}</View>}
    </View>
  );
}
