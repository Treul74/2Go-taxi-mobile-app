import { Stack } from 'expo-router';
import React from 'react';

/**
 * Driver route group layout
 * Contains navigation and trip screens for active rides
 */
export default function DriverLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#E7F1F9' },
            }}
        >
            <Stack.Screen name="navigation" />
            <Stack.Screen name="trip" />
            <Stack.Screen name="trip-summary" />
        </Stack>
    );
}
