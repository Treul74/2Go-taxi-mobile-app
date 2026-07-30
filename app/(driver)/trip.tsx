import { CompassButton, Map } from '@/components/map';
import { RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { useTurnPreview } from '@/hooks/useTurnPreview';
import { calculateDistanceKm, calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { getDirections, type DirectionStep } from '@/lib/google/mapsApi';
import { getManeuverIconName } from '@/lib/maneuverIcon';
import { calculateBearing } from '@/lib/routeSnapping';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CARD_COLLAPSED_HEIGHT = 180;
const CARD_EXPANDED_HEIGHT = 420;

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
        vehicleType,
    } = useDriverStore();

    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(
        currentLocation
    );
    const [driverHeading, setDriverHeading] = useState<number>(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [isAutoFollow, setIsAutoFollow] = useState(true);
    const [lastInteraction, setLastInteraction] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [routeSteps, setRouteSteps] = useState<DirectionStep[]>([]);
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const [distanceToManeuverMeters, setDistanceToManeuverMeters] = useState<number | null>(null);
    const mapRef = useRef<any>(null);
    const insets = useSafeAreaInsets();
    const overlayAnim = useRef(new Animated.Value(CARD_COLLAPSED_HEIGHT + 16)).current;

    // Slides the navigation-arrow / speed overlays up as the trip card
    // expands, so they never end up hidden behind (or overlapping) it.
    useEffect(() => {
        Animated.spring(overlayAnim, {
            toValue: isExpanded ? CARD_EXPANDED_HEIGHT + 16 : CARD_COLLAPSED_HEIGHT + 16,
            useNativeDriver: false,
            friction: 8,
            tension: 40,
        }).start();
    }, [isExpanded]);

    // Actual GPS distance travelled so far this trip (accumulated from
    // consecutive location fixes below), used only for the final fare
    // calculation at trip completion — never displayed live.
    const distanceTraveledRef = useRef(0);
    const lastGpsPointRef = useRef<{ latitude: number; longitude: number; accuracy: number | null; timestamp: number } | null>(null);

    useDriverTelemetryPing(currentTrip?.id, driverLocation, driverHeading);

    // Start trip when component mounts
    useEffect(() => {
        if (tripStatus !== 'in_progress') {
            startTrip();
        }
    }, []);

    // Accumulates the real GPS distance travelled between consecutive fixes —
    // the running total this produces is the actual distance driven this
    // trip, as opposed to the remaining distance to the destination. Only
    // valid movement is added, and noisy or implausible fixes are ignored.
    const trackGpsPoint = (location: Location.LocationObject) => {
        const { latitude, longitude, accuracy } = location.coords;
        const currentTimestamp = location.timestamp;

        if (accuracy == null || !Number.isFinite(accuracy) || accuracy > 50) {
            return false;
        }

        const prev = lastGpsPointRef.current;
        if (!prev) {
            lastGpsPointRef.current = { latitude, longitude, accuracy, timestamp: currentTimestamp };
            return true;
        }

        const segmentDistanceKm = calculateDistanceKm(prev.latitude, prev.longitude, latitude, longitude);
        const segmentDistanceMeters = segmentDistanceKm * 1000;
        const timeDeltaMs = currentTimestamp - prev.timestamp;

        if (segmentDistanceMeters < 8 || timeDeltaMs <= 0) {
            return false;
        }

        const allowedSpeedKmh = 120;
        const allowedDistanceMeters = Math.max(8, (timeDeltaMs / 1000 / 60 / 60) * allowedSpeedKmh * 1000);
        const uncertaintyMeters = (prev.accuracy ?? 0) + (accuracy ?? 0);
        const minimumMoveMeters = Math.max(8, uncertaintyMeters * 2);

        if (segmentDistanceMeters < minimumMoveMeters) {
            return false;
        }

        const segmentSpeedKmh = (segmentDistanceKm / (timeDeltaMs / 1000 / 60 / 60));
        if (segmentDistanceMeters > allowedDistanceMeters || segmentSpeedKmh > allowedSpeedKmh) {
            return false;
        }

        distanceTraveledRef.current += segmentDistanceKm;
        lastGpsPointRef.current = { latitude, longitude, accuracy, timestamp: currentTimestamp };
        return true;
    };

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
                    trackGpsPoint(initial);
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
                        trackGpsPoint(location);
                        if (location.coords.heading !== null) {
                            setDriverHeading(location.coords.heading);
                        }
                        if (location.coords.speed !== null && location.coords.speed >= 0) {
                            setCurrentSpeed(Math.round(location.coords.speed * 3.6));
                        }
                    }
                );
            } catch {
                // Non-critical — location tracking will retry on next mount.
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
            setRouteSteps(route.steps);
            setActiveStepIndex(0);
        })();
        return () => {
            cancelled = true;
        };
    }, [driverLocation?.latitude, driverLocation?.longitude, currentTrip?.destination?.latitude, currentTrip?.destination?.longitude]);

    // TBT step advance — also tracks live distance to the upcoming maneuver
    // for the turn preview pulse/color escalation, matching app/(tabs)/navigate.tsx.
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

        const dist = calculateDistanceMeters(
            driverLocation.latitude,
            driverLocation.longitude,
            step.endLocation.latitude,
            step.endLocation.longitude
        );

        setDistanceToManeuverMeters(dist);

        if (dist < 25 && activeStepIndex < routeSteps.length - 1) {
            setActiveStepIndex((prev) => prev + 1);
        }
    }, [driverLocation, routeSteps, activeStepIndex]);

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

    // Camera follow mode during trip — heading-up, with a bearing-toward-next-maneuver
    // fallback for stationary/low-speed GPS fixes (heading unreliable near 0),
    // matching the pattern in app/(tabs)/navigate.tsx.
    useEffect(() => {
        if (!driverLocation || !isAutoFollow) return;
        if (mapRef.current?.animateCamera) {
            const nextStep = routeSteps[activeStepIndex];
            const cameraHeading = (driverHeading && driverHeading > 1)
                ? driverHeading
                : nextStep
                    ? calculateBearing(
                        { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
                        { latitude: nextStep.endLocation.latitude, longitude: nextStep.endLocation.longitude }
                    )
                    : driverHeading;

            mapRef.current.animateCamera({
                center: {
                    latitude: driverLocation.latitude,
                    longitude: driverLocation.longitude,
                },
                heading: cameraHeading || 0,
                pitch: 45,
                altitude: 500,
                zoom: 17,
            }, 700);
        }
    }, [driverLocation?.latitude, driverLocation?.longitude, driverHeading, isAutoFollow, routeSteps, activeStepIndex]);

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

    const distance = driverLocation && currentTrip
        ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, currentTrip.destination.latitude, currentTrip.destination.longitude).toFixed(1)
        : '...';

    const arrivalTime = useMemo(() => {
        const mins = Math.ceil(parseFloat(distance) * 2);
        const arrival = new Date(Date.now() + mins * 60000);
        return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [distance]);

    const { pulseScale: turnPulseScale, color: turnDistanceColor } = useTurnPreview(distanceToManeuverMeters);

    if (!currentTrip || !vehicleType) {
        return null;
    }

    const handleSliderComplete = async () => {
        // Report actual trip facts only — the app no longer calculates a
        // fare. distanceKm is the real GPS-tracked distance driven this trip,
        // not the remaining distance to the destination.
        const distanceKm = distanceTraveledRef.current;
        const durationMin = Math.ceil(elapsedTime / 60);
        const waitingMin = Math.ceil(waitingDuration / 60);

        const receiptData = {
            passengerName: currentTrip.passengerName,
            distance: distanceKm,
            duration: durationMin,
            waitingDuration: waitingMin,
            completedAt: new Date().toISOString(),
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

    const handleChatPassenger = () => {
        router.push(`/chat/${currentTrip.id}`);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const currentStep = routeSteps[activeStepIndex];
    const nextManeuverIcon = getManeuverIconName(currentStep?.maneuver);

    return (
        <View className="flex-1 bg-background">
            {/* Full-screen Map */}
            <View className="absolute inset-0">
                <Map
                    ref={mapRef}
                    driverLocation={driverLocation || undefined}
                    driverHeading={driverHeading}
                    navigationArrowMode={true}
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
                    mapPadding={{ top: 0, right: 0, bottom: 200, left: 0 }}
                />
            </View>

            {/* Next turn HUD — top-left, shown once route steps are available */}
            {routeSteps.length > 0 && (
                <View
                    style={{
                        position: 'absolute',
                        top: insets.top + 8,
                        left: 16,
                        right: 16,
                        zIndex: 20,
                    }}
                >
                    <View
                        style={{
                            backgroundColor: 'white',
                            borderRadius: 16,
                            padding: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.15,
                            shadowRadius: 8,
                            elevation: 8,
                        }}
                    >
                        <Animated.View
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: '#F3F4F6',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 12,
                                transform: [{ scale: turnPulseScale }],
                            }}
                        >
                            <Ionicons name={nextManeuverIcon} size={20} color="#26344F" />
                        </Animated.View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#7B8387', fontSize: 10, marginBottom: 2 }}>
                                NEXT TURN
                            </Text>
                            <Text
                                style={{ color: '#26344F', fontWeight: 'bold', fontSize: 15 }}
                                numberOfLines={1}
                            >
                                {currentStep ? currentStep.instruction.replace(/<[^>]*>/g, '') : ''}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: '#7B8387', fontSize: 10 }}>IN</Text>
                            <Text style={{ fontWeight: 'bold', fontSize: 18, color: turnDistanceColor }}>
                                {distanceToManeuverMeters !== null ? formatManeuverDistance(distanceToManeuverMeters) : '--'}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Compass button overlay — below zoom controls, resets camera to north-up */}
            <View
                pointerEvents="auto"
                style={{
                    position: 'absolute',
                    right: 16,
                    top: 160,
                    zIndex: 10,
                }}
            >
                <CompassButton
                    heading={driverHeading}
                    onPress={() => mapRef.current?.animateCamera?.({ heading: 0 }, 700)}
                />
            </View>

            {/* Speed display + speed limit overlay — bottom-left, above the trip card */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 16,
                    bottom: Animated.add(overlayAnim, 20),
                    zIndex: 10,
                }}
            >
                <View
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: 'white',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 3,
                        borderColor: '#FE5035',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 4,
                        elevation: 5,
                        marginBottom: 8,
                    }}
                >
                    <Text className="text-primary font-bold text-2xl">
                        {currentSpeed}
                    </Text>
                    <Text className="text-secondary text-xs">km/h</Text>
                </View>

                <View
                    style={{
                        width: 64,
                        borderRadius: 12,
                        backgroundColor: 'white',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 4,
                        borderWidth: 2,
                        borderColor: '#EF4444',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 3,
                        elevation: 4,
                    }}
                >
                    <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 14 }}>
                        60
                    </Text>
                    <Text className="text-secondary text-xs">LIMIT</Text>
                </View>
            </Animated.View>

            {/* Bottom trip card — collapsed shows stats only, expanded adds passenger/pickup/dropoff/fare */}
            <View style={[styles.card, { paddingBottom: insets.bottom || 16 }]}>
                {/* Drag handle pill */}
                <View style={styles.dragHandleWrap}>
                    <View style={styles.dragHandle} />
                </View>

                {/* Stats row — always visible */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Ionicons name="repeat-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{distance} km</Text>
                        <Text style={styles.statLabel}>Distance</Text>
                    </View>

                    <View style={styles.statItem}>
                        <Ionicons name="time-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{arrivalTime}</Text>
                        <Text style={styles.statLabel}>Arrival</Text>
                    </View>

                    <View style={styles.statItem}>
                        <Ionicons name="stopwatch-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{formatTime(elapsedTime)}</Text>
                        <Text style={styles.statLabel}>Duration</Text>
                    </View>

                    <Pressable onPress={() => setIsExpanded((prev) => !prev)} style={styles.expandToggle}>
                        <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-up'} size={20} color="#26344F" />
                    </Pressable>
                </View>

                {/* Expanded content — passenger info, pickup/dropoff, fare */}
                {isExpanded && (
                    <View style={styles.expandedContent}>
                        {/* Passenger row */}
                        <View style={styles.passengerRow}>
                            <View style={styles.avatar}>
                                <Ionicons name="person" size={28} color="#7B8387" />
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.passengerName}>{currentTrip.passengerName}</Text>
                                <View style={styles.ratingRow}>
                                    <Ionicons name="star" size={12} color="#FFB800" />
                                    <Text style={styles.ratingText}>{currentTrip.passengerRating ?? '5.0'}</Text>
                                </View>
                            </View>

                            <View style={styles.actionButtons}>
                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={handleCallPassenger} style={styles.actionButton}>
                                        <Ionicons name="call" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>Call</Text>
                                </View>

                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={handleChatPassenger} style={styles.actionButton}>
                                        <Ionicons name="chatbubble" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>Chat</Text>
                                </View>

                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={() => { }} style={styles.actionButton}>
                                        <Ionicons name="ellipsis-vertical" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>More</Text>
                                </View>
                            </View>
                        </View>

                        {/* Pickup row */}
                        <View style={styles.locationRow}>
                            <View style={styles.locationDotColumn}>
                                <View style={styles.pickupDot} />
                                <View style={styles.locationConnector} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.locationAddress}>
                                    {currentTrip.pickup?.address ?? 'Current location'}
                                </Text>
                                <Text style={styles.locationLabel}>Pickup</Text>
                            </View>
                        </View>

                        {/* Dropoff row */}
                        <View style={[styles.locationRow, { marginBottom: 16 }]}>
                            <View style={{ marginRight: 12, marginTop: 4 }}>
                                <View style={styles.dropoffDot} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.locationAddress}>{currentTrip.destination.address}</Text>
                                <Text style={styles.locationLabel}>Drop-off</Text>
                            </View>

                            {/* Fare pill */}
                            <View style={styles.farePill}>
                                <View style={styles.fareMethodRow}>
                                    <Ionicons name="cash-outline" size={14} color="#7B8387" />
                                    <Text style={styles.fareMethodText}>Cash</Text>
                                </View>
                                <Text style={styles.fareAmount}>K{currentTrip.estimatedFare}</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Slide to complete — always visible */}
                <View style={styles.sliderWrap}>
                    <RideActionSlider
                        label="SLIDE TO COMPLETE TRIP"
                        onComplete={handleSliderComplete}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 20,
    },
    dragHandleWrap: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 4,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E5E7EB',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 18,
        marginTop: 4,
    },
    statLabel: {
        color: '#7B8387',
        fontSize: 12,
        marginTop: 2,
    },
    expandToggle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedContent: {
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    passengerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginRight: 12,
    },
    passengerName: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 16,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    ratingText: {
        color: '#7B8387',
        fontSize: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButtonWrap: {
        alignItems: 'center',
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonLabel: {
        color: '#7B8387',
        fontSize: 10,
        marginTop: 2,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    locationDotColumn: {
        alignItems: 'center',
        marginRight: 12,
        marginTop: 4,
    },
    pickupDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#00D26A',
    },
    locationConnector: {
        width: 1,
        height: 24,
        backgroundColor: '#E5E7EB',
        marginTop: 2,
    },
    dropoffDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FE5035',
    },
    locationAddress: {
        color: '#26344F',
        fontWeight: '600',
        fontSize: 14,
    },
    locationLabel: {
        color: '#7B8387',
        fontSize: 12,
        marginTop: 2,
    },
    farePill: {
        backgroundColor: '#FFF5F3',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginLeft: 8,
        alignItems: 'flex-end',
    },
    fareMethodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    fareMethodText: {
        color: '#7B8387',
        fontSize: 11,
    },
    fareAmount: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 15,
        marginTop: 2,
    },
    sliderWrap: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
});
