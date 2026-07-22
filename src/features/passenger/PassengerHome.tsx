import type { MapVehicle, VehicleMarkerVariant } from '@/components/map';
import { Map, ProvinceLabel } from '@/components/map';
import { getNearbyHexes } from '@/core/spatialEngine';

import { BackButton, IconButton } from '@/components/ui';
import { useSnappedLocation } from '@/hooks/useSnappedLocation';
import { calculateDistanceMeters } from '@/lib/distance';
import { findNearbyDrivers } from '@/services/discoveryEngine';
import { useRideStore, useSettingsStore } from '@/state';
import type { CancellationReason, Location as GeoLocation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTripCard, CancellationModal, MatchingOverlay, RidePlannerSheet } from './components';

// Simulated nearby Transporter vehicles shown idling around the customer
// while there's no live driver location to display yet.
const NEARBY_VEHICLE_MIN_COUNT = 2;
const NEARBY_VEHICLE_MAX_COUNT = 4;
// Must stay inside the map's default "premium street-level zoom" viewport
// (latitudeDelta 0.0035 / longitudeDelta 0.0016, used in getInitialRegion and
// handleRecenter) — that view only spans ~195m half-height / ~87m half-width
// from center. A larger radius scatters vehicles past the visible camera
// edge, where they still render but are indistinguishable from not showing.
const NEARBY_VEHICLE_RADIUS_METERS = 80;
const VEHICLE_IDLE_JITTER_DEGREES = 0.00002;
const METERS_PER_DEGREE_LAT = 111320;

// How close the pickup pin needs to be to the live GPS dot to count as "the
// same spot" — the pickup (raw GPS) and userLocation (road-snapped GPS) come
// from independent fixes, so a tiny tolerance absorbs snapping drift instead
// of requiring bit-exact coordinates.
const PICKUP_LIVE_LOCATION_MATCH_METERS = 25;

function generateNearbyVehicles(center: GeoLocation): MapVehicle[] {
  const count =
    NEARBY_VEHICLE_MIN_COUNT +
    Math.floor(Math.random() * (NEARBY_VEHICLE_MAX_COUNT - NEARBY_VEHICLE_MIN_COUNT + 1));

  return Array.from({ length: count }, (_, index) => {
    // Uniform random point within the radius circle.
    const r = NEARBY_VEHICLE_RADIUS_METERS * Math.sqrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((center.latitude * Math.PI) / 180);

    return {
      id: `nearby-vehicle-${index}-${Date.now()}`,
      latitude: center.latitude + (r * Math.cos(theta)) / METERS_PER_DEGREE_LAT,
      longitude: center.longitude + (r * Math.sin(theta)) / metersPerDegreeLng,
      heading: Math.floor(Math.random() * 360),
      variant: 'economy' as VehicleMarkerVariant,
    };
  });
}

interface VehicleIdleJitterProps {
  id: string;
  baseLat: number;
  baseLng: number;
  onJitter: (id: string, latitude: number, longitude: number) => void;
}

/**
 * Non-visual driver that nudges a nearby vehicle's coordinate by a tiny
 * random amount every ~3-4s so it feels alive. AnimatedVehicleMarker already
 * smoothly interpolates any coordinate change it's given, so this only needs
 * to hand it a new (barely different) target position on each cycle.
 */
function VehicleIdleJitter({ id, baseLat, baseLng, onJitter }: VehicleIdleJitterProps) {
  const pulse = useSharedValue(0);

  const triggerJitter = useCallback(() => {
    const jitterLat = (Math.random() * 2 - 1) * VEHICLE_IDLE_JITTER_DEGREES;
    const jitterLng = (Math.random() * 2 - 1) * VEHICLE_IDLE_JITTER_DEGREES;
    onJitter(id, baseLat + jitterLat, baseLng + jitterLng);
  }, [id, baseLat, baseLng, onJitter]);

  useEffect(() => {
    const halfCycleMs = 1500 + Math.random() * 500; // full cycle ~3-4s

    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: halfCycleMs, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: halfCycleMs, easing: Easing.inOut(Easing.ease) }, (finished) => {
          if (finished) {
            runOnJS(triggerJitter)();
          }
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, triggerJitter]);

  return null;
}

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
    routeDurationMinutes,
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
  const [showH3Grid, setShowH3Grid] = useState(false);
  const [matchingPhase, setMatchingPhase] = useState<'searching' | 'expanded'>('searching');
  const mapRef = useRef<any>(null);

  // Debug-only feature: force the grid off if h3DebugMode is turned off while
  // it's showing, so customers can never be left staring at hexagons with no
  // toggle button left to dismiss them.
  useEffect(() => {
    if (!h3DebugMode && showH3Grid) {
      setShowH3Grid(false);
    }
  }, [h3DebugMode, showH3Grid]);

  // Simulated nearby Transporter vehicles, spawned once around the customer's
  // first known location so they don't jump around as GPS fixes update.
  const [baseNearbyVehicles, setBaseNearbyVehicles] = useState<MapVehicle[]>([]);
  const [nearbyVehicles, setNearbyVehicles] = useState<MapVehicle[]>([]);

  useEffect(() => {
    if (userLocation && baseNearbyVehicles.length === 0) {
      const generated = generateNearbyVehicles(userLocation);
      setBaseNearbyVehicles(generated);
      setNearbyVehicles(generated);
    }
  }, [userLocation, baseNearbyVehicles.length]);

  const handleVehicleJitter = useCallback((id: string, latitude: number, longitude: number) => {
    setNearbyVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, latitude, longitude } : v)));
  }, []);

  // Only show simulated nearby cars before a booking is made.
  const showNearbyVehicles = status === 'idle' || status === 'planning';

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
    } catch {
      // Silently ignore — re-centering is a non-critical convenience action.
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

  // The blue live-location dot is only rendered in these statuses.
  const showUserMarker = status === 'idle' || status === 'planning' || status === 'matching';

  // Hide the plain pickup pin when it sits on top of the blue GPS dot —
  // otherwise the same live location gets two markers. Pickup (raw GPS) and
  // userLocation (road-snapped GPS) come from independent fixes, so allow a
  // small tolerance instead of requiring exactly equal coordinates.
  const pickupMatchesUserLocation =
    showUserMarker &&
    !!pickupToDisplay &&
    !!userLocation &&
    calculateDistanceMeters(
      pickupToDisplay.latitude,
      pickupToDisplay.longitude,
      userLocation.latitude,
      userLocation.longitude
    ) <= PICKUP_LIVE_LOCATION_MATCH_METERS;

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

  // Formatted arrival time shown on the destination map marker once a route
  // duration is known.
  const arrivalTime = useMemo(() => {
    if (!destination || !routeDurationMinutes) return null;
    const arrival = new Date(Date.now() + routeDurationMinutes * 60000);
    return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [destination, routeDurationMinutes]);

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
          arrivalTime={arrivalTime}

          showRoute={showRoute}
          passengerHex9={passengerHex9}
          showH3Grid={showH3Grid}
          h3Grid={h3Grid}
          routeCoordinates={routeCoordinates.length > 0 ? routeCoordinates : undefined}
          showUserMarker={showUserMarker}
          showSearchPulse={status === 'matching' && matchingPhase === 'searching'}
          hidePickupPin={pickupMatchesUserLocation}
          isLiveLocation={!isPickupManual && showUserMarker}
          vehicles={showNearbyVehicles ? nearbyVehicles : undefined}
          mapType={mapType}
          onPanDrag={handleMapDragStart}
          onRegionChangeComplete={handleMapDragEnd}
        />

        {/* Drivers for the idle micro-movement of simulated nearby vehicles
            (non-visual — each just nudges its own marker's coordinate) */}
        {showNearbyVehicles &&
          baseNearbyVehicles.map((vehicle) => (
            <VehicleIdleJitter
              key={vehicle.id}
              id={vehicle.id}
              baseLat={vehicle.latitude}
              baseLng={vehicle.longitude}
              onJitter={handleVehicleJitter}
            />
          ))}

        {/* Back Button - floats above the bottom sheet, returns to Discover */}
        <View
          className="absolute left-4"
          style={{
            bottom: isMapDragging
              ? (insets.bottom + 100)
              : (status === 'active' ? 360 : 420),
            zIndex: 15,
          }}
        >
          <BackButton onPress={() => router.back()} />
        </View>

        {/* Floating Controls Container (Vertical Stack) */}
        <View
          className="absolute right-4 items-center gap-4"
          style={{
            top: insets.top + (status === 'active' ? 10 : 60),
            zIndex: 10
          }}
        >
          {/* H3 Grid Toggle Button — debug-only, never shown to customers */}
          {h3DebugMode && (
            <Pressable
              onPress={() => setShowH3Grid(!showH3Grid)}
              className={`w-12 h-12 rounded-full items-center justify-center shadow-md ${showH3Grid ? 'bg-red-500' : 'bg-white'}`}
            >
              <Ionicons
                name={showH3Grid ? 'grid' : 'grid-outline'}
                size={24}
                color={showH3Grid ? '#FFFFFF' : '#26344F'}
              />
            </Pressable>
          )}

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

