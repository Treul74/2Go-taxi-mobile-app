import { Stack } from 'expo-router';
import React from 'react';

/**
 * Customer route group layout
 * Contains the live trip-tracking screen shown once an order is accepted
 */
export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#E7F1F9' },
      }}
    >
      <Stack.Screen name="trip" />
      <Stack.Screen
        name="ride/[id]"
        options={{
          presentation: 'card',
          headerShown: true,
          headerTitle: 'Ride Details',
          headerTintColor: '#26344F',
          headerStyle: { backgroundColor: '#E7F1F9' },
        }}
      />
      <Stack.Screen
        name="rating/[id]"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
