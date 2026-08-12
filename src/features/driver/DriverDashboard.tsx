import { NavigationMap } from '@/components/navigation';
import { Card, IconButton, SkeletonBox } from '@/components/ui';
import { recenterOnLocation } from '@/navigation/NavigationEngine/CameraController';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { useDriverLocation, useFollowMode } from '@/navigation/NavigationEngine/NavigationHooks';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useDriverStore, useUserStore } from '@/state';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

  // Engine-owned — read from NavigationStore, not mirrored into local state
  // (matches app/(driver)/navigation.tsx's/trip.tsx's migration pattern).
  // NavigationProvider (mounted once at the app root) already forwards
  // every GPSManager fix into this once GPS is acquired below. Heading
  // isn't read here — <NavigationMap/> already reads it from the store
  // internally to render the car marker, this screen has no other use for it.
  const driverLocation = useDriverLocation();
  // Whether the camera is actively auto-following (true) or the driver
  // panned away into FREE_EXPLORE (false) — <NavigationMap/>'s own gesture
  // handling already owns this transition (pan -> enterFreeExplore() -> a
  // 7s timer -> recenter()), so no screen-local auto-follow timer is needed.
  const followMode = useFollowMode();

  // GPS acquisition lifecycle only — goes entirely through GPSManager, the
  // only file allowed to create a location subscription
  // (src/navigation/NavigationEngine/GPSManager.ts).
  useEffect(() => {
    if (!isOnline) return;

    GPSManager.acquire('foreground', 'driverBestNavigation').catch((error) => {
      if (__DEV__) {
        console.warn('[DriverDashboard] GPS acquisition failed:', error);
      }
    });

    return () => {
      GPSManager.release();
    };
  }, [isOnline]);

  // Bridges the engine's live driverLocation into driverStore's persisted
  // position (hex9/nearbyHexes/incomingRequests recompute on every call) —
  // same bridge app/(driver)/trip.tsx already uses; NavigationStore
  // intentionally isn't written back to driverStore on its own
  // (Architecture.md's "Relationship to existing stores").
  useEffect(() => {
    if (driverLocation) {
      updateLocation(driverLocation.latitude, driverLocation.longitude);
    }
  }, [driverLocation, updateLocation]);

  // Camera follow, engine-owned: CameraController has no per-mode opinion
  // for IDLE/OFFLINE (no active trip to frame), so this re-centers on every
  // fix directly via CameraController.recenterOnLocation — the same
  // one-shot primitive CustomerHome's recenter button uses — instead of
  // calling animateToRegion() itself. Gated on followMode (owned by
  // <NavigationMap/>'s own pan-gesture handling below) so panning away
  // pauses following exactly as before, without a second, screen-local
  // auto-follow timer duplicating that mechanism.
  useEffect(() => {
    if (driverLocation && followMode) {
      recenterOnLocation(driverLocation);
    }
  }, [driverLocation, followMode]);

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
      // DRIVER_TO_PICKUP the moment this Driver accepts — per Phase 5C:
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

  const handleRecenter = React.useCallback(async () => {
    try {
      const fix = await GPSManager.getCurrentFix('driverBestNavigation');
      if (fix) {
        recenterOnLocation(fix.coordinate);
        navigation.recenter(); // exit free explore mode
      } else {
        if (__DEV__) {
          console.warn('[DriverDashboard] GPS acquisition failed: null fix returned');
        }
        Alert.alert('Location unavailable', 'Could not determine your current location.');
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[DriverDashboard] GPS acquisition failed:', error);
      }
      Alert.alert('Location unavailable', 'Could not determine your current location.');
    }
  }, [navigation]);

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />

      {/* Full-screen map — the engine (CameraController, driven by
          NavigationStore) owns every marker/camera decision this base
          layer renders; the screen no longer passes driver position or
          camera props by hand. */}
      <View className="absolute inset-0">
        <NavigationMap />
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Header - Minimalist & Centered Status */}
        <View className="px-5 pt-4 pb-2 items-center justify-center flex-row relative" pointerEvents="box-none">
          {/* Status Pill */}
          <View className={`px-5 py-2 rounded-full ${isOnline ? 'bg-success/10' : 'bg-primary/10'} shadow-sm bg-white/95 border border-white/20`}>
            <Text className={`font-bold text-sm ${isOnline ? 'text-success' : 'text-primary uppercase tracking-wider'}`}>
              {isOnline ? "You're Online" : "Currently Offline"}
            </Text>
          </View>

          {/* Fixed Online Toggle at top right */}
          <View className="absolute right-5" pointerEvents="auto">
            <OnlineToggle isOnline={isOnline} onToggle={handleToggleOnline} />
          </View>
        </View>

        {/* Dashboard Stats - Only show when offline */}
        {!isOnline && <DashboardStats />}

        {/* Offline Placeholder Overlay */}
        {!isOnline && (
          <View className="flex-1 items-center justify-center pointer-events-none px-5 pb-20">
            <View className="bg-white/95 px-6 py-8 rounded-3xl items-center shadow-sm border border-gray-200 w-full max-w-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
                <Ionicons name="moon-outline" size={32} color="#9CA3AF" />
              </View>
              <Text className="text-xl font-bold text-primary mb-2">You're Offline</Text>
              <Text className="text-sm text-gray-500 text-center leading-relaxed">
                Toggle online to start receiving ride requests.
              </Text>
            </View>
          </View>
        )}

        {/* Re-center Button (Locator Icon) */}
        <View
          className="absolute right-5"
          style={{
            bottom: isOnline ? (incomingRequests.length > 0 ? 300 : 120) : 320,
            zIndex: 15
          }}
        >
          <View
            className="bg-white p-0.5 rounded-full shadow-lg"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 10
            }}
          >
            <IconButton
              icon="locate"
              variant="ghost"
              size="lg"
              onPress={handleRecenter}
            />
          </View>
        </View>

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

        </View>
      </SafeAreaView>
    </View>
  );
}

