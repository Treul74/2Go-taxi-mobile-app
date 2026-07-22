import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PILL_TEXT_COLOR = '#26344F';
const POINTER_SIZE = 6;

export interface ArrivalTimeMarkerProps {
  /** Formatted time, e.g. "10:59 PM" */
  arrivalTime: string;
}

/**
 * White speech-bubble pill shown at the destination coordinate in place of
 * the default red pin, reading "arrive at HH:MM". Purely visual — position
 * is handled by the parent Marker (anchored so the pointer tip sits on the
 * destination coordinate).
 */
export const ArrivalTimeMarker = React.memo(function ArrivalTimeMarker({ arrivalTime }: ArrivalTimeMarkerProps) {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>arrive at {arrivalTime}</Text>
      </View>
      <View style={styles.pointer} />
    </View>
  );
});

// StyleSheet (not NativeWind) on purpose: these views render inside a
// react-native-maps Marker, where className styling is unreliable.
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: PILL_TEXT_COLOR,
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: POINTER_SIZE,
    borderRightWidth: POINTER_SIZE,
    borderTopWidth: POINTER_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    marginTop: -1,
  },
});
