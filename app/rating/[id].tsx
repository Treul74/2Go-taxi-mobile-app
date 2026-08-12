import { Button, RatingStars } from '@/components/ui';
import { calculateDistanceKm } from '@/lib/distance';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useRideStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

/**
 * Post-trip rating screen. Reached from rideStore.applyOrderUpdate when an
 * order's status flips to 'completed'. Rating is optional and can be
 * skipped -- a submitted rating is persisted to InsForge (rideStore.rateRide),
 * which also updates the driver's average rating.
 */
export default function RatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideHistory = useRideStore((state) => state.rideHistory);
  const rateRide = useRideStore((state) => state.rateRide);
  const resetRide = useRideStore((state) => state.resetRide);
  const navigation = useNavigation();

  const [rating, setRating] = useState(0);
  const [drivingSkill, setDrivingSkill] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ride = rideHistory.find((r) => r.id === id);

  const handleSubmit = async () => {
    if (id && rating > 0) {
      setSubmitting(true);
      await rateRide(id, rating, comment.trim() || undefined);
      setSubmitting(false);
    }
    resetRide();
    safeTransition(() => navigation.reset());
    router.replace('/discover');
  };

  const handleSkip = () => {
    resetRide();
    safeTransition(() => navigation.reset());
    router.replace('/discover');
  };

  const driverName = ride?.driver?.name ?? 'your driver';
  const initials = ride?.driver?.name
    ? ride.driver.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  const distanceKm =
    ride?.pickup && ride?.destination
      ? calculateDistanceKm(
          ride.pickup.latitude,
          ride.pickup.longitude,
          ride.destination.latitude,
          ride.destination.longitude
        )
      : null;

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
          {ride?.driver?.avatar ? (
            <Image
              source={{ uri: ride.driver.avatar }}
              className="w-full h-full rounded-full"
            />
          ) : (
            <Text className="text-primary font-bold text-2xl">{initials}</Text>
          )}
        </View>
        <Text className="text-primary font-bold text-xl mt-3">{ride?.driver?.name}</Text>
        <Text className="text-secondary text-sm mt-1">
          How was your journey with {driverName} today?
        </Text>
      </View>

      <View className="flex-row bg-white rounded-2xl mx-4 mt-4 py-4">
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Distance</Text>
          <Text className="text-primary font-bold text-base mt-1">
            {distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'}
          </Text>
        </View>
        <View className="w-px self-stretch bg-gray-200 mx-2" />
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Time</Text>
          <Text className="text-primary font-bold text-base mt-1">
            {ride?.duration != null ? `${ride.duration} min` : '—'}
          </Text>
        </View>
        <View className="w-px self-stretch bg-gray-200 mx-2" />
        <View className="flex-1 items-center">
          <Text className="text-secondary text-xs uppercase tracking-wider">Fare</Text>
          <Text className="text-accent font-bold text-base mt-1">
            {ride?.fare != null ? `K${ride.fare.toFixed(2)}` : '—'}
          </Text>
        </View>
      </View>

      <View className="bg-white rounded-2xl mx-4 mt-3 py-4 items-center">
        <Text className="text-secondary text-xs uppercase tracking-widest mb-3">
          Overall Rating
        </Text>
        <RatingStars size="lg" value={rating} onChange={setRating} />
      </View>

      <View className="mx-4 mt-3 gap-3">
        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center">
            <Ionicons name="time-outline" size={20} color="#FE5035" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Driving Skill</Text>
          </View>
          <RatingStars size="sm" value={drivingSkill} onChange={setDrivingSkill} />
        </View>

        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center">
            <Ionicons name="sparkles-outline" size={20} color="#FE5035" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Cleanliness</Text>
          </View>
          <RatingStars size="sm" value={cleanliness} onChange={setCleanliness} />
        </View>

        <View className="px-4 py-4 flex-row items-center bg-white rounded-2xl">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <Ionicons name="chatbubble-outline" size={20} color="#26344F" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-primary font-semibold text-sm">Communication</Text>
          </View>
          <RatingStars size="sm" value={communication} onChange={setCommunication} />
        </View>
      </View>

      <View className="mx-4 mt-6 mb-4">
        <Button
          variant="accent"
          fullWidth
          className="rounded-2xl"
          onPress={handleSubmit}
          disabled={rating === 0}
          loading={submitting}
        >
          Submit Feedback
        </Button>
        <Text
          className="text-secondary text-sm text-center mt-3"
          accessibilityRole="button"
          accessibilityLabel="Skip rating"
          onPress={submitting ? undefined : handleSkip}
        >
          Skip
        </Text>
      </View>
    </ScrollView>
  );
}
