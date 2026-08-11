import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Post-trip summary shown to the driver after Slide to Complete Trip
 * succeeds. Reads driverStore.lastTripSummary (set by completeTrip()). Done
 * only navigates home — the driver stays online, and trip state is left
 * as-is (no store resets, no offline calls).
 */
export default function DriverTripSummaryScreen() {
  const { lastTripSummary, finishTrip } = useDriverStore();

  const handleDone = () => {
    router.replace('/rating/driver');
  };

  useEffect(() => {
    if (!lastTripSummary) {
      finishTrip();
      router.replace('/(tabs)');
    }
  }, [lastTripSummary]);

  if (!lastTripSummary) return null;

  const { customerName, distance, duration, waitingDuration, fareAmount, serviceFeeAmount, netEarnings } = lastTripSummary;

  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-6" edges={['top', 'bottom']}>
      <Card variant="elevated" padding="lg" radius="2xl" className="w-full">
        <View className="items-center py-4">
          <View className="w-16 h-16 rounded-full bg-success/10 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text className="text-primary font-bold text-xl mb-1">
            Trip Completed
          </Text>
          <Text className="text-secondary text-sm mb-6">
            {customerName} &middot; {distance.toFixed(1)} km &middot; {duration} min
          </Text>

          <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
            <Text className="text-secondary text-xs mb-3">TRIP BREAKDOWN</Text>

            <View className="flex-row justify-between mb-2">
              <Text className="text-secondary text-sm">Distance</Text>
              <Text className="text-primary font-medium text-sm">{distance.toFixed(1)} km</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-secondary text-sm">Travel time</Text>
              <Text className="text-primary font-medium text-sm">{duration} min</Text>
            </View>
            <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
              <Text className="text-secondary text-sm">Waiting time</Text>
              <Text className="text-primary font-medium text-sm">{waitingDuration} min</Text>
            </View>

            <View className="flex-row justify-between mb-2">
              <Text className="text-primary text-sm">Final fare</Text>
              <Text className="text-primary font-medium text-sm">{formatCurrency(fareAmount)}</Text>
            </View>
            <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
              <Text className="text-secondary text-sm">Service fee</Text>
              <Text className="text-secondary text-sm">-{formatCurrency(serviceFeeAmount)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-primary font-bold">You earned</Text>
              <Text className="text-success font-bold text-lg">{formatCurrency(netEarnings)}</Text>
            </View>
          </View>
        </View>

        <Button variant="accent" fullWidth onPress={handleDone}>
          Done
        </Button>
      </Card>
    </SafeAreaView>
  );
}
