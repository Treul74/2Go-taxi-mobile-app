import { useAnimatedMarker, type AnimatedMarkerCoordinate } from '@/hooks/useAnimatedMarker';
import React, { useRef } from 'react';
import { AnimatedMapMarker, CENTER_ANCHOR } from './animatedMarker';
import { UserLocationMarker } from './UserLocationMarker';

export interface AnimatedUserLocationProps {
  /** Latest GPS fix for the customer's device. */
  coordinate: AnimatedMarkerCoordinate;
  /** Marker stacking order on the map. */
  zIndex?: number;
}

/**
 * Customer location indicator: blue dot with a pulsing accuracy halo that
 * glides between GPS updates (no heading rotation).
 *
 * Unlike vehicle markers, this marker keeps `tracksViewChanges` ON: Google
 * Maps rasterizes marker children, so the infinite halo pulse would freeze on
 * the first frame without view tracking. There is exactly one of these on
 * screen, so the re-rasterization cost stays bounded.
 */
function UserLocation({ coordinate, zIndex }: AnimatedUserLocationProps) {
  const { animatedProps } = useAnimatedMarker({ coordinate });

  // Frozen at mount — Reanimated owns the native coordinate afterwards (see
  // AnimatedVehicleMarker for the full rationale).
  const initialCoordinate = useRef(coordinate).current;

  if (!AnimatedMapMarker) {
    // react-native-maps unavailable (Expo Go) — Map already shows MapPlaceholder.
    return null;
  }

  return (
    <AnimatedMapMarker
      animatedProps={animatedProps}
      coordinate={initialCoordinate}
      anchor={CENTER_ANCHOR}
      flat={false}
      tracksViewChanges={true}
      zIndex={zIndex}
    >
      <UserLocationMarker />
    </AnimatedMapMarker>
  );
}

function arePropsEqual(
  prev: AnimatedUserLocationProps,
  next: AnimatedUserLocationProps
): boolean {
  return (
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.zIndex === next.zIndex
  );
}

export const AnimatedUserLocation = React.memo(UserLocation, arePropsEqual);
