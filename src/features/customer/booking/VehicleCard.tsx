import { SkeletonBox } from '@/components/ui';
import { useRideStore } from '@/state';
import type { VehicleType } from '@/types';
import type { VehicleOption } from '@/features/customer/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface VehicleCardProps {
  vehicle: VehicleOption;
  selected: boolean;
  onSelect: (id: VehicleType) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Vehicle icon mapping. Exported for reuse as rideStore's temporary
// fallback when a vehicle_classes_public row has no icon_svg_url yet.
export const vehicleIcons: Record<VehicleType, keyof typeof Ionicons.glyphMap> = {
  economy: 'car-outline',
  comfort: 'car-sport-outline',
  bike: 'bicycle-outline',
  tricycle: 'navigate-outline',
  truck: 'bus-outline',
};

/**
 * Vehicle selection card for the ride planner carousel
 * Shows vehicle type, estimated fare, and ETA
 */
export function VehicleCard({ vehicle, selected, onSelect }: VehicleCardProps) {
  const isFareCalculating = useRideStore((state) => state.isFareCalculating);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    width: 96, // Reduced from 112
    marginRight: 10,
    padding: 8, // Reduced from 12
    borderRadius: 24, // Reduced from 32
    alignItems: 'center',
    backgroundColor: selected ? '#26344F' : '#FFFFFF',
    borderWidth: selected ? 0 : 1.5,
    borderColor: selected ? 'transparent' : '#F3F4F6',
    shadowColor: selected ? '#26344F' : 'transparent',
    shadowOffset: { width: 0, height: 4 }, // Reduced from 8
    shadowOpacity: selected ? 0.1 : 0, // Reduced from 0.16
    shadowRadius: selected ? 8 : 0, // Reduced from 16
    elevation: selected ? 2 : 0, // Reduced from 4
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      onPress={() => onSelect(vehicle.id)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
    >
      {/* Vehicle Icon */}
      <View
        style={{
          width: 40, // Reduced from 48
          height: 40, // Reduced from 48
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6, // Reduced from 8
          backgroundColor: selected ? 'rgba(255, 255, 255, 0.2)' : '#F3F4F6',
        }}
      >
        <Ionicons
          name={vehicleIcons[vehicle.id]}
          size={20} // Reduced from 24
          color={selected ? '#FFFFFF' : '#26344F'}
        />
      </View>

      {/* Vehicle Name */}
      <Text
        style={{
          fontWeight: '600',
          fontSize: 12, // Reduced from 14
          marginBottom: 2, // Reduced from 4
          color: selected ? '#FFFFFF' : '#26344F',
        }}
        numberOfLines={1}
      >
        {vehicle.name}
      </Text>

      {/* Fare */}
      {isFareCalculating ? (
        <SkeletonBox width={32} height={14} borderRadius={4} />
      ) : (
        <Text
          style={{
            fontWeight: 'bold',
            fontSize: 14, // Reduced from 16
            color: selected ? '#FFFFFF' : '#FE5035',
          }}
        >
          K{vehicle.estimatedFare}
        </Text>
      )}

      {/* ETA */}
      {isFareCalculating ? (
        <SkeletonBox width={28} height={10} borderRadius={4} style={{ marginTop: 2 }} />
      ) : (
        <Text
          style={{
            fontSize: 10, // Reduced from 12
            marginTop: 2, // Reduced from 4
            color: selected ? 'rgba(255, 255, 255, 0.7)' : '#7B8387',
          }}
        >
          {vehicle.eta} min
        </Text>
      )}
    </AnimatedPressable>
  );
}

