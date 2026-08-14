import { colors } from '@/constants/theme';
import { hasGoogleMapsApiKey } from '@/constants/env';
import { calculateDistanceMeters } from '@/lib/distance';
import { calculateBearing } from '@/lib/routeSnapping';
import { getHexBoundary, getHexCenter } from '@/core/spatialEngine';
import { useRoadSnappedVehicle } from '@/hooks/useRoadSnappedVehicle';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { MapProps } from './Map';
import { MapPlaceholder } from './MapPlaceholder';
import { AnimatedUserLocation, AnimatedVehicleMarker, ArrivalTimeMarker, NavigationArrowMarker, SearchPulseMarker, UserLocationMarker, DriverStaticPositionMarker } from './markers';

// Lazy import react-native-maps to handle missing native modules gracefully
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let Polygon: any = null;
let PROVIDER_GOOGLE: any = null;
let hasNativeModule = false;

try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  Polygon = maps.Polygon;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  hasNativeModule = true;
} catch (error) {
  // react-native-maps not available (Expo Go)
  hasNativeModule = false;
}

// ---------------------------------------------------------------------------
// Performance (Phase 7F): memoized layers.
//
// `Map`'s driver/vehicle markers legitimately re-render on every GPS fix
// (~1/sec while navigating) — that's the whole point, the driver moved. But
// before this pass, the route polyline/arrows/turn-highlights and the
// pickup/destination/H3-grid/ETA-badge markers lived inline in the same
// render, so React re-diffed all of them too on every single fix even
// though none of their own props (route, pickup, destination, H3 grid, ETA)
// had changed. `React.memo` here means React bails out of re-rendering
// (and re-invoking) these two blocks unless the specific props each one
// actually reads change — a `driverLocation`-only re-render of `Map` no
// longer touches them at all. Pure extraction: every prop and every line of
// JSX below is unchanged from before, just moved into its own component so
// it can be memoized independently of the driver marker.
// ---------------------------------------------------------------------------



interface PickupDestinationLayerProps {
  pickup: MapProps['pickup'];
  destination: MapProps['destination'];
  showSearchPulse: boolean;
  showPickupAsUserLocation: boolean;
  hidePickupPin: boolean;
  isLiveLocation: boolean;
  arrivalTime: MapProps['arrivalTime'];
  showH3Grid: boolean;
  h3Grid: NonNullable<MapProps['h3Grid']>;
  eta: MapProps['eta'];
  etaPosition: MapProps['etaPosition'];
}

const PickupDestinationLayer = React.memo(function PickupDestinationLayer({
  pickup,
  destination,
  showSearchPulse,
  showPickupAsUserLocation,
  hidePickupPin,
  isLiveLocation,
  arrivalTime,
  showH3Grid,
  h3Grid,
  eta,
  etaPosition,
}: PickupDestinationLayerProps) {
  return (
    <>
      {/* Pickup marker — the pulsing user-location dot on the live tracking
          screen (the pickup is the customer's fixed spot), a plain pin everywhere else */}
      {pickup && (
        showSearchPulse ? (
          <Marker
            key="pickup-search-pulse"
            coordinate={{
              latitude: pickup.latitude,
              longitude: pickup.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
            <SearchPulseMarker />
          </Marker>
        ) : showPickupAsUserLocation ? (
          <Marker
            key="pickup-marker"
            coordinate={{
              latitude: pickup.latitude,
              longitude: pickup.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
            <UserLocationMarker />
          </Marker>
        ) : (
          !hidePickupPin && !isLiveLocation && (
            <Marker
              coordinate={{
                latitude: pickup.latitude,
                longitude: pickup.longitude,
              }}
              title="Pickup"
              description={pickup.address}
              pinColor="#00D26A"
            />
          )
        )
      )}

      {/* Destination marker — a white "arrive at" callout bubble once an
          arrival time is known, otherwise the default red pin */}
      {destination && (
        arrivalTime ? (
          <Marker
            key="destination-arrival-time"
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <ArrivalTimeMarker arrivalTime={arrivalTime} />
          </Marker>
        ) : (
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            title="Destination"
            description={destination.address}
            pinColor="#FE5035"
          />
        )
      )}

      {/* H3 Grid Visualization */}
      {showH3Grid && Polygon && (
        <>
          {h3Grid.map((hex) => {
            const center = getHexCenter(hex);
            return (
              <React.Fragment key={`h3-visual-${hex}`}>
                {/* Hexagon Polygon */}
                <Polygon
                  coordinates={getHexBoundary(hex)}
                  fillColor="rgba(255, 0, 0, 0.1)"
                  strokeColor="#FF0000"
                  strokeWidth={1}
                  geodesic={true}
                />
                {/* Hexagon ID Label */}
                <Marker
                  coordinate={center}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View className="bg-white/80 px-1 rounded border border-red-500">
                    <Text style={{ fontSize: 8, color: '#FF0000', fontWeight: 'bold' }}>
                      {hex.substring(hex.length - 6)}
                    </Text>
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* ETA Badge Overlay */}
      {eta && (etaPosition || pickup || destination) && (
        <Marker
          coordinate={
            etaPosition ||
            (pickup && !destination ? pickup : destination) ||
            { latitude: 0, longitude: 0 }
          }
          anchor={{ x: 0.5, y: -0.8 }} // Position above the marker
          tracksViewChanges={false}
          zIndex={999} // Ensure it's on top
        >
          <View style={{
            backgroundColor: 'white',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#26344F' }}>
              {eta}
            </Text>
          </View>
        </Marker>
      )}
    </>
  );
});

/**
 * Native Map Component (iOS/Android)
 * Uses react-native-maps with Google Maps provider
 * Displays standard vector map with buildings, POIs, and custom styling
 * Falls back to MapPlaceholder if no API key is configured or native module unavailable
 */
export const Map = React.forwardRef<any, MapProps>(({
  userLocation,
  pickup,
  destination,
  showRoute = false,
  routeCoordinates = [],
  overviewRouteCoordinates = [],
  routeSteps = [],
  showUserMarker = true,
  scrollEnabled = true,
  zoomEnabled = true,
  onMapReady,
  onMapPress,
  onPanDrag,
  onRegionChangeComplete,
  mapType = 'standard',
  driverLocation,
  driverHeading = 0,
  cameraBearing = 0,
  driverVehicleVariant = 'comfort',
  navigationArrowMode = false,
  vehicles = [],
  showPickupAsUserLocation = false,
  showSearchPulse = false,
  autoFollowDriver = true,
  customerHex9,
  showH3Grid = false,
  h3Grid = [],
  eta,
  etaPosition,
  showZoomControls = false,
  hidePickupPin = false,
  isLiveLocation = false,
  arrivalTime,
  mapPadding,
  disableInternalCamera = false,
  isDriverOwnMap = false,
}: MapProps, ref) => {
  const mapRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // OSM-Style Route Visualization
  // Generate direction arrows along the route
  const directionArrows = useMemo(() => {
    if (!showRoute || routeCoordinates.length < 2) return [];

    const arrows: Array<{ coordinate: { latitude: number; longitude: number }; bearing: number }> = [];
    const arrowSpacing = 100; // meters between arrows
    let accumulatedDistance = 0;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const start = routeCoordinates[i];
      const end = routeCoordinates[i + 1];
      const segmentDistance = calculateDistanceMeters(start.latitude, start.longitude, end.latitude, end.longitude);

      if (accumulatedDistance + segmentDistance >= arrowSpacing) {
        const bearing = calculateBearing(start, end);
        arrows.push({ coordinate: start, bearing });
        accumulatedDistance = 0;
      } else {
        accumulatedDistance += segmentDistance;
      }

      // Limit to 30 arrows for performance
      if (arrows.length >= 30) break;
    }

    return arrows;
  }, [showRoute, routeCoordinates]);

  // Generate turn highlights from route steps
  const turnHighlights = useMemo(() => {
    if (!showRoute || !routeSteps || routeSteps.length === 0) return [];

    const highlights: Array<Array<{ latitude: number; longitude: number }>> = [];

    routeSteps.forEach((step) => {
      // Only highlight turns (not straight segments)
      if (step.maneuver && step.maneuver !== 'straight' && step.maneuver !== '') {
        // Create a short segment around the turn point
        const turnPoint = step.endLocation;
        const startPoint = step.startLocation;

        // Find nearby coordinates from the route for a smooth highlight
        const turnIndex = routeCoordinates.findIndex(
          coord => Math.abs(coord.latitude - turnPoint.latitude) < 0.0001 &&
            Math.abs(coord.longitude - turnPoint.longitude) < 0.0001
        );

        if (turnIndex > 0 && turnIndex < routeCoordinates.length - 1) {
          // Take 3-5 points around the turn for a smooth yellow segment
          const segmentStart = Math.max(0, turnIndex - 2);
          const segmentEnd = Math.min(routeCoordinates.length, turnIndex + 3);
          highlights.push(routeCoordinates.slice(segmentStart, segmentEnd));
        }
      }
    });

    return highlights;
  }, [showRoute, routeSteps, routeCoordinates]);

  // Snap the tracked driver onto the active route (instead of the raw GPS
  // fix, which can drift off-road) and derive its heading from consecutive
  // snapped positions rather than trusting a possibly noisy/stale compass
  // heading. Falls back to the raw coordinate/heading when no route exists.
  const snappedDriver = useRoadSnappedVehicle(driverLocation, driverHeading, routeCoordinates);

  // Expose map controller methods to parent
  React.useImperativeHandle(ref, () => ({
    animateToRegion: (region: any, duration?: number) => {
      if (mapRef.current) {
        mapRef.current.animateToRegion(region, duration || 1000);
      }
    },
    animateCamera: (camera: any, duration?: number) => {
      if (mapRef.current && typeof mapRef.current.animateCamera === 'function') {
        // `?? ` not `||`: CameraController's first-applied pose deliberately
        // passes duration 0 ("snap directly to the target, no tween" — see
        // CameraController.recompute's isFirstApplication branch); `|| 1000`
        // would silently turn that into a 1000ms animation since 0 is
        // falsy. Only reachable with a real, correctly-shaped number since
        // NavigationMap.tsx's/CustomerHome.tsx's adapters unwrap
        // CameraController's `{ duration }` options object before calling
        // this (Phase 9D camera runtime cleanup).
        mapRef.current.animateCamera(camera, { duration: duration ?? 1000 });
      }
    },
    fitToCoordinates: (coordinates: any[], options?: any) => {
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(coordinates, options);
      }
    },
    getMapRef: () => mapRef.current,
  }));

  // Check if we have an API key
  const hasApiKey = hasGoogleMapsApiKey();

  // Fallback to placeholder if no API key or native module not available
  if (!hasApiKey || !hasNativeModule || !MapView) {
    return (
      <MapPlaceholder
        showMarker={showUserMarker}
        showRoute={showRoute}
        pickupLabel={pickup?.address?.split(',')[0] || 'Pickup'}
        destinationLabel={destination?.address?.split(',')[0] || 'Destination'}
      />
    );
  }

  // Determine initial region
  const getInitialRegion = () => {
    const location = driverLocation || pickup || userLocation || {
      latitude: -13.5433,
      longitude: 23.1200, // Zambezi District, Zambia default
    };

    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.0035,
      longitudeDelta: 0.0016,
    };
  };

  // Center on user location when it first arrives if no markers are set
  useEffect(() => {
    if (disableInternalCamera) return;
    if (isReady && mapRef.current && userLocation && !pickup && !destination && !driverLocation) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.0035,
        longitudeDelta: 0.0016,
      }, 1000);
    }
  }, [userLocation?.latitude, userLocation?.longitude, isReady, disableInternalCamera]);

  // Center on driver location if it updates (unless custom follow is enabled)
  useEffect(() => {
    if (disableInternalCamera) return;
    if (isReady && mapRef.current && driverLocation && autoFollowDriver) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.0035,
        longitudeDelta: 0.0016,
      }, 500);
    }
  }, [driverLocation?.latitude, driverLocation?.longitude, isReady, autoFollowDriver, disableInternalCamera]);


  // Fit map to show all markers when they change
  useEffect(() => {
    if (disableInternalCamera) return;
    if (!isReady || !mapRef.current || driverLocation) return; // Skip if we are in driver mode (handled above)

    const markers = [];
    if (pickup) markers.push({ latitude: pickup.latitude, longitude: pickup.longitude });
    if (destination) markers.push({ latitude: destination.latitude, longitude: destination.longitude });

    if (markers.length >= 2) {
      // Fit to show both pickup and destination
      mapRef.current.fitToCoordinates(markers, {
        edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    } else if (markers.length === 1) {
      // Center on single marker
      mapRef.current.animateToRegion({
        latitude: markers[0].latitude,
        longitude: markers[0].longitude,
        latitudeDelta: 0.0035,
        longitudeDelta: 0.0016,
      });
    }
  }, [pickup, destination, isReady, !!driverLocation, disableInternalCamera]);

  const handleMapReady = () => {
    setIsReady(true);
    onMapReady?.();
  };

  const handleMapPress = (event: any) => {
    const { coordinate } = event.nativeEvent;
    if (coordinate && onMapPress) {
      onMapPress({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        address: '', // Address will be geocoded by the caller if needed
      });
    }
  };

  const handleZoom = async (zoomIn: boolean) => {
    if (!mapRef.current) return;

    try {
      const camera = await mapRef.current.getCamera();
      if (camera) {
        const newZoom = zoomIn ? (camera.zoom || 15) + 1 : (camera.zoom || 15) - 1;
        mapRef.current.animateCamera({
          ...camera,
          zoom: newZoom,
        }, { duration: 500 });
      }
    } catch {
      // Non-critical — zoom is a convenience control.
    }
  };


  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={getInitialRegion()}
        mapType={mapType}
        showsBuildings={true}
        showsIndoors={true}
        showsPointsOfInterest={true}
        showsTraffic={false}
        showsScale={true}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        rotateEnabled={true}
        pitchEnabled={true}
        toolbarEnabled={false}
        mapPadding={mapPadding ?? (navigationArrowMode ? { top: 0, right: 0, bottom: 200, left: 0 } : { top: 0, right: 0, bottom: 0, left: 0 })}
        onMapReady={handleMapReady}
        onPress={handleMapPress}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {/* Driver marker — animated top-down car (Uber style) normally, or a
            heading-aware directional arrow during turn-by-turn navigation.
            Both are snapped to the route path with a road-derived heading. */}
        {snappedDriver ? (
          navigationArrowMode ? (
            <NavigationArrowMarker
              key="driver-marker"
              coordinate={snappedDriver.position}
              heading={snappedDriver.heading}
              cameraBearing={cameraBearing}
            />
          ) : isDriverOwnMap ? (
            <DriverStaticPositionMarker
              key="driver-marker"
              coordinate={snappedDriver.position}
            />
          ) : (
            <AnimatedVehicleMarker
              key="driver-marker"
              coordinate={snappedDriver.position}
              heading={snappedDriver.heading}
              cameraBearing={cameraBearing}
              variant={driverVehicleVariant}
            />
          )
        ) : (
          // Fallback: snappedDriver is null (e.g. before the road-snap hook has
          // a fix), but a raw driverLocation is already available — use it
          // directly so the arrow has coordinates to render immediately.
          navigationArrowMode && driverLocation && (
            <NavigationArrowMarker
              key="driver-marker"
              coordinate={driverLocation}
              heading={driverHeading}
              cameraBearing={cameraBearing}
            />
          )
        )}

        {/* Nearby Driver vehicles */}
        {vehicles.map((vehicle) => (
          <AnimatedVehicleMarker
            key={vehicle.id}
            coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
            heading={vehicle.heading}
            variant={vehicle.variant}
          />
        ))}

        {/* Customer location indicator — animated blue dot with pulsing halo
            (replaces the native showsUserLocation dot, same visibility rules) */}
        {showUserMarker && !driverLocation && userLocation && (
          <AnimatedUserLocation coordinate={userLocation} />
        )}

        <PickupDestinationLayer
          pickup={pickup}
          destination={destination}
          showSearchPulse={showSearchPulse}
          showPickupAsUserLocation={showPickupAsUserLocation}
          hidePickupPin={hidePickupPin}
          isLiveLocation={isLiveLocation}
          arrivalTime={arrivalTime}
          showH3Grid={showH3Grid}
          h3Grid={h3Grid}
          eta={eta}
          etaPosition={etaPosition}
        />

        {/* Layer 0: Overview Route (underneath the active route) */}
        {overviewRouteCoordinates && overviewRouteCoordinates.length > 0 && (
          <Polyline
            coordinates={overviewRouteCoordinates}
            strokeColor={colors.secondary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={[1, 10]}
            zIndex={0}
          />
        )}

        {/* Layer 1: Base Route */}
        {showRoute && routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={colors.accent}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
        )}

        {/* Layer 2: Direction Arrows */}
        {directionArrows.map((arrow, index) => (
          <Marker
            key={`arrow-${index}`}
            coordinate={arrow.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            tracksViewChanges={false}
            zIndex={2}
          >
            <View style={{ transform: [{ rotate: `${arrow.bearing}deg` }] }}>
              <Ionicons name="chevron-forward" size={12} color="#1F2937" />
            </View>
          </Marker>
        ))}

        {/* Layer 3: Turn Highlights (Yellow Segments) — rendered after (and
            z-indexed above) the base route so upcoming turns stay visible
            over the orange line rather than blending under it */}
        {turnHighlights.map((segment, index) => (
          <Polyline
            key={`turn-${index}`}
            coordinates={segment}
            strokeColor="#F4C430"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ))}
      </MapView>

      {/* Zoom Controls — `handleZoom` drives the camera directly via
          `mapRef`, so this must stay off whenever `disableInternalCamera` is
          set (CameraController owns the camera instead): otherwise this is
          a second, uncoordinated `animateCamera()` call site reachable from
          the same screen. No manual zoom override exists on CameraController
          today (see NavigationControls.tsx's own doc comment), so these
          buttons simply don't render in that case rather than fighting it. */}
      {showZoomControls && !disableInternalCamera && (
        <View style={styles.zoomControls}>
          <TouchableOpacity onPress={() => handleZoom(true)} style={styles.zoomButton}>
            <Ionicons name="add" size={24} color="#26344F" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleZoom(false)} style={[styles.zoomButton, styles.zoomButtonBottom]}>
            <Ionicons name="remove" size={24} color="#26344F" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});


const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    top: '35%',
    backgroundColor: 'transparent',
    gap: 12,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomButtonBottom: {
    // optional spacing styling if needed beyond gap
  }
});

