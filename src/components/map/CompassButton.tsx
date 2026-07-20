import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export interface CompassButtonProps {
    /** Current map/camera heading in degrees (0 = north). */
    heading: number;
    onPress: () => void;
}

/**
 * Navigation HUD compass, matching Google Maps / Waze: rotates counter to
 * the map's heading so "N" always points true north, tap resets the camera
 * to north-up. Uses StyleSheet (not NativeWind) because Android `elevation`
 * shadows aren't reliably applied via className.
 */
export function CompassButton({ heading, onPress }: CompassButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            hitSlop={8}
            style={[styles.compass, { transform: [{ rotate: `${-heading}deg` }] }]}
        >
            <Text style={styles.label}>N</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    compass: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    label: {
        fontWeight: '700',
        fontSize: 14,
        color: '#26344F',
    },
});
