import { NavigationCompass, NavigationControls, NavigationMap } from '@/components/navigation';
import { Button, Card, IconButton } from '@/components/ui';
import { CancellationModal } from '@/features/customer/components';
import { formatDisplayAddress } from '@/lib';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { NavigationMode } from '@/navigation/NavigationEngine/NavigationModes';
import { useNavigationStore } from '@/navigation/NavigationEngine/NavigationStore';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import type { LatLng, NavigationActions } from '@/navigation/NavigationEngine/types';
import { useRideStore } from '@/state';
import type { ActiveTrip, CancellationReason } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/** The trip-lifecycle path a Customer's own local NavigationStore mode
 * machine can walk, in order — see `advanceNavigationMode` below. */
const MODE_SEQUENCE: NavigationMode[] = [
  NavigationMode.IDLE,
  NavigationMode.PREVIEW,
  NavigationMode.MATCHING,
  NavigationMode.DRIVER_TO_PICKUP,
  NavigationMode.ARRIVED_PICKUP,
  NavigationMode.TRIP_IN_PROGRESS,
  NavigationMode.ARRIVED_DROPOFF,
  NavigationMode.TRIP_COMPLETED,
];

/** Maps rideStore's `activeTrip.status` onto its NavigationEngine mode
 * equivalent — 'arriving' has no separate NavigationMode of its own
 * (AGENTS.md's DRIVER_TO_PICKUP covers the whole "driver en route to
 * pickup" span, same as the Bible's "Navigate To Pickup"). */
function targetModeForStatus(status: ActiveTrip['status']): NavigationMode {
  switch (status) {
    case 'driver_assigned':
    case 'arriving':
      return NavigationMode.DRIVER_TO_PICKUP;
    case 'waiting':
      return NavigationMode.ARRIVED_PICKUP;
    case 'in_progress':
      return NavigationMode.TRIP_IN_PROGRESS;
    case 'completed':
      return NavigationMode.TRIP_COMPLETED;
  }
}

/**
 * Replays this device's own local `NavigationStore` mode machine forward to
 * match `activeTrip.status`, one legal edge at a time — the Customer-side
 * equivalent of `DriverDashboard.handleAcceptRequest`'s replay for the
 * Driver side (same reasoning: `NavigationStore` is a per-device
 * Zustand store, not shared over the network, so each device has to drive
 * its own instance from whatever status updates it already receives).
 * Re-reads the store after every step rather than precomputing a range, so
 * a step `safeTransition` silently rejected doesn't get treated as if it
 * had succeeded, and stops as soon as no further progress is made.
 */
function advanceNavigationMode(
  navigation: NavigationActions,
  targetMode: NavigationMode,
  pickup: LatLng,
  destination: LatLng
): void {
  const targetIndex = MODE_SEQUENCE.indexOf(targetMode);
  if (targetIndex === -1) return;

  for (let i = 0; i < MODE_SEQUENCE.length; i++) {
    const currentMode = useNavigationStore.getState().mode;
    const currentIndex = MODE_SEQUENCE.indexOf(currentMode);
    if (currentIndex === -1 || currentIndex >= targetIndex) return;

    const nextMode = MODE_SEQUENCE[currentIndex + 1];
    safeTransition(() => {
      switch (nextMode) {
        case NavigationMode.PREVIEW:
          navigation.preview(pickup, destination);
          break;
        case NavigationMode.MATCHING:
          navigation.requestMatch();
          break;
        case NavigationMode.DRIVER_TO_PICKUP:
          navigation.driverToPickup();
          break;
        case NavigationMode.ARRIVED_PICKUP:
          navigation.arrivedAtPickup();
          break;
        case NavigationMode.TRIP_IN_PROGRESS:
          navigation.startTrip();
          break;
        case NavigationMode.ARRIVED_DROPOFF:
          navigation.arrivedAtDropoff();
          break;
        case NavigationMode.TRIP_COMPLETED:
          navigation.completeTrip();
          break;
      }
    });

    if (useNavigationStore.getState().mode === currentMode) return; // stuck — stop instead of looping
  }
}

/**
 * Customer Trip Tracking Screen
 * Full-screen map showing the driver moving toward pickup/destination in
 * real time, driven entirely by rideStore.activeTrip (populated over the
 * order's realtime channel — see rideStore.applyOrderUpdate). The map layer
 * itself now runs on the shared Navigation Engine (NavigationMap /
 * CameraController / NavigationStore) instead of a raw <Map> — see
 * advanceNavigationMode above for how this device's own NavigationStore
 * mode machine is kept in sync with activeTrip.status, and the effect below
 * for how activeTrip's realtime driver position is forwarded into it.
 * rideStore itself is untouched: this screen only reads activeTrip, never
 * writes it.
 */
export default function CustomerTripScreen() {
  const { activeTrip, status, cancelRide } = useRideStore();
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Redirect home if there's no active trip to show (cancelled, completed,
  // or this screen was reached without an order in flight).
  useEffect(() => {
    if (status !== 'active' || !activeTrip) {
      router.replace('/(tabs)');
    }
  }, [status, activeTrip]);

  // Keeps this device's own NavigationStore mode in step with
  // activeTrip.status — see advanceNavigationMode's doc.
  useEffect(() => {
    if (!activeTrip) return;
    const pickup: LatLng = { latitude: activeTrip.pickup.latitude, longitude: activeTrip.pickup.longitude };
    const destination: LatLng = {
      latitude: activeTrip.destination.latitude,
      longitude: activeTrip.destination.longitude,
    };
    advanceNavigationMode(navigation, targetModeForStatus(activeTrip.status), pickup, destination);
  }, [activeTrip?.status, activeTrip?.pickup, activeTrip?.destination, navigation]);

  // Forwards the driver's realtime-channel position into NavigationStore —
  // NavigationMap/CameraController read driverLocation from here, not from
  // a prop this screen passes by hand. rideStore's own applyOrderUpdate
  // write (the actual data source) is unchanged; this only adds a second
  // consumer of the value it already produces.
  useEffect(() => {
    useNavigationStore.getState().setDriverLocation(
      activeTrip?.driverLocation ?? null,
      activeTrip?.driverHeading ?? null
    );
  }, [activeTrip?.driverLocation?.latitude, activeTrip?.driverLocation?.longitude, activeTrip?.driverHeading]);

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
    safeTransition(() => navigation.cancel());
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
      {/* Full-screen map — the engine (CameraController, driven by
          NavigationStore) owns every marker/camera decision this base layer
          renders; the screen no longer passes driver position or camera
          props by hand. */}
      <View className="absolute inset-0">
        <NavigationMap>
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', right: 16, top: insets.top + 16, gap: 12 }}
          >
            <NavigationCompass />
            <NavigationControls />
          </View>
        </NavigationMap>
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
