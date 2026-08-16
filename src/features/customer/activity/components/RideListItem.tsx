import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Pill } from '@/components/ui';
import type { RideHistoryItem } from '@/features/customer/types';

interface RideListItemProps {
  ride: RideHistoryItem;
  onPress: (id: string) => void;
}

// Vehicle icon mapping
const vehicleIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  economy: 'car-outline',
  fastest: 'flash-outline',
  comfort: 'car-sport-outline',
  bike: 'bicycle-outline',
  truck: 'bus-outline',
};

// Status config
const statusConfig: Record<string, { label: string; variant: 'success' | 'error' | 'warning' }> = {
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  scheduled: { label: 'Scheduled', variant: 'warning' },
};

/**
 * Ride history list item
 */
export function RideListItem({ ride, onPress }: RideListItemProps) {
  const status = statusConfig[ride.status];
  const vehicleIcon = vehicleIcons[ride.vehicleType] || 'car-outline';
  
  // Format date
  const formatDate = (date: Date) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  return (
    <Card 
      variant="default" 
      padding="sm" 
      radius="xl" 
      onPress={() => onPress(ride.id)}
      className="mb-3"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <Ionicons name={vehicleIcon} size={20} color="#26344F" />
          </View>
          <View className="ml-3">
            <Text className="text-primary font-semibold">
              {ride.mode === 'taxi' ? 'Taxi Ride' : 'Delivery'}
            </Text>
            <Text className="text-secondary text-xs">
              {formatDate(ride.date)}
            </Text>
          </View>
        </View>
        
        <View className="items-end">
          <Pill 
            label={status.label} 
            variant={status.variant} 
            size="sm"
          />
          {ride.fare && (
            <Text className="text-primary font-bold mt-1">
              K{ride.fare}
            </Text>
          )}
        </View>
      </View>
      
      {/* Route */}
      <View className="bg-gray-50 rounded-3xl p-2.5">
        {/* Pickup */}
        <View className="flex-row items-start mb-1.5">
          <View className="w-5 items-center">
            <View className="w-2 h-2 rounded-full bg-success" />
            <View className="w-0.5 h-4 bg-gray-200 mt-0.5" />
          </View>
          <Text className="text-primary text-xs ml-2 flex-1" numberOfLines={1}>
            {ride.pickup.address}
          </Text>
        </View>
        
        {/* Destination */}
        <View className="flex-row items-start">
          <View className="w-5 items-center">
            <View className="w-2 h-2 rounded-full bg-accent" />
          </View>
          <Text className="text-primary text-xs ml-2 flex-1" numberOfLines={1}>
            {ride.destination.address}
          </Text>
        </View>
      </View>
      
      {/* Driver info (if completed) */}
      {ride.driver && ride.status === 'completed' && (
        <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <View className="flex-row items-center flex-1">
            {/* Driver Avatar */}
            <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center overflow-hidden">
              {ride.driver.avatar ? (
                <Image
                  source={{ uri: ride.driver.avatar }}
                  className="w-10 h-10 rounded-full"
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={20} color="#7B8387" />
              )}
            </View>
            <View className="ml-2 flex-1">
              <Text className="text-primary font-semibold text-sm">
                {ride.driver.name}
              </Text>
              <View className="flex-row items-center">
                <Ionicons name="star" size={12} color="#FFB800" />
                <Text className="text-secondary text-xs ml-1">
                  {ride.driver.rating.toFixed(1)}
                </Text>
              </View>
            </View>
          </View>
          
          {ride.rating && (
            <View className="flex-row items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= ride.rating! ? 'star' : 'star-outline'}
                  size={14}
                  color={star <= ride.rating! ? '#FFB800' : '#CBD5E1'}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

