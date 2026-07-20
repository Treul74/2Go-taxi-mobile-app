import { useAnimatedMarker, type AnimatedMarkerCoordinate } from '@/hooks/useAnimatedMarker';
import { normalizeHeading } from '@/lib/mapAnimation';
import React, { useMemo, useRef } from 'react';
import { AnimatedMapMarker, CENTER_ANCHOR } from './animatedMarker';
import { CarMarker, DEFAULT_VEHICLE_MARKER_SIZE, type VehicleMarkerVariant } from './CarMarker';

export interface AnimatedVehicleMarkerProps {
  /** Latest GPS fix for the vehicle. */
  coordinate: AnimatedMarkerCoordinate;
  /** Latest compass heading in degrees (0 = north). */
  heading?: number;
  /** Ride tier deciding the car body color. Ignored when `color` is set. */
  variant?: VehicleMarkerVariant;
  /** Explicit body color override. */
  color?: string;
  /** Icon size in px. */
  size?: number;
  /** Marker stacking order on the map. */
  zIndex?: number;
}

/**
 * Uber/Lyft-style animated vehicle marker.
 *
 * Position and heading updates are animated on the UI thread by
 * `useAnimatedMarker` (linear interpolation between GPS fixes, shortest-path
 * rotation), so the marker glides instead of jumping.
 *
 * Rendering notes for `tracksViewChanges={false}`:
 * - The CarMarker SVG is static and memoized — it is rasterized once by the
 *   map and never re-rendered, which is what makes 200+ vehicles cheap.
 * - Rotation therefore cannot be applied by transforming the SVG view (the
 *   rasterized child would never repaint). Instead the marker's native
 *   `rotation` prop is animated; with `CENTER_ANCHOR` and the CarMarker's
 *   centered viewBox the icon rotates around its exact center, natively.
 */
function VehicleMarker({
  coordinate,
  heading = 0,
  variant = 'economy',
  color,
  size = DEFAULT_VEHICLE_MARKER_SIZE,
  zIndex,
}: AnimatedVehicleMarkerProps) {
  const { animatedProps } = useAnimatedMarker({ coordinate, heading });

  // Frozen at mount: after the first render, Reanimated owns the native
  // coordinate/rotation props. Keeping the React-managed values stable stops
  // reconciliation from ever snapping the marker back to a stale position.
  const initialCoordinate = useRef(coordinate).current;
  const initialRotation = useRef(normalizeHeading(heading)).current;

  // Stable element: coordinate/heading updates re-render this wrapper, but the
  // SVG element identity only changes when its appearance actually changes,
  // so React skips reconciling it entirely — key for 200+ vehicle fleets.
  const carIcon = useMemo(
    () => <CarMarker variant={variant} color={color} size={size} />,
    [variant, color, size]
  );

  if (!AnimatedMapMarker) {
    // react-native-maps unavailable (Expo Go) — Map already shows MapPlaceholder.
    return null;
  }

  return (
    <AnimatedMapMarker
      animatedProps={animatedProps}
      coordinate={initialCoordinate}
      rotation={initialRotation}
      anchor={CENTER_ANCHOR}
      flat={true}
      tracksViewChanges={false}
      zIndex={zIndex}
    >
      {carIcon}
    </AnimatedMapMarker>
  );
}

/**
 * Value-compare props so parents can pass inline `coordinate` objects (fresh
 * identity every render) without re-rendering every marker in a fleet.
 */
function arePropsEqual(
  prev: AnimatedVehicleMarkerProps,
  next: AnimatedVehicleMarkerProps
): boolean {
  return (
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.heading === next.heading &&
    prev.variant === next.variant &&
    prev.color === next.color &&
    prev.size === next.size &&
    prev.zIndex === next.zIndex
  );
}

export const AnimatedVehicleMarker = React.memo(VehicleMarker, arePropsEqual);
