import { Button, IconButton, Input } from '@/components/ui';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDisplayAddress } from '@/lib';
import { getDirections } from '@/lib/google';
import { useRideStore, useUserStore } from '@/state';
import type { Location, PaymentMethod, SavedAddress } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookForSomeoneModal } from './BookForSomeoneModal';
import { InstructionsModal } from './InstructionsModal';
import { LocationSearchModal } from './LocationSearchModal';
import { MapPickerModal } from './MapPickerModal';
import { ScheduleRideModal } from './ScheduleRideModal';

import { VehicleCarousel } from './VehicleCarousel';

interface RidePlannerSheetProps {
  onRequestRide: () => void;
  isMapDragging?: boolean;
}

/**
 * Main ride planning card (Fixed position, no dragging)
 * Contains mode toggle, vehicle selection, and ride options
 */
// Payment method config
const paymentMethods: { id: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
];

export function RidePlannerSheet({ onRequestRide, isMapDragging = false }: RidePlannerSheetProps) {
  const insets = useSafeAreaInsets();

  // Get current location
  const { location: currentLocation, loading: locationLoading, error: locationError, hasPermission, province } = useCurrentLocation();

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showPickupSearchModal, setShowPickupSearchModal] = useState(false);
  const [showDestinationSearchModal, setShowDestinationSearchModal] = useState(false);
  const [mapPickerMode, setMapPickerMode] = useState<'pickup' | 'destination'>('pickup');

  // Ride options modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showBookForSomeoneModal, setShowBookForSomeoneModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  // Input state
  const [destinationQuery, setDestinationQuery] = useState('');
  const [pickupQuery, setPickupQuery] = useState('');

  // Animation for card minimization
  const cardHeightAnim = useRef(new Animated.Value(1)).current;

  // Animate card when map is being dragged
  useEffect(() => {
    Animated.spring(cardHeightAnim, {
      toValue: isMapDragging ? 0 : 1, // 0 when dragging, 1 when not
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isMapDragging, cardHeightAnim]);

  // User state
  const savedAddresses = useUserStore((state) => state.savedAddresses);

  // Ride state
  const {
    mode,
    setMode,
    selectedVehicle,
    setVehicle,
    vehicleOptions,
    paymentMethod,
    setPaymentMethod,
    scheduledFor,
    setScheduledFor,
    bookingFor,
    setBookingFor,
    driverInstructions,
    setDriverInstructions,
    pickup,
    isPickupManual,
    destination,
    setPickup,
    setDestination,
    setRouteData,
    clearRoute,
    calculateVehicleFares,
    isFareCalculating,
  } = useRideStore();

  // No filtered vehicles needed - use all vehicle options
  const vehicles = vehicleOptions;

  // Set current location as pickup on mount
  useEffect(() => {
    if (currentLocation && !pickup) {
      setPickup(currentLocation);
      // GPS pickup shows a fixed "Live location" label — the real
      // reverse-geocoded address is still stored on the pickup itself,
      // only the displayed text differs.
      setPickupQuery('Live location');
    } else if (currentLocation && pickup && !pickupQuery) {
      // If we have pickup but no query text, restore it — showing the real
      // address only for a manually-selected pickup, otherwise "Live location".
      if (isPickupManual) {
        const displayAddress = formatDisplayAddress(pickup.address);
        setPickupQuery(displayAddress || 'Fetching location...');
      } else {
        setPickupQuery('Live location');
      }
    }
  }, [currentLocation, pickup, pickupQuery, isPickupManual, setPickup]);

  // Hydrate the destination query when a destination was already set before
  // this screen mounted (e.g. picked on the Discover screen's "Where to?").
  useEffect(() => {
    if (destination && !destinationQuery) {
      setDestinationQuery(formatDisplayAddress(destination.address) || '');
    }
  }, [destination, destinationQuery]);

  // Fetch route when both pickup and destination are set
  useEffect(() => {
    if (pickup && destination) {
      getDirections(pickup, destination)
        .then(route => {
          if (route) {
            setRouteData(
              route.coordinates,
              route.distance.text,
              route.duration.text,
              route.distance.value,
              route.duration.value
            );
          }
        })
        .catch(err => {
          console.error('Failed to get route:', err);
          clearRoute();
        });
    } else {
      clearRoute();
    }
  }, [pickup, destination, setRouteData, clearRoute]);

  // Recalculate real per-vehicle fares/ETAs whenever both pickup and
  // destination are set, replacing the mock vehicleOptions values.
  useEffect(() => {
    if (pickup && destination) {
      calculateVehicleFares();
    }
  }, [pickup, destination, calculateVehicleFares]);

  // Handle address selection from quick destinations
  const handleSelectAddress = useCallback((address: SavedAddress) => {
    const location: Location = {
      latitude: address.latitude,
      longitude: address.longitude,
      address: address.address,
    };
    setDestination(location);
    setDestinationQuery(formatDisplayAddress(address.address));
  }, [setDestination]);

  // Handle pickup selection
  const handleSelectPickup = useCallback((location: Location) => {
    setPickup(location, true);
    setPickupQuery(formatDisplayAddress(location.address) || '');
  }, [setPickup]);

  // Handle destination selection
  const handleSelectDestination = useCallback((location: Location) => {
    setDestination(location);
    setDestinationQuery(formatDisplayAddress(location.address) || '');
  }, [setDestination]);

  // Handle map picker open
  const handleOpenMapPicker = useCallback((mode: 'pickup' | 'destination') => {
    setMapPickerMode(mode);
    setShowMapPicker(true);
  }, []);

  // Handle map picker confirm
  const handleMapPickerConfirm = useCallback((location: Location) => {
    if (mapPickerMode === 'pickup') {
      setPickup(location, true);
      setPickupQuery(formatDisplayAddress(location.address) || '');
    } else {
      setDestination(location);
      setDestinationQuery(formatDisplayAddress(location.address) || '');
    }
    setShowMapPicker(false);
  }, [mapPickerMode, setPickup, setDestination]);

  // Handle map picker back — returns to the search modal it was opened from
  const handleMapPickerBack = useCallback(() => {
    setShowMapPicker(false);
    if (mapPickerMode === 'pickup') {
      setShowPickupSearchModal(true);
    } else {
      setShowDestinationSearchModal(true);
    }
  }, [mapPickerMode]);

  // Handle clear destination input
  const handleClearDestination = useCallback(() => {
    setDestination(null);
    setDestinationQuery('');
  }, [setDestination]);

  // Handle book ride
  const handleBookRide = useCallback(async () => {
    // Validate pickup
    const finalPickup = pickup || currentLocation;
    if (!finalPickup) {
      Alert.alert('Location Required', 'Please wait while we get your current location');
      return;
    }

    // Validate destination
    if (!destination) {
      Alert.alert('Destination Required', 'Please enter where you want to go');
      return;
    }

    // Set pickup if not already set
    if (!pickup) {
      setPickup(finalPickup);
    }

    // Optionally fetch directions for route preview (non-blocking)
    if (finalPickup && destination) {
      getDirections(finalPickup, destination)
        .then(route => {
          if (route) {
            console.log('Route calculated:', route.distance.text, route.duration.text);
            // You can store this in state if you want to show the route on the map
          }
        })
        .catch(err => console.error('Failed to get directions:', err));
    }

    onRequestRide();
  }, [pickup, destination, currentLocation, setPickup, onRequestRide]);

  // Get selected vehicle info
  const selectedVehicleInfo = vehicleOptions.find((v) => v.id === selectedVehicle);
  const currentPayment = paymentMethods.find((p) => p.id === paymentMethod)!;

  // Handle option actions
  const handleScheduleRide = () => {
    setShowOptionsModal(false);
    setShowScheduleModal(true);
  };

  const handleBookForSomeone = () => {
    setShowOptionsModal(false);
    setShowBookForSomeoneModal(true);
  };

  const handleLeaveNote = () => {
    setShowOptionsModal(false);
    setShowInstructionsModal(true);
  };

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 16,
        maxHeight: cardHeightAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['6%', '80%'], // Minimized to 6% (showing handle) to 80%
        }),
        paddingBottom: insets.bottom,
        overflow: 'hidden',
      }}
    >
      {/* Visual Handle - subtle indicator that card can be pulled back */}
      <View className="items-center pt-3">
        <View className="w-12 h-1.5 bg-gray-200 rounded-full" />
      </View>
      <ScrollView
        className="px-5 pt-4 pb-0"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 1 }}
      >


        {/* Pickup Location input */}
        <Pressable
          onPress={() => setShowPickupSearchModal(true)}
          className="mt-4"
        >
          <View pointerEvents="none">
            <Input
              variant="search"
              placeholder={locationLoading ? "Getting your location..." : "Pickup location"}
              leftIcon="location"
              value={pickupQuery}
              editable={false}
            />
            {locationLoading && (
              <View className="absolute right-4 top-3">
                <ActivityIndicator size="small" color="#FE5035" />
              </View>
            )}
          </View>

          {!hasPermission && !locationLoading && (
            <Text className="text-error text-xs mt-1 ml-1">
              Location permission required
            </Text>
          )}
        </Pressable>

        {/* Where to input */}
        <Pressable
          onPress={() => setShowDestinationSearchModal(true)}
          className="mt-3"
        >
          <View>
            <Input
              variant="search"
              placeholder="Where to?"
              leftIcon="search"
              value={destinationQuery}
              editable={false}
              pointerEvents="none"
              rightIcon={destinationQuery.length > 0 ? 'close-circle' : undefined}
              onRightIconPress={handleClearDestination}
            />
          </View>
        </Pressable>



        {/* Vehicle Carousel */}
        <View className="mt-4">
          <VehicleCarousel
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            onSelectVehicle={(id) => setVehicle(id)}
          />
        </View>

        {/* Book Button Row */}
        <View className="mt-4 flex-row items-center gap-3">
          {/* Payment Icon */}
          <IconButton
            icon={currentPayment.icon}
            variant="outline"
            size="lg"
            onPress={() => setShowPaymentModal(true)}
          />

          {/* Book Button */}
          <View className="flex-1">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleBookRide}
              rightIcon="arrow-forward"
              disabled={isFareCalculating}
            >
              {isFareCalculating
                ? 'Calculating...'
                : scheduledFor
                  ? 'Schedule Ride'
                  : `Book ${selectedVehicleInfo?.name || 'Ride'} • K${selectedVehicleInfo?.estimatedFare || '—'}`
              }
            </Button>
          </View>

          {/* Options Icon */}
          <IconButton
            icon="ellipsis-horizontal"
            variant="outline"
            size="lg"
            onPress={() => setShowOptionsModal(true)}
          />
        </View>
      </ScrollView>

      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-5xl p-6">
            <Text className="text-primary font-bold text-xl mb-4">
              Payment Method
            </Text>

            {paymentMethods.map((method) => (
              <Pressable
                key={method.id}
                onPress={() => {
                  setPaymentMethod(method.id);
                  setShowPaymentModal(false);
                }}
                className={`flex-row items-center p-4 rounded-3xl mb-2 ${paymentMethod === method.id ? 'bg-primary' : 'bg-gray-100'
                  }`}
              >
                <Ionicons
                  name={method.icon}
                  size={24}
                  color={paymentMethod === method.id ? '#FFFFFF' : '#26344F'}
                />
                <Text className={`font-medium text-base ml-4 ${paymentMethod === method.id ? 'text-white' : 'text-primary'
                  }`}>
                  {method.label}
                </Text>
                {paymentMethod === method.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color="#FFFFFF"
                    style={{ marginLeft: 'auto' }}
                  />
                )}
              </Pressable>
            ))}

            <Button
              variant="ghost"
              onPress={() => setShowPaymentModal(false)}
              className="mt-2"
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      {/* Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-5xl p-6">
            <Text className="text-primary font-bold text-xl mb-4">
              Ride Options
            </Text>

            {/* Schedule Ride */}
            <Pressable
              onPress={handleScheduleRide}
              className="flex-row items-center p-4 rounded-3xl mb-2 bg-gray-100"
            >
              <Ionicons name="time-outline" size={24} color="#26344F" />
              <View className="ml-4 flex-1">
                <Text className="text-primary font-medium text-base">
                  {scheduledFor ? 'Remove Schedule' : 'Schedule Ride'}
                </Text>
                <Text className="text-secondary text-sm">
                  {scheduledFor ? 'Book for now instead' : 'Book for later'}
                </Text>
              </View>
            </Pressable>

            {/* Book for Someone */}
            <Pressable
              onPress={handleBookForSomeone}
              className="flex-row items-center p-4 rounded-3xl mb-2 bg-gray-100"
            >
              <Ionicons name="person-add-outline" size={24} color="#26344F" />
              <View className="ml-4 flex-1">
                <Text className="text-primary font-medium text-base">
                  Book for Someone Else
                </Text>
                <Text className="text-secondary text-sm">
                  Add recipient details
                </Text>
              </View>
            </Pressable>

            {/* Leave Note */}
            <Pressable
              onPress={handleLeaveNote}
              className="flex-row items-center p-4 rounded-3xl mb-2 bg-gray-100"
            >
              <Ionicons name="chatbubble-outline" size={24} color="#26344F" />
              <View className="ml-4 flex-1">
                <Text className="text-primary font-medium text-base">
                  Leave Instructions
                </Text>
                <Text className="text-secondary text-sm">
                  Add notes for driver
                </Text>
              </View>
            </Pressable>

            <Button
              variant="ghost"
              onPress={() => setShowOptionsModal(false)}
              className="mt-2"
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      {/* Pickup Search Modal */}
      <LocationSearchModal
        visible={showPickupSearchModal}
        title="Pickup Location"
        initialQuery={pickupQuery}
        userLocation={currentLocation || undefined}
        onSelectLocation={handleSelectPickup}
        onOpenMapPicker={() => {
          setShowPickupSearchModal(false);
          handleOpenMapPicker('pickup');
        }}
        onClose={() => setShowPickupSearchModal(false)}
      />

      {/* Destination Search Modal */}
      <LocationSearchModal
        visible={showDestinationSearchModal}
        title="Where to?"
        initialQuery={destinationQuery}
        userLocation={currentLocation || undefined}
        onSelectLocation={handleSelectDestination}
        onOpenMapPicker={() => {
          setShowDestinationSearchModal(false);
          handleOpenMapPicker('destination');
        }}
        onClose={() => setShowDestinationSearchModal(false)}
      />

      {/* Map Picker Modal */}
      <MapPickerModal
        visible={showMapPicker}
        initialLocation={mapPickerMode === 'pickup' ? (pickup || currentLocation || undefined) : (destination || currentLocation || undefined)}
        title={mapPickerMode === 'pickup' ? 'Select Pickup Location' : 'Select Destination'}
        onConfirm={handleMapPickerConfirm}
        onClose={handleMapPickerBack}
      />

      {/* Schedule Ride Modal */}
      <ScheduleRideModal
        visible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onConfirm={setScheduledFor}
        initialDate={scheduledFor}
      />

      {/* Book For Someone Modal */}
      <BookForSomeoneModal
        visible={showBookForSomeoneModal}
        onClose={() => setShowBookForSomeoneModal(false)}
        onConfirm={setBookingFor}
        initialValue={bookingFor}
      />

      {/* Instructions Modal */}
      <InstructionsModal
        visible={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
        onConfirm={setDriverInstructions}
        initialValue={driverInstructions}
      />
    </Animated.View>
  );
}

