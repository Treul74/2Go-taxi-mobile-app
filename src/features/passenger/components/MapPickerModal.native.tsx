import { BackButton, Button } from '@/components/ui';
import { formatDisplayAddress } from '@/lib';
import { nearestRoad, reverseGeocode } from '@/lib/google';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as LocationAPI from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface MapPickerModalProps {
  /** Whether the modal is visible */
  visible: boolean;

  /** Initial location (center of map) */
  initialLocation?: Location;

  /** Title for the modal */
  title: string;

  /** Callback when location is confirmed */
  onConfirm: (location: Location) => void;

  /** Callback when modal is closed */
  onClose: () => void;
}

// Import MapView components conditionally
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;
let hasNativeModule = false;

try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  hasNativeModule = true;
} catch (error) {
  console.log('react-native-maps not available');
  hasNativeModule = false;
}

/**
 * Map Picker Modal
 * Full-screen modal that allows user to select a location by dragging the map
 * The center pin marks the selected location
 */
export function MapPickerModal({
  visible,
  initialLocation,
  title,
  onConfirm,
  onClose,
}: MapPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [mapType, setMapType] = useState<'standard' | 'terrain' | 'hybrid'>('terrain');
  const [snapToRoad, setSnapToRoad] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    initialLocation || null
  );
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [centerCoordinate, setCenterCoordinate] = useState({
    latitude: initialLocation?.latitude || -15.4167,
    longitude: initialLocation?.longitude || 28.2833,
  });

  const mapRef = useRef<any>(null);
  const geocodeTimeoutRef = useRef<number | null>(null);

  // Initialize with initial location when modal opens
  useEffect(() => {
    if (visible && initialLocation) {
      setCenterCoordinate({
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
      });
      setSelectedLocation(initialLocation);
    }
  }, [visible, initialLocation]);

  // Handle region change (when user drags the map)
  const handleRegionChangeComplete = useCallback(async (region: any) => {
    const newCenter = {
      latitude: region.latitude,
      longitude: region.longitude,
    };

    setCenterCoordinate(newCenter);

    // Clear any pending geocode request
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    // Debounce geocoding to avoid too many API calls
    geocodeTimeoutRef.current = setTimeout(async () => {
      setIsGeocoding(true);

      try {
        let finalLat = newCenter.latitude;
        let finalLng = newCenter.longitude;

        // Optionally snap to nearest road
        if (snapToRoad) {
          const snapped = await nearestRoad(newCenter);
          if (snapped) {
            finalLat = snapped.latitude;
            finalLng = snapped.longitude;

            // Optionally animate map to snapped position if it's significantly different
            // This makes the center pin always sit on a road
          }
        }

        // Reverse geocode to get address
        const address = await reverseGeocode(finalLat, finalLng);

        setSelectedLocation({
          latitude: finalLat,
          longitude: finalLng,
          address: address || 'Unknown location',
        });
      } catch (error) {
        console.error('Geocoding error:', error);
        setSelectedLocation({
          latitude: newCenter.latitude,
          longitude: newCenter.longitude,
          address: `${newCenter.latitude.toFixed(6)}, ${newCenter.longitude.toFixed(6)}`,
        });
      } finally {
        setIsGeocoding(false);
      }
    }, 500); // Wait 500ms after user stops dragging
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    };
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (selectedLocation && !isGeocoding) {
      onConfirm(selectedLocation);
    }
  }, [selectedLocation, isGeocoding, onConfirm]);

  // Handle go to current location
  const handleGoToMyLocation = async () => {
    try {
      const { status } = await LocationAPI.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const position = await LocationAPI.getCurrentPositionAsync({
        accuracy: LocationAPI.Accuracy.Balanced,
      });

      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.0035,
          longitudeDelta: 0.0016,
        }, 1000);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  // Get initial region
  const getInitialRegion = () => {
    const location = initialLocation || {
      latitude: -15.4167,
      longitude: 28.2833, // Lusaka, Zambia default
    };

    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.0035,
      longitudeDelta: 0.0016,
    };
  };

  const toggleMapType = () => {
    setMapType(prev => {
      if (prev === 'standard') return 'terrain';
      if (prev === 'terrain') return 'hybrid';
      return 'standard';
    });
  };

  // Fallback if MapView is not available
  if (!hasNativeModule || !MapView) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center' }}>
            <BackButton onPress={onClose} style={{ marginRight: 15 }} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#26344F' }}>{title}</Text>
          </View>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Map not available</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Floating Back Button - Positioned to avoid status bar and respect user's "middle-left" request */}
        <BackButton
          onPress={onClose}
          size="lg"
          style={[
            styles.backButton,
            {
              top: insets.top + (Platform.OS === 'ios' ? 450 : 460),
            }
          ]}
        />

        {/* Floating Title - Positioned top center away from buttons */}
        <View style={[styles.floatingHeader, { top: insets.top + 20 }]}>
          <Text style={styles.floatingTitle}>{title}</Text>
        </View>

        {/* Map Type Toggle - Below back button */}
        <Pressable
          onPress={toggleMapType}
          style={[
            styles.mapTypeButton,
            {
              top: insets.top + (Platform.OS === 'ios' ? 450 : 460) + 60,
            }
          ]}
        >
          <Ionicons
            name={mapType === 'standard' ? 'map-outline' : mapType === 'terrain' ? 'layers-outline' : 'globe-outline'}
            size={24}
            color="#26344F"
          />
        </Pressable>

        {/* Snap to Road Toggle - Below map type toggle */}
        <Pressable
          onPress={() => setSnapToRoad(!snapToRoad)}
          style={[
            styles.mapTypeButton,
            {
              top: insets.top + (Platform.OS === 'ios' ? 450 : 460) + 110,
              backgroundColor: snapToRoad ? '#FE5035' : '#FFFFFF',
            }
          ]}
        >
          <Ionicons
            name="magnet-outline"
            size={22}
            color={snapToRoad ? '#FFFFFF' : '#26344F'}
          />
        </Pressable>

        {/* My Location Button - Aligned with back arrow on the right */}
        <Pressable
          onPress={handleGoToMyLocation}
          style={[
            styles.myLocationButton,
            {
              top: insets.top + (Platform.OS === 'ios' ? 450 : 460),
            }
          ]}
        >
          <Ionicons name="locate" size={28} color="#FE5035" />
        </Pressable>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={getInitialRegion()}
            mapType={mapType}
            onRegionChangeComplete={handleRegionChangeComplete}
            showsUserLocation={true}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
          />

          {/* Center pin indicator */}
          <View style={styles.centerPin}>
            <Ionicons name="location" size={48} color="#FE5035" />
          </View>
        </View>

        {/* Selected location info */}
        {selectedLocation && (
          <View style={styles.infoCard}>
            {isGeocoding ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#FE5035" />
                <Text style={styles.loadingText}>Getting address...</Text>
              </View>
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color="#26344F" />
                  <Text style={styles.infoText} numberOfLines={2}>
                    {formatDisplayAddress(selectedLocation.address) || 'Unknown location'}
                  </Text>
                  {snapToRoad && (
                    <View style={styles.snapBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#00D26A" />
                      <Text style={styles.snapBadgeText}>Snapped</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.coordsText}>
                  {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Confirm button */}
        <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
          <View style={styles.footer}>
            <Text style={styles.instructionText}>
              Drag the map to select your location
            </Text>

            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleConfirm}
              disabled={!selectedLocation || isGeocoding}
            >
              Confirm Location
            </Button>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 100,
  },
  mapTypeButton: {
    position: 'absolute',
    left: 20,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  myLocationButton: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  floatingTitle: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 16,
    fontWeight: '600',
    color: '#26344F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -24,
    marginTop: -48,
    zIndex: 10,
    pointerEvents: 'none',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#26344F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#7B8387',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#26344F',
  },
  snapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F9EF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  snapBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00D26A',
    marginLeft: 4,
  },
  coordsText: {
    fontSize: 12,
    color: '#7B8387',
    marginLeft: 28,
  },
  footerSafeArea: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  instructionText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#7B8387',
    marginBottom: 12,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#7B8387',
    textAlign: 'center',
  },
});

