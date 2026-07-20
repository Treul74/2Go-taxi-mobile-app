import { Map } from '@/components/map';
import { Card, SkeletonBox } from '@/components/ui';
import { useDriverStore, useUserStore } from '@/state';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DashboardStats, OnlineToggle, RequestCard } from './components';

/**
 * Driver Dashboard Screen
 * Shows real-time Google Map with car tracking and incoming requests
 */
export function DriverDashboard() {
  const router = useRouter();
  const driverAccount = useUserStore((state) => state.driverAccount);
  const {
    isOnline,
    goOnline,
    goOffline,
    stats,
    incomingRequests,
    isRequestsLoading,
    acceptRequest,
    declineRequest,
    updateLocation,
  } = useDriverStore();

  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState<number>(0);
  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [lastInteraction, setLastInteraction] = useState(0);
  const mapRef = React.useRef<any>(null);

  // Auto-follow logic: Resumes following after 5 seconds of no interaction
  useEffect(() => {
    if (!isAutoFollow) {
      const timer = setInterval(() => {
        const now = Date.now();
        if (now - lastInteraction > 5000) {
          setIsAutoFollow(true);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isAutoFollow, lastInteraction]);

  const handleMapAction = () => {
    setIsAutoFollow(false);
    setLastInteraction(Date.now());
  };

  // High-accuracy real-time tracking
  useEffect(() => {
    let subscription: any = null;

    async function startTracking() {
      try {
        // 1. Check if services are enabled
        const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
        if (!enabled) {
          console.warn('Location services are fully disabled on this device.');
          return;
        }

        // 2. Request permissions
        const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        if (status !== 'granted') return;

        // 3. Get initial position with multi-tier fallback
        let initial = null;
        const accuracyTiers = [
          Location.Accuracy.High,
          Location.Accuracy.Balanced,
          Location.Accuracy.Low,
        ];

        for (const accuracy of accuracyTiers) {
          try {
            initial = await Location.getCurrentPositionAsync({ accuracy });
            if (initial) break;
          } catch (e) {
            // Continue to next tier
          }
        }

        // Last resort: Last known position
        if (!initial) {
          try {
            initial = await Location.getLastKnownPositionAsync();
          } catch (e) { }
        }

        if (initial) {
          setDriverLocation(initial.coords);
          updateLocation(initial.coords.latitude, initial.coords.longitude);
          if (initial.coords.heading !== null) {
            setDriverHeading(initial.coords.heading);
          }
        }

        // 4. Watch for movement with fallback
        const startWatching = async (accuracy: Location.LocationAccuracy) => {
          try {
            return await Location.watchPositionAsync(
              {
                accuracy,
                distanceInterval: accuracy === Location.Accuracy.High ? 1 : 10,
                timeInterval: accuracy === Location.Accuracy.High ? 1000 : 5000,
              },
              (location) => {
                setDriverLocation(location.coords);
                updateLocation(location.coords.latitude, location.coords.longitude);
                if (location.coords.heading !== null) {
                  setDriverHeading(location.coords.heading);
                }

                if (isAutoFollow && mapRef.current) {
                  mapRef.current.animateToRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.0035,
                    longitudeDelta: 0.0016,
                  }, 600);
                }
              }
            );
          } catch (e) {
            return null;
          }
        };

        subscription = await startWatching(Location.Accuracy.High);
        if (!subscription) {
          subscription = await startWatching(Location.Accuracy.Balanced);
        }
        if (!subscription) {
          subscription = await startWatching(Location.Accuracy.Low);
        }

      } catch (error: any) {
        // Silently handle 'unsatisfied device settings' to avoid console spam
        if (error?.message?.includes('unsatisfied device settings')) {
          console.warn('Location tracking paused: Device location settings (GPS/Network) are not optimal.');
        } else {
          console.warn('Non-critical location error:', error?.message);
        }
      }
    }

    if (isOnline) {
      startTracking();
    }

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [isOnline, isAutoFollow]);

  // Leave the pending-orders realtime channel on unmount regardless of
  // online state, so navigating away never leaves a dangling subscription.
  useEffect(() => {
    return () => {
      const id = useUserStore.getState().driverAccount?.id;
      if (useDriverStore.getState().isOnline && id) {
        useDriverStore.getState().goOffline(id);
      }
    };
  }, []);

  // Slide-to-go-online/offline: persists driver_status to InsForge first,
  // then (online only) fetches + subscribes to real pending orders matching
  // this driver's vehicle type. The slider only reflects the new state once
  // the InsForge call actually succeeds.
  const handleToggleOnline = async () => {
    if (!driverAccount) return;

    const success = isOnline
      ? await goOffline(driverAccount.id)
      : await goOnline(driverAccount.id, driverAccount.vehicleType);

    if (!success) {
      Alert.alert(
        isOnline ? "Couldn't go offline" : "Couldn't go online",
        'Please check your connection and try again.'
      );
    }
  };

  // Handle ride acceptance and navigate to navigation screen
  const handleAcceptRequest = async (id: string) => {
    if (!driverAccount) return;
    const trip = await acceptRequest(id, driverAccount.id);
    if (trip) {
      router.push('/(driver)/navigation');
    } else {
      Alert.alert('Ride unavailable', 'This ride was just taken by another driver.');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />

      {/* Full-screen Google Map background */}
      <View className="absolute inset-0">
        <Map
          ref={mapRef}
          driverLocation={driverLocation || undefined}
          driverHeading={driverHeading}
          showUserMarker={false}
          scrollEnabled={true}
          zoomEnabled={true}
          onPanDrag={handleMapAction}
          onRegionChangeComplete={handleMapAction}
        />
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Header - Minimalist & Centered Status */}
        <View className="px-5 pt-4 pb-2 items-center justify-center" pointerEvents="box-none">
          {/* Status Pill */}
          <View className={`px-5 py-2 rounded-full ${isOnline ? 'bg-success/10' : 'bg-primary/10'} shadow-sm bg-white/95 border border-white/20`}>
            <Text className={`font-bold text-sm ${isOnline ? 'text-success' : 'text-primary uppercase tracking-wider'}`}>
              {isOnline ? "You're Online" : "Currently Offline"}
            </Text>
          </View>
        </View>

        {/* Dashboard Stats - Only show when offline */}
        {!isOnline && <DashboardStats />}

        {/* Dynamic Overlay for Requests */}
        <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
          {isOnline && (
            <View className="max-h-[60%] mb-4" pointerEvents="box-none">
              <ScrollView
                showsVerticalScrollIndicator={false}
                className="overflow-visible"
                pointerEvents="box-none"
              >
                {isRequestsLoading && incomingRequests.length === 0 ? (
                  [0, 1].map((i) => (
                    <View key={i} className="mb-4" pointerEvents="none">
                      <Card variant="default" padding="none" radius="2xl">
                        <View className="flex-row items-center justify-between p-4 bg-accent/5 border-b border-gray-100">
                          <View className="flex-row items-center">
                            <SkeletonBox width={40} height={40} borderRadius={20} />
                            <View className="ml-3">
                              <SkeletonBox width={120} height={14} borderRadius={4} />
                            </View>
                          </View>
                          <SkeletonBox width={48} height={48} borderRadius={24} />
                        </View>
                        <View className="p-4">
                          <SkeletonBox width="80%" height={12} borderRadius={4} style={{ marginBottom: 12 }} />
                          <SkeletonBox width="60%" height={12} borderRadius={4} />
                        </View>
                      </Card>
                    </View>
                  ))
                ) : (
                  incomingRequests.map((request) => (
                    <View key={request.id} pointerEvents="auto">
                      <RequestCard
                        request={request}
                        onAccept={handleAcceptRequest}
                        onDecline={declineRequest}
                      />
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          {/* Fixed Online Toggle at bottom */}
          <View pointerEvents="auto">
            <OnlineToggle isOnline={isOnline} onToggle={handleToggleOnline} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

