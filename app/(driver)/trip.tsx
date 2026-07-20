import { Map } from '@/components/map';
import { Card, RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { calculateDistanceKm } from '@/lib/distance';
import { calculateFare } from '@/lib/fareCalculator';
import { getDirections } from '@/lib/google/mapsApi';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Driver Trip Screen
 * Active trip in progress - shows route to destination
 */
export default function DriverTripScreen() {
    const router = useRouter();
    const {
        currentTrip,
        tripStatus,
        tripStartTime,
        waitingDuration,
        startTrip,
        completeTrip,
        currentLocation,
        updateLocation,
    } = useDriverStore();

    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(
        currentLocation
    );
    const [driverHeading, setDriverHeading] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [isAutoFollow, setIsAutoFollow] = useState(true);
    const [lastInteraction, setLastInteraction] = useState(0);
    const mapRef = useRef<any>(null);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, driverHeading);

    // Start trip when component mounts
    useEffect(() => {
        if (tripStatus !== 'in_progress') {
            startTrip();
        }
    }, []);

    // Track driver location (high accuracy, 1–2s interval)
    useEffect(() => {
        let subscription: any = null;

        async function startTracking() {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                const initial = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                }).catch(() => null);

                if (initial) {
                    setDriverLocation(initial.coords);
                    updateLocation(initial.coords.latitude, initial.coords.longitude);
                    if (initial.coords.heading !== null) {
                        setDriverHeading(initial.coords.heading);
                    }
                }

                subscription = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        distanceInterval: 1,
                        timeInterval: 1000,
                    },
                    (location) => {
                        setDriverLocation(location.coords);
                        updateLocation(location.coords.latitude, location.coords.longitude);
                        if (location.coords.heading !== null) {
                            setDriverHeading(location.coords.heading);
                        }
                    }
                );
            } catch (error) {
                console.warn('Location tracking error:', error);
            }
        }

        startTracking();

        return () => {
            if (subscription?.remove) {
                subscription.remove();
            }
        };
    }, []);

    // Fetch route to destination for in-app navigation
    useEffect(() => {
        if (!driverLocation || !currentTrip) return;
        let cancelled = false;
        (async () => {
            const route = await getDirections(
                { ...driverLocation, address: '' },
                currentTrip.destination,
                'driving'
            );
            if (!route || cancelled) return;
            setRouteCoordinates(route.coordinates);
        })();
        return () => {
            cancelled = true;
        };
    }, [driverLocation?.latitude, driverLocation?.longitude, currentTrip?.destination?.latitude, currentTrip?.destination?.longitude]);

    // Auto-follow logic: resumes following after 5 seconds of no interaction
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

    // Camera follow mode during trip
    useEffect(() => {
        if (!driverLocation || !isAutoFollow) return;
        if (mapRef.current?.animateCamera) {
            mapRef.current.animateCamera({
                center: {
                    latitude: driverLocation.latitude,
                    longitude: driverLocation.longitude,
                },
                zoom: 17.5,
                heading: driverHeading || 0,
                pitch: 55,
            }, 700);
        }
    }, [driverLocation?.latitude, driverLocation?.longitude, driverHeading, isAutoFollow]);

    // Timer
    useEffect(() => {
        if (!tripStartTime) return;

        const interval = setInterval(() => {
            const now = new Date();
            const start = new Date(tripStartTime);
            const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
            setElapsedTime(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [tripStartTime]);

    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);

    if (!currentTrip) {
        return null;
    }

    const handleSliderComplete = async () => {
        // Prepare final receipt data
        const distanceKm = parseFloat(distance);
        const durationMin = Math.ceil(elapsedTime / 60);
        const waitingMin = Math.ceil(waitingDuration / 60);

        const fareData = calculateFare(distanceKm, durationMin, waitingMin);

        const receiptData = {
            tripId: currentTrip.id,
            passengerName: currentTrip.passengerName,
            pickupAddress: currentTrip.pickup.address,
            destinationAddress: currentTrip.destination.address,
            distance: distanceKm,
            duration: durationMin,
            waitingDuration: waitingMin,
            totalFare: fareData.total,
            breakdown: {
                baseFare: fareData.baseFare,
                distanceFare: fareData.distanceFare,
                timeFare: fareData.timeFare,
                waitingFare: fareData.waitingFare,
            }
        };

        const success = await completeTrip(receiptData);
        if (!success) {
            Alert.alert('Error', 'Could not complete the trip. Please check your connection and try again.');
            return;
        }

        // currentTrip stays set until finishTrip() (called from the summary
        // screen) so this navigation doesn't race the "no active trip" redirect.
        router.replace('/(driver)/trip-summary');
    };

    const handleCallPassenger = () => {
        // In production, passenger phone would be in the trip data
        const telUrl = `tel:+260971234567`;

        Linking.openURL(telUrl).catch(() => {
            Alert.alert('Error', 'Could not open phone dialer');
        });
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const distance = driverLocation
        ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, currentTrip.destination.latitude, currentTrip.destination.longitude).toFixed(1)
        : '...';

    return (
        <View className="flex-1 bg-background">
            {/* Full-screen Map */}
            <View className="absolute inset-0">
                <Map
                    ref={mapRef}
                    driverLocation={driverLocation || undefined}
                    driverHeading={driverHeading}
                    destination={currentTrip.destination}
                    showRoute={routeCoordinates.length > 0}
                    routeCoordinates={routeCoordinates}
                    scrollEnabled={true}
                    zoomEnabled={true}
                    autoFollowDriver={false}
                    onPanDrag={handleMapAction}
                    onRegionChangeComplete={handleMapAction}
                    eta={`${Math.ceil(parseFloat(distance) * 2)} min ETA`} // Approximation or use real route ETA if available
                    showZoomControls={true}
                />
            </View>

            <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
                {/* Top navigation bar with passenger info and call button */}
                <View className="px-5 pt-4 pb-2" pointerEvents="auto">
                    <View className="bg-white/95 rounded-3xl px-5 py-3 shadow-card border border-white/20 flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1">
                            <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
                                <Ionicons name="person" size={20} color="#FE5035" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-primary font-bold" numberOfLines={1}>
                                    {currentTrip.passengerName}
                                </Text>
                                <Text className="text-secondary text-xs">
                                    Trip in progress
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={handleCallPassenger}
                            className="w-10 h-10 rounded-full bg-success items-center justify-center ml-2"
                        >
                            <Ionicons name="call" size={20} color="#FFFFFF" />
                        </Pressable>
                    </View>
                </View>

                {/* Bottom trip info card */}
                <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
                    <View pointerEvents="auto">
                        <Card variant="default" className="mb-4">
                            {/* Trip Timer */}
                            <View className="items-center py-4 mb-4 border-b border-gray-100">
                                <Text className="text-secondary text-sm mb-2">TRIP DURATION</Text>
                                <Text className="text-primary font-bold text-4xl">
                                    {formatTime(elapsedTime)}
                                </Text>
                            </View>

                            {/* Destination */}
                            <View className="flex-row items-start mb-4 pb-4 border-b border-gray-100">
                                <View className="w-6 items-center pt-1">
                                    <View className="w-3 h-3 rounded-full bg-accent border-2 border-white shadow-sm" />
                                </View>
                                <View className="ml-3 flex-1">
                                    <Text className="text-secondary text-xs mb-1">DESTINATION</Text>
                                    <Text className="text-primary font-medium">
                                        {currentTrip.destination.address}
                                    </Text>
                                </View>
                            </View>

                            {/* Trip Stats */}
                            <View className="flex-row items-center justify-between mb-4">
                                <View className="flex-1 items-center">
                                    <Ionicons name="navigate" size={24} color="#7B8387" />
                                    <Text className="text-secondary text-xs mt-1">Distance</Text>
                                    <Text className="text-primary font-bold">{distance} km</Text>
                                </View>
                                <View className="w-px h-12 bg-gray-200" />
                                <View className="flex-1 items-center">
                                    <Ionicons name="cash-outline" size={24} color="#10B981" />
                                    <Text className="text-secondary text-xs mt-1">Earnings</Text>
                                    <Text className="text-success font-bold">K{currentTrip.estimatedFare}</Text>
                                </View>
                            </View>

                            {/* Complete Trip Button */}
                            {/* Complete Trip Slider */}
                            <RideActionSlider
                                label="Slide to Complete Trip"
                                onComplete={handleSliderComplete}
                            />
                        </Card>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}
