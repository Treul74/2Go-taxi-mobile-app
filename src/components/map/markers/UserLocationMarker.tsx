import { MARKER_ANIMATION } from '@/lib/mapAnimation';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Google Maps / Uber style location blue. */
export const USER_LOCATION_COLOR = '#4285F4';

const DOT_DIAMETER = 16;
const DOT_BORDER_WIDTH = 3;
/** Resting diameter of the accuracy halo before it scales outward. */
const HALO_BASE_DIAMETER = 24;
/** How far the halo expands over one pulse cycle. */
const HALO_MAX_SCALE = 2.5;
/** Halo opacity at the start of a pulse; it fades to 0 as it expands. */
const HALO_MAX_OPACITY = 0.4;
/** Square container sized to fit the halo at full expansion. */
const CONTAINER_SIZE = HALO_BASE_DIAMETER * HALO_MAX_SCALE;

/**
 * Google Maps / Uber style user-location indicator: a blue dot with a white
 * outline and an infinitely pulsing accuracy halo (scale + opacity, driven by
 * Reanimated on the UI thread). Purely visual — position animation is handled
 * by the parent marker. No heading rotation.
 */
export const UserLocationMarker = React.memo(function UserLocationMarker() {
  // 0 → 1 across one pulse cycle, repeating forever.
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: MARKER_ANIMATION.pulseDurationMs,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (HALO_MAX_SCALE - 1) * pulse.value }],
    opacity: HALO_MAX_OPACITY * (1 - pulse.value),
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.halo, haloStyle]} />
      <View style={styles.dot} />
    </View>
  );
});

// StyleSheet (not NativeWind) on purpose: these views render inside a
// react-native-maps Marker, where className styling is unreliable.
const styles = StyleSheet.create({
  container: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO_BASE_DIAMETER,
    height: HALO_BASE_DIAMETER,
    borderRadius: HALO_BASE_DIAMETER / 2,
    backgroundColor: USER_LOCATION_COLOR,
  },
  dot: {
    width: DOT_DIAMETER,
    height: DOT_DIAMETER,
    borderRadius: DOT_DIAMETER / 2,
    backgroundColor: USER_LOCATION_COLOR,
    borderWidth: DOT_BORDER_WIDTH,
    borderColor: '#FFFFFF',
    // Slight lift so the dot separates from the map like the native indicator
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
});
