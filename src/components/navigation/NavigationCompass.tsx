import { colors } from '@/constants/theme';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { useBearing } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

/**
 * Right-side compass indicator (Bible: "Right Side: Layers, Compass,
 * Center, Zoom"). Rotates opposite the camera's current bearing so its
 * needle always points true north regardless of how the map itself is
 * rotated (Bible: "Auto Rotation... Driver arrow always faces north. Road
 * rotates.") — a presentational transform of `NavigationStore.bearing`,
 * not a computed value.
 *
 * Tapping it calls the one existing engine action that returns the camera
 * to its standard framing (`navigation.recenter()`) — there is no separate
 * "reset to north, keep following" action on `NavigationActions` today, so
 * this reuses the closest real one rather than inventing a new engine
 * capability for this component.
 */
export function NavigationCompass() {
  const bearing = useBearing();
  const navigation = useNavigation();

  return (
    <Pressable
      onPress={() => navigation.recenter()}
      className="w-11 h-11 rounded-full bg-white items-center justify-center shadow-md"
    >
      <View style={{ transform: [{ rotate: `${-(bearing ?? 0)}deg` }] }}>
        <Ionicons name="navigate" size={22} color={colors.accent} />
      </View>
    </Pressable>
  );
}
