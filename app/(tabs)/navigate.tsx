import { CompassButton, Map } from '@/components/map';
import { Button, Card, Input } from '@/components/ui';
import { LocationSearchModal } from '@/features/customer/components/LocationSearchModal';
import { MapPickerModal } from '@/features/customer/components/MapPickerModal';
import { useTurnPreview } from '@/hooks/useTurnPreview';
import { calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { type DirectionStep } from '@/lib/google/mapsApi';
import { getManeuverIconName } from '@/lib/maneuverIcon';
import { calculateBearing } from '@/lib/routeSnapping';
import {
  applyManualPose,
  attachMap,
  detachMap,
  fitPointsNow,
  getCurrentPose,
  recenterOnLocation,
  setChrome,
  setViewportSize,
} from '@/navigation/NavigationEngine/CameraController';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import { fetchRoute } from '@/navigation/NavigationEngine/RouteEngine';
import { useDriverStore } from '@/state';
import type { Location } from '@/types';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/** Heading-up navigation camera tilt/zoom, matched to app/(driver)/navigation.tsx. */
const NAV_CAMERA_PITCH = 45;
const NAV_CAMERA_ZOOM = 17;

/**
 * Standalone Driver Navigation Screen
 * Allows drivers to navigate point-to-point without an active ride.
 */
export default function DriverNavigateScreen() {
    const { currentLocation } = useDriverStore();

    // -- State --
    const [startLocation, setStartLocation] = useState<Location | null>(
        currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude, address: 'Current Location' } : null
    );
    const [destinationLocation, setDestinationLocation] = useState<Location | null>(null);
    const [showStartSearchModal, setShowStartSearchModal] = useState(false);
    const [showDestSearchModal, setShowDestSearchModal] = useState(false);
    const [showMidSearchModal, setShowMidSearchModal] = useState(false);

    const [travelMode, setTravelMode] = useState<'driving' | 'bicycling' | 'walking' | 'transit'>('driving');
    const [isMuted, setIsMuted] = useState(false);
    const [midLocation, setMidLocation] = useState<Location | null>(null);
    const [showMidStop, setShowMidStop] = useState(false);

    const [isNavigating, setIsNavigating] = useState(false);
    const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [navigationSteps, setNavigationSteps] = useState<DirectionStep[]>([]);
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const [routeDistance, setRouteDistance] = useState<string | null>(null);
    const [routeEta, setRouteEta] = useState<string | null>(null);
    const [distanceToManeuverMeters, setDistanceToManeuverMeters] = useState<number | null>(null);

    const [mapSelectionTarget, setMapSelectionTarget] = useState<'start' | 'destination' | null>(null);

    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(currentLocation);
    const [driverHeading, setDriverHeading] = useState<number>(0);
    const [currentSpeed, setCurrentSpeed] = useState(0); // km/h
    const [isAutoFollow, setIsAutoFollow] = useState(true);
    const [lastInteraction, setLastInteraction] = useState(0);

    const mapRef = useRef<any>(null);
    const insets = useSafeAreaInsets();

    // -- Effects --

    // Attaches this screen's map to CameraController — the same
    // attachMap/detachMap adapter CustomerHome.tsx/DriverDashboard.tsx use,
    // scoped to focus (not just mount) so a driver navigating away to a real
    // trip and back doesn't leave two screens fighting over the singleton.
    // This screen never dispatches a NavigationMode transition (see the
    // camera-migration prompt this satisfies): NavigationStore.mode may
    // simultaneously belong to a real, unrelated active trip elsewhere in
    // the app, so every camera move below goes through CameraController's
    // mode-independent primitives (recenterOnLocation/applyManualPose/
    // fitPointsNow) instead of a mode-driven one.
    useFocusEffect(
        useCallback(() => {
            attachMap({
                // `Map`'s exposed `animateCamera` takes a bare `duration?: number`,
                // not CameraController's `{ duration }` options object — same
                // unwrap NavigationMap.tsx/CustomerHome.tsx already do.
                animateCamera: (camera, options) => {
                    mapRef.current?.animateCamera?.(camera, options.duration);
                },
            });
            return () => detachMap();
        }, [])
    );

    useEffect(() => {
        setChrome({ safeArea: insets });
    }, [insets.top, insets.right, insets.bottom, insets.left]);

    const handleMapLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setViewportSize({ width, height });
    }, []);

    // Update start location when driver location changes initially
    useEffect(() => {
        if (!startLocation && currentLocation) {
            setStartLocation({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, address: 'Current Location' });
        }
    }, [currentLocation]);

    // Mirrors state the onFix callback below needs fresh, without needing
    // any of it in the tracking effect's dependency array — toggling
    // navigation/auto-follow/route-step state no longer tears down and
    // recreates the GPS subscription (a pre-existing inefficiency; see
    // audit_export/audit_03-08-26_11-58_gps-subscription-audit.md).
    const isNavigatingRef = useRef(isNavigating);
    useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);
    const isAutoFollowRef = useRef(isAutoFollow);
    useEffect(() => { isAutoFollowRef.current = isAutoFollow; }, [isAutoFollow]);
    const navigationStepsRef = useRef(navigationSteps);
    useEffect(() => { navigationStepsRef.current = navigationSteps; }, [navigationSteps]);
    const activeStepIndexRef = useRef(activeStepIndex);
    useEffect(() => { activeStepIndexRef.current = activeStepIndex; }, [activeStepIndex]);

    // Live Tracking. GPS acquisition goes entirely through GPSManager — the
    // only file allowed to create a location subscription
    // (src/navigation/NavigationEngine/GPSManager.ts).
    useEffect(() => {
        let cancelled = false;
        const unsubscribeFix = GPSManager.onFix((fix) => {
            setDriverLocation(fix.coordinate);
            // Heading falls back to 0 (handled by the state's initial value)
            // whenever GPS can't derive one, e.g. indoors — never crashes.
            if (fix.heading !== undefined) setDriverHeading(fix.heading);
            if (fix.speed !== undefined) {
                // Convert m/s to km/h
                setCurrentSpeed(Math.max(0, Math.round(fix.speed * 3.6)));
            } else {
                setCurrentSpeed(0);
            }

            // Heading-up camera: rotates so the direction of travel always
            // faces up on screen, like Waze/Google Maps navigation. Routed
            // through CameraController.applyManualPose (not a raw mapRef
            // call) so this is still the engine's one animateCamera call
            // site — see the useFocusEffect attachMap wiring above.
            if (isNavigatingRef.current && isAutoFollowRef.current) {
                // GPS heading is unreliable (0 or null) while stationary or at
                // low speed — fall back to the bearing toward the upcoming
                // maneuver instead of defaulting to 0 (which would snap the
                // map to face north).
                let cameraHeading = fix.heading ?? null;
                if (cameraHeading === null || cameraHeading < 1) {
                    const nextStepEnd = navigationStepsRef.current[activeStepIndexRef.current]?.endLocation;
                    cameraHeading = nextStepEnd
                        ? calculateBearing(fix.coordinate, nextStepEnd)
                        : 0;
                }

                applyManualPose({
                    center: {
                        latitude: fix.coordinate.latitude,
                        longitude: fix.coordinate.longitude,
                    },
                    bearing: cameraHeading,
                    pitch: NAV_CAMERA_PITCH,
                    zoom: NAV_CAMERA_ZOOM,
                }, 700);
            }
        });

        async function startTracking() {
            try {
                await GPSManager.acquire('foreground', 'driverBestNavigation');
                if (cancelled) return;

                const existingFix = GPSManager.getLastFix();
                if (existingFix) {
                    setDriverLocation(existingFix.coordinate);
                    if (existingFix.heading !== undefined) setDriverHeading(existingFix.heading);
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

    // Route Preview Calculation
    useEffect(() => {
        if (startLocation && destinationLocation && !isNavigating) {
            calculateRoute();
        }
    }, [startLocation, destinationLocation]);

    const calculateRoute = async () => {
        if (!startLocation || !destinationLocation) return;

        // Routing goes entirely through RouteEngine — the only file allowed
        // to fetch/cache Directions (src/navigation/NavigationEngine/RouteEngine.ts).
        const route = await fetchRoute(startLocation, destinationLocation);

        if (route) {
            setRouteCoordinates(route.path);
            // Adapted to the shape this screen (and <Map routeSteps>) already
            // expects — RouteEngine's own RouteStep carries the same data as
            // flat numeric fields instead of Google's {text,value} pairs.
            setNavigationSteps(route.steps.map((step): DirectionStep => ({
                instruction: step.instruction,
                distance: { text: formatManeuverDistance(step.distanceMeters), value: step.distanceMeters },
                duration: { text: `${Math.round(step.durationSeconds / 60)} min`, value: step.durationSeconds },
                startLocation: step.startLocation,
                endLocation: step.endLocation,
                maneuver: step.maneuver,
                polyline: '', // unused by <Map routeSteps> (only maneuver/start/endLocation are read); RouteStep.path already carries the decoded points if ever needed
            })));
            setRouteDistance(route.distanceText ?? formatManeuverDistance(route.distanceMeters));
            setRouteEta(route.durationText ?? `${Math.round(route.durationSeconds / 60)} min`);
            setActiveStepIndex(0);

            // Fit to bounds — CameraController.fitPointsNow (AutoFitEngine's
            // shared fit math), not a raw mapRef.fitToCoordinates call.
            if (route.path.length > 0) {
                fitPointsNow(route.path);
            }
        }
    };

    // TBT Advance Logic — also tracks live distance to the upcoming maneuver
    // for the turn preview pulse/color escalation.
    useEffect(() => {
        if (!isNavigating || !driverLocation || navigationSteps.length === 0) {
            setDistanceToManeuverMeters(null);
            return;
        }
        const step = navigationSteps[activeStepIndex];
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

        if (dist < 30 && activeStepIndex < navigationSteps.length - 1) {
            setActiveStepIndex(prev => prev + 1);
        }
    }, [driverLocation, isNavigating, navigationSteps, activeStepIndex]);

    // Auto-follow resume
    useEffect(() => {
        if (!isAutoFollow && isNavigating) {
            const timer = setInterval(() => {
                if (Date.now() - lastInteraction > 5000) {
                    setIsAutoFollow(true);
                }
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isAutoFollow, isNavigating, lastInteraction]);

    // -- Handlers --
    const handleMapAction = () => {
        if (isNavigating) {
            setIsAutoFollow(false);
            setLastInteraction(Date.now());
        }
    };

    const handleCompassPress = () => {
        // Reset bearing to north only — keep whatever center/pitch/zoom the
        // camera is currently at. CameraController's pose model has no
        // partial-update primitive (unlike react-native-maps' own
        // animateCamera, which merges a partial camera object onto the
        // current one), so the current pose is read back via
        // getCurrentPose() and only its bearing is changed.
        const current = getCurrentPose();
        if (!current) return;
        applyManualPose({
            center: current.center,
            bearing: 0,
            pitch: current.pitch,
            zoom: current.zoom,
        }, 700);
    };

    const handleClear = () => {
        if (currentLocation) {
            const loc: Location = {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                address: 'Current Location'
            };
            setStartLocation(loc);
        } else {
            setStartLocation(null);
        }
        setDestinationLocation(null);
        setRouteCoordinates([]);
        setNavigationSteps([]);
        setIsNavigating(false);
        setIsAutoFollow(true);
        setMapSelectionTarget(null);
        // CameraController.recenterOnLocation (not a raw mapRef.animateToRegion
        // call) — same "go to my location" one-shot every other screen's
        // recenter button already uses.
        if (currentLocation) {
            recenterOnLocation(currentLocation);
        }
    };

    const handleStartNavigation = () => {
        if (startLocation && destinationLocation) {
            setIsNavigating(true);
            setIsAutoFollow(true);
            setMapSelectionTarget(null);
            Keyboard.dismiss();

            // The first GPS fix often has a stale/zero heading (device hasn't
            // moved yet), so derive an initial bearing from the route polyline
            // itself to rotate the map to face the direction of travel right away.
            if (routeCoordinates.length >= 2) {
                const initialHeading = calculateBearing(routeCoordinates[0], routeCoordinates[1]);
                const center = driverLocation || startLocation;
                applyManualPose({
                    center: {
                        latitude: center.latitude,
                        longitude: center.longitude,
                    },
                    bearing: initialHeading,
                    pitch: NAV_CAMERA_PITCH,
                    zoom: NAV_CAMERA_ZOOM,
                }, 700);
            }
        }
    };

    const handleEndNavigation = () => {
        setIsNavigating(false);
        setIsAutoFollow(true);
    };

    const handleSwapLocations = () => {
        const temp = startLocation;
        setStartLocation(destinationLocation);
        setDestinationLocation(temp);
    };

    const handleAddStop = () => {
        setShowMidStop(!showMidStop);
        if (showMidStop) setMidLocation(null);
    };

    // Same MapPickerModal the customer flow uses (drag-to-center-pin with
    // road snapping) — writes into this screen's own local start/destination
    // state, never the customer-side rideStore.
    const handleMapPickerConfirm = useCallback((location: Location) => {
        if (mapSelectionTarget === 'start') {
            setStartLocation(location);
        } else if (mapSelectionTarget === 'destination') {
            setDestinationLocation(location);
        }
        setMapSelectionTarget(null);
        Keyboard.dismiss();
    }, [mapSelectionTarget]);

    const handleMapPickerClose = useCallback(() => {
        setMapSelectionTarget(null);
    }, []);

    const stripHtml = (value: string) => value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    const { pulseScale: turnPulseScale, color: turnDistanceColorValue } = useTurnPreview(distanceToManeuverMeters);
    const nextManeuverIcon = getManeuverIconName(navigationSteps[activeStepIndex]?.maneuver);

    return (
        <View className="flex-1 bg-background">
            <View className="absolute inset-0" onLayout={handleMapLayout}>
                <Map
                    ref={mapRef}
                    driverLocation={driverLocation || undefined}
                    driverHeading={driverHeading}
                    navigationArrowMode={isNavigating}
                    hidePickupPin={isNavigating}
                    autoFollowDriver={!isNavigating}
                    disableInternalCamera={isNavigating}
                    pickup={startLocation || undefined}
                    destination={destinationLocation || undefined}
                    showRoute={routeCoordinates.length > 0}
                    routeCoordinates={routeCoordinates}
                    routeSteps={navigationSteps}
                    onPanDrag={handleMapAction}
                    onRegionChangeComplete={handleMapAction}
                    eta={isNavigating ? undefined : routeEta || undefined}
                />
            </View>

            <SafeAreaView className="flex-1" edges={['top']} pointerEvents="box-none">
                {/* HUD / Inputs Overlays */}
                {!isNavigating ? (
                    <View className="flex-1 justify-end" pointerEvents="box-none">
                        <View pointerEvents="auto">
                            <Card variant="default" className="w-full rounded-t-[32px] rounded-b-none shadow-2xl" padding="lg">
                                <View className="gap-4">
                                    {/* Header: Transport Modes & Settings */}
                                    <View className="flex-row items-center justify-between">
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 mr-4">
                                            <View className="flex-row gap-2">
                                                {[
                                                    { id: 'driving', icon: 'car-sharp' },
                                                    { id: 'bicycling', icon: 'bicycle-sharp' },
                                                    { id: 'walking', icon: 'walk-sharp' },
                                                    { id: 'transit', icon: 'bus-sharp' },
                                                ].map((mode) => (
                                                    <Pressable
                                                        key={mode.id}
                                                        onPress={() => setTravelMode(mode.id as any)}
                                                        className={`w-10 h-10 rounded-full items-center justify-center ${travelMode === mode.id ? 'bg-primary' : 'bg-gray-100'}`}
                                                    >
                                                        <Ionicons name={mode.icon as any} size={20} color={travelMode === mode.id ? 'white' : '#7B8387'} />
                                                    </Pressable>
                                                ))}
                                            </View>
                                        </ScrollView>

                                        <View className="flex-row gap-2">
                                            <Pressable
                                                onPress={() => setIsMuted(!isMuted)}
                                                className="w-10 h-10 rounded-full items-center justify-center bg-gray-100"
                                            >
                                                <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color="#7B8387" />
                                            </Pressable>
                                            <Pressable className="w-10 h-10 rounded-full items-center justify-center bg-gray-100">
                                                <Ionicons name="settings-outline" size={20} color="#7B8387" />
                                            </Pressable>
                                        </View>
                                    </View>

                                    {/* Location Inputs with Connectors */}
                                    <View className="flex-row items-center gap-3">
                                        {/* Vertical Connector Line */}
                                        <View className="items-center py-5">
                                            <View className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                            <View className="w-0.5 h-16 bg-gray-200 my-1" />
                                            {showMidStop && (
                                                <>
                                                    <View className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 bg-white" />
                                                    <View className="w-0.5 h-16 bg-gray-200 my-1" />
                                                </>
                                            )}
                                            <View className="w-2.5 h-2.5 bg-accent" />
                                        </View>

                                        <View className="flex-1 gap-4">
                                            <Input
                                                placeholder="Start Location"
                                                value={startLocation?.address || ''}
                                                editable={false}
                                                variant="default"
                                                leftIcon="location"
                                                rightIcon="swap-vertical"
                                                onRightIconPress={handleSwapLocations}
                                                onPress={() => setShowStartSearchModal(true)}
                                            />

                                            {showMidStop && (
                                                <Input
                                                    placeholder="Add stop"
                                                    value={midLocation?.address || ''}
                                                    editable={false}
                                                    variant="default"
                                                    leftIcon="ellipse-outline"
                                                    rightIcon="close-circle"
                                                    onRightIconPress={() => {
                                                        setMidLocation(null);
                                                        setShowMidStop(false);
                                                    }}
                                                    onPress={() => setShowMidSearchModal(true)}
                                                />
                                            )}

                                            <Input
                                                placeholder="Enter Destination"
                                                value={destinationLocation?.address || ''}
                                                editable={false}
                                                variant="default"
                                                leftIcon="pin"
                                                rightIcon={showMidStop ? undefined : "add"}
                                                onRightIconPress={handleAddStop}
                                                onPress={() => setShowDestSearchModal(true)}
                                            />
                                        </View>
                                    </View>

                                    <View className="flex-row gap-3 mt-2">
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            onPress={handleClear}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            variant="primary"
                                            className="flex-1"
                                            onPress={handleStartNavigation}
                                            disabled={!startLocation || !destinationLocation}
                                        >
                                            Start
                                        </Button>
                                    </View>
                                </View>
                            </Card>
                        </View>
                    </View>
                ) : (
                    /* Navigation HUD */
                    <View className="flex-1" pointerEvents="box-none">
                        {/* Top TBT Bar */}
                        <View className="px-5 pt-2" pointerEvents="auto">
                            <View className="bg-white/95 rounded-2xl px-4 py-3 shadow-card border border-white/20 flex-row items-center justify-between">
                                <View className="flex-row items-center flex-1 pr-3">
                                    <Animated.View
                                        className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center mr-3"
                                        style={{ transform: [{ scale: turnPulseScale }] }}
                                    >
                                        <Ionicons name={nextManeuverIcon} size={20} color="#26344F" />
                                    </Animated.View>
                                    <View className="flex-1">
                                        <Text className="text-secondary text-[10px] mb-1 uppercase">Next Turn</Text>
                                        <Text className="text-primary font-bold text-lg" numberOfLines={2}>
                                            {navigationSteps[activeStepIndex] ? stripHtml(navigationSteps[activeStepIndex].instruction) : 'Follow route'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="items-end">
                                    <Text className="text-secondary text-[10px] mb-1 uppercase">In</Text>
                                    <Text className="font-bold text-xl" style={{ color: turnDistanceColorValue }}>
                                        {distanceToManeuverMeters != null ? formatManeuverDistance(distanceToManeuverMeters) : '...'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Compass */}
                        <View className="absolute top-24 right-5" pointerEvents="auto">
                            <CompassButton heading={driverHeading} onPress={handleCompassPress} />
                        </View>

                        {/* Bottom Info Bar */}
                        <View className="flex-1 justify-end px-5 pb-8" pointerEvents="box-none">
                            <View className="flex-row gap-4 mb-4" pointerEvents="auto">
                                {/* Speed Card */}
                                <View className="bg-white/95 rounded-3xl px-4 py-3 shadow-card border border-white/20 items-center justify-center min-w-[100px]">
                                    <Text className="text-primary font-black text-3xl">{currentSpeed}</Text>
                                    <Text className="text-secondary text-[10px] font-bold uppercase">KM/H</Text>
                                </View>

                                {/* Stats Card */}
                                <View className="flex-1 bg-white/95 rounded-3xl px-6 py-3 shadow-card border border-white/20 flex-row items-center justify-between">
                                    <View>
                                        <Text className="text-secondary text-[10px] font-bold uppercase">Distance</Text>
                                        <Text className="text-primary font-bold text-lg">{routeDistance}</Text>
                                    </View>
                                    <View className="w-px h-8 bg-gray-100 mx-4" />
                                    <View className="items-end">
                                        <Text className="text-secondary text-[10px] font-bold uppercase">ETA</Text>
                                        <Text className="text-accent font-bold text-lg uppercase">{routeEta}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* End Button */}
                            <Button
                                variant="accent"
                                onPress={handleEndNavigation}
                                leftIcon="close-circle"
                                pointerEvents="auto"
                            >
                                End Navigation
                            </Button>
                        </View>
                    </View>
                )}

                {/* Modal Selectors */}
                <LocationSearchModal
                    visible={showStartSearchModal}
                    title="Start Location"
                    initialQuery={startLocation?.address || ''}
                    onSelectLocation={(loc) => {
                        setStartLocation(loc);
                        setShowStartSearchModal(false);
                    }}
                    onOpenMapPicker={() => {
                        setShowStartSearchModal(false);
                        setMapSelectionTarget('start');
                    }}
                    onClose={() => setShowStartSearchModal(false)}
                    userLocation={driverLocation ? { ...driverLocation, address: 'Current Location' } as Location : undefined}
                />

                <LocationSearchModal
                    visible={showDestSearchModal}
                    title="Where to?"
                    initialQuery={destinationLocation?.address || ''}
                    onSelectLocation={(loc) => {
                        setDestinationLocation(loc);
                        setShowDestSearchModal(false);
                    }}
                    onOpenMapPicker={() => {
                        setShowDestSearchModal(false);
                        setMapSelectionTarget('destination');
                    }}
                    onClose={() => setShowDestSearchModal(false)}
                />

                <LocationSearchModal
                    visible={showMidSearchModal}
                    title="Add Stop"
                    initialQuery={midLocation?.address || ''}
                    onSelectLocation={(loc) => {
                        setMidLocation(loc);
                        setShowMidSearchModal(false);
                    }}
                    onOpenMapPicker={() => {
                        setShowMidSearchModal(false);
                        setMapSelectionTarget('destination'); // Reusing destination target for map selection
                    }}
                    onClose={() => setShowMidSearchModal(false)}
                />

                {/* Map Picker Modal - same drag-to-select + road-snapping screen the
                    customer flow uses, opened via "Choose on Map" above */}
                <MapPickerModal
                    visible={mapSelectionTarget !== null}
                    initialLocation={
                        mapSelectionTarget === 'start'
                            ? (startLocation || (driverLocation ? { ...driverLocation, address: 'Current Location' } as Location : undefined))
                            : (destinationLocation || undefined)
                    }
                    title={mapSelectionTarget === 'start' ? 'Select Start Location' : 'Select Destination'}
                    onConfirm={handleMapPickerConfirm}
                    onClose={handleMapPickerClose}
                />

            </SafeAreaView>
        </View>
    );
}
