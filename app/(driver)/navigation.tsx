import { CompassButton, Map } from '@/components/map';
import { Button, Card, RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { useTurnPreview } from '@/hooks/useTurnPreview';
import { calculateDistanceKm, calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { getDirections, type DirectionStep } from '@/lib/google/mapsApi';
import { getManeuverIconName } from '@/lib/maneuverIcon';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Heading-up navigation camera tilt/zoom, matched to app/(tabs)/navigate.tsx. */
const NAV_CAMERA_PITCH = 45;
const NAV_CAMERA_ALTITUDE = 500;
const NAV_CAMERA_ZOOM = 17;

/**
 * Driver Navigation Screen
 * Shown after accepting a ride - guides driver to pickup location
 */
export default function DriverNavigationScreen() {
    const router = useRouter();
    const {
        currentTrip,
        tripStatus,
        confirmArrival,
        beginTrip,
        waitingStartTime,
        currentLocation,
        updateLocation,
    } = useDriverStore();

    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(
        currentLocation
    );
    const [driverHeading, setDriverHeading] = useState<number>(0);
    const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [routeDistance, setRouteDistance] = useState<string | null>(null);
    const [routeEta, setRouteEta] = useState<string | null>(null);
    const [routeSteps, setRouteSteps] = useState<DirectionStep[]>([]);
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const [distanceToManeuverMeters, setDistanceToManeuverMeters] = useState<number | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [routeError, setRouteError] = useState(false);
    const [isAutoFollow, setIsAutoFollow] = useState(true);
    const [lastInteraction, setLastInteraction] = useState(0);
    const [elapsedWaitingTime, setElapsedWaitingTime] = useState(0);
    const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
    const [arrivalAttempt, setArrivalAttempt] = useState(0);
    const [isStartingTrip, setIsStartingTrip] = useState(false);
    const [startTripAttempt, setStartTripAttempt] = useState(0);
    const mapRef = useRef<any>(null);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, driverHeading);

    // Track driver location (high accuracy, 1–2s interval)
    useEffect(() => {
        let subscription: any = null;

        async function startTracking() {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                const initial = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.BestForNavigation,
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
                        accuracy: Location.Accuracy.BestForNavigation,
                        distanceInterval: 1,
                        timeInterval: 1000,
                    },
                    (location) => {
                        setDriverLocation(location.coords);
                        updateLocation(location.coords.latitude, location.coords.longitude);
                        // Falls back to the existing heading state (initially 0) when
                        // GPS can't derive one, e.g. indoors — never crashes.
                        if (location.coords.heading !== null) {
                            setDriverHeading(location.coords.heading);
                        }
                    }
                );
            } catch (error) {
                console.warn('GPS tracking error', error);
            }
        }

        startTracking();

        return () => {
            if (subscription?.remove) {
                subscription.remove();
            }
        };
    }, []);

    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);

    const calculateRoute = async () => {
        if (!driverLocation || !currentTrip) return;

        // Don't modify init state here to avoid flashing UI, just fetch silently or with minor indicator if needed
        // But for first load valid to leave as is

        const route = await getDirections(
            { ...driverLocation, address: '' },
            currentTrip.pickup,
            'driving'
        );

        if (!route) {
            console.warn('GPS tracking error', 'Directions fetch failed');
            return;
        }

        setRouteCoordinates(route.coordinates);
        setRouteDistance(route.distance.text);
        setRouteEta(route.duration.text);
        setRouteSteps(route.steps);
        setActiveStepIndex(0);
    };

    // Auto-calculate route on mount or location update if no route
    useEffect(() => {
        if (currentTrip && routeCoordinates.length === 0 && driverLocation) {
            calculateRoute();
        }
    }, [currentTrip, driverLocation]); // simplified dependency

    const handleStartPickup = async () => {
        // Just enable navigation mode (camera follow)
        setIsNavigating(true);
        setIsAutoFollow(true);
    };

    const handleArrived = async () => {
        setIsConfirmingArrival(true);
        const success = await confirmArrival();
        setIsConfirmingArrival(false);
        if (!success) {
            setArrivalAttempt((n) => n + 1);
            Alert.alert('Error', 'Could not confirm arrival. Please try again.');
        }
    };

    const handleStartRide = async () => {
        setIsStartingTrip(true);
        const success = await beginTrip();
        setIsStartingTrip(false);
        if (success) {
            router.push('/(driver)/trip');
        } else {
            setStartTripAttempt((n) => n + 1);
            Alert.alert('Error', 'Could not start the trip. Please try again.');
        }
    };

    const handleCallPassenger = () => {
        // In production, passenger phone would be in the trip data
        // For now using a placeholder
        const telUrl = `tel:+260971234567`;

        Linking.openURL(telUrl).catch(() => {
            Alert.alert('Error', 'Could not open phone dialer');
        });
    };

    const handleOpenSettings = () => {
        Linking.openSettings().catch((error) => {
            console.warn('GPS tracking error', error);
        });
    };

    const distance = driverLocation && currentTrip
        ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, currentTrip.pickup.latitude, currentTrip.pickup.longitude).toFixed(1)
        : '...';
    const eta = Math.max(1, Math.ceil(parseFloat(distance) * 2)); // Rough ETA: 2 min per km

    const isNearPickup = useMemo(() => {
        if (!driverLocation || !currentTrip) return false;
        const meters = calculateDistanceMeters(
            driverLocation.latitude,
            driverLocation.longitude,
            currentTrip.pickup.latitude,
            currentTrip.pickup.longitude
        );
        return meters < 50;
    }, [driverLocation?.latitude, driverLocation?.longitude, currentTrip?.pickup.latitude, currentTrip?.pickup.longitude]);

    const currentStep = routeSteps[activeStepIndex];
    const nextTurnDistance = distanceToManeuverMeters != null ? formatManeuverDistance(distanceToManeuverMeters) : '...';
    const stripHtml = (value: string) => value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    const currentRoad = currentStep?.instruction ? stripHtml(currentStep.instruction) : '...';
    const { pulseScale: turnPulseScale, color: turnDistanceColorValue } = useTurnPreview(distanceToManeuverMeters);
    const nextManeuverIcon = getManeuverIconName(currentStep?.maneuver);

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

    const handleCompassPress = () => {
        mapRef.current?.animateCamera?.({ heading: 0 }, 700);
    };

    // Heading-up camera for navigation: rotates so the direction of travel
    // always faces up on screen, like Waze/Google Maps navigation.
    useEffect(() => {
        if (!isNavigating || !driverLocation || !isAutoFollow) return;
        if (mapRef.current?.animateCamera) {
            mapRef.current.animateCamera({
                center: {
                    latitude: driverLocation.latitude,
                    longitude: driverLocation.longitude,
                },
                heading: driverHeading || 0,
                pitch: NAV_CAMERA_PITCH,
                altitude: NAV_CAMERA_ALTITUDE,
                zoom: NAV_CAMERA_ZOOM,
            }, 700);
        }
    }, [driverLocation?.latitude, driverLocation?.longitude, driverHeading, isNavigating, isAutoFollow]);

    // Advance to next step when close to current step end — also tracks live
    // distance to the upcoming maneuver for the turn preview pulse/color escalation.
    useEffect(() => {
        if (!driverLocation || routeSteps.length === 0) {
            setDistanceToManeuverMeters(null);
            return;
        }
        const step = routeSteps[activeStepIndex];
        if (!step) {
            setDistanceToManeuverMeters(null);
            return;
        }
        const meters = calculateDistanceMeters(
            driverLocation.latitude,
            driverLocation.longitude,
            step.endLocation.latitude,
            step.endLocation.longitude
        );
        setDistanceToManeuverMeters(meters);
        if (meters < 25 && activeStepIndex < routeSteps.length - 1) {
            setActiveStepIndex((idx) => Math.min(idx + 1, routeSteps.length - 1));
        }
    }, [driverLocation?.latitude, driverLocation?.longitude, routeSteps, activeStepIndex]);

    // Waiting Timer
    useEffect(() => {
        if (!waitingStartTime) {
            setElapsedWaitingTime(0);
            return;
        }

        const interval = setInterval(() => {
            const now = new Date();
            const start = new Date(waitingStartTime);
            const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
            setElapsedWaitingTime(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [waitingStartTime]);

    // This guard must stay below every hook: returning above any hook throws
    // "Rendered fewer hooks than expected" when currentTrip goes null while
    // this screen is still mounted under trip/trip-summary (e.g. on Done).
    // The redirect effect above navigates away; this just blanks the frame.
    if (!currentTrip) {
        return null;
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };



    return (
        <View className="flex-1 bg-background">
            {/* Full-screen Map */}
            <View className="absolute inset-0">
                <Map
                    ref={mapRef}
                    driverLocation={driverLocation || undefined}
                    driverHeading={driverHeading}
                    navigationArrowMode={isNavigating}
                    pickup={currentTrip.pickup}
                    showRoute={routeCoordinates.length > 0} // Always show route if available
                    routeCoordinates={routeCoordinates}
                    scrollEnabled={true}
                    zoomEnabled={true}
                    autoFollowDriver={false}
                    onPanDrag={handleMapAction}
                    onRegionChangeComplete={handleMapAction}
                    eta={routeEta || `${eta} min ETA`} // Pass ETA to map
                    showZoomControls={true}
                />
            </View>



            <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
                {/* Turn-by-turn top HUD */}
                {isNavigating && (
                    <View className="px-5 pt-2" pointerEvents="box-none">
                        <View className="bg-white/95 rounded-2xl px-4 py-3 shadow-card border border-white/20 flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1 pr-3">
                                <Animated.View
                                    className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3"
                                    style={{ transform: [{ scale: turnPulseScale }] }}
                                >
                                    <Ionicons name={nextManeuverIcon} size={18} color="#26344F" />
                                </Animated.View>
                                <View className="flex-1">
                                    <Text className="text-secondary text-[10px] mb-1">NEXT</Text>
                                    <Text className="text-primary font-bold" numberOfLines={1}>
                                        {currentRoad}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="text-secondary text-[10px]">IN</Text>
                                <Text className="font-bold text-lg" style={{ color: turnDistanceColorValue }}>
                                    {nextTurnDistance}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Compass */}
                {isNavigating && (
                    <View className="absolute top-24 right-5" pointerEvents="auto">
                        <CompassButton heading={driverHeading} onPress={handleCompassPress} />
                    </View>
                )}

                {/* Top navigation bar removed as per requirements */}

                {/* Bottom content */}
                <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
                    <View pointerEvents="auto">
                        {/* Navigating to Pickup */}
                        {tripStatus === 'navigating_to_pickup' && (
                            <Card variant="default" className="mb-4 shadow-xl">
                                {/* Passenger Info */}
                                <View className="flex-row items-center mb-4">
                                    <View className="w-12 h-12 rounded-full bg-accent/10 items-center justify-center">
                                        <Ionicons name="person" size={24} color="#FE5035" />
                                    </View>
                                    <View className="ml-3 flex-1">
                                        <Text className="text-primary font-bold text-lg">
                                            {currentTrip.passengerName}
                                        </Text>
                                        <View className="flex-row items-center">
                                            <Ionicons name="star" size={14} color="#FFB800" />
                                            <Text className="text-secondary text-sm ml-1">
                                                {currentTrip.passengerRating.toFixed(1)}
                                            </Text>
                                        </View>
                                    </View>
                                    {/* Call Button moved here */}
                                    <Pressable
                                        onPress={handleCallPassenger}
                                        className="w-10 h-10 rounded-full bg-success/10 items-center justify-center ml-2 border border-success/20"
                                    >
                                        <Ionicons name="call" size={20} color="#10B981" />
                                    </Pressable>
                                </View>

                                {/* Pickup Location */}
                                <View className="flex-row items-start mb-4 pb-4 border-b border-gray-100">
                                    <View className="w-6 items-center pt-1">
                                        <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
                                    </View>
                                    <View className="ml-3 flex-1">
                                        <Text className="text-secondary text-xs mb-1">PICKUP LOCATION</Text>
                                        <Text className="text-primary font-medium">
                                            {currentTrip.pickup.address}
                                        </Text>
                                    </View>
                                </View>

                                {/* Distance & Price (formerly ETA) */}
                                <View className="flex-row items-center justify-between mb-4">
                                    <View className="flex-row items-center">
                                        <Ionicons name="navigate" size={20} color="#7B8387" />
                                        <Text className="text-secondary ml-2">
                                            {routeDistance || `${distance} km away`}
                                        </Text>
                                    </View>
                                    {/* Price moved to here */}
                                    <View className="flex-row items-center">
                                        <Text className="text-accent font-bold text-lg mr-1">
                                            K{currentTrip.estimatedFare}
                                        </Text>
                                    </View>
                                </View>

                                {/* Action Buttons */}
                                <View className="gap-3">
                                    {!isNavigating ? (
                                        <Button
                                            variant={routeError ? "accent" : "primary"}
                                            leftIcon={routeError ? "refresh" : "navigate"}
                                            onPress={routeError ? calculateRoute : handleStartPickup}
                                            fullWidth
                                            disabled={isCalculating || (!routeCoordinates.length && !routeError)}
                                            loading={isCalculating}
                                        >
                                            {routeError ? "Retry Route" : "Start Pickup"}
                                        </Button>
                                    ) : (
                                        <RideActionSlider
                                            key={`arrival-${arrivalAttempt}`}
                                            label="Slide to Arrive"
                                            onComplete={handleArrived}
                                            isLoading={isConfirmingArrival}
                                        />
                                    )}

                                </View>
                            </Card>
                        )}



                        {/* Waiting Mode */}
                        {(tripStatus === 'arrived' || tripStatus === 'waiting') && (
                            <Card variant="default" className="mb-4">
                                <View className="items-center py-4">
                                    <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
                                        <Ionicons name="hourglass-outline" size={40} color="#26344F" />
                                    </View>
                                    <Text className="text-primary font-bold text-xl mb-2">
                                        Waiting for Passenger
                                    </Text>
                                    <Text className="text-secondary text-center mb-2">
                                        {currentTrip.passengerName}
                                    </Text>
                                    <Text className="text-secondary text-sm text-center mb-4">
                                        {currentTrip.pickup.address}
                                    </Text>
                                    <View className="bg-success/10 px-4 py-1 rounded-full mb-6">
                                        <Text className="text-success font-bold text-lg">
                                            {formatTime(elapsedWaitingTime)}
                                        </Text>
                                    </View>
                                    <RideActionSlider
                                        key={`start-trip-${startTripAttempt}`}
                                        label="Slide to Start Trip"
                                        onComplete={handleStartRide}
                                        isLoading={isStartingTrip}
                                    />
                                </View>
                            </Card>
                        )}


                    </View>
                </View>
            </SafeAreaView >
        </View >
    );
}
