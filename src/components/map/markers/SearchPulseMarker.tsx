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

/** Matches colors.accent in src/constants/theme.ts. */
const SEARCH_PULSE_COLOR = '#FE5035';

const SOLID_DIAMETER = 130;
const CENTER_DOT_DIAMETER = 26;
const CENTER_BORDER_WIDTH = 4;
/** How far the outer halo expands beyond the solid circle over one pulse cycle. */
const HALO_MAX_SCALE = 1.35;
const HALO_MAX_OPACITY = 0.35;
const CONTAINER_SIZE = SOLID_DIAMETER * HALO_MAX_SCALE;

/**
 * Large pulsing accent circle marking the pickup pin while the app searches
 * for a driver (Screen 1 of the matching flow). Purely visual — position is
 * handled by the parent Marker.
 */
export const SearchPulseMarker = React.memo(function SearchPulseMarker() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
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
      <View style={styles.solid} />
      <View style={styles.centerDot} />
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
    width: SOLID_DIAMETER,
    height: SOLID_DIAMETER,
    borderRadius: SOLID_DIAMETER / 2,
    backgroundColor: SEARCH_PULSE_COLOR,
  },
  solid: {
    position: 'absolute',
    width: SOLID_DIAMETER,
    height: SOLID_DIAMETER,
    borderRadius: SOLID_DIAMETER / 2,
    backgroundColor: SEARCH_PULSE_COLOR,
  },
  centerDot: {
    width: CENTER_DOT_DIAMETER,
    height: CENTER_DOT_DIAMETER,
    borderRadius: CENTER_DOT_DIAMETER / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: CENTER_BORDER_WIDTH,
    borderColor: SEARCH_PULSE_COLOR,
  },
});
