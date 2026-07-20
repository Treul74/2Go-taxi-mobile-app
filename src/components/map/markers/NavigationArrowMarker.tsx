import { colors } from '@/constants/theme';
import { useAnimatedMarker, type AnimatedMarkerCoordinate } from '@/hooks/useAnimatedMarker';
import { normalizeHeading } from '@/lib/mapAnimation';
import React, { useMemo, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { AnimatedMapMarker, CENTER_ANCHOR } from './animatedMarker';

export const DEFAULT_NAVIGATION_ARROW_SIZE = 44;

export interface NavigationArrowMarkerProps {
  /** Latest (road-snapped) GPS fix for the navigating driver. */
  coordinate: AnimatedMarkerCoordinate;
  /** Latest heading in degrees (0 = north). Falls back to 0 when unavailable. */
  heading?: number;
  /** Icon size in px. */
  size?: number;
  /** Marker stacking order on the map. */
  zIndex?: number;
}

/**
 * Filled chevron/arrow icon pointing up (north), matching the app's primary
 * color. Rotation is applied by the parent marker, not the SVG itself, so
 * "up" here always means "the heading the marker currently points at".
 */
function ArrowIcon({ size = DEFAULT_NAVIGATION_ARROW_SIZE }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Path
        d="M22 3 L38 40 L22 31 L6 40 Z"
        fill={colors.primary}
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Heading-aware directional arrow for the driver's own position during
 * turn-by-turn navigation (replaces the top-down car marker in that mode).
 *
 * Reuses `useAnimatedMarker` — the same Reanimated-driven, shortest-arc
 * rotation smoothing already powering `AnimatedVehicleMarker` — so the arrow
 * eases between headings instead of snapping, and the native `rotation` prop
 * keeps `tracksViewChanges={false}` cheap.
 */
function NavigationArrow({
  coordinate,
  heading = 0,
  size = DEFAULT_NAVIGATION_ARROW_SIZE,
  zIndex,
}: NavigationArrowMarkerProps) {
  const { animatedProps } = useAnimatedMarker({ coordinate, heading });

  // Frozen at mount — Reanimated owns the native coordinate/rotation props
  // afterwards (see AnimatedVehicleMarker for the full rationale).
  const initialCoordinate = useRef(coordinate).current;
  const initialRotation = useRef(normalizeHeading(heading)).current;

  const arrowIcon = useMemo(() => <ArrowIcon size={size} />, [size]);

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
      {arrowIcon}
    </AnimatedMapMarker>
  );
}

function arePropsEqual(
  prev: NavigationArrowMarkerProps,
  next: NavigationArrowMarkerProps
): boolean {
  return (
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.heading === next.heading &&
    prev.size === next.size &&
    prev.zIndex === next.zIndex
  );
}

export const NavigationArrowMarker = React.memo(NavigationArrow, arePropsEqual);
