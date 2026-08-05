import { colors } from '@/constants/theme';
import { getGoogleMapsApiKey, hasGoogleMapsApiKey } from '@/constants/env';
import { mapStyle } from '@/lib/google/mapStyle';
import { useAnimatedMarkerWeb } from '@/hooks/useAnimatedMarkerWeb';
import { useRoadSnappedVehicle } from '@/hooks/useRoadSnappedVehicle';
import { DRIVER_MARKER_PROFILE } from '@/navigation/NavigationEngine/MarkerAnimator';
import { GoogleMap, Marker, OverlayView, Polyline, useJsApiLoader } from '@react-google-maps/api';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MapProps } from './Map';
import { MapPlaceholder } from './MapPlaceholder';
import { CarMarker, DEFAULT_VEHICLE_MARKER_SIZE } from './markers';

/**
 * Web Map Component
 * Uses @react-google-maps/api (Google Maps JavaScript API)
 * Falls back to MapPlaceholder if no API key or loading fails
 */
export function Map({
  userLocation,
  pickup,
  destination,
  showRoute = false,
  routeCoordinates = [],
  showUserMarker = true,
  scrollEnabled = true,
  zoomEnabled = true,
  onMapReady,
  onMapPress,
  mapType = 'standard',
  driverLocation,
  driverHeading = 0,
  driverVehicleVariant = 'comfort',
  showSearchPulse = false,
  disableInternalCamera = false,
}: MapProps) {
  // Check if we have an API key
  const apiKey = getGoogleMapsApiKey();
  const hasApiKey = hasGoogleMapsApiKey();

  // Load Google Maps JavaScript API - MUST be called unconditionally
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
  });

  // All hooks must be called before any conditional returns
  const mapRef = useRef<google.maps.Map | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Handle map load
  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setIsReady(true);
    onMapReady?.();
  }, [onMapReady]);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Snap the tracked driver onto the active route (instead of the raw GPS
  // fix, which can drift off-road) and derive its heading from consecutive
  // snapped positions rather than trusting a possibly noisy/stale compass
  // heading. Falls back to the raw coordinate/heading when no route exists.
  const snappedDriver = useRoadSnappedVehicle(driverLocation, driverHeading, routeCoordinates);

  // Smooths the driver marker's position/rotation the same way the native
  // renderer already does via `useAnimatedMarker` (Reanimated) — this is
  // the `requestAnimationFrame`-driven twin for `@react-google-maps/api`,
  // which has no worklet equivalent. Without this, every snapped fix jumped
  // the OverlayView straight to its new position/rotation with no easing.
  const animatedDriver = useAnimatedMarkerWeb({
    coordinate: snappedDriver?.position ?? null,
    heading: snappedDriver?.heading ?? null,
    profile: DRIVER_MARKER_PROFILE,
  });

  // Fit map to show all markers when they change
  useEffect(() => {
    if (disableInternalCamera) return;
    if (!isReady || !mapRef.current) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasMarkers = false;

    if (pickup) {
      bounds.extend({ lat: pickup.latitude, lng: pickup.longitude });
      hasMarkers = true;
    }

    if (destination) {
      bounds.extend({ lat: destination.latitude, lng: destination.longitude });
      hasMarkers = true;
    }

    if (hasMarkers) {
      mapRef.current.fitBounds(bounds, {
        top: 100,
        right: 50,
        bottom: 300,
        left: 50,
      });
    }
  }, [pickup, destination, isReady, disableInternalCamera]);

  // NOW we can do conditional rendering after all hooks are called
  // Fallback to placeholder if no API key or loading failed
  if (!hasApiKey || loadError) {
    return (
      <MapPlaceholder
        showMarker={showUserMarker}
        showRoute={showRoute}
        pickupLabel={pickup?.address?.split(',')[0] || 'Pickup'}
        destinationLabel={destination?.address?.split(',')[0] || 'Destination'}
      />
    );
  }

  // Show placeholder while loading
  if (!isLoaded) {
    return (
      <MapPlaceholder
        showMarker={showUserMarker}
        showRoute={showRoute}
        pickupLabel={pickup?.address?.split(',')[0] || 'Pickup'}
        destinationLabel={destination?.address?.split(',')[0] || 'Destination'}
      />
    );
  }

  // Determine center of map
  const getCenter = (): google.maps.LatLngLiteral => {
    const location = driverLocation || pickup || userLocation || {
      latitude: -13.5433,
      longitude: 23.1200, // Zambezi District, Zambia default
    };


    return {
      lat: location.latitude,
      lng: location.longitude,
    };
  };

  // Map type mapping
  const mapTypeId = mapType === 'standard' ? 'roadmap' : mapType;

  // Map options
  const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: zoomEnabled,
    scrollwheel: scrollEnabled,
    gestureHandling: scrollEnabled ? 'greedy' : 'none',
    mapTypeId,
    styles: mapType === 'standard' ? mapStyle : undefined,
  };

  // Handle map click
  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (event.latLng && onMapPress) {
      onMapPress({
        latitude: event.latLng.lat(),
        longitude: event.latLng.lng(),
        address: '',
      });
    }
  };

  return (
    <View style={styles.container}>
      <GoogleMap
        mapContainerStyle={styles.map}
        center={getCenter()}
        zoom={16.6}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={handleMapClick}
      >
        {/* Driver vehicle marker — same top-down car asset as native, snapped
            to the route path with a road-derived heading, position/rotation
            smoothed by useAnimatedMarkerWeb (never jumps straight to a raw
            fix, matching native's Reanimated-driven marker). */}
        {animatedDriver.position && (
          <OverlayView
            position={{ lat: animatedDriver.position.latitude, lng: animatedDriver.position.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(width, height) => ({ x: -width / 2, y: -height / 2 })}
          >
            <View style={{ transform: [{ rotate: `${animatedDriver.heading ?? 0}deg` }] }}>
              <CarMarker variant={driverVehicleVariant} size={DEFAULT_VEHICLE_MARKER_SIZE} />
            </View>
          </OverlayView>
        )}

        {/* Pickup marker — large accent circle while searching for a driver, plain pin otherwise */}
        {pickup && (
          <Marker
            position={{ lat: pickup.latitude, lng: pickup.longitude }}
            title="Pickup"
            label={showSearchPulse ? undefined : {
              text: 'P',
              color: '#FFFFFF',
              fontWeight: 'bold',
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: showSearchPulse ? 32 : 10,
              fillColor: showSearchPulse ? '#FE5035' : '#00D26A',
              fillOpacity: showSearchPulse ? 0.85 : 1,
              strokeColor: '#FFFFFF',
              strokeWeight: showSearchPulse ? 4 : 2,
            }}
          />
        )}

        {/* Destination marker */}
        {destination && (
          <Marker
            position={{ lat: destination.latitude, lng: destination.longitude }}
            title="Destination"
            label={{
              text: 'D',
              color: '#FFFFFF',
              fontWeight: 'bold',
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#FE5035',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            }}
          />
        )}

        {/* Route polyline */}
        {showRoute && routeCoordinates.length > 0 && (
          <Polyline
            path={routeCoordinates.map(coord => ({ lat: coord.latitude, lng: coord.longitude }))}
            options={{
              strokeColor: colors.accent,
              strokeOpacity: 0.8,
              strokeWeight: 4,
            }}
          />
        )}
      </GoogleMap>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});

