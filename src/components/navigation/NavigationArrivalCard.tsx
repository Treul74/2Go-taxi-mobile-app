import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { useNavigationMode } from '@/navigation/NavigationEngine/NavigationHooks';
import { NavigationMode } from '@/navigation/NavigationEngine/NavigationModes';
import React from 'react';
import { Text, View } from 'react-native';
import { NavigationSlideButton } from './NavigationSlideButton';

/**
 * Arrival card (Bible: "Waiting At Pickup — ... Slide Arrive appears" and
 * "Near Destination — ... Arrival countdown", "Trip In Progress — ...
 * Slide Complete Trip"). Renders only for the two arrival modes and picks
 * the one legal transition each mode allows — the same dispatch every
 * other engine-integration component in this codebase does (e.g.
 * `CameraController`'s per-mode `CAMERA_PROFILES` switch), not a product
 * decision made by this component.
 *
 * Renders nothing outside `ARRIVED_PICKUP`/`ARRIVED_DROPOFF`, so it's
 * always safe to mount unconditionally alongside `NavigationHUD`.
 */
export function NavigationArrivalCard() {
  const mode = useNavigationMode();
  const navigation = useNavigation();

  if (mode !== NavigationMode.ARRIVED_PICKUP && mode !== NavigationMode.ARRIVED_DROPOFF) {
    return null;
  }

  const isPickup = mode === NavigationMode.ARRIVED_PICKUP;

  return (
    <View className="bg-white rounded-3xl px-5 py-5 shadow-lg gap-4">
      <Text className="text-primary text-lg font-bold text-center">
        {isPickup ? "You've arrived at pickup" : "You've arrived at the destination"}
      </Text>
      <NavigationSlideButton
        label={isPickup ? 'SLIDE TO START TRIP' : 'SLIDE TO COMPLETE TRIP'}
        onComplete={() => (isPickup ? navigation.startTrip() : navigation.completeTrip())}
      />
    </View>
  );
}
