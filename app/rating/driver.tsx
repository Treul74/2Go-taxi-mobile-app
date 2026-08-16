import { Button, RatingStars } from '@/components/ui';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * Post-trip rating screen shown to the driver, reached from
 * trip-summary.tsx. Reads driverStore.lastTripSummary -- finishTrip() (which
 * clears it) is deferred to this screen's Submit/Skip handlers instead of
 * trip-summary's handleDone, so the summary data is still available here.
 */
export default function DriverRatingScreen() {
  const { lastTripSummary, finishTrip, rateCustomer } = useDriverStore();
  const navigation = useNavigation();

  const [overallRating, setOverallRating] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [payment, setPayment] = useState(0);

  useEffect(() => {
    if (!lastTripSummary) {
      router.replace('/(driver)/(tabs)');
    }
  }, [lastTripSummary]);

  // Prevent hardware back button from causing GO_BACK error since this screen is replaced onto the stack
  useEffect(() => {
    const onBackPress = () => true;
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  if (!lastTripSummary) return null;

  const customerName = lastTripSummary?.customerName ?? 'Customer';

  const handleSubmit = async () => {
    if (lastTripSummary && overallRating > 0) {
      await rateCustomer(lastTripSummary.tripId, lastTripSummary.customerId, overallRating, {
        punctuality,
        communication,
        payment,
      });
    }
    safeTransition(() => navigation.reset());
    finishTrip();
    router.replace('/(driver)/(tabs)');
  };

  const handleSkip = () => {
    safeTransition(() => navigation.reset());
    finishTrip();
    router.replace('/(driver)/(tabs)');
  };

  const initials = lastTripSummary?.customerName
    ? lastTripSummary.customerName
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="items-center pt-4 pb-2">
        <Text className="text-primary font-bold text-lg">Trip Complete</Text>
      </View>

      <View className="items-center mt-6">
        <View
          className="w-[88px] h-[88px] rounded-full border-[3px] border-white items-center justify-center bg-gray-200"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          <Text className="text-primary font-bold text-2xl">{initials}</Text>
          <View className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-accent items-center justify-center">
            <Ionicons name="location" size={12} color="#FFFFFF" />
          </View>
        </View>
        <Text className="text-primary font-bold text-xl mt-3">{customerName}</Text>
        <Text className="text-secondary text-sm mt-1">
          How was your ride with {customerName} today?
        </Text>
      </View>

      <View className="flex-row bg-white rounded-2xl mx-4 mt-4 py-4">
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Distance</Text>
          <Text className="text-primary font-bold text-base mt-1">
            {lastTripSummary.distance.toFixed(1)} km
          </Text>
        </View>
        <View className="w-px self-stretch bg-gray-200 mx-2" />
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Time</Text>
          <Text className="text-primary font-bold text-base mt-1">
            {lastTripSummary.duration} min
          </Text>
        </View>
        <View className="w-px self-stretch bg-gray-200 mx-2" />
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Fare</Text>
          <Text className="text-accent font-bold text-base mt-1">
            K{lastTripSummary.fareAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      <View className="bg-white rounded-2xl mx-4 mt-3 py-4 items-center">
        <Text className="text-secondary text-xs uppercase tracking-widest mb-3">
          Overall Rating
        </Text>
        <RatingStars size="lg" value={overallRating} onChange={setOverallRating} />
      </View>

      <View className="mx-4 mt-3 gap-3">
        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center">
            <Ionicons name="time-outline" size={20} color="#FE5035" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Punctuality</Text>
          </View>
          <RatingStars size="sm" value={punctuality} onChange={setPunctuality} />
        </View>

        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center">
            <Ionicons name="chatbubble-outline" size={20} color="#FE5035" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Communication</Text>
          </View>
          <RatingStars size="sm" value={communication} onChange={setCommunication} />
        </View>

        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <Ionicons name="wallet-outline" size={20} color="#26344F" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Payment</Text>
          </View>
          <RatingStars size="sm" value={payment} onChange={setPayment} />
        </View>
      </View>

      <View className="mx-4 mt-6 mb-4">
        <Button
          variant="accent"
          fullWidth
          className="rounded-2xl"
          onPress={handleSubmit}
          disabled={overallRating === 0}
        >
          Submit Rating
        </Button>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip rating"
          onPress={handleSkip}
          className="mt-3 items-center justify-center py-2"
        >
          <Text className="text-secondary text-sm text-center">Skip for now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
