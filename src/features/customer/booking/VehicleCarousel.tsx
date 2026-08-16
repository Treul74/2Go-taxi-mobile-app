import type { VehicleType } from '@/types';
import type { VehicleOption } from '@/features/customer/types';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { VehicleCard } from './VehicleCard';

interface VehicleCarouselProps {
  vehicles: VehicleOption[];
  selectedVehicle: VehicleType;
  onSelectVehicle: (id: VehicleType) => void;
}

/**
 * Horizontal scrolling carousel of vehicle options
 */
export function VehicleCarousel({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
}: VehicleCarouselProps) {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {vehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            selected={selectedVehicle === vehicle.id}
            onSelect={onSelectVehicle}
          />
        ))}
      </ScrollView>
    </View>
  );
}

