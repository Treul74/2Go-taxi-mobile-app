import { colors } from '@/constants/theme';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** Distance (meters) at which the upcoming turn starts drawing attention. */
export const TURN_PULSE_TRIGGER_METERS = 150;
/** Distance (meters) at which the "in" text turns amber. */
export const TURN_AMBER_THRESHOLD_METERS = 50;
/** Distance (meters) at which the "in" text turns red. */
export const TURN_RED_THRESHOLD_METERS = 20;

/**
 * Drives the "next turn" icon pulse (scale up/down, looping) once the driver
 * is within `TURN_PULSE_TRIGGER_METERS` of the upcoming maneuver, and stops
 * cleanly (resetting to scale 1) once they pass it or the distance is
 * unknown.
 */
export function useTurnPreviewPulse(distanceMeters: number | null) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const shouldPulse = distanceMeters !== null && distanceMeters <= TURN_PULSE_TRIGGER_METERS;

  useEffect(() => {
    if (shouldPulse) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.3,
            duration: 450,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 450,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loopRef.current = loop;
      loop.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
      pulseScale.setValue(1);
    }

    return () => {
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [shouldPulse, pulseScale]);

  return pulseScale;
}

/**
 * Escalating color for the "in <distance>" text as the driver nears the next
 * maneuver: default primary color -> amber at 50m -> red at 20m.
 */
export function turnDistanceColor(distanceMeters: number | null): string {
  if (distanceMeters === null) return colors.primary;
  if (distanceMeters <= TURN_RED_THRESHOLD_METERS) return colors.error;
  if (distanceMeters <= TURN_AMBER_THRESHOLD_METERS) return colors.warning;
  return colors.primary;
}

/** Convenience hook bundling the pulse animation and the color for one render. */
export function useTurnPreview(distanceMeters: number | null) {
  const pulseScale = useTurnPreviewPulse(distanceMeters);
  const color = useMemo(() => turnDistanceColor(distanceMeters), [distanceMeters]);
  return { pulseScale, color };
}
