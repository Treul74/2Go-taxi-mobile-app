import { Button } from '@/components/ui';
import { calculateDistanceKm } from '@/lib/distance';
import { useDriverStore } from '@/state';
import type { IncomingRequest } from '../types';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

interface RequestCardProps {
  request: IncomingRequest;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export function RequestCard({ request, onAccept, onDecline }: RequestCardProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  const vehicleType = useDriverStore((s) => s.vehicleType) || 'economy';

  // Calculate destination distance and estimated time
  const destinationDistance = calculateDistanceKm(
    request.pickup.latitude,
    request.pickup.longitude,
    request.destination.latitude,
    request.destination.longitude
  );
  // Assume ~40km/h average speed for ETA
  const destinationTime = Math.max(1, Math.round((destinationDistance / 40) * 60));

  // Countdown timer
  useEffect(() => {
    const expiresAt = new Date(request.expiresAt).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.expiresAt]);

  const isReturningCustomer = request.customerRating > 4.5;
  // Use display name and rating from request or defaults
  const displayName = request.customerName !== 'New Customer' ? request.customerName : 'Regina Banda';
  const displayRating = request.customerRating > 0 ? request.customerRating.toFixed(1) : '4.9';

  return (
    <View className="bg-white rounded-t-3xl pt-3 pb-8 px-5 shadow-lg border-t border-gray-100">
      {/* Drag handle */}
      <View className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

      {/* Header */}
      <View className="flex-row items-center justify-between mb-5">
        <Text className="text-xl font-bold text-primary">New order request</Text>
        <Text className="text-xl font-bold text-accent">{timeLeft}s</Text>
      </View>

      {/* Customer Info */}
      <View className="flex-row items-center mb-6">
        <View className="w-12 h-12 rounded-full bg-gray-200 items-center justify-center overflow-hidden">
          <Ionicons name="person" size={24} color="#7B8387" />
        </View>
        <View className="ml-3">
          <Text className="text-primary font-bold text-base mb-0.5">{displayName}</Text>
          <View className="flex-row items-center">
            <Ionicons name="star" size={12} color="#FFB800" />
            <Text className="text-primary text-xs font-bold ml-1 mr-2">{displayRating}</Text>
            {isReturningCustomer && (
              <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                <Text className="text-[#3b82f6] text-[10px] font-medium">Returning customer</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Route Info */}
      <View className="mb-6 relative">
        {/* Connection Line */}
        <View className="absolute left-[7px] top-[14px] bottom-[14px] w-0.5 bg-gray-200" />

        {/* Pickup Row */}
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-row items-start flex-1">
            <View className="mt-1.5 w-4 items-center">
              <View className="w-2.5 h-2.5 rounded-full bg-success" />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="text-primary font-semibold text-sm" numberOfLines={1}>
                {request.pickup.address}
              </Text>
              <Text className="text-secondary text-xs mt-0.5">
                Pickup • {request.distance.toFixed(1)} km away
              </Text>
            </View>
          </View>
          <View className="bg-gray-100 flex-row items-center px-2 py-1 rounded">
            <MaterialCommunityIcons name="cash" size={14} color="#26344F" />
            <Text className="text-primary text-xs font-medium ml-1">Cash</Text>
          </View>
        </View>

        {/* Drop-off Row */}
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-start flex-1">
            <View className="mt-1.5 w-4 items-center">
              <View className="w-2.5 h-2.5 rounded-full bg-error" />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="text-primary font-semibold text-sm" numberOfLines={1}>
                {request.destination.address}
              </Text>
              <Text className="text-secondary text-xs mt-0.5">
                Drop-off • {destinationDistance.toFixed(1)} km • {destinationTime} min
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-primary font-bold text-lg">ZMW {request.estimatedFare.toFixed(2)}</Text>
            <Text className="text-secondary text-[10px]">Includes traffic</Text>
          </View>
        </View>
      </View>

      {/* Trip Info Grid */}
      <View className="flex-row items-center justify-between bg-white border border-gray-100 rounded-xl p-3 mb-6 shadow-sm">
        {/* Vehicle */}
        <View className="items-center flex-1 border-r border-gray-100">
          <Ionicons name="car-outline" size={20} color="#26344F" />
          <Text className="text-primary font-bold text-xs mt-1 capitalize">{vehicleType}</Text>
          <Text className="text-secondary text-[10px] mt-0.5">Vehicle</Text>
        </View>

        {/* Time */}
        <View className="items-center flex-1 border-r border-gray-100">
          <Ionicons name="time-outline" size={20} color="#26344F" />
          <Text className="text-primary font-bold text-xs mt-1">{destinationTime} min</Text>
          <Text className="text-secondary text-[10px] mt-0.5">Est. trip time</Text>
        </View>

        {/* Distance */}
        <View className="items-center flex-1 border-r border-gray-100">
          <MaterialCommunityIcons name="map-marker-distance" size={20} color="#26344F" />
          <Text className="text-primary font-bold text-xs mt-1">{destinationDistance.toFixed(1)} km</Text>
          <Text className="text-secondary text-[10px] mt-0.5">Est. distance</Text>
        </View>

        {/* Passenger */}
        <View className="items-center flex-1">
          <Ionicons name="person-outline" size={20} color="#26344F" />
          <Text className="text-primary font-bold text-xs mt-1">1</Text>
          <Text className="text-secondary text-[10px] mt-0.5">Passenger</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row justify-between gap-4">
        <Button
          variant="outline"
          onPress={() => onDecline(request.id)}
          className="flex-1 bg-white border-gray-300"
        >
          Decline
        </Button>
        <Button
          variant="accent"
          onPress={() => onAccept(request.id)}
          className="flex-1 shadow-sm"
        >
          Accept order
        </Button>
      </View>
    </View>
  );
}

