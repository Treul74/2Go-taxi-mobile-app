import { CompassButton } from '@/components/map';
import { NavigationMap } from '@/components/navigation';
import { Button, Card, RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { useTurnPreview } from '@/hooks/useTurnPreview';
import { calculateDistanceKm, calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { type DirectionStep } from '@/lib/google/mapsApi';
import { getManeuverIconName } from '@/lib/maneuverIcon';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { fetchRoute } from '@/navigation/NavigationEngine/RouteEngine';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useNavigationStore } from '@/navigation/NavigationEngine/NavigationStore';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        startTripRetry,
        waitingStartTime,
        currentLocation,
        updateLocation,
    } = useDriverStore();
    const navigation = useNavigation();

    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(
        currentLocation
    );
    const [driverHeading, setDriverHeading] = useState<number>(0);
    const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [routeDistance, setRouteDistance] = useState<string | null>(null);
    const [routeSteps, setRouteSteps] = useState<DirectionStep[]>([]);
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const [distanceToManeuverMeters, setDistanceToManeuverMeters] = useState<number | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [routeError, setRouteError] = useState(false);
    const [elapsedWaitingTime, setElapsedWaitingTime] = useState(0);
    const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
    const [arrivalAttempt, setArrivalAttempt] = useState(0);
    const [isStartingTrip, setIsStartingTrip] = useState(false);
    const [startTripAttempt, setStartTripAttempt] = useState(0);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, driverHeading);

    // Track driver location (high accuracy, 1–2s interval). GPS acquisition
    // goes entirely through GPSManager — the only file allowed to create a
    // location subscription (src/navigation/NavigationEngine/GPSManager.ts).
    useEffect(() => {
        let cancelled = false;
        const unsubscribeFix = GPSManager.onFix((fix) => {
            setDriverLocation(fix.coordinate);
            updateLocation(fix.coordinate.latitude, fix.coordinate.longitude);
            // Falls back to the existing heading state (initially 0) when
            // GPS can't derive one, e.g. indoors — never crashes.
            if (fix.heading !== undefined) {
                setDriverHeading(fix.heading);
            }
        });

        async function startTracking() {
            try {
                await GPSManager.acquire('foreground', 'driverBestNavigation');
                if (cancelled) return;

                const existingFix = GPSManager.getLastFix();
                if (existingFix) {
                    setDriverLocation(existingFix.coordinate);
                    updateLocation(existingFix.coordinate.latitude, existingFix.coordinate.longitude);
                    if (existingFix.heading !== undefined) {
                        setDriverHeading(existingFix.heading);
                    }
                }
            } catch {
                // Non-critical — location tracking will retry on next mount.
            }
        }

        startTracking();

        return () => {
            cancelled = true;
            unsubscribeFix();
            GPSManager.release();
        };
    }, []);

    // Phase 6A (Camera Runtime Activation): this screen is the first
    // NavigationMap host, and CameraController's initial cameraState
    // ('OVERVIEW') would otherwise resolve to an auto-fit pose instead of
    // following the driver toward pickup. Requesting FOLLOW_DRIVER once on
    // mount is the existing, Bible-documented action for this
    // (`navigation.followDriver()`) — no new camera logic, just telling the
    // already-built engine which of its existing intents applies here.
    useEffect(() => {
        navigation.followDriver();
    }, []);

    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);

    const calculateRoute = async () => {
        if (!driverLocation || !currentTrip) return;
        // Guards against overlapping fetches — driverLocation updates every
        // 1-2s from GPSManager and could otherwise re-trigger the auto-fetch
        // effect below while a previous fetchRoute() is still in flight,
        // letting an earlier failure land after a later success and flip
        // routeError back to true despite a valid route already being stored.
        if (isCalculating) return;

        setIsCalculating(true);
        setRouteError(false);

        try {
            // Routing goes entirely through RouteEngine — the only file allowed
            // to fetch/cache Directions (src/navigation/NavigationEngine/RouteEngine.ts).
            const route = await fetchRoute(driverLocation, currentTrip.pickup);

            if (!route) {
                setRouteError(true);
                return;
            }

            // Publishes the fetched pickup route into NavigationStore alongside
            // this screen's own local state (Phase 5D) — this screen's UI still
            // reads its own state below, unchanged.
            useNavigationStore.getState().setRoute(route);

            setRouteCoordinates(route.path);
            setRouteDistance(route.distanceText ?? formatManeuverDistance(route.distanceMeters));
            // Adapted to the shape this screen already expects — RouteEngine's
            // own RouteStep carries the same data as flat numeric fields instead
            // of Google's {text,value} pairs.
            setRouteSteps(route.steps.map((step): DirectionStep => ({
                instruction: step.instruction,
                distance: { text: formatManeuverDistance(step.distanceMeters), value: step.distanceMeters },
                duration: { text: `${Math.round(step.durationSeconds / 60)} min`, value: step.durationSeconds },
                startLocation: step.startLocation,
                endLocation: step.endLocation,
                maneuver: step.maneuver,
                polyline: '', // unused by <Map routeSteps> (only maneuver/start/endLocation are read)
            })));
            setActiveStepIndex(0);
            setRouteError(false);
        } catch (error) {
            console.error('Error calculating route:', error);
            setRouteError(true);
        } finally {
            setIsCalculating(false);
        }
    };

    // Auto-calculate route on mount or location update if no route
    useEffect(() => {
        if (currentTrip && routeCoordinates.length === 0 && driverLocation) {
            calculateRoute();
        }
    }, [currentTrip, driverLocation]); // simplified dependency

    const handleStartPickup = async () => {
        // Runtime handoff (Phase 5.5B): makes the Navigation Runtime aware
        // that navigation has started. Mode is normally already
        // DRIVER_TO_PICKUP by the time this button is pressed (dispatched at
        // Accept time — DriverDashboard.handleAcceptRequest), so this
        // re-dispatch is typically a safeTransition-guarded no-op (DRIVER_TO_PICKUP
        // has no legal self-loop — NavigationModes.ts). It's kept, not
        // skipped, because it doubles as the recovery path if that earlier
        // dispatch never landed (remount, race) — the only existing action
        // that can (re)reach DRIVER_TO_PICKUP.
        safeTransition(() => navigation.driverToPickup(driverLocation ?? undefined));

        // Local UI state only (turn-by-turn banner, slider vs. button) —
        // camera behaviour no longer depends on this flag (Phase 6A).
        setIsNavigating(true);
    };

    const handleArrived = async () => {
        setIsConfirmingArrival(true);
        const success = await confirmArrival();
        setIsConfirmingArrival(false);
        if (!success) {
            setArrivalAttempt((n) => n + 1);
            Alert.alert('Error', 'Could not confirm arrival. Please try again.');
            return;
        }
        safeTransition(() => navigation.arrivedAtPickup());
    };

    const handleStartRide = async () => {
        setIsStartingTrip(true);
        const success = await beginTrip();
        setIsStartingTrip(false);
        if (success) {
            safeTransition(() => navigation.startTrip());
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
        Linking.openSettings().catch(() => {});
    };

    const distance = driverLocation && currentTrip
        ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, currentTrip.pickup.latitude, currentTrip.pickup.longitude).toFixed(1)
        : '...';

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

    // Camera is now owned entirely by CameraController (Phase 6A) — this
    // screen no longer holds a map ref or drives animateCamera itself (see
    // AGENTS.md "Camera Rules" / Bible "Core Principles"). Compass tap
    // requests the engine's existing FOLLOW_DRIVER intent instead of
    // manipulating the map directly.
    const handleCompassPress = () => {
        navigation.recenter();
    };

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
            {/* Full-screen Map — Phase 6A: this screen is the first
                NavigationMap host. The engine (CameraController, driven by
                NavigationStore) now owns every marker/camera decision this
                base layer renders; the screen no longer passes driver
                position, route, or camera props by hand. */}
            <View className="absolute inset-0">
                <NavigationMap />
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
                                            {currentTrip.passengerRating > 0 ? (
                                                <>
                                                    <Ionicons name="star" size={14} color="#FFB800" />
                                                    <Text className="text-secondary text-sm ml-1">
                                                        {currentTrip.passengerRating.toFixed(1)}
                                                    </Text>
                                                </>
                                            ) : (
                                                <Text className="text-secondary text-sm">New</Text>
                                            )}
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
                                    {isStartingTrip && startTripRetry && (
                                        <View className="bg-warning/10 px-4 py-2 rounded-xl mb-3 flex-row items-center justify-center">
                                            <Ionicons name="cloud-offline-outline" size={16} color="#FFB800" />
                                            <Text className="text-warning font-medium text-sm ml-2 text-center">
                                                Network connection interrupted.{'\n'}
                                                Retrying... Attempt {startTripRetry.attempt} of {startTripRetry.maxAttempts}
                                            </Text>
                                        </View>
                                    )}
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
