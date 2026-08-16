import {
  NavigationArrivalTime,
  NavigationCompass,
  NavigationControls,
  NavigationLaneGuidance,
  NavigationMap,
  NavigationRoadName,
  NavigationTurnBanner,
  NavigationVoiceToggle,
} from '@/components/navigation';
import { Button } from '@/components/ui';
import { DriverActiveTripCard } from './DriverActiveTripCard';
import { PickupNavigationCard } from './PickupNavigationCard';
import { WaitingForCustomerCard } from './WaitingForCustomerCard';
import { NavigationSpeedWidget } from '../components';
import { useDriverTelemetryPing } from '../hooks';
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
    useGPSState,
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

    const gpsState = useGPSState();

    const [isCalculating, setIsCalculating] = useState(false);
    const [routeError, setRouteError] = useState(false);
    const [elapsedWaitingTime, setElapsedWaitingTime] = useState(0);
    const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
    const [arrivalAttempt, setArrivalAttempt] = useState(0);
    const [isStartingTrip, setIsStartingTrip] = useState(false);
    const [startTripAttempt, setStartTripAttempt] = useState(0);
    const [showGpsTimeout, setShowGpsTimeout] = useState(false);
    const [gpsServicesDisabled, setGpsServicesDisabled] = useState(false);
    const [elapsedPickupTime, setElapsedPickupTime] = useState(0);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, heading ?? 0);

    // GPS acquisition lifecycle only — goes entirely through GPSManager, the
    // only file allowed to create a location subscription
    // (src/navigation/NavigationEngine/GPSManager.ts). This screen no longer
    // mirrors fixes into local state (Phase 7R.4): NavigationProvider
    // (mounted once at the app root) already has its own GPSManager.onFix
    // listener that keeps NavigationStore.driverLocation/heading live for
    // every consumer, this screen included, via the selectors above.
    useEffect(() => {
        GPSManager.acquire('foreground', 'driverBestNavigation').catch((error) => {
            if (error instanceof GPSManager.GPSManagerError && error.code === 'SERVICES_DISABLED') {
                setGpsServicesDisabled(true);
            }
            // Non-critical — location tracking will retry on next mount.
        });

        return () => {
            GPSManager.release();
        };
    }, []);

    // 8-10 second timeout for "acquiring" GPS state
    useEffect(() => {
        if (gpsState.status === 'acquiring' && (!gpsState.lastFix || gpsState.lastFix.isApproximate)) {
            const timer = setTimeout(() => {
                setShowGpsTimeout(true);
            }, 8000);
            return () => clearTimeout(timer);
        } else {
            setShowGpsTimeout(false);
        }
    }, [gpsState.status, gpsState.lastFix]);

    const handleRetryGPS = () => {
        setShowGpsTimeout(false);
        setGpsServicesDisabled(false);
        GPSManager.acquire('foreground', 'driverBestNavigation').catch((error) => {
            if (error instanceof GPSManager.GPSManagerError && error.code === 'SERVICES_DISABLED') {
                setGpsServicesDisabled(true);
            }
        });
    };

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
            router.replace('/(driver)/(tabs)');
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
        if (routeCoordinates.length > 0) {
            navigation.setNavigationEnabled(true);
        } else if (routeError) {
            calculateRoute();
        }
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

    const arrivalTime = useMemo(() => {
        if (distance === '...') return '...';
        const mins = Math.ceil(parseFloat(distance) * 2);
        const arrival = new Date(Date.now() + mins * 60000);
        return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [distance]);

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

    // Pickup phase timer
    useEffect(() => {
        if (tripStatus === 'navigating_to_pickup' && navigationEnabled) {
            const interval = setInterval(() => setElapsedPickupTime((prev) => prev + 1), 1000);
            return () => clearInterval(interval);
        }
    }, [tripStatus, navigationEnabled]);

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
            {/* GPS Timeout / Services Disabled Overlay */}
            {(showGpsTimeout || gpsServicesDisabled) && (
                <View className="absolute inset-0 bg-black/60 items-center justify-center px-6 z-50">
                    <View className="bg-white rounded-2xl p-6 items-center w-full max-w-sm">
                        <Ionicons name="location-outline" size={48} color="#FE5035" style={{ marginBottom: 16 }} />
                        <Text className="text-lg font-bold text-center mb-2">
                            {gpsServicesDisabled ? 'Location Services Disabled' : 'Still finding your location'}
                        </Text>
                        <Text className="text-secondary text-center mb-6">
                            {gpsServicesDisabled 
                                ? 'Please enable Location Services in your system settings to continue.' 
                                : 'Check that Location Services are turned on and you have a clear view of the sky.'}
                        </Text>
                        {gpsServicesDisabled ? (
                            <Button onPress={handleOpenSettings} className="w-full">Open Settings</Button>
                        ) : (
                            <Button onPress={handleRetryGPS} className="w-full">Retry</Button>
                        )}
                    </View>
                </View>
            )}

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
                        {tripStatus !== 'navigating_to_pickup' && <NavigationSpeedWidget />}
                        <NavigationVoiceToggle />
                    </View>
                )}

                {/* Top navigation bar removed as per requirements */}

                {/* Bottom content */}
                <View className="flex-1 justify-end px-5 pb-4" pointerEvents="box-none">
                    {/* onLayout reports whichever card (or neither) is
                        currently rendered below. We conditionally attach it
                        so it doesn't conflict with DriverActiveTripCard's onLayout. */}
                    <View 
                        pointerEvents="auto" 
                        onLayout={!(tripStatus === 'navigating_to_pickup' && navigationEnabled) ? handleBottomCardLayout : undefined}
                    >
                        {/* Navigating to Pickup */}
                        {tripStatus === 'navigating_to_pickup' && !navigationEnabled && (
                            <PickupNavigationCard
                                customerName={currentTrip.customerName}
                                customerRating={currentTrip.customerRating}
                                pickupAddress={currentTrip.pickup.address}
                                estimatedFare={currentTrip.estimatedFare}
                                distance={distance}
                                routeDistanceText={routeDistanceText}
                                routeError={routeError}
                                isCalculating={isCalculating}
                                onStartPickup={handleStartPickup}
                                onCallCustomer={handleCallCustomer}
                            />
                        )}





                        {/* Waiting Mode */}
                        {(tripStatus === 'arrived' || tripStatus === 'waiting') && (
                            <WaitingForCustomerCard
                                customerName={currentTrip.customerName}
                                pickupAddress={currentTrip.pickup.address}
                                elapsedWaitingTime={elapsedWaitingTime}
                                isStartingTrip={isStartingTrip}
                                startTripAttempt={startTripAttempt}
                                startTripRetry={startTripRetry}
                                onStartTrip={handleStartRide}
                            />
                        )}


                    </View>
                </View>
            </SafeAreaView >

            {/* Slide to Arrive card — pulled out of SafeAreaView so it can attach edge-to-edge 
                and manage its own bottom inset exactly like trip.tsx */}
            {tripStatus === 'navigating_to_pickup' && navigationEnabled && (
                <DriverActiveTripCard
                    distance={routeDistanceText || `${distance} km`}
                    arrivalTime={arrivalTime}
                    duration={formatTime(elapsedPickupTime)}
                    customerName={currentTrip.customerName}
                    customerRating={currentTrip.customerRating}
                    pickupAddress={currentTrip.pickup.address}
                    destinationAddress={currentTrip.destination.address}
                    fare={currentTrip.estimatedFare}
                    sliderLabel="Slide to Arrive"
                    onSliderComplete={handleArrived}
                    onCallCustomer={handleCallCustomer}
                    onChatCustomer={() => router.push(`/chat/${currentTrip.id}`)}
                    isLoadingAction={isConfirmingArrival}
                    onLayout={handleBottomCardLayout}
                />
            )}
        </View >
    );
}
