import { MARKER_ANIMATION, normalizeHeading, shortestRotation } from '@/lib/mapAnimation';
import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { MapMarkerProps } from 'react-native-maps';

export interface AnimatedMarkerCoordinate {
  latitude: number;
  longitude: number;
}

export interface UseAnimatedMarkerOptions {
  /** Latest raw coordinate for the marker (e.g. a GPS fix). */
  coordinate: AnimatedMarkerCoordinate;
  /**
   * Latest compass heading in degrees (0 = north). Omit for markers that
   * never rotate (e.g. the user-location dot). Whether a marker tracks
   * heading is fixed on first render.
   */
  heading?: number;
  /** Latest camera bearing in degrees. Used to compensate the marker's screen rotation when flat={false}. */
  cameraBearing?: number;
  /** Override for the coordinate interpolation duration. */
  positionDurationMs?: number;
  /** Override for the rotation duration. */
  rotationDurationMs?: number;
}

/**
 * Drives a react-native-maps Marker on the UI thread via Reanimated.
 *
 * Every coordinate update is linearly interpolated from the marker's current
 * (possibly mid-animation) position to the new fix, so markers never jump.
 * If a newer fix arrives before the previous animation completes, `withTiming`
 * retargets from the in-flight value and continues toward the newest position.
 *
 * Heading changes rotate along the shortest arc (350° → 10° passes through
 * 360°, never back through 180°) with cubic easing.
 *
 * The returned `animatedProps` must be spread onto an
 * `Animated.createAnimatedComponent(Marker)` component. Because the native
 * `coordinate` and `rotation` marker props are updated directly, no React
 * re-render happens per animation frame and the marker's child view (the SVG)
 * is never redrawn — safe to combine with `tracksViewChanges={false}`.
 */
export function useAnimatedMarker({
  coordinate,
  heading,
  cameraBearing,
  positionDurationMs = MARKER_ANIMATION.positionDurationMs,
  rotationDurationMs = MARKER_ANIMATION.rotationDurationMs,
}: UseAnimatedMarkerOptions) {
  const latitude = useSharedValue(coordinate.latitude);
  const longitude = useSharedValue(coordinate.longitude);
  const rotation = useSharedValue(normalizeHeading(heading ?? 0));

  // Fixed on first render: toggling heading tracking per instance is not
  // supported because the animated-props worklet shape must stay stable.
  const tracksHeading = useRef(heading !== undefined).current;

  useEffect(() => {
    const timing = { duration: positionDurationMs, easing: Easing.linear };
    latitude.value = withTiming(coordinate.latitude, timing);
    longitude.value = withTiming(coordinate.longitude, timing);
  }, [coordinate.latitude, coordinate.longitude, positionDurationMs, latitude, longitude]);

  useEffect(() => {
    if (!tracksHeading || heading === undefined) return;

    // Retarget from the current (possibly unwrapped) animated angle along the
    // shortest arc, then re-normalize once the rotation settles so the value
    // never grows unbounded across many turns.
    const target = shortestRotation(rotation.value, heading - (cameraBearing ?? 0));
    rotation.value = withTiming(
      target,
      { duration: rotationDurationMs, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        'worklet';
        if (finished) {
          rotation.value = normalizeHeading(rotation.value);
        }
      }
    );
  }, [heading, tracksHeading, rotationDurationMs, rotation, cameraBearing]);

  // Stop in-flight animations when the marker unmounts.
  useEffect(() => {
    return () => {
      cancelAnimation(latitude);
      cancelAnimation(longitude);
      cancelAnimation(rotation);
    };
  }, [latitude, longitude, rotation]);

  const animatedProps = useAnimatedProps<Partial<MapMarkerProps>>(() => {
    if (tracksHeading) {
      return {
        coordinate: { latitude: latitude.value, longitude: longitude.value },
        rotation: rotation.value,
      };
    }
    return {
      coordinate: { latitude: latitude.value, longitude: longitude.value },
    };
  });

  return { animatedProps };
}
