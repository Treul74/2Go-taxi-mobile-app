import {
  computeMarkerFrame,
  retargetMarkerTransition,
  startMarkerTransition,
  type MarkerAnimationState,
  type MarkerProfile,
  type MarkerTransition,
} from '@/navigation/NavigationEngine/MarkerAnimator';
import type { LatLng } from '@/navigation/NavigationEngine/types';
import { useEffect, useRef, useState } from 'react';

export interface UseAnimatedMarkerWebOptions {
  /** Latest raw coordinate for the marker (e.g. a GPS fix), or `null` before one exists yet (e.g. GPS not acquired). */
  coordinate: LatLng | null;
  /** Latest heading in degrees (0 = north), or `null`/omitted for markers that never rotate. */
  heading?: number | null;
  /** Timing profile — whether this marker kind tracks heading at all, and how long each timeline takes. See `MarkerAnimator`'s `DRIVER_MARKER_PROFILE`/`CUSTOMER_MARKER_PROFILE`/`NAVIGATION_ARROW_PROFILE`. */
  profile: MarkerProfile;
}

export interface AnimatedMarkerWebFrame {
  /** `null` until the first real `coordinate` arrives — callers should skip rendering the marker while this is `null` rather than falling back to a placeholder point (avoids animating in from an arbitrary origin once a real fix finally arrives). */
  position: LatLng | null;
  heading: number | null;
}

/**
 * `requestAnimationFrame`-driven twin of `useAnimatedMarker` for renderers
 * with no Reanimated-worklet equivalent — `Map.web.tsx`'s
 * `@react-google-maps/api` markers, which take plain DOM-updating React
 * state rather than a UI-thread shared value. This is exactly the "second
 * renderer" `MarkerAnimator.ts`'s own header names as the reason that file
 * exists ("what a *second* renderer... would drive with
 * `requestAnimationFrame` instead of `withTiming`") — this hook is that
 * consumer, driving `MarkerAnimator`'s pure position/heading interpolation
 * math on a RAF loop instead of re-deriving any of it here.
 *
 * Same behavior contract as `useAnimatedMarker`: every coordinate update
 * interpolates from wherever the marker is *right now* (never snaps to the
 * new fix), heading always takes the shortest arc, and a fresh fix arriving
 * mid-animation retargets from the current in-flight frame — matching
 * `MarkerAnimator.retargetMarkerTransition`'s own documented behavior,
 * itself modeled on `useAnimatedMarker`'s `withTiming` retarget semantics so
 * the two renderers never visually disagree about what "smooth" means.
 */
export function useAnimatedMarkerWeb({ coordinate, heading = null, profile }: UseAnimatedMarkerWebOptions): AnimatedMarkerWebFrame {
  const transitionRef = useRef<MarkerTransition | null>(null);
  const rafRef = useRef<number | null>(null);
  const [frame, setFrame] = useState<AnimatedMarkerWebFrame>({ position: coordinate, heading });

  useEffect(() => {
    // No real fix yet — don't start a transition toward a placeholder
    // point; wait for the first real coordinate so it can be rendered
    // immediately, in place, with no animated "flight in" from an
    // arbitrary origin.
    if (!coordinate) return;

    const nowMs = Date.now();
    const target: MarkerAnimationState = { position: coordinate, heading, timestampMs: nowMs };

    // First-ever fix: no prior state to animate from — start a transition
    // "from itself" (mirrors useAnimatedMarker's shared value initializing
    // directly to the first coordinate) rather than a special-cased instant
    // path, so both renderers share the exact same transition machinery.
    transitionRef.current = transitionRef.current
      ? retargetMarkerTransition(transitionRef.current, target, profile, nowMs)
      : startMarkerTransition(target, target, profile, nowMs);

    if (rafRef.current === null) {
      const tick = () => {
        const transition = transitionRef.current;
        if (!transition) {
          rafRef.current = null;
          return;
        }
        const frameNowMs = Date.now();
        const nextFrame = computeMarkerFrame(transition, frameNowMs);
        setFrame({ position: nextFrame.position, heading: nextFrame.heading });
        if (nextFrame.isComplete) {
          rafRef.current = null;
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile is a stable module-level constant (DRIVER_MARKER_PROFILE etc.), not expected to change identity per render
  }, [coordinate?.latitude, coordinate?.longitude, heading]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return frame;
}
