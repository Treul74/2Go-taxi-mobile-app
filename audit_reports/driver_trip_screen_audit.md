# Driver Active Trip Screen — Audit

Read-only audit. No code was modified.

---

## 1. Current Trip Screen File

**File:** [app/(driver)/trip.tsx](../app/(driver)/trip.tsx) (386 lines)

### Complete layout structure (top to bottom)

```
<View flex-1 bg-background>                                    // root
  <View absolute inset-0>                                       // full-screen map layer
    <Map ref showRoute routeCoordinates driverLocation ... />
  </View>

  <SafeAreaView flex-1 edges=[top,bottom] pointerEvents=box-none>
    <View px-5 pt-4 pb-2>                                       // TOP bar
      <View bg-white/95 rounded-3xl ... flex-row justify-between>
        <View flex-row items-center flex-1>                     // avatar + name + "Trip in progress"
          <View w-10 h-10 rounded-full bg-accent/10>  <Ionicons name="person" />
          <View flex-1>  <Text>{passengerName}</Text>  <Text>Trip in progress</Text>
        </View>
        <Pressable chat button (chatbubble icon)>
        <Pressable call button (call icon, bg-success)>
      </View>
    </View>

    <View flex-1 justify-end px-5 pb-4 pointerEvents=box-none>   // BOTTOM card wrapper
      <View pointerEvents=auto>
        <Card variant="default" className="mb-4">
          <View>  TRIP DURATION timer (large text)  </View>
          <View>  Destination row (dot + address)  </View>
          <View flex-row justify-between>            // stats row
            <View> Distance icon+value </View>
            <View w-px h-12 />                        // divider
            <View> Estimated fare icon+value </View>
          </View>
          <RideActionSlider label="Slide to Complete Trip" onComplete={handleSliderComplete} />
        </Card>
      </View>
    </View>
  </SafeAreaView>
</View>
```

No compass, no speed display, no turn-by-turn HUD, no zoom-control view beyond what `Map` itself renders.

### What is currently in the bottom card

A single `Card variant="default"` containing, in order:
1. Trip duration timer — `TRIP DURATION` label + `formatTime(elapsedTime)` in a 4xl bold string (e.g. `12:34`)
2. Destination row — small accent dot + `DESTINATION` label + `currentTrip.destination.address`
3. Stats row — two columns separated by a vertical divider: **Distance** (`navigate` icon, live haversine distance-to-destination in km) and **Estimated fare** (`cash-outline` icon, `currentTrip.estimatedFare`, static value stamped at order creation — not live-recalculated)
4. `RideActionSlider` — "Slide to Complete Trip"

No passenger photo, no passenger rating shown here (unlike `navigation.tsx`'s pickup card, which does show a star rating). No expand/collapse.

### Exact RideActionSlider usage in trip.tsx

```tsx
{/* Complete Trip Button */}
{/* Complete Trip Slider */}
<RideActionSlider
    label="Slide to Complete Trip"
    onComplete={handleSliderComplete}
/>
```

(`disabled` / `isLoading` props are not passed here — trip.tsx doesn't gate the slider on a loading state, unlike `navigation.tsx` which passes `isLoading={isConfirmingArrival}` / `isLoading={isStartingTrip}` on its two slider usages.)

---

## 2. Slide to Complete Component

**File:** [src/components/ui/RideActionSlider.tsx](../src/components/ui/RideActionSlider.tsx) (111 lines)

### Full component code

```tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

interface RideActionSliderProps {
    label: string;
    onComplete: () => void;
    disabled?: boolean;
    isLoading?: boolean;
}

const CONTAINER_HEIGHT = 56;
const PADDING = 4;
const THUMB_SIZE = CONTAINER_HEIGHT - PADDING * 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDER_WIDTH = SCREEN_WIDTH - 40; // Assuming 20px padding on each side
const MAX_TRANSLATE = SLIDER_WIDTH - THUMB_SIZE - PADDING * 2;

export const RideActionSlider: React.FC<RideActionSliderProps> = ({
    label,
    onComplete,
    disabled = false,
    isLoading = false,
}) => {
    const [completed, setCompleted] = useState(false);
    const translateX = useSharedValue(0);

    // Reset slider if disabled or not completed
    useEffect(() => {
        if (!disabled && !completed) {
            translateX.value = withSpring(0);
        }
    }, [disabled, completed]);

    const handleComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompleted(true);
        onComplete();
    };

    const panGesture = Gesture.Pan()
        .enabled(!disabled && !completed && !isLoading)
        .onUpdate((event) => {
            const translation = event.translationX;
            // Clamp value between 0 and MAX_TRANSLATE
            translateX.value = Math.max(0, Math.min(translation, MAX_TRANSLATE));
        })
        .onEnd(() => {
            if (translateX.value > MAX_TRANSLATE * 0.9) {
                // Snap to end and trigger complete
                translateX.value = withTiming(MAX_TRANSLATE, { duration: 150 }, (finished) => {
                    if (finished) {
                        runOnJS(handleComplete)();
                    }
                });
            } else {
                // Snap back to start
                translateX.value = withSpring(0);
            }
        });

    const animatedThumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const animatedLabelStyle = useAnimatedStyle(() => ({
        opacity: 1 - translateX.value / (MAX_TRANSLATE * 0.8),
    }));

    return (
        <View className="relative w-full h-14 bg-primary rounded-full justify-center overflow-hidden shadow-sm" style={{ opacity: disabled ? 0.6 : 1 }}>
            {/* Label */}
            <Animated.View style={[animatedLabelStyle, { position: 'absolute', width: '100%', alignItems: 'center' }]}>
                <Text className="text-white font-bold text-lg">{label}</Text>
            </Animated.View>

            {/* Progress Track (optional visual fill) */}
            <Animated.View
                className="absolute left-0 top-0 bottom-0 bg-accent/20"
                style={useAnimatedStyle(() => ({
                    width: translateX.value + THUMB_SIZE + PADDING,
                }))}
            />

            {/* Thumb */}
            <GestureDetector gesture={panGesture}>
                <Animated.View
                    className="absolute left-1 w-12 h-12 bg-white rounded-full items-center justify-center shadow-md z-10"
                    style={animatedThumbStyle}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FE5035" />
                    ) : completed ? (
                        <Ionicons name="checkmark" size={24} color="#10B981" />
                    ) : (
                        <Ionicons name="arrow-forward" size={24} color="#FE5035" />
                    )}
                </Animated.View>
            </GestureDetector>
        </View>
    );
};
```

### Props accepted

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `label` | `string` | required | Text shown centered, fades out as thumb slides |
| `onComplete` | `() => void` | required | Fired once the thumb crosses the 90% threshold |
| `disabled` | `boolean` | `false` | Disables the pan gesture, dims track to 60% opacity |
| `isLoading` | `boolean` | `false` | Disables the gesture, swaps thumb icon for an `ActivityIndicator` |

### How the slide gesture works

- Built on `react-native-gesture-handler`'s `Gesture.Pan()` + `react-native-reanimated` shared values (`translateX`).
- `onUpdate`: clamps `translateX` between `0` and `MAX_TRANSLATE` (`SLIDER_WIDTH - THUMB_SIZE - PADDING*2`, where `SLIDER_WIDTH = Dimensions.get('window').width - 40`).
- `onEnd`: if `translateX > MAX_TRANSLATE * 0.9`, animates (`withTiming`, 150ms) to full extension then calls `handleComplete` via `runOnJS` — which fires a success haptic (`expo-haptics`), sets `completed = true` (locks the thumb showing a checkmark), and calls `onComplete()`. Otherwise springs back to `0` (`withSpring`).
- Label opacity fades linearly as the thumb approaches ~80% of travel.
- A translucent accent-colored "progress track" fill grows behind the thumb as it's dragged.
- Gesture is `.enabled(!disabled && !completed && !isLoading)` — once completed it locks permanently (no reset without unmounting/remounting via a `key` change, which is exactly how `navigation.tsx` resets it: `key={`arrival-${arrivalAttempt}`}`).

### Is it already a reusable component?

Yes. It is a generic, presentation-only component with no domain logic — takes a label and a completion callback. It is already reused in three places in the driver flow:
- [app/(driver)/trip.tsx:376](../app/(driver)/trip.tsx) — "Slide to Complete Trip"
- [app/(driver)/navigation.tsx:453](../app/(driver)/navigation.tsx) — "Slide to Arrive"
- [app/(driver)/navigation.tsx:488](../app/(driver)/navigation.tsx) — "Slide to Start Trip"

It is exported from [src/components/ui/index.ts](../src/components/ui/index.ts) (barrel) per the `src/components/ui/` reusable-component convention in AGENTS.md.

---

## 3. Current Map Overlays

All overlay logic lives in [src/components/map/Map.native.tsx](../src/components/map/Map.native.tsx) (rendered by trip.tsx), not in trip.tsx itself. In **trip.tsx**, the `<Map>` invocation is:

```tsx
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
```

Note: `navigationArrowMode` is **not** passed (see §4).

### Floating buttons on the map

Only **zoom controls**, gated by `showZoomControls={true}` (passed from trip.tsx) and rendered inside `Map.native.tsx`:

```tsx
{/* Zoom Controls */}
{showZoomControls && (
  <View style={styles.zoomControls}>
    <TouchableOpacity onPress={() => handleZoom(true)} style={styles.zoomButton}>
      <Ionicons name="add" size={24} color="#26344F" />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => handleZoom(false)} style={[styles.zoomButton, styles.zoomButtonBottom]}>
      <Ionicons name="remove" size={24} color="#26344F" />
    </TouchableOpacity>
  </View>
)}
```
```tsx
const styles = StyleSheet.create({
  zoomControls: { position: 'absolute', right: 16, top: '35%', backgroundColor: 'transparent', gap: 12 },
  zoomButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
});
```

Also present regardless of trip.tsx: an **ETA badge** marker (white pill, positioned above pickup/destination via `eta`/`etaPosition` props) rendered inside `Map.native.tsx` — this is triggered by trip.tsx's `eta` prop.

### Speed display

**Does not exist anywhere in trip.tsx or Map.native.tsx.** The only "speed" concept in trip.tsx is `allowedSpeedKmh = 120` and `segmentSpeedKmh`, both internal GPS-plausibility-check variables used to reject noisy fixes for the running distance total — never rendered to the UI.

### Compass / north indicator

**Not used in trip.tsx.** A reusable `CompassButton` component exists at [src/components/map/CompassButton.tsx](../src/components/map/CompassButton.tsx) and rotates counter to camera heading, tapping resets to north:

```tsx
export function CompassButton({ heading, onPress }: CompassButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            hitSlop={8}
            style={[styles.compass, { transform: [{ rotate: `${-heading}deg` }] }]}
        >
            <Text style={styles.label}>N</Text>
        </Pressable>
    );
}
```

It **is** used in [app/(driver)/navigation.tsx:364-369](../app/(driver)/navigation.tsx), gated by `isNavigating`:

```tsx
{isNavigating && (
    <View className="absolute top-24 right-5" pointerEvents="auto">
        <CompassButton heading={driverHeading} onPress={handleCompassPress} />
    </View>
)}
```

with `handleCompassPress = () => mapRef.current?.animateCamera?.({ heading: 0 }, 700);`

Also, `Map.native.tsx` sets `showsCompass={true}` on the native `MapView` itself (Google Maps' own built-in compass), independent of the custom `CompassButton`.

### Zoom in/out control

Exists — see "Floating buttons" above. `showZoomControls={true}` is already passed in trip.tsx, so zoom +/- buttons **do** render on the trip screen today.

### Turn instruction header

**Does not exist in trip.tsx.** Exists only in [app/(driver)/navigation.tsx:336-362](../app/(driver)/navigation.tsx) as the "Turn-by-turn top HUD", gated by `isNavigating`:

```tsx
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
```

This depends on `routeSteps`, `activeStepIndex`, `useTurnPreview` hook (pulse/color), and `getManeuverIconName` from `@/lib/maneuverIcon` — none of which trip.tsx currently fetches or tracks (trip.tsx calls `getDirections(...)` but never reads `route.steps` into state, unlike navigation.tsx's `setRouteSteps(route.steps)`).

---

## 4. Navigation Arrow

### Driver position marker in trip.tsx

trip.tsx passes `driverLocation` + `driverHeading` to `<Map>` but does **not** pass `navigationArrowMode`. Inside `Map.native.tsx`, the marker choice is:

```tsx
{snappedDriver ? (
  navigationArrowMode ? (
    <NavigationArrowMarker key="driver-marker" coordinate={snappedDriver.position} heading={snappedDriver.heading} />
  ) : (
    <AnimatedVehicleMarker key="driver-marker" coordinate={snappedDriver.position} heading={snappedDriver.heading} variant={driverVehicleVariant} />
  )
) : (
  navigationArrowMode && driverLocation && (
    <NavigationArrowMarker key="driver-marker" coordinate={driverLocation} heading={driverHeading} />
  )
)}
```

Since `navigationArrowMode` defaults to `false` and trip.tsx never sets it, **trip.tsx renders the top-down car icon (`AnimatedVehicleMarker`, from [src/components/map/markers/CarMarker.tsx](../src/components/map/markers/CarMarker.tsx) family), not the directional navigation arrow.**

### Is `navigationArrowMode` being passed to Map?

**No.** Confirmed absent from the `<Map ... />` call in trip.tsx (§3 above). Contrast with navigation.tsx, which explicitly passes `navigationArrowMode={isNavigating}`.

### Is the camera heading-up during trip?

Yes — camera heading tracking is implemented independently of `navigationArrowMode` (that prop only controls which *marker icon* is drawn, not camera behavior). trip.tsx has its own camera-follow effect:

```tsx
// Camera follow mode during trip
useEffect(() => {
    if (!driverLocation || !isAutoFollow) return;
    if (mapRef.current?.animateCamera) {
        mapRef.current.animateCamera({
            center: {
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
            },
            heading: driverHeading || 0,
            pitch: 45,
            altitude: 500,
            zoom: 17,
        }, 700);
    }
}, [driverLocation?.latitude, driverLocation?.longitude, driverHeading, isAutoFollow]);
```

This sets `heading: driverHeading || 0` on every location/heading update while `isAutoFollow` is true, so the camera does rotate to match direction of travel (heading-up), with `pitch: 45`, `altitude: 500`, `zoom: 17` — identical constants to navigation.tsx's `NAV_CAMERA_PITCH/ALTITUDE/ZOOM` (45/500/17), just inlined instead of named constants.

### Exact animateCamera call

(shown in full immediately above — this is the only `animateCamera` call in trip.tsx.) The imperative handle it calls into is defined in `Map.native.tsx`:

```tsx
animateCamera: (camera: any, duration?: number) => {
  if (mapRef.current && typeof mapRef.current.animateCamera === 'function') {
    mapRef.current.animateCamera(camera, { duration: duration || 1000 });
  }
},
```

---

## 5. Passenger Info

### Where passenger name/photo is shown

Only in the **top bar** (§1) — no photo, only name + static "Trip in progress" subtitle:

```tsx
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
```

The avatar is a generic `Ionicons name="person"` icon in a tinted circle — **not** an actual passenger photo (no `profile_photo_url` wired in). No passenger rating shown here (navigation.tsx's pickup card does show `currentTrip.passengerRating`, trip.tsx does not).

### Call/chat button

Both present, in the same top bar, to the right of the name:

```tsx
<Pressable
    onPress={handleChatPassenger}
    className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center ml-2"
>
    <Ionicons name="chatbubble" size={20} color="#26344F" />
</Pressable>
<Pressable
    onPress={handleCallPassenger}
    className="w-10 h-10 rounded-full bg-success items-center justify-center ml-2"
>
    <Ionicons name="call" size={20} color="#FFFFFF" />
</Pressable>
```

Handlers:

```tsx
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
```

`handleCallPassenger` uses a **hardcoded placeholder phone number** (`+260971234567`), not the actual passenger's number — pre-existing gap, not something this audit was asked to fix.

### Pickup and dropoff display code

trip.tsx shows **destination only** — there is no pickup display anywhere on this screen (expected: pickup was already handled on the prior `navigation.tsx` screen; by the time the driver reaches trip.tsx the ride is already in progress, en route to dropoff).

```tsx
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
```

(For reference, `navigation.tsx`'s equivalent "PICKUP LOCATION" block is visually identical, just green dot instead of accent-orange dot, and a "Distance & Price" row instead of a Distance/Fare two-column stat row.)

---

## 6. Bottom Card Current State

### Exact bottom card layout

```tsx
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
            <Text className="text-secondary text-xs mt-1">Estimated fare</Text>
            <Text className="text-success font-bold">K{currentTrip.estimatedFare}</Text>
        </View>
    </View>

    {/* Complete Trip Slider */}
    <RideActionSlider
        label="Slide to Complete Trip"
        onComplete={handleSliderComplete}
    />
</Card>
```

### Stats shown

- **Duration** — via the large timer at the top of the card (`formatTime(elapsedTime)`, updated every second from `tripStartTime`), not in the icon-stats row.
- **Distance** — icon-stats row, live haversine distance remaining to destination (`calculateDistanceKm` between current `driverLocation` and `currentTrip.destination`), **not** the GPS-tracked distance-driven-so-far that's silently accumulated in `distanceTraveledRef` for the final fare calc.
- **Fare** — icon-stats row, `currentTrip.estimatedFare` — a static value from order creation, not live-recalculated as the trip progresses.

No duration appears in the icon-stats row (only distance + fare there); duration lives separately as the big timer above.

### Expand/collapse functionality

**None exists.** The card is a single fixed-height block with no collapsed/summary state, no drag handle, no `BottomSheet` usage (the reusable `src/components/ui/BottomSheet` component is not used on this screen).

---

## 7. What Exists vs What Is Needed

*(Based on the 3 reference images described in the prompt — no image files were provided/attached to this conversation, so this section is scoped to reusable pieces found in the codebase during this audit and can be cross-checked once the reference images are actually shared.)*

### Already exists in trip.tsx (usable as-is)
- Full-screen `<Map>` with route polyline, destination marker, driver marker, ETA badge
- Zoom in/out controls (`showZoomControls={true}` already wired)
- Top passenger bar with chat + call buttons
- Heading-up camera follow during trip (`animateCamera` with `heading`, `pitch: 45`, `zoom: 17`)
- Bottom `Card` with trip timer, destination row, distance/fare stats, `RideActionSlider` to complete
- Auto-follow-with-manual-override logic (5s timeout after user pans/zooms) — mirrors navigation.tsx
- GPS-distance-tracking with noise/speed filtering for the real trip distance (background, not displayed)

### Already exists elsewhere in the codebase (reusable, not yet wired into trip.tsx)
- `CompassButton` ([src/components/map/CompassButton.tsx](../src/components/map/CompassButton.tsx)) — built, used in navigation.tsx, **not** used in trip.tsx
- Turn-by-turn HUD pattern (maneuver icon + "NEXT"/"IN" distance) — built in navigation.tsx using `useTurnPreview` hook + `getManeuverIconName` from `@/lib/maneuverIcon`, **not** present in trip.tsx
- `NavigationArrowMarker` ([src/components/map/markers/NavigationArrowMarker.tsx](../src/components/map/markers/NavigationArrowMarker.tsx)) — built, wired into `Map.native.tsx` behind `navigationArrowMode`, **not activated** in trip.tsx (trip.tsx never passes that prop, so it always renders the top-down car icon instead)
- `routeSteps` state + `getDirections(...).steps` — navigation.tsx already stores and advances through `routeSteps`; trip.tsx calls `getDirections` but discards `.steps`, only keeping `.coordinates`

### Needs to be built from scratch (not found anywhere in the codebase)
- **Speed display** — no speedometer/speed readout UI exists anywhere in the app; only an internal, non-displayed `segmentSpeedKmh` plausibility check in trip.tsx
- Any dedicated "expand/collapse" bottom card behavior — no screen in the app currently does this; would need new state + gesture or a `BottomSheet` integration
- Passenger **photo** rendering — only a placeholder person icon exists; no code path reads `profile_photo_url` for a passenger avatar anywhere in the driver screens

### Needs to be moved/restructured (exists, but in the wrong screen or wrong shape for the reference design)
- `CompassButton` — currently only rendered in navigation.tsx (`isNavigating` gate); would need to be added to trip.tsx's overlay layer if the reference design shows a compass during the active trip too
- Turn-by-turn top HUD — currently coupled to navigation.tsx's local state (`activeStepIndex`, `distanceToManeuverMeters`, `useTurnPreview`); trip.tsx would need to fetch `routeSteps` (already discarded today) and re-implement/share this state-tracking logic if turn instructions are wanted during the trip-to-dropoff phase, not just the pickup phase
- `navigationArrowMode` — a one-line prop addition to trip.tsx's `<Map>` call would swap the top-down car for the directional arrow; currently this "restructuring" is just an unused capability, not a code gap
