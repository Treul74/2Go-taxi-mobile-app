/**
 * Shared animation utilities for map markers.
 *
 * Used by `useAnimatedMarker` (src/hooks/useAnimatedMarker.ts) and the marker
 * components in src/components/map/markers/. Keep all marker timing values
 * here so vehicle and user-location markers stay in sync.
 */

/** Timing configuration for animated map markers. */
export const MARKER_ANIMATION = {
  /** Duration of the linear coordinate interpolation between GPS updates. */
  positionDurationMs: 1800,
  /** Duration of the shortest-path heading rotation. */
  rotationDurationMs: 1800,
  /** Duration of one pulse cycle of the user-location accuracy halo. */
  pulseDurationMs: 2000,
} as const;

/**
 * Normalize any heading (including negative or unwrapped values) into [0, 360).
 */
export function normalizeHeading(heading: number): number {
  'worklet';
  return ((heading % 360) + 360) % 360;
}

/**
 * Return the rotation target that reaches `nextHeading` from `previousHeading`
 * via the shortest arc, e.g. 350° → 10° animates through 360° (+20°) instead
 * of sweeping back through 180° (-340°).
 *
 * `previousHeading` may be an unwrapped animation value (e.g. 370°); the
 * result is expressed on the same unwrapped scale so it can be fed directly
 * to `withTiming` without the marker visually snapping.
 */
export function shortestRotation(previousHeading: number, nextHeading: number): number {
  'worklet';
  const delta = normalizeHeading(nextHeading) - normalizeHeading(previousHeading);
  // Wrap the difference into [-180, 180) so we always take the shortest arc.
  const shortestDelta = ((delta + 540) % 360) - 180;
  return previousHeading + shortestDelta;
}
