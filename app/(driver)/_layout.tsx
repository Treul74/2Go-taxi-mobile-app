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
            <Stack.Screen
                name="onboarding/index"
                options={{
                    presentation: 'modal',
                    headerShown: true,
                    headerTitle: 'Become a Driver',
                    headerTintColor: '#26344F',
                    headerStyle: { backgroundColor: '#E7F1F9' },
                }}
            />
        </Stack>
    );
}
