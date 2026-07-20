import type { ComponentType } from 'react';
import type { MapMarkerProps } from 'react-native-maps';
import Animated from 'react-native-reanimated';
import type { AnimatedProps } from 'react-native-reanimated';

/**
 * A react-native-maps Marker wrapped with Reanimated so `useAnimatedMarker`
 * can drive its native `coordinate` / `rotation` props from the UI thread.
 */
export type AnimatedMapMarkerComponent = ComponentType<AnimatedProps<MapMarkerProps>>;

/** Center anchor shared by all animated markers so rotation pivots exactly on the icon center. */
export const CENTER_ANCHOR = { x: 0.5, y: 0.5 } as const;

let animatedMarker: AnimatedMapMarkerComponent | null = null;

// Same guarded require as Map.native.tsx: in Expo Go the native module is
// missing and the Map component renders MapPlaceholder instead, so these
// markers simply render nothing.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require('react-native-maps');
  animatedMarker = Animated.createAnimatedComponent(
    maps.Marker
  ) as AnimatedMapMarkerComponent;
} catch {
  animatedMarker = null;
}

export const AnimatedMapMarker = animatedMarker;
