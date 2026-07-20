import { Map, ProvinceLabel } from '@/components/map';
import { getNearbyHexes } from '@/core/spatialEngine';

import { BackButton, IconButton } from '@/components/ui';
import { useSnappedLocation } from '@/hooks/useSnappedLocation';
import { findNearbyDrivers } from '@/services/discoveryEngine';
import { useRideStore, useSettingsStore } from '@/state';
import type { CancellationReason } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTripCard, CancellationModal, MatchingOverlay, RidePlannerSheet } from './components';

/**
 * Passenger Home Screen
 * Full-screen map with ride planning card
 * Shows matching overlay and active trip card based on ride status
 */
export function PassengerHome() {
  const insets = useSafeAreaInsets();
  const {
    status,
    activeTrip,
    pickup,
    destination,
    isPickupManual,
    routeCoordinates,
    passengerHex9,
    requestRide,
    cancelRide,
    completeRide,
    setStatus,
  } = useRideStore();

  const { h3DebugMode, toggleH3DebugMode } = useSettingsStore();
  const { location: userLocation, province, loading: locationLoading } = useSnappedLocation();

  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'terrain' | 'hybrid'>('standard');
  const [showH3Grid, setShowH3Grid] = useState(true);
  const [matchingPhase, setMatchingPhase] = useState<'searching' | 'expanded'>('searching');
  const mapRef = useRef<any>(null);

  // Reset to the "searching" phase every time a new matching cycle starts.
  useEffect(() => {
    if (status === 'matching') {
      setMatchingPhase('searching');
    }
  }, [status]);

  // Calculate H3 Grid (Radius 2 as requested)
  const h3Grid = React.useMemo(() => {
    if (!passengerHex9) return [];
    try {
      // getNearbyHexes(hex, 2) returns center + 2 rings (19 total hexagons)
      const ring = useRideStore.getState().passengerHex9
        ? getNearbyHexes(useRideStore.getState().passengerHex9!, 2)
        : [];
      return ring;
    } catch (e) {
      return [];
    }
  }, [passengerHex9]);

  // Handle re-center to user location

  const handleRecenter = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
      if (status !== 'granted') return;

      let position = null;
      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch (e) {
        // Fallback to last known if High is unsatisfied
        position = await Location.getLastKnownPositionAsync();
      }

      if (position && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.0035, // Premium street-level zoom
          longitudeDelta: 0.0016,
        }, 1000);
      }
    } catch (error: any) {
      if (!error?.message?.includes('unsatisfied device settings')) {
        console.warn('Failed to re-center:', error?.message);
      }
    }
  }, []);

  // Handle ride request
  const handleRequestRide = useCallback(async () => {
    try {
      await requestRide();
    } catch (error) {
      console.error('Failed to request ride:', error);
      setStatus('idle');
    }
  }, [requestRide, setStatus]);

  // Handle cancel during matching
  const handleCancelMatching = useCallback(() => {
    setStatus('idle');
  }, [setStatus]);

  // Handle cancel trip - show modal
  const handleCancelTrip = useCallback(() => {
    setShowCancellationModal(true);
  }, []);

  // Handle confirmed cancellation
  const handleConfirmCancellation = useCallback((reason: CancellationReason, note?: string) => {
    cancelRide(reason, note);
    setShowCancellationModal(false);
  }, [cancelRide]);

  const handleEndTrip = useCallback(() => {
    completeRide();
  }, [completeRide]);

  // Handle map dragging state with a small delay to avoid flickering
  const dragTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  const handleMapDragStart = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }
    setIsMapDragging(true);
  }, []);

  const handleMapDragEnd = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }
    // Delay the appearance of the card to ensure map has settled
    // and user has finished their interaction
    dragTimeoutRef.current = setTimeout(() => {
      setIsMapDragging(false);
      dragTimeoutRef.current = null;
    }, 1200); // 1.2 second delay feels premium and avoids "re-pop up" issues
  }, []);

  // Handle map type toggle
  const toggleMapType = () => {
    setMapType(prev => {
      if (prev === 'standard') return 'terrain';
      if (prev === 'terrain') return 'hybrid';
      return 'standard';
    });
  };

  // Determine if we should show pickup marker
  // Only show if destination is set, ride is active/matching, or user manually picked a location
  const shouldShowPickupMarker = !!destination || status === 'matching' || status === 'active' || isPickupManual;
  const pickupToDisplay = (shouldShowPickupMarker || activeTrip) ? (activeTrip?.pickup || pickup) : undefined;

  // Debug logging for H3
  useEffect(() => {
    if (h3DebugMode && passengerHex9 && (status === 'matching' || status === 'planning')) {
      const nearby = findNearbyDrivers(passengerHex9);
      console.log(`[H3 DEBUG] Discovered ${nearby.length} drivers near ${passengerHex9}`);
      nearby.forEach(d => console.log(` - Driver ${d.id} at ${d.hex9}`));
    }
  }, [h3DebugMode, passengerHex9, status]);

  // Determine if we should show route on map
  const showRoute = (status === 'active' || (!!pickup && !!destination && routeCoordinates.length > 0)) && activeTrip?.status !== 'waiting';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />

      {/* Map base layer - absolutely positioned at z-index 0 */}
      <View style={styles.mapContainer} pointerEvents="box-none">
        <Map
          ref={mapRef}
          userLocation={userLocation || undefined}
          pickup={pickupToDisplay || undefined}
          destination={activeTrip?.destination || destination || undefined}

          showRoute={showRoute}
          passengerHex9={passengerHex9}
          showH3Grid={showH3Grid}
          h3Grid={h3Grid}
          routeCoordinates={routeCoordinates.length > 0 ? routeCoordinates : undefined}
          showUserMarker={status === 'idle' || status === 'planning' || status === 'matching'}
          showSearchPulse={status === 'matching' && matchingPhase === 'searching'}
          mapType={mapType}
          onPanDrag={handleMapDragStart}
          onRegionChangeComplete={handleMapDragEnd}
        />

        {/* Back Button - Upper-left corner, returns to Discover */}
        <View
          className="absolute left-4"
          style={{ top: insets.top + 16, zIndex: 20 }}
        >
          <BackButton />
        </View>

        {/* Floating Controls Container (Vertical Stack) */}
        <View
          className="absolute right-4 items-center gap-4"
          style={{
            top: insets.top + (status === 'active' ? 10 : 60),
            zIndex: 10
          }}
        >
          {/* H3 Grid Toggle Button */}
          <Pressable
            onPress={() => setShowH3Grid(!showH3Grid)}
            className={`w-12 h-12 rounded-full items-center justify-center shadow-md ${showH3Grid ? 'bg-red-500' : 'bg-white'}`}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 3,
              elevation: 5
            }}
          >
            <Ionicons
              name={showH3Grid ? 'grid' : 'grid-outline'}
              size={24}
              color={showH3Grid ? '#FFFFFF' : '#26344F'}
            />
          </Pressable>

          {/* Map Type Toggle */}
          <Pressable
            onPress={toggleMapType}
            className="bg-white w-12 h-12 rounded-full items-center justify-center shadow-md"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 3,
              elevation: 5
            }}
          >
            <Ionicons
              name={mapType === 'standard' ? 'map-outline' : mapType === 'terrain' ? 'layers-outline' : 'globe-outline'}
              size={24}
              color="#26344F"
            />
          </Pressable>

          {/* Re-center Button - Always stays above the RidePlannerSheet or ActiveTripCard */}
          <View
            style={{
              marginTop: Platform.OS === 'ios' ? (isMapDragging ? 400 : 0) : (isMapDragging ? 450 : 20),
              // We'll use absolute positioning for better control if needed, 
              // but here we just stack them.
            }}
          >
            {/* Let's put it at the bottom right instead for better ergonomics */}
          </View>
        </View>

        {/* Re-center Button (Bottom Right Positioning for better Thumb Reach) */}
        <View
          className="absolute right-4"
          style={{
            bottom: isMapDragging ? (insets.bottom + 100) : (status === 'active' ? 360 : 420),
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
              onLongPress={toggleH3DebugMode}
            />
          </View>
        </View>

        {/* H3 Debug Overlay */}
        {h3DebugMode && (
          <View
            className="absolute top-16 left-4 right-4 bg-black/70 p-3 rounded-xl border border-blue-500/50"
            style={{ zIndex: 100 }}
          >
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-blue-400 font-bold text-xs uppercase tracking-widest">H3 Spatial Debug</Text>
              <View className="bg-red-500 px-1.5 py-0.5 rounded">
                <Text className="text-white text-[10px] font-bold">LIVE</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="cube-outline" size={14} color="#60A5FA" />
              <Text className="text-white font-mono text-sm">{passengerHex9 || 'Calculating...'}</Text>
            </View>
            <Text className="text-blue-200/60 text-[10px] mt-1 italic">
              * Resolution: 9 (≈170m) | Search radius: 6 rings
            </Text>
          </View>
        )}

        {/* Province Label */}
        <ProvinceLabel province={province} loading={locationLoading} />
      </View>

      {/* Overlay layer - rides on top of map */}
      <KeyboardAvoidingView
        style={styles.overlayContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        {/* Ride planner (shown when idle or planning) */}
        {(status === 'idle' || status === 'planning') && (
          <RidePlannerSheet onRequestRide={handleRequestRide} isMapDragging={isMapDragging} />
        )}

        {/* Matching overlay */}
        {status === 'matching' && (
          <MatchingOverlay onCancel={handleCancelMatching} onPhaseChange={setMatchingPhase} />
        )}

        {/* Active trip card */}
        {status === 'active' && activeTrip && (
          <ActiveTripCard
            trip={activeTrip}
            onEndTrip={handleEndTrip}
            onCancelTrip={handleCancelTrip}
            isMapDragging={isMapDragging}
          />
        )}

        {/* Cancellation modal */}
        <CancellationModal
          visible={showCancellationModal}
          onClose={() => setShowCancellationModal(false)}
          onConfirm={handleConfirmCancellation}
          driverName={activeTrip?.driver.name}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});

