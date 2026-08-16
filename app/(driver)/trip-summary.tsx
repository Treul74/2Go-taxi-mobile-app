import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripSummaryCard } from '@/features/driver/trip';

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
      router.replace('/(driver)/(tabs)');
    }
  }, [lastTripSummary]);

  if (!lastTripSummary) return null;

  const { customerName, distance, duration, waitingDuration, fareAmount, serviceFeeAmount, netEarnings } = lastTripSummary;

  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-6" edges={['top', 'bottom']}>
      <TripSummaryCard
        customerName={customerName}
        distance={distance}
        duration={duration}
        waitingDuration={waitingDuration}
        fareAmount={fareAmount}
        serviceFeeAmount={serviceFeeAmount}
        netEarnings={netEarnings}
        onDone={handleDone}
      />
    </SafeAreaView>
  );
}
