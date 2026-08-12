import { Button, Card, IconButton } from '@/components/ui';
import { formatDisplayAddress } from '@/lib';
import { CANCELLATION_WINDOW_MS } from '@/state/rideStore';
import type { ActiveTrip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface ActiveTripCardProps {
  trip: ActiveTrip;
  onEndTrip: () => void;
  onCancelTrip: () => void;
  isMapDragging?: boolean;
}

// The customer may only cancel while the driver is still on the way —
// once the trip status moves past this, cancelling is no longer offered.
const CANCELLABLE_STATUSES: ActiveTrip['status'][] = ['driver_assigned', 'arriving'];

function getRemainingCancelSeconds(acceptedAt: Date): number {
  const remainingMs = CANCELLATION_WINDOW_MS - (Date.now() - acceptedAt.getTime());
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function formatCancelCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Floating driver card shown during active trip
 * Displays driver info, vehicle details, and communication buttons
 */
export function ActiveTripCard({ trip, onEndTrip, onCancelTrip, isMapDragging = false }: ActiveTripCardProps) {
  const pulseScale = useSharedValue(1);
  const dragProgress = useSharedValue(0); // 0 when not dragging, 1 when dragging

  const isCancellableStatus = CANCELLABLE_STATUSES.includes(trip.status);
  const [remainingCancelSeconds, setRemainingCancelSeconds] = React.useState(() =>
    getRemainingCancelSeconds(trip.acceptedAt)
  );

  // Ticks the cancellation countdown every second while cancelling is still
  // possible; stops (and re-syncs) once the trip moves past that stage.
  React.useEffect(() => {
    if (!isCancellableStatus) return;

    setRemainingCancelSeconds(getRemainingCancelSeconds(trip.acceptedAt));
    const interval = setInterval(() => {
      setRemainingCancelSeconds(getRemainingCancelSeconds(trip.acceptedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [isCancellableStatus, trip.acceptedAt]);

  const canCancel = isCancellableStatus && remainingCancelSeconds > 0;

  React.useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.2, { duration: 1500 }),
      -1,
      true
    );
  }, []);

  React.useEffect(() => {
    dragProgress.value = withTiming(isMapDragging ? 1 : 0, {
      duration: 300,
    });
  }, [isMapDragging]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: withSpring(dragProgress.value * 100, { damping: 15, stiffness: 100 }) }
    ],
    opacity: withTiming(1 - dragProgress.value * 0.9, { duration: 200 }),
  }));

  const handleCall = () => {
    Linking.openURL(`tel:${trip.driver.phone}`).catch(() => {
      Alert.alert('Calling Unavailable', 'Unable to initiate call at this time.');
    });
  };

  const handleChat = () => {
    router.push(`/chat/${trip.id}`);
  };

  // Status text mapping
  const statusText: Record<ActiveTrip['status'], string> = {
    driver_assigned: 'Driver assigned',
    arriving: 'Driver is arriving',
    waiting: 'Driver is waiting',
    in_progress: 'On the way',
    completed: 'Trip completed',
  };

  return (
    <Animated.View
      style={[{ position: 'absolute', bottom: 32, left: 16, right: 16 }, animatedContainerStyle]}
    >
      <Card variant="elevated" padding="md" radius="2xl">
        {/* Status indicator */}
        <View className="flex-row items-center mb-3">
          <View className="relative">
            <Animated.View
              className="absolute w-3 h-3 rounded-full bg-success"
              style={pulseStyle}
            />
            <View className="w-3 h-3 rounded-full bg-success" />
          </View>
          <Text className="text-success font-semibold text-sm ml-2">
            {statusText[trip.status]}
          </Text>
          <Text className="text-secondary text-sm ml-auto">
            {trip.estimatedArrival} min
          </Text>
        </View>

        {/* Driver info row */}
        <View className="flex-row items-center">
          {/* Avatar */}
          <View className="w-14 h-14 rounded-full bg-gray-200 items-center justify-center">
            {trip.driver.avatar ? (
              <Animated.Image
                source={{ uri: trip.driver.avatar }}
                className="w-14 h-14 rounded-full"
              />
            ) : (
              <Ionicons name="person" size={28} color="#7B8387" />
            )}
          </View>

          {/* Driver details */}
          <View className="ml-3 flex-1">
            <Text className="text-primary font-bold text-lg">
              {trip.driver.name}
            </Text>
            <View className="flex-row items-center mt-0.5">
              {trip.driver.rating > 0 ? (
                <>
                  <Ionicons name="star" size={14} color="#FFB800" />
                  <Text className="text-secondary text-sm ml-1">
                    {trip.driver.rating.toFixed(1)} • {trip.driver.tripsCompleted} trips
                  </Text>
                </>
              ) : (
                <Text className="text-secondary text-sm">
                  New • {trip.driver.tripsCompleted} trips
                </Text>
              )}
            </View>
          </View>

          {/* Action buttons */}
          <View className="flex-row gap-2">
            <IconButton
              icon="chatbubble"
              variant="outline"
              size="md"
              onPress={handleChat}
            />
            <IconButton
              icon="call"
              variant="accent"
              size="md"
              onPress={handleCall}
            />
          </View>
        </View>

        {/* Vehicle info */}
        <View className="flex-row items-center mt-4 p-3 bg-gray-100 rounded-3xl">
          <Ionicons name="car" size={24} color="#26344F" />
          <View className="ml-3 flex-1">
            <Text className="text-primary font-semibold">
              {trip.vehicle.color} {trip.vehicle.model}
            </Text>
            <Text className="text-secondary text-sm">
              {trip.vehicle.plate}
            </Text>
          </View>
          <View className="bg-white px-3 py-1.5 rounded-full">
            <Text className="text-primary font-bold">
              K{trip.fare}
            </Text>
          </View>
        </View>

        {/* Trip progress */}
        <View className="mt-4">
          {/* Pickup */}
          <View className="flex-row items-start">
            <View className="w-6 items-center">
              <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
              <View className="w-0.5 h-8 bg-gray-200 mt-1" />
            </View>
            <View className="ml-2 flex-1">
              <Text className="text-secondary text-xs">PICKUP</Text>
              <Text className="text-primary font-medium text-sm" numberOfLines={1}>
                {formatDisplayAddress(trip.pickup.address)}
              </Text>
            </View>
          </View>

          {/* Destination */}
          <View className="flex-row items-start">
            <View className="w-6 items-center">
              <View className="w-3 h-3 rounded-full bg-accent border-2 border-white shadow-sm" />
            </View>
            <View className="ml-2 flex-1">
              <Text className="text-secondary text-xs">DROP-OFF</Text>
              <Text className="text-primary font-medium text-sm" numberOfLines={1}>
                {formatDisplayAddress(trip.destination.address)}
              </Text>
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            {canCancel ? (
              <Button
                variant="outline"
                size="sm"
                onPress={onCancelTrip}
                leftIcon="close-circle-outline"
              >
                {`Cancel ride (${formatCancelCountdown(remainingCancelSeconds)})`}
              </Button>
            ) : (
              <Text className="text-secondary text-sm text-center py-2">
                Cancellation window closed
              </Text>
            )}
          </View>
          <View className="flex-1">
            <Button
              variant="ghost"
              size="sm"
              onPress={onEndTrip}
            >
              Complete (Demo)
            </Button>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

