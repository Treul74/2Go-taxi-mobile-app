import {
  NavigationArrivalTime,
  NavigationCompass,
  NavigationControls,
  NavigationLaneGuidance,
  NavigationMap,
  NavigationRoadName,
  NavigationSpeedWidget,
  NavigationTurnBanner,
  NavigationVoiceToggle,
} from '@/components/navigation';
import { Button, Card, RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { calculateDistanceKm, calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { setChrome } from '@/navigation/NavigationEngine/CameraController';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import {
    useActiveRoute,
    useDriverLocation,
    useHeading,
    useNavigationEnabled,
    useOverviewRoute,
} from '@/navigation/NavigationEngine/NavigationHooks';
import { fetchRoute } from '@/navigation/NavigationEngine/RouteEngine';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useNavigationStore } from '@/navigation/NavigationEngine/NavigationStore';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
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
        updateLocation,
    } = useDriverStore();
    const navigation = useNavigation();

    // Engine-owned — read from NavigationStore, not mirrored into local
    // state (Phase 7R.4: this screen no longer keeps its own copy of
    // anything NavigationProvider/calculateRoute already publish to the
    // store; see NavigationEngine/Architecture.md's Rollout plan step 6).
    const driverLocation = useDriverLocation();
    const heading = useHeading();
    const route = useActiveRoute();
    const overviewRoute = useOverviewRoute();
    const navigationEnabled = useNavigationEnabled();
    const routeCoordinates = route?.path ?? [];
    const routeDistanceText = route ? (route.distanceText ?? formatManeuverDistance(route.distanceMeters)) : null;

    const [isCalculating, setIsCalculating] = useState(false);
    const [routeError, setRouteError] = useState(false);
    const [elapsedWaitingTime, setElapsedWaitingTime] = useState(0);
    const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
    const [arrivalAttempt, setArrivalAttempt] = useState(0);
    const [isStartingTrip, setIsStartingTrip] = useState(false);
    const [startTripAttempt, setStartTripAttempt] = useState(0);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, heading ?? 0);

    // GPS acquisition lifecycle only — goes entirely through GPSManager, the
    // only file allowed to create a location subscription
    // (src/navigation/NavigationEngine/GPSManager.ts). This screen no longer
    // mirrors fixes into local state (Phase 7R.4): NavigationProvider
    // (mounted once at the app root) already has its own GPSManager.onFix
    // listener that keeps NavigationStore.driverLocation/heading live for
    // every consumer, this screen included, via the selectors above.
    useEffect(() => {
        GPSManager.acquire('foreground', 'driverBestNavigation').catch(() => {
            // Non-critical — location tracking will retry on next mount.
        });

        return () => {
            GPSManager.release();
        };
    }, []);

    // Bridges the engine's live driverLocation into driverStore's persisted
    // position (hex9/nearbyHexes/incomingRequests recompute on every call) —
    // NavigationStore intentionally isn't written back to driverStore on its
    // own (Architecture.md's "Relationship to existing stores"), so this is
    // the one place that still does, same as the old onFix listener did.
    useEffect(() => {
        if (driverLocation) {
            updateLocation(driverLocation.latitude, driverLocation.longitude);
        }
    }, [driverLocation, updateLocation]);

    // Phase 6A (Camera Runtime Activation): this screen is the first
    // NavigationMap host. Instead of calling navigation.followDriver() immediately,
    // which would do nothing until GPS resolves, we now wait to fetch the
    // overview route and call navigation.overview() to fit pickup and destination.
    // Once GPS resolves, calculateRoute() will call navigation.followDriver().
    useEffect(() => {
        // Only set to OVERVIEW if we don't have GPS yet, otherwise we might
        // override an active follow state on re-mount.
        if (!driverLocation) {
            navigation.overview();
        }
    }, []);

    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);

    const calculateRoute = async () => {
        if (!driverLocation || !currentTrip) {
            if (__DEV__) {
                console.warn('[DriverNavigation] calculateRoute aborted: missing data', {
                    hasDriverLocation: !!driverLocation,
                    hasCurrentTrip: !!currentTrip
                });
            }
            return;
        }
        if (isCalculating) return;

        setIsCalculating(true);
        setRouteError(false);

        try {
            const fetchedRoute = await fetchRoute(driverLocation, currentTrip.pickup);
            if (!fetchedRoute) {
                setRouteError(true);
                return;
            }
            useNavigationStore.getState().setRoute(fetchedRoute);
            setRouteError(false);
            
            // Once we have the live route, we follow the driver
            navigation.followDriver();
        } catch (error) {
            console.error('Error calculating route:', error);
            setRouteError(true);
        } finally {
            setIsCalculating(false);
        }
    };

    // Auto-calculate live route on location update if no active route
    useEffect(() => {
        if (currentTrip && routeCoordinates.length === 0 && driverLocation) {
            calculateRoute();
        }
    }, [currentTrip, driverLocation]);

    // Fetch static overview route immediately
    useEffect(() => {
        if (currentTrip && !overviewRoute) {
            fetchRoute(currentTrip.pickup, currentTrip.destination).then(fetchedRoute => {
                if (fetchedRoute) {
                    useNavigationStore.getState().setOverviewRoute(fetchedRoute);
                    // Fit camera to the overview route while waiting for GPS
                    if (!driverLocation) {
                        navigation.overview();
                    }
                }
            }).catch(error => {
                console.error('Error fetching overview route:', error);
            });
        }
    }, [currentTrip, overviewRoute]);

    const handleStartPickup = async () => {
        // The mode is already DRIVER_TO_PICKUP by the time this button is pressed 
        // (dispatched at Accept time — DriverDashboard.handleAcceptRequest).
        // Removing the redundant safeTransition(() => navigation.driverToPickup(...))
        // that was throwing and swallowing NavigationTransitionError.

        // Engine-owned (Phase 7R.4): turn-by-turn banner / slider-vs-button
        // switch now reads NavigationStore.navigationEnabled instead of a
        // screen-local flag — camera behaviour still doesn't depend on it
        // (Phase 6A).
        navigation.setNavigationEnabled(true);
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

    const handleCallCustomer = () => {
        // In production, customer phone would be in the trip data
        // For now using a placeholder
        const telUrl = `tel:+260971234567`;

        Linking.openURL(telUrl).catch(() => {
            Alert.alert('Error', 'Could not open phone dialer');
        });
    };

    const handleOpenSettings = () => {
        Linking.openSettings().catch(() => {});
    };

    // Phase 7B (Professional AutoFit): this screen owns its own bespoke turn
    // banner slot and pickup/arrival card (not the generic NavigationBottomCard),
    // so it's the one place that actually knows their real rendered heights —
    // reports them into CameraController's chrome model the same way
    // NavigationMap already reports safe-area insets (Phase 7), via the
    // engine's existing setChrome() setter (AutoFitEngine.mergeChromeIntoPadding
    // consumes it — no new fitting math). Currently inert on this screen (its
    // reachable modes, DRIVER_TO_PICKUP/ARRIVED_PICKUP, are both
    // autoFit:false — see CAMERA_PROFILES), wired for correctness so a future
    // autoFit-true moment on this screen frames correctly on the first tick
    // instead of defaulting to zero padding.
    const handleTurnBannerLayout = (event: LayoutChangeEvent) => {
        setChrome({ navigationBannerHeight: event.nativeEvent.layout.height });
    };
    const handleBottomCardLayout = (event: LayoutChangeEvent) => {
        setChrome({ bottomSheetHeight: event.nativeEvent.layout.height });
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
                {/* Turn-by-turn top HUD — store-driven (Phase 7): reads
                    NavigationStore's currentStep/currentInstruction, kept
                    live by RouteProgressTracker on every GPS tick. Always
                    mounted (Phase 7B) so onLayout reliably reports 0 when
                    empty instead of going stale when navigationEnabled flips off —
                    same visible result as before (nothing renders while not
                    navigating), just measurable. Lane guidance + road name
                    (Phase 7D) share this slot, below the turn banner. */}
                <View className="px-5 pt-2" pointerEvents="box-none" onLayout={handleTurnBannerLayout}>
                    {navigationEnabled && (
                        <View className="gap-2" pointerEvents="box-none">
                            <NavigationTurnBanner />
                            <View className="flex-row gap-2" pointerEvents="box-none">
                                <NavigationLaneGuidance />
                                <NavigationRoadName />
                            </View>
                        </View>
                    )}
                </View>

                {/* Arrival time (Phase 7D) — wall-clock complement to the
                    distance/price shown lower in the pickup card; mirrors
                    the turn banner's top row on the opposite side. */}
                {navigationEnabled && (
                    <View className="absolute top-2 right-5" pointerEvents="auto">
                        <NavigationArrivalTime />
                    </View>
                )}

                {/* Compass + Recenter — Phase 7: engine components, replacing
                    the screen-local CompassButton. Recenter only renders once
                    the driver pans/pinches away from follow. */}
                {navigationEnabled && (
                    <View className="absolute top-24 right-5 gap-3" pointerEvents="auto">
                        <NavigationCompass />
                        <NavigationControls />
                    </View>
                )}

                {/* Speed + voice-guidance toggle */}
                {navigationEnabled && (
                    <View className="absolute bottom-40 left-5 gap-3" pointerEvents="auto">
                        <NavigationSpeedWidget />
                        <NavigationVoiceToggle />
                    </View>
                )}

                {/* Top navigation bar removed as per requirements */}

                {/* Bottom content */}
                <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
                    {/* onLayout reports whichever card (or neither) is
                        currently rendered below — this View is unconditional,
                        so it collapses to 0 height and re-reports correctly
                        when tripStatus changes (Phase 7B chrome wiring). */}
                    <View pointerEvents="auto" onLayout={handleBottomCardLayout}>
                        {/* Navigating to Pickup */}
                        {tripStatus === 'navigating_to_pickup' && (
                            <Card variant="default" className="mb-4 shadow-xl">
                                {/* Customer Info */}
                                <View className="flex-row items-center mb-4">
                                    <View className="w-12 h-12 rounded-full bg-accent/10 items-center justify-center">
                                        <Ionicons name="person" size={24} color="#FE5035" />
                                    </View>
                                    <View className="ml-3 flex-1">
                                        <Text className="text-primary font-bold text-lg">
                                            {currentTrip.customerName}
                                        </Text>
                                        <View className="flex-row items-center">
                                            {currentTrip.customerRating > 0 ? (
                                                <>
                                                    <Ionicons name="star" size={14} color="#FFB800" />
                                                    <Text className="text-secondary text-sm ml-1">
                                                        {currentTrip.customerRating.toFixed(1)}
                                                    </Text>
                                                </>
                                            ) : (
                                                <Text className="text-secondary text-sm">New</Text>
                                            )}
                                        </View>
                                    </View>
                                    {/* Call Button moved here */}
                                    <Pressable
                                        onPress={handleCallCustomer}
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
                                            {routeDistanceText || `${distance} km away`}
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
                                    {!navigationEnabled ? (
                                        <Button
                                            variant="primary"
                                            leftIcon="navigate"
                                            onPress={handleStartPickup}
                                            fullWidth
                                        >
                                            Start Pickup
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
                                        Waiting for Customer
                                    </Text>
                                    <Text className="text-secondary text-center mb-2">
                                        {currentTrip.customerName}
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
