import {
    NavigationArrivalTime,
    NavigationCompass,
    NavigationControls,
    NavigationLaneGuidance,
    NavigationMap,
    NavigationRoadName,
    NavigationSpeedWidget,
    NavigationTurnBanner,
} from '@/components/navigation';
import { RideActionSlider } from '@/components/ui';
import { useDriverTelemetryPing } from '@/hooks';
import { calculateDistanceKm } from '@/lib/distance';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { useDriverLocation, useHeading } from '@/navigation/NavigationEngine/NavigationHooks';
import { fetchRoute } from '@/navigation/NavigationEngine/RouteEngine';
import { safeTransition } from '@/navigation/NavigationEngine/safeTransition';
import { useNavigationStore } from '@/navigation/NavigationEngine/NavigationStore';
import type { GPSFix } from '@/navigation/NavigationEngine/types';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
        updateLocation,
        vehicleType,
    } = useDriverStore();
    const navigation = useNavigation();

    // Engine-owned — read from NavigationStore, not mirrored into local
    // state (matches app/(driver)/navigation.tsx's migration pattern; see
    // NavigationEngine/Architecture.md's Rollout plan step 6).
    const driverLocation = useDriverLocation();
    const heading = useHeading();

    const [elapsedTime, setElapsedTime] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const insets = useSafeAreaInsets();
    const overlayAnim = useRef(new Animated.Value(CARD_COLLAPSED_HEIGHT + 16)).current;

    // Slides the speed/compass overlays up as the trip card expands, so they
    // never end up hidden behind (or overlapping) it.
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

    useDriverTelemetryPing(currentTrip?.id, driverLocation, heading ?? 0);

    // Start trip when component mounts
    useEffect(() => {
        if (tripStatus !== 'in_progress') {
            startTrip();
        }
    }, []);

    // Runtime handoff — mirrors app/(driver)/navigation.tsx's driverToPickup
    // recovery dispatch. Mode is normally already TRIP_IN_PROGRESS by the
    // time this screen mounts (dispatched at handleStartRide in
    // navigation.tsx), so this is typically a safeTransition-guarded no-op —
    // kept as the recovery path for a remount/race where that earlier
    // dispatch never landed.
    useEffect(() => {
        safeTransition(() => navigation.startTrip());
    }, []);

    // Phase 6A (Camera Runtime Activation): TRIP_IN_PROGRESS's follow
    // behaviour only applies once cameraState is FOLLOW_DRIVER (the default,
    // 'OVERVIEW', would otherwise resolve to an auto-fit pose) — the
    // existing, Bible-documented action for this (`navigation.followDriver()`),
    // same call navigation.tsx makes on its own mount.
    useEffect(() => {
        navigation.followDriver();
    }, []);

    // Accumulates the real GPS distance travelled between consecutive fixes —
    // the running total this produces is the actual distance driven this
    // trip, as opposed to the remaining distance to the destination. Only
    // valid movement is added, and noisy or implausible fixes are ignored.
    const trackGpsPoint = (fix: GPSFix) => {
        const { latitude, longitude } = fix.coordinate;
        const accuracy = fix.accuracy ?? null;
        const currentTimestamp = fix.timestamp;

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

    // GPS acquisition lifecycle only — goes entirely through GPSManager, the
    // only file allowed to create a location subscription
    // (src/navigation/NavigationEngine/GPSManager.ts). NavigationProvider
    // (mounted once at the app root) already forwards every fix into
    // NavigationStore.driverLocation/heading for every consumer, this screen
    // included, via the selectors above.
    useEffect(() => {
        GPSManager.acquire('foreground', 'driverBestNavigation').catch(() => {
            // Non-critical — location tracking will retry on next mount.
        });

        return () => {
            GPSManager.release();
        };
    }, []);

    // Business-logic-only raw fix listener: fare-distance accumulation needs
    // each fix's accuracy/timestamp, which NavigationStore.driverLocation
    // (a plain LatLng) doesn't carry. Subscribes to the same GPSManager
    // event bus NavigationProvider already listens on — not a second
    // location subscription, GPSManager remains the sole GPS owner.
    useEffect(() => {
        const unsubscribeFix = GPSManager.onFix((fix) => {
            trackGpsPoint(fix);
        });

        const existingFix = GPSManager.getLastFix();
        if (existingFix) {
            trackGpsPoint(existingFix);
        }

        return () => {
            unsubscribeFix();
        };
    }, []);

    // Bridges the engine's live driverLocation into driverStore's persisted
    // position (hex9/nearbyHexes/incomingRequests recompute on every call) —
    // NavigationStore intentionally isn't written back to driverStore on its
    // own (Architecture.md's "Relationship to existing stores").
    useEffect(() => {
        if (driverLocation) {
            updateLocation(driverLocation.latitude, driverLocation.longitude);
        }
    }, [driverLocation, updateLocation]);

    // Fetch route to destination for in-app navigation. Routing goes
    // entirely through RouteEngine — the only file allowed to fetch/cache
    // Directions (src/navigation/NavigationEngine/RouteEngine.ts).
    // NavigationStore is the sole owner of route data — NavigationMap /
    // NavigationTurnBanner / RouteProgressTracker all read it from there.
    useEffect(() => {
        if (!driverLocation || !currentTrip) return;
        let cancelled = false;
        (async () => {
            const route = await fetchRoute(driverLocation, currentTrip.destination);
            if (!route || cancelled) return;
            useNavigationStore.getState().setRoute(route);
        })();
        return () => {
            cancelled = true;
        };
    }, [driverLocation?.latitude, driverLocation?.longitude, currentTrip?.destination?.latitude, currentTrip?.destination?.longitude]);

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
            customerName: currentTrip.customerName,
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

        safeTransition(() => {
            navigation.arrivedAtDropoff();
            navigation.completeTrip();
        });

        // currentTrip stays set until finishTrip() (called from the summary
        // screen) so this navigation doesn't race the "no active trip" redirect.
        router.replace('/(driver)/trip-summary');
    };

    const handleCallCustomer = () => {
        // In production, customer phone would be in the trip data
        const telUrl = `tel:+260971234567`;

        Linking.openURL(telUrl).catch(() => {
            Alert.alert('Error', 'Could not open phone dialer');
        });
    };

    const handleChatCustomer = () => {
        router.push(`/chat/${currentTrip.id}`);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View className="flex-1 bg-background">
            {/* Full-screen Map — the engine (CameraController, driven by
                NavigationStore) owns every marker/camera decision this base
                layer renders; the screen no longer passes driver position,
                route, or camera props by hand. */}
            <View className="absolute inset-0">
                <NavigationMap />
            </View>

            {/* Turn-by-turn top HUD — store-driven, kept live by
                RouteProgressTracker on every GPS tick. */}
            <SafeAreaView className="flex-1" edges={['top']} pointerEvents="box-none">
                <View className="flex-row items-start justify-between px-5 pt-2 gap-3" pointerEvents="box-none">
                    <View className="flex-1 gap-2" pointerEvents="box-none">
                        <NavigationTurnBanner />
                        <View className="flex-row gap-2" pointerEvents="box-none">
                            <NavigationLaneGuidance />
                            <NavigationRoadName />
                        </View>
                    </View>
                    <NavigationArrivalTime />
                </View>
            </SafeAreaView>

            {/* Compass + Recenter — engine components; Recenter only renders
                once the driver pans/pinches away from follow (replaces the
                old isAutoFollow/lastInteraction timer). */}
            <View
                pointerEvents="auto"
                style={{ position: 'absolute', right: 16, top: 160, zIndex: 10, gap: 12 }}
            >
                <NavigationCompass />
                <NavigationControls />
            </View>

            {/* Speed display — bottom-left, above the trip card */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 16,
                    bottom: Animated.add(overlayAnim, 20),
                    zIndex: 10,
                }}
            >
                <NavigationSpeedWidget speedLimitKph={60} />
            </Animated.View>

            {/* Bottom trip card — collapsed shows stats only, expanded adds customer/pickup/dropoff/fare */}
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

                {/* Expanded content — customer info, pickup/dropoff, fare */}
                {isExpanded && (
                    <View style={styles.expandedContent}>
                        {/* Customer row */}
                        <View style={styles.customerRow}>
                            <View style={styles.avatar}>
                                <Ionicons name="person" size={28} color="#7B8387" />
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.customerName}>{currentTrip.customerName}</Text>
                                <View style={styles.ratingRow}>
                                    <Ionicons name="star" size={12} color="#FFB800" />
                                    <Text style={styles.ratingText}>{currentTrip.customerRating ?? '5.0'}</Text>
                                </View>
                            </View>

                            <View style={styles.actionButtons}>
                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={handleCallCustomer} style={styles.actionButton}>
                                        <Ionicons name="call" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>Call</Text>
                                </View>

                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={handleChatCustomer} style={styles.actionButton}>
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
    customerRow: {
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
    customerName: {
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
