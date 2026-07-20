import { Button, Card } from '@/components/ui';
import type { IncomingRequest } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';

interface RequestCardProps {
  request: IncomingRequest;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

/**
 * Incoming trip request card with pulsing animation
 * Shows pickup, destination, fare, and countdown timer
 */
export function RequestCard({ request, onAccept, onDecline }: RequestCardProps) {
  const pulseScale = useSharedValue(1);
  const borderOpacity = useSharedValue(1);
  const [timeLeft, setTimeLeft] = useState(30);

  // Pulsing animation
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      true
    );

    borderOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      true
    );
  }, []);

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

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(254, 80, 53, ${borderOpacity.value})`,
  }));

  return (
    <Animated.View style={[pulseStyle]} className="mb-4">
      <Animated.View
        className="rounded-5xl border-2 overflow-hidden"
        style={borderStyle}
      >
        <Card variant="default" padding="none" radius="2xl">
          {/* Header with timer */}
          <View className="flex-row items-center justify-between p-4 bg-accent/5 border-b border-gray-100">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center">
                <Ionicons name="car" size={20} color="#FE5035" />
              </View>
              <View className="ml-3">
                {/* Passenger identity isn't visible until the driver accepts */}
                <Text className="text-primary font-semibold">
                  New Ride Request
                </Text>
              </View>
            </View>

            {/* Timer */}
            <View className="items-center">
              <View
                className={`w-12 h-12 rounded-full items-center justify-center ${timeLeft <= 10 ? 'bg-error' : 'bg-accent'
                  }`}
              >
                <Text className="text-white font-bold text-lg">
                  {timeLeft}
                </Text>
              </View>
              <Text className="text-secondary text-xs mt-1">seconds</Text>
            </View>
          </View>

          {/* Route info */}
          <View className="p-4">
            {/* Pickup */}
            <View className="flex-row items-start mb-3">
              <View className="w-6 items-center">
                <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
                <View className="w-0.5 h-8 bg-gray-200 mt-1" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-secondary text-xs">PICKUP</Text>
                <Text className="text-primary font-medium" numberOfLines={1}>
                  {request.pickup.address}
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
                <Text className="text-primary font-medium" numberOfLines={1}>
                  {request.destination.address}
                </Text>
              </View>
            </View>

            {/* Trip info */}
            <View className="flex-row items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <View className="flex-row items-center">
                <Ionicons name="navigate" size={16} color="#7B8387" />
                <Text className="text-secondary text-sm ml-1">
                  {request.distance.toFixed(1)} km
                </Text>
              </View>

              <View className="bg-accent/10 px-4 py-2 rounded-full">
                <Text className="text-accent font-bold text-lg">
                  K{Math.round(request.estimatedFare)}
                </Text>
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <View className="flex-row gap-3 p-4 pt-0">
            <Button
              variant="outline"
              onPress={() => onDecline(request.id)}
              className="flex-1"
            >
              Decline
            </Button>
            <Button
              variant="accent"
              onPress={() => onAccept(request.id)}
              className="flex-1"
            >
              Accept
            </Button>
          </View>
        </Card>
      </Animated.View>
    </Animated.View>
  );
}

