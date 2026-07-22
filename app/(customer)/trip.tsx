import { Map } from '@/components/map';
import { Button, Card, IconButton } from '@/components/ui';
import { formatDisplayAddress } from '@/lib';
import { useRideStore } from '@/state';
import type { CancellationReason } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CancellationModal } from '@/features/passenger/components';

/**
 * Customer Trip Tracking Screen
 * Full-screen map showing the driver moving toward pickup/destination in
 * real time, driven entirely by rideStore.activeTrip (populated over the
 * order's realtime channel — see rideStore.applyOrderUpdate).
 */
export default function CustomerTripScreen() {
  const { activeTrip, status, cancelRide } = useRideStore();
  const [showCancellationModal, setShowCancellationModal] = useState(false);

  // Redirect home if there's no active trip to show (cancelled, completed,
  // or this screen was reached without an order in flight).
  useEffect(() => {
    if (status !== 'active' || !activeTrip) {
      router.replace('/(tabs)');
    }
  }, [status, activeTrip]);

  if (!activeTrip) {
    return null;
  }

  const handleCall = () => {
    if (activeTrip.driver.phone) {
      Linking.openURL(`tel:${activeTrip.driver.phone}`);
    }
  };

  const handleChat = () => {
    router.push(`/chat/${activeTrip.id}`);
  };

  const handleConfirmCancellation = (reason: CancellationReason, note?: string) => {
    cancelRide(reason, note);
    setShowCancellationModal(false);
  };

  // Per the driver-side slide-to-confirm flow: driver_arrived_at flips the
  // trip to 'waiting' while status stays 'accepted' server-side, so this is
  // the moment to show the "driver has arrived" banner.
  const hasArrived = activeTrip.status === 'waiting';
  const canCancel = activeTrip.status === 'driver_assigned' || activeTrip.status === 'waiting';

  const statusText: Record<typeof activeTrip.status, string> = {
    driver_assigned: 'Driver is on the way',
    arriving: 'Driver is arriving',
    waiting: 'Driver is waiting for you',
    in_progress: 'On the way to your destination',
    completed: 'Trip completed',
  };

  return (
    <View className="flex-1 bg-background">
      {/* Full-screen map, following the driver's live position */}
      <View className="absolute inset-0">
        <Map
          driverLocation={activeTrip.driverLocation ?? undefined}
          driverHeading={activeTrip.driverHeading ?? 0}
          pickup={activeTrip.pickup}
          destination={activeTrip.status === 'in_progress' ? activeTrip.destination : undefined}
          showPickupAsUserLocation
          autoFollowDriver
          eta={`${activeTrip.estimatedArrival} min ETA`}
        />
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
        {/* "Driver has arrived" banner */}
        {hasArrived && (
          <View className="px-5 pt-4" pointerEvents="none">
            <View className="bg-success rounded-2xl px-4 py-3 shadow-card flex-row items-center">
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text className="text-white font-bold ml-2">
                Driver has arrived
              </Text>
            </View>
          </View>
        )}

        {/* Bottom trip card */}
        <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
          <View pointerEvents="auto">
            <Card variant="elevated" padding="md" radius="2xl">
              {/* Status row */}
              <View className="flex-row items-center mb-3">
                <View className="w-3 h-3 rounded-full bg-success" />
                <Text className="text-success font-semibold text-sm ml-2">
                  {statusText[activeTrip.status]}
                </Text>
                <Text className="text-secondary text-sm ml-auto">
                  {activeTrip.estimatedArrival} min
                </Text>
              </View>

              {/* Driver info */}
              <View className="flex-row items-center">
                <View className="w-14 h-14 rounded-full bg-gray-200 items-center justify-center">
                  <Ionicons name="person" size={28} color="#7B8387" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-primary font-bold text-lg">
                    {activeTrip.driver.name}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    <Ionicons name="star" size={14} color="#FFB800" />
                    <Text className="text-secondary text-sm ml-1">
                      {activeTrip.driver.rating.toFixed(1)} • {activeTrip.driver.tripsCompleted} trips
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <IconButton icon="chatbubble" variant="outline" size="md" onPress={handleChat} />
                  <IconButton icon="call" variant="accent" size="md" onPress={handleCall} />
                </View>
              </View>

              {/* Vehicle info */}
              <View className="flex-row items-center mt-4 p-3 bg-gray-100 rounded-3xl">
                <Ionicons name="car" size={24} color="#26344F" />
                <View className="ml-3 flex-1">
                  <Text className="text-primary font-semibold">
                    {activeTrip.vehicle.color} {activeTrip.vehicle.model}
                  </Text>
                  <Text className="text-secondary text-sm">
                    {activeTrip.vehicle.plate}
                  </Text>
                </View>
                <View className="bg-white px-3 py-1.5 rounded-full">
                  <Text className="text-primary font-bold">
                    K{activeTrip.fare}
                  </Text>
                </View>
              </View>

              {/* Trip progress */}
              <View className="mt-4">
                <View className="flex-row items-start">
                  <View className="w-6 items-center">
                    <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
                    <View className="w-0.5 h-8 bg-gray-200 mt-1" />
                  </View>
                  <View className="ml-2 flex-1">
                    <Text className="text-secondary text-xs">PICKUP</Text>
                    <Text className="text-primary font-medium text-sm" numberOfLines={1}>
                      {formatDisplayAddress(activeTrip.pickup.address)}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-start">
                  <View className="w-6 items-center">
                    <View className="w-3 h-3 rounded-full bg-accent border-2 border-white shadow-sm" />
                  </View>
                  <View className="ml-2 flex-1">
                    <Text className="text-secondary text-xs">DROP-OFF</Text>
                    <Text className="text-primary font-medium text-sm" numberOfLines={1}>
                      {formatDisplayAddress(activeTrip.destination.address)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Cancel — only while the driver hasn't started the trip yet */}
              {canCancel && (
                <View className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => setShowCancellationModal(true)}
                    leftIcon="close-circle-outline"
                  >
                    Cancel Trip
                  </Button>
                </View>
              )}
            </Card>
          </View>
        </View>
      </SafeAreaView>

      <CancellationModal
        visible={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        onConfirm={handleConfirmCancellation}
        driverName={activeTrip.driver.name}
      />
    </View>
  );
}
