import React from 'react';
import { View, Text, ScrollView, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, IconButton, Pill, Divider } from '@/components/ui';
import { MapPlaceholder } from '@/components/map';
import { formatDisplayAddress, formatShortAddress } from '@/lib';
import { useRideStore } from '@/state';
import type { CancellationReason } from '@/types';

/**
 * Ride Summary / Details Screen
 * Shows full details of a past or scheduled ride
 */
export default function RideSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideHistory = useRideStore((state) => state.rideHistory);
  
  const ride = rideHistory.find((r) => r.id === id);
  
  if (!ride) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-primary font-semibold">Ride not found</Text>
        <Button variant="ghost" onPress={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </View>
    );
  }
  
  // Format date
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString([], { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Status config
  const statusConfig: Record<string, { label: string; variant: 'success' | 'error' | 'warning'; icon: keyof typeof Ionicons.glyphMap }> = {
    completed: { label: 'Completed', variant: 'success', icon: 'checkmark-circle' },
    cancelled: { label: 'Cancelled', variant: 'error', icon: 'close-circle' },
    scheduled: { label: 'Scheduled', variant: 'warning', icon: 'time' },
  };
  
  const status = statusConfig[ride.status];
  
  // Handle call driver
  const handleCallDriver = () => {
    if (ride.driver?.phone) {
      Linking.openURL(`tel:${ride.driver.phone}`);
    }
  };
  
  // Cancellation reason labels
  const cancellationReasonLabels: Record<CancellationReason, string> = {
    changed_plans: 'Changed my plans',
    driver_too_far: 'Driver was too far away',
    long_wait: 'Wait time was too long',
    wrong_location: 'Wrong pickup location',
    found_alternative: 'Found another ride',
    price_too_high: 'Price was too high',
    other: 'Other reason',
  };
  
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      <ScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
        {/* Map preview */}
        <View className="h-48 relative">
          <MapPlaceholder
            showMarker={false}
            showRoute
            pickupLabel={formatShortAddress(ride.pickup.address)}
            destinationLabel={formatShortAddress(ride.destination.address)}
          />
        </View>
        
        <View className="px-5 -mt-6">
          {/* Status card */}
          <Card variant="elevated" padding="lg" radius="2xl">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-primary font-bold text-xl">
                  {ride.mode === 'taxi' ? 'Taxi Ride' : 'Delivery'}
                </Text>
                <Text className="text-secondary text-sm mt-1">
                  {formatDate(ride.date)} • {formatTime(ride.date)}
                </Text>
              </View>
              <Pill 
                label={status.label}
                icon={status.icon}
                variant={status.variant}
              />
            </View>
            
            {/* Route details */}
            <View className="bg-gray-50 rounded-3xl p-4 mb-4">
              {/* Pickup */}
              <View className="flex-row items-start mb-3">
                <View className="w-6 items-center">
                  <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
                  <View className="w-0.5 h-10 bg-gray-200 mt-1" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-secondary text-xs">PICKUP</Text>
                  <Text className="text-primary font-medium">
                    {formatDisplayAddress(ride.pickup.address)}
                  </Text>
                </View>
              </View>
              
              {/* Destination */}
              <View className="flex-row items-start">
                <View className="w-6 items-center">
                  <View className="w-3 h-3 rounded-full bg-accent border-2 border-white shadow-sm" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-secondary text-xs">DROP-OFF</Text>
                  <Text className="text-primary font-medium">
                    {formatDisplayAddress(ride.destination.address)}
                  </Text>
                </View>
              </View>
            </View>
            
            {/* Fare */}
            {ride.fare && (
              <View className="flex-row items-center justify-between py-3 border-t border-gray-100">
                <Text className="text-secondary">Total Fare</Text>
                <Text className="text-primary font-bold text-2xl">
                  K{ride.fare}
                </Text>
              </View>
            )}
            
            {/* Duration */}
            {ride.duration && (
              <View className="flex-row items-center justify-between py-3 border-t border-gray-100">
                <Text className="text-secondary">Trip Duration</Text>
                <Text className="text-primary font-semibold">
                  {ride.duration} min
                </Text>
              </View>
            )}
          </Card>
          
          {/* Cancellation info (if cancelled) */}
          {ride.status === 'cancelled' && ride.cancellationReason && (
            <Card variant="default" padding="md" radius="xl" className="mt-4">
              <Text className="text-secondary text-xs uppercase tracking-wide mb-3">
                Cancellation Details
              </Text>
              
              <View className="flex-row items-start">
                <View className="w-10 h-10 rounded-full bg-error/10 items-center justify-center">
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </View>
                
                <View className="ml-3 flex-1">
                  <Text className="text-primary font-semibold text-base">
                    {cancellationReasonLabels[ride.cancellationReason]}
                  </Text>
                  {ride.cancellationNote && (
                    <Text className="text-secondary text-sm mt-1">
                      {ride.cancellationNote}
                    </Text>
                  )}
                  <Text className="text-secondary text-xs mt-2">
                    Cancelled on {formatDate(ride.date)} at {formatTime(ride.date)}
                  </Text>
                </View>
              </View>
            </Card>
          )}
          
          {/* Driver info (if exists) */}
          {ride.driver && (
            <Card variant="default" padding="md" radius="xl" className="mt-4">
              <Text className="text-secondary text-xs uppercase tracking-wide mb-3">
                Driver
              </Text>
              
              <View className="flex-row items-center">
                <View className="w-14 h-14 rounded-full bg-gray-200 items-center justify-center">
                  <Ionicons name="person" size={28} color="#7B8387" />
                </View>
                
                <View className="ml-4 flex-1">
                  <Text className="text-primary font-bold text-lg">
                    {ride.driver.name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Ionicons name="star" size={14} color="#FFB800" />
                    <Text className="text-secondary text-sm ml-1">
                      {ride.driver.rating.toFixed(1)} • {ride.driver.tripsCompleted} trips
                    </Text>
                  </View>
                </View>
                
                {ride.status !== 'cancelled' && (
                  <IconButton
                    icon="call"
                    variant="accent"
                    size="md"
                    onPress={handleCallDriver}
                  />
                )}
              </View>
            </Card>
          )}
          
          {/* Rating (if completed) */}
          {ride.status === 'completed' && (
            <Card variant="default" padding="md" radius="xl" className="mt-4">
              <Text className="text-secondary text-xs uppercase tracking-wide mb-3">
                Your Rating
              </Text>
              
              <View className="flex-row items-center justify-center py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= (ride.rating || 0) ? 'star' : 'star-outline'}
                    size={32}
                    color={star <= (ride.rating || 0) ? '#FFB800' : '#CBD5E1'}
                    style={{ marginHorizontal: 4 }}
                  />
                ))}
              </View>
              
              {ride.rating && (
                <Text className="text-secondary text-sm text-center mt-2">
                  You rated this trip {ride.rating} star{ride.rating !== 1 ? 's' : ''}
                </Text>
              )}
            </Card>
          )}
          
          {/* Actions */}
          <View className="mt-6 mb-8">
            {ride.status === 'scheduled' && (
              <Button
                variant="outline"
                fullWidth
                leftIcon="close-circle-outline"
              >
                Cancel Scheduled Ride
              </Button>
            )}
            
            {ride.status === 'completed' && (
              <Button
                variant="accent"
                fullWidth
                leftIcon="repeat"
                onPress={() => {
                  // TODO: Rebook same trip
                  router.push('/');
                }}
              >
                Book Again
              </Button>
            )}
            
            <Button
              variant="ghost"
              fullWidth
              leftIcon="help-circle-outline"
              className="mt-3"
            >
              Get Help
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

