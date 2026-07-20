import { Button, Card, Input } from '@/components/ui';
import { useRideStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ride = rideHistory.find((r) => r.id === id);

  const handleDone = async () => {
    if (id && rating > 0) {
      setSubmitting(true);
      await rateRide(id, rating, comment.trim() || undefined);
      setSubmitting(false);
    }
    router.replace('/(tabs)');
  };

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
          {ride?.fare != null && (
            <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
              {ride.baseFare != null && (
                <>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-secondary text-sm">Base fare</Text>
                    <Text className="text-primary text-sm">K{ride.baseFare.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
                    <Text className="text-secondary text-sm">Distance & time</Text>
                    <Text className="text-primary text-sm">
                      K{(ride.fare - ride.baseFare).toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
              <View className="flex-row justify-between">
                <Text className="text-primary font-bold">Total fare</Text>
                <Text className="text-primary font-bold">K{ride.fare.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {ride?.driver && (
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-gray-200 items-center justify-center mb-2">
                <Ionicons name="person" size={32} color="#7B8387" />
              </View>
              <Text className="text-primary font-semibold text-base">
                {ride.driver.name}
              </Text>
            </View>
          )}

          <Text className="text-secondary text-sm mb-3">
            How was your trip?
          </Text>

          <View className="flex-row items-center mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} hitSlop={8}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? '#FFB800' : '#CBD5E1'}
                  style={{ marginHorizontal: 4 }}
                />
              </Pressable>
            ))}
          </View>

          {rating > 0 && (
            <Input
              placeholder="Leave a comment (optional)"
              value={comment}
              onChangeText={setComment}
              multiline
              className="w-full mb-4"
            />
          )}
        </View>

        <Button variant="accent" fullWidth onPress={handleDone} disabled={rating === 0} loading={submitting}>
          Submit Rating
        </Button>
        <Button variant="ghost" fullWidth className="mt-2" onPress={handleDone} disabled={submitting}>
          Skip
        </Button>
      </Card>
    </SafeAreaView>
  );
}
