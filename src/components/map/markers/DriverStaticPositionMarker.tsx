import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import NavigationArrow from '@/assets/svg/NavigationArrow';
import { colors } from '@/constants/theme';
import { useAnimatedMarker, type AnimatedMarkerCoordinate } from '@/hooks/useAnimatedMarker';
import { AnimatedMapMarker, CENTER_ANCHOR } from './animatedMarker';
import { useHeading } from '@/navigation/NavigationEngine/NavigationHooks';

export interface DriverStaticPositionMarkerProps {
  coordinate: AnimatedMarkerCoordinate;
  zIndex?: number;
}

/**
 * A static position indicator for the driver's own map.
 * Replaces the animated top-down car with a simple blue navigation arrow inside a solid blue circle.
 * It uses useAnimatedMarker for position interpolation only (rotation is locked to 0).
 */
export function DriverStaticPositionMarker({
  coordinate,
  zIndex,
}: DriverStaticPositionMarkerProps) {
  const heading = useHeading() ?? 0;

  // We use useAnimatedMarker for position interpolation only (heading is hardcoded to 0).
  const { animatedProps } = useAnimatedMarker({ coordinate, heading: 0 });

  // Freeze coordinate identity after mount so Reanimated can own it natively
  const initialCoordinate = useRef(coordinate).current;

  if (!AnimatedMapMarker) {
    return null;
  }

  return (
    <AnimatedMapMarker
      animatedProps={animatedProps}
      coordinate={initialCoordinate}
      anchor={CENTER_ANCHOR}
      flat={true}
      tracksViewChanges={true}
      zIndex={zIndex}
    >
      <View style={styles.circle}>
        <View style={styles.arrowContainer}>
           <NavigationArrow size={18} rotation={heading} variant="white" />
        </View>
      </View>
    </AnimatedMapMarker>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: colors.white,
  },
  arrowContainer: {
    // Slight offset to visually center the triangle since its center of mass is different from bounding box center
    transform: [{ translateY: -1 }],
  }
});
