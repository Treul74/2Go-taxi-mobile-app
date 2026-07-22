import { Button, Card, RatingStars } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Post-trip rating screen shown to the driver, reached from
 * trip-summary.tsx. Reads driverStore.lastTripSummary -- finishTrip() (which
 * clears it) is deferred to this screen's Submit/Skip handlers instead of
 * trip-summary's handleDone, so the summary data is still available here.
 */
export default function DriverRatingScreen() {
  const { lastTripSummary, finishTrip, ratePassenger } = useDriverStore();

  const [overallRating, setOverallRating] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [payment, setPayment] = useState(0);

  useEffect(() => {
    if (!lastTripSummary) {
      router.replace('/(tabs)');
    }
  }, [lastTripSummary]);

  if (!lastTripSummary) return null;

  const passengerName = lastTripSummary?.passengerName ?? 'Passenger';

  const handleSubmit = async () => {
    if (lastTripSummary && overallRating > 0) {
      await ratePassenger(lastTripSummary.tripId, lastTripSummary.customerId, overallRating, {
        punctuality,
        communication,
        payment,
      });
    }
    finishTrip();
    router.replace('/(tabs)');
  };

  const handleSkip = () => {
    finishTrip();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
      >
        <Card variant="elevated" padding="lg" radius="2xl" className="w-full">
          <View className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-success/10 items-center justify-center mb-4">
              <Ionicons name="checkmark-circle" size={40} color="#10B981" />
            </View>
            <Text className="text-primary font-bold text-xl mb-1">
              Trip Completed
            </Text>
            <Text className="text-secondary text-sm mb-4">
              How was your ride with {passengerName}?
            </Text>

            <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
              <View className="flex-row justify-between mb-2">
                <Text className="text-secondary text-sm">Distance</Text>
                <Text className="text-primary font-medium text-sm">
                  {lastTripSummary.distance.toFixed(1)} km
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-secondary text-sm">Duration</Text>
                <Text className="text-primary font-medium text-sm">
                  {lastTripSummary.duration} min
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-secondary text-sm">Fare</Text>
                <Text className="text-primary font-medium text-sm">
                  {formatCurrency(lastTripSummary.fareAmount)}
                </Text>
              </View>
            </View>

            <Text className="text-secondary text-sm mt-4 mb-2 text-center">
              Rate your passenger
            </Text>

            <RatingStars size="lg" value={overallRating} onChange={setOverallRating} />

            <View className="w-full mt-4">
              <View className="flex-row items-center py-3 border-b border-gray-100">
                <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <Ionicons name="time-outline" size={20} color="#7B8387" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-primary font-semibold text-sm">Punctuality</Text>
                </View>
                <RatingStars size="sm" value={punctuality} onChange={setPunctuality} />
              </View>

              <View className="flex-row items-center py-3 border-b border-gray-100">
                <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <Ionicons name="chatbubble-outline" size={20} color="#7B8387" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-primary font-semibold text-sm">Communication</Text>
                </View>
                <RatingStars size="sm" value={communication} onChange={setCommunication} />
              </View>

              <View className="flex-row items-center py-3">
                <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <Ionicons name="wallet-outline" size={20} color="#7B8387" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-primary font-semibold text-sm">Payment</Text>
                </View>
                <RatingStars size="sm" value={payment} onChange={setPayment} />
              </View>
            </View>
          </View>

          <Button variant="accent" fullWidth onPress={handleSubmit} disabled={overallRating === 0}>
            Submit Rating
          </Button>
          <Button variant="ghost" fullWidth className="mt-2" onPress={handleSkip}>
            Skip for now
          </Button>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
