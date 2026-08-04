import { Map } from '@/components/map';
import { Card, SkeletonBox } from '@/components/ui';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useDriverStore, useUserStore } from '@/state';
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
  const navigation = useNavigation();

  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState<number>(0);
  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [lastInteraction, setLastInteraction] = useState(0);
  const mapRef = React.useRef<any>(null);
  // Mirrors isAutoFollow for the onFix callback below, so that callback can
  // read its current value without needing isAutoFollow in the tracking
  // effect's dependency array — toggling auto-follow no longer tears down
  // and recreates the GPS subscription (a pre-existing inefficiency; see
  // audit_export/audit_03-08-26_11-58_gps-subscription-audit.md).
  const isAutoFollowRef = React.useRef(isAutoFollow);
  useEffect(() => {
    isAutoFollowRef.current = isAutoFollow;
  }, [isAutoFollow]);

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

  // High-accuracy real-time tracking. GPS acquisition goes entirely through
  // GPSManager (the only file allowed to create a location subscription —
  // see src/navigation/NavigationEngine/GPSManager.ts), which owns its own
  // accuracy-tier/fallback handling internally, so this effect only reacts
  // to `isOnline`, not `isAutoFollow` — the underlying subscription is no
  // longer torn down and recreated on every auto-follow toggle.
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;
    const unsubscribeFix = GPSManager.onFix((fix) => {
      setDriverLocation(fix.coordinate);
      updateLocation(fix.coordinate.latitude, fix.coordinate.longitude);
      if (fix.heading !== undefined) {
        setDriverHeading(fix.heading);
      }

      if (isAutoFollowRef.current && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: fix.coordinate.latitude,
          longitude: fix.coordinate.longitude,
          latitudeDelta: 0.0035,
          longitudeDelta: 0.0016,
        }, 600);
      }
    });

    async function startTracking() {
      try {
        await GPSManager.acquire('foreground', 'driverBestNavigation');
        if (cancelled) return;

        // A sibling consumer (or a previous mount) may already have
        // GPSManager tracking active — seed immediately from its last fix
        // instead of waiting for the next tick.
        const existingFix = GPSManager.getLastFix();
        if (existingFix) {
          setDriverLocation(existingFix.coordinate);
          updateLocation(existingFix.coordinate.latitude, existingFix.coordinate.longitude);
          if (existingFix.heading !== undefined) {
            setDriverHeading(existingFix.heading);
          }
        }
      } catch {
        // Silently handle location errors (including 'unsatisfied device settings'),
        // matching the previous behaviour.
      }
    }

    startTracking();

    return () => {
      cancelled = true;
      unsubscribeFix();
      GPSManager.release();
    };
  }, [isOnline]);

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
      return;
    }

    // Mirrors driverStore's online/offline flip onto NavigationStore's mode
    // machine (IDLE <-> OFFLINE). Guarded: NavigationStore starts at IDLE,
    // not OFFLINE, so the very first "go online" of a session is a no-op
    // here (IDLE already means "available") rather than an illegal
    // transition — see safeTransition's doc comment.
    safeTransition(() => {
      if (isOnline) navigation.goOffline();
      else navigation.goOnline();
    });
  };

  // Handle ride acceptance and navigate to navigation screen
  const handleAcceptRequest = async (id: string) => {
    if (!driverAccount) return;
    const trip = await acceptRequest(id, driverAccount.id);
    if (trip) {
      // Drives NavigationStore through the same edges a Customer's own
      // booking flow would (IDLE -> PREVIEW -> MATCHING), landing on
      // DRIVER_TO_PICKUP the moment this Transporter accepts — per Phase 5C:
      // reusing the existing state machine's legal edges, not inventing one.
      safeTransition(() => {
        navigation.preview(trip.pickup, trip.destination);
        navigation.requestMatch();
        navigation.driverToPickup(driverLocation ?? undefined);
      });
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

