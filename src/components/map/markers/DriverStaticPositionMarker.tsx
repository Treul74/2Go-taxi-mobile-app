import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import NavigationArrow from '@/assets/svg/NavigationArrow';
import { useAnimatedMarker, type AnimatedMarkerCoordinate } from '@/hooks/useAnimatedMarker';
import { AnimatedMapMarker, CENTER_ANCHOR } from './animatedMarker';

export interface DriverStaticPositionMarkerProps {
  coordinate: AnimatedMarkerCoordinate;
  zIndex?: number;
}

/**
 * A static position indicator for the driver's own map.
 * Replaces the animated top-down car with a simple blue arrow inside a translucent halo.
 * It uses useAnimatedMarker for position interpolation only (rotation is locked to 0).
 */
export function DriverStaticPositionMarker({
  coordinate,
  zIndex,
}: DriverStaticPositionMarkerProps) {
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
           <NavigationArrow size={18} rotation={0} variant="white" />
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
    backgroundColor: '#2563EB', // solid blue
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  arrowContainer: {
    // Slight offset to visually center the triangle since its center of mass is different from bounding box center
    transform: [{ translateY: -1 }],
  }
});
