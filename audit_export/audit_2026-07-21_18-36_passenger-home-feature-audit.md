# Audit Report — PassengerHome Feature Audit (Read-Only)

**Date:** 2026-07-21
**Scope:** SVG car marker, live location pickup display, H3 hex grid, ride cancellation after acceptance, profile picture display, fare updates during trip.
**Type:** Audit only — no code was changed.

---

## 1. SVG Car Marker

### 1.1 Does `src/assets/images/asset_SVG_car_birdview.svg` exist?

**Yes.** Confirmed present in `src/assets/images/`, alongside a `carBirdview.png` (extracted raster of the same artwork).

### 1.2 Current map marker implementation for nearby drivers

File: `src/components/map/markers/CarMarker.tsx` (full file)

```tsx
import React from 'react';
import { Image, View } from 'react-native';

export type VehicleMarkerVariant = 'economy' | 'comfort' | 'premium' | 'offline';

export const VEHICLE_MARKER_COLORS: Record<VehicleMarkerVariant, string> = {
  economy: '#FE5035',
  comfort: '#4F7DFF',
  premium: '#222222',
  offline: '#BDBDBD',
};

export const DEFAULT_VEHICLE_MARKER_SIZE = 36;
const OFFLINE_OPACITY = 0.45;

// Bird's-eye car artwork, extracted from src/assets/images/asset_SVG_car_birdview.svg
// (that file wraps this same raster image in an SVG shell as a single embedded
// PNG — extracting it avoids relying on SVG data-URI parsing at runtime).
const CAR_MARKER_IMAGE = require('@/assets/images/carBirdview.png');
const CAR_ASSET_ASPECT_RATIO = 205 / 419;

export interface CarMarkerProps {
  variant?: VehicleMarkerVariant;
  color?: string;
  size?: number;
}

export const CarMarker = React.memo(function CarMarker({
  variant = 'economy',
  size = DEFAULT_VEHICLE_MARKER_SIZE,
}: CarMarkerProps) {
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      pointerEvents="none"
    >
      <Image
        source={CAR_MARKER_IMAGE}
        resizeMode="contain"
        style={{
          width: size,
          height: size * CAR_ASSET_ASPECT_RATIO,
          transform: [{ rotate: '90deg' }],
          opacity: variant === 'offline' ? OFFLINE_OPACITY : 1,
        }}
      />
    </View>
  );
});
```

**Finding:** The marker does **not** load `asset_SVG_car_birdview.svg` directly. It `require()`s a separate PNG (`carBirdview.png`) — the code comment states the `.svg` file only wraps this same PNG in an SVG shell as a base64 data URI, and that shell is bypassed to avoid runtime SVG parsing. The `.svg` asset file itself is therefore currently unused by the app at runtime.

**Stale comment noted (not fixed, per audit-only instructions):** `src/components/map/markers/AnimatedVehicleMarker.tsx` (lines 29-35) still describes "The CarMarker SVG is static and memoized — it is rasterized once by the map" and "Rotation therefore cannot be applied by transforming the SVG view" — but `CarMarker` renders a PNG `<Image>`, not an SVG. This comment is inaccurate relative to the current implementation.

Wrapper: `src/components/map/markers/AnimatedVehicleMarker.tsx` — animates position/heading via Reanimated and renders `<CarMarker variant={variant} color={color} size={size} />` inside an `AnimatedMapMarker`.

### 1.3 Where nearby driver markers are rendered on PassengerHome

File: `src/components/map/Map.native.tsx` (lines 304-343)

```tsx
{/* Driver marker — animated top-down car (Uber style) normally, or a
    heading-aware directional arrow during turn-by-turn navigation. ... */}
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

{/* Nearby Transporter vehicles */}
{vehicles.map((vehicle) => (
  <AnimatedVehicleMarker
    key={vehicle.id}
    coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
    heading={vehicle.heading}
    variant={vehicle.variant}
  />
))}
```

`Map.native.tsx` accepts a `vehicles?: MapVehicle[]` prop (`src/components/map/Map.tsx:88`) specifically to render nearby Transporter markers via `AnimatedVehicleMarker`/`CarMarker`.

**Finding — nearby drivers are NOT actually rendered on PassengerHome.** The `<Map ... />` call inside `src/features/passenger/PassengerHome.tsx` (lines 194-210) passes:

```tsx
<Map
  ref={mapRef}
  userLocation={userLocation || undefined}
  pickup={pickupToDisplay || undefined}
  destination={activeTrip?.destination || destination || undefined}
  showRoute={showRoute}
  passengerHex9={passengerHex9}
  showH3Grid={showH3Grid}
  h3Grid={h3Grid}
  routeCoordinates={routeCoordinates.length > 0 ? routeCoordinates : undefined}
  showUserMarker={status === 'idle' || status === 'planning' || status === 'matching'}
  showSearchPulse={status === 'matching' && matchingPhase === 'searching'}
  mapType={mapType}
  onPanDrag={handleMapDragStart}
  onRegionChangeComplete={handleMapDragEnd}
/>
```

No `vehicles` prop and no `driverLocation` prop are passed. As a result:
- `vehicles.map(...)` in `Map.native.tsx` never renders anything for PassengerHome (the array is always empty/undefined there).
- The single "driver marker" block (`snappedDriver`/`driverLocation`) also never renders on PassengerHome, since PassengerHome doesn't supply driver location either — that data path is only wired up in the driver-side/trip screens (e.g. `app/(driver)/trip.tsx`).
- `findNearbyDrivers` (`src/services/discoveryEngine.ts`) is imported into `PassengerHome.tsx` and called at line 179, but **only inside a `console.log`-only debug effect** gated by `h3DebugMode`:

```tsx
// Debug logging for H3
useEffect(() => {
  if (h3DebugMode && passengerHex9 && (status === 'matching' || status === 'planning')) {
    const nearby = findNearbyDrivers(passengerHex9);
    console.log(`[H3 DEBUG] Discovered ${nearby.length} drivers near ${passengerHex9}`);
    nearby.forEach(d => console.log(` - Driver ${d.id} at ${d.hex9}`));
  }
}, [h3DebugMode, passengerHex9, status]);
```

**Conclusion:** No nearby-driver car markers currently appear anywhere on the PassengerHome map. `findNearbyDrivers` results are only ever written to the console when `h3DebugMode` is on.

---

## 2. Live Location Pickup Display

### 2.1 LocationAutocomplete / pickup field component

File: `src/features/passenger/components/LocationAutocomplete.tsx` — a dropdown of Google Places suggestions/Plus-Code resolution shown while typing (not the pickup text field itself). It renders `resolvedResult.addressName` / `suggestion.structuredFormatting.mainText` for search results — it has no "Live location" branch.

The actual pickup text field lives in `src/features/passenger/components/RidePlannerSheet.tsx`.

### 2.2 What text is shown when GPS location is used as pickup

File: `src/features/passenger/components/RidePlannerSheet.tsx` (lines 102-114)

```tsx
// Set current location as pickup on mount
useEffect(() => {
  if (currentLocation && !pickup) {
    setPickup(currentLocation);
    // Always use the actual address from current location
    const displayAddress = formatDisplayAddress(currentLocation.address);
    setPickupQuery(displayAddress || 'Fetching location...');
  } else if (currentLocation && pickup && !pickupQuery) {
    // If we have pickup but no query text, set it
    const displayAddress = formatDisplayAddress(pickup.address);
    setPickupQuery(displayAddress || 'Fetching location...');
  }
}, [currentLocation, pickup, pickupQuery, setPickup]);
```

**Finding:** It shows the reverse-geocoded **address** (via `formatDisplayAddress()`, `src/lib/formatAddress.ts`), not the literal string "Live location". The code comment explicitly says "Always use the actual address from current location." The only fallback text is `'Fetching location...'` while the address is still resolving. No occurrence of the string "Live location" exists anywhere under `src/features/passenger/`.

`formatDisplayAddress()` (see `src/lib/formatAddress.ts`) prioritizes a specific place name, then falls back to city/province, then a Plus Code, per its documented priority rules.

Similar behavior is repeated for pickup selected via search/map picker (same file):
```tsx
const handleSelectPickup = useCallback((location: Location) => {
  setPickup(location, true);
  setPickupQuery(formatDisplayAddress(location.address) || '');
}, [setPickup]);
```

### 2.3 Where the pickup marker is rendered on the map

File: `src/components/map/Map.native.tsx` (lines 351-391)

```tsx
{/* Pickup marker — the pulsing user-location dot on the live tracking
    screen (the pickup is the customer's fixed spot), a plain pin everywhere else */}
{pickup && (
  showSearchPulse ? (
    <Marker key="pickup-search-pulse" coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true}>
      <SearchPulseMarker />
    </Marker>
  ) : showPickupAsUserLocation ? (
    <Marker key="pickup-marker" coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true}>
      <UserLocationMarker />
    </Marker>
  ) : (
    !hidePickupPin && (
      <Marker
        coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }}
        title="Pickup"
        description={pickup.address}
        pinColor="#00D26A"
      />
    )
  )
)}
```

On PassengerHome specifically, `showSearchPulse` is passed (`status === 'matching' && matchingPhase === 'searching'`), but `showPickupAsUserLocation` and `hidePickupPin` are **not** passed by PassengerHome (they default to `undefined`/falsy in `Map.tsx`), so PassengerHome's pickup marker resolves to the plain green pin (`pinColor="#00D26A"`, title "Pickup") outside of the searching phase.

### 2.4 All map markers currently rendered on PassengerHome

Based on the exact prop set PassengerHome passes to `<Map />` (Section 1.3) and `Map.native.tsx`'s render tree:

| Marker | Condition on PassengerHome | Renders? |
|---|---|---|
| Driver / nearby-vehicle car markers (`AnimatedVehicleMarker`/`CarMarker`) | Requires `vehicles` or `driverLocation` prop | **Never** — neither prop is passed |
| Customer location dot (`AnimatedUserLocation`) | `showUserMarker && !driverLocation && userLocation` | Yes, when status is `idle`/`planning`/`matching` |
| Pickup search-pulse (`SearchPulseMarker`) | `pickup && showSearchPulse` | Yes, while `status === 'matching' && matchingPhase === 'searching'` |
| Pickup-as-user-location (`UserLocationMarker`) | `pickup && showPickupAsUserLocation` (not passed by PassengerHome) | **Never** |
| Plain pickup pin | `pickup && !hidePickupPin` (fallback case) | Yes, whenever `pickup` is set and not in the search-pulse phase |
| Destination pin | `destination` set | Yes |
| Route polyline + direction-arrow markers + turn highlights | `showRoute && routeCoordinates.length > 0` | Yes, during active/planned trips with a route |
| H3 hex grid polygons + hex ID labels | `showH3Grid` (see Section 3) | Yes, by default (see below) |

---

## 3. H3 Hexagon Grid

### 3.1 Default value of `showH3Grid` in PassengerHome

File: `src/features/passenger/PassengerHome.tsx:43`

```tsx
const [showH3Grid, setShowH3Grid] = useState(true);
```

**Default is `true`.** This is local component state (not the `h3DebugMode` global toggle) and is passed straight through to `<Map showH3Grid={showH3Grid} .../>`, which renders red hexagon polygons + hex-ID labels over the live map (`Map.native.tsx:454` — `{showH3Grid && Polygon && (...)}`).

The floating toggle button that flips it is unconditionally rendered (not gated by `h3DebugMode` or `__DEV__`) at `PassengerHome.tsx:228-245`:

```tsx
{/* H3 Grid Toggle Button */}
<Pressable
  onPress={() => setShowH3Grid(!showH3Grid)}
  className={`w-12 h-12 rounded-full items-center justify-center shadow-md ${showH3Grid ? 'bg-red-500' : 'bg-white'}`}
  ...
>
  <Ionicons name={showH3Grid ? 'grid' : 'grid-outline'} size={24} color={showH3Grid ? '#FFFFFF' : '#26344F'} />
</Pressable>
```

**Finding:** The H3 debug hex grid is visible by default to every customer on first load of PassengerHome, with a manual toggle button always present in the UI (top-right floating controls), independent of the `h3DebugMode` dev flag.

### 3.2 Where `h3DebugMode` is read from `settingsStore`

Store definition — `src/state/settingsStore.ts`:
```ts
h3DebugMode: boolean;
...
h3DebugMode: false,
setH3DebugMode: (enabled) => set({ h3DebugMode: enabled }),
toggleH3DebugMode: () => set((state) => ({ h3DebugMode: !state.h3DebugMode })),
```
Default is `false`.

Consumer — `src/features/passenger/PassengerHome.tsx`:
- Line 37: `const { h3DebugMode, toggleH3DebugMode } = useSettingsStore();`
- Line 178: gates the `findNearbyDrivers` console-log debug effect (Section 1.3).
- Line 307: `{h3DebugMode && ( ... )}` — gates a separate debug UI block (not the hex grid itself, which is controlled by the separate local `showH3Grid` state described above).

So `h3DebugMode` (global, defaults `false`) and `showH3Grid` (local to PassengerHome, defaults `true`) are two independent toggles — `h3DebugMode` does **not** control whether the hex grid itself is drawn.

### 3.3 Was AGENTS.md cleanup item 3 ever completed?

**Cannot confirm — no such item exists.** `AGENTS.md` in this repo contains no numbered "cleanup" list (searched the full file and the entire repo, including `audit_export/`, for the word "cleanup" — the only matches are unrelated string-cleanup helper functions in `formatAddress.ts` and a `MapPickerModal` comment). `AGENTS.md` does have an unnumbered "Known Gaps (Not Yet Built)" list, none of whose bullets reference "cleanup item 3" or the H3 grid. If a "cleanup item 3" existed in a prior conversation or an earlier draft of AGENTS.md, it is not present in the current file — please confirm the source of that reference.

---

## 4. Ride Cancellation After Driver Accepts

### 4.1 Cancel ride logic in `rideStore.ts`

File: `src/state/rideStore.ts` (lines 452-490)

```ts
// Cancel ride
cancelRide: (reason?: CancellationReason, note?: string) => {
  const state = get();

  if (state.orderId) {
    unsubscribeFromOrder(state.orderId);
    cancelOrder(state.orderId).then((errorMessage) => {
      if (errorMessage) console.error('Failed to cancel order:', errorMessage);
    });
  }

  // Add to history if was active
  if (state.activeTrip) {
    const cancelledRide: RideHistoryItem = {
      id: state.activeTrip.id,
      date: new Date(),
      pickup: state.activeTrip.pickup,
      destination: state.activeTrip.destination,
      status: 'cancelled',
      vehicleType: state.selectedVehicle,
      mode: state.mode,
      driver: state.activeTrip.driver,
      cancellationReason: reason,
      cancellationNote: note,
    };

    set((s) => ({
      rideHistory: [cancelledRide, ...s.rideHistory],
    }));
  }

  // Reset
  set({
    status: 'idle',
    activeTrip: null,
    orderId: null,
    orderFare: null,
  });
},
```

Backing service call — `src/services/orders.ts` (lines 117-128):
```ts
export async function cancelOrder(orderId: string): Promise<string | null> {
  const { error } = await insforge.database
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'customer',
    })
    .eq('id', orderId);

  return error ? error.message : null;
}
```

### 4.2 What happens when the customer tries to cancel after `status = 'accepted'`

**Finding: nothing blocks it.** `cancelRide()` contains no branch on `activeTrip.status` (`driver_assigned` / `arriving` / `waiting` / `in_progress`) or on order status. It always:
1. Fires `cancelOrder(orderId)`, which unconditionally sets the order row's `status` to `'cancelled'` in the DB regardless of its current status (`pending`, `accepted`, or `in_progress`).
2. Records a `cancelled` entry in local `rideHistory`.
3. Resets local ride state to `idle`.

There is no cancellation-fee calculation, no confirmation step tied to how far along the trip is, and no server-side guard visible in this file preventing cancellation once a driver has accepted or even once the trip is `in_progress`.

### 4.3 `ActiveTripCard` cancel button logic

File: `src/features/passenger/components/ActiveTripCard.tsx` (lines 188-209)

```tsx
{/* Action buttons */}
<View className="flex-row gap-3 mt-4">
  <View className="flex-1">
    <Button variant="outline" size="sm" onPress={onCancelTrip} leftIcon="close-circle-outline">
      Cancel
    </Button>
  </View>
  <View className="flex-1">
    <Button variant="ghost" size="sm" onPress={onEndTrip}>
      Complete (Demo)
    </Button>
  </View>
</View>
```

**Finding:** The "Cancel" button is rendered unconditionally for every `ActiveTrip['status']` value (`driver_assigned`, `arriving`, `waiting`, `in_progress`, `completed`) — there is no `disabled`/hidden state based on trip progress. Tapping it always calls the `onCancelTrip` prop, wired in `PassengerHome.tsx`:

```tsx
// Handle cancel trip - show modal
const handleCancelTrip = useCallback(() => {
  setShowCancellationModal(true);
}, []);

// Handle confirmed cancellation
const handleConfirmCancellation = useCallback((reason: CancellationReason, note?: string) => {
  cancelRide(reason, note);
  setShowCancellationModal(false);
}, [cancelRide]);
```

`CancellationModal` (`src/features/passenger/components/CancellationModal.tsx`) only disables its confirm button when `!selectedReason || isConfirming` (line 177) — it has no logic gating cancellation based on trip status, driver proximity, or a cancellation fee.

Also present on the same card: a **"Complete (Demo)"** ghost button calling `onEndTrip` → `handleEndTrip` — a dev/demo shortcut that lets the customer end the trip client-side, independent of the driver's own "Slide to Complete Trip" flow.

---

## 5. Profile Picture Display

### 5.1 Where `profile_photo_url` is read/displayed

**`src/state/userStore.ts`** — the customer's `profile_photo_url` (returned from InsForge as `profilePhotoUrl`) is mapped into the in-memory `profile.avatar` field:

```ts
profile: customerAccount
  ? {
      ...state.profile,
      id: customerAccount.id,
      firstName: customerAccount.firstName,
      lastName: customerAccount.lastName,
      email: customerAccount.email,
      phone: customerAccount.phoneNumber,
      avatar: customerAccount.profilePhotoUrl ?? undefined,
    }
  : state.profile,
```

and updated after a photo change:
```ts
applySharedProfilePhoto: (url, key) => set((state) => ({
  profile: { ...state.profile, avatar: url },
  customerAccount: state.customerAccount
    ? { ...state.customerAccount, profilePhotoUrl: url, profilePhotoKey: key }
    : state.customerAccount,
  driverAccount:
    state.driverAccount && state.driverAccount.profilePhotoKey === null
      ? { ...state.driverAccount, profilePhotoUrl: url }
      : state.driverAccount,
})),
```

**`src/features/account/components/ProfileCard.tsx`** (full relevant excerpt, lines 20-37):
```tsx
<View className="w-20 h-20 rounded-full bg-primary items-center justify-center">
  {profile.avatar ? (
    <View className="w-20 h-20 rounded-full overflow-hidden">
      {/* Image would go here */}
      <Ionicons name="person" size={40} color="#FFFFFF" />
    </View>
  ) : (
    <Text className="text-white text-3xl font-bold">
      {profile.firstName.charAt(0).toUpperCase()}
    </Text>
  )}
</View>
```

**Finding — bug:** When `profile.avatar` (i.e. `profile_photo_url`) exists, `ProfileCard` still only renders a generic `Ionicons name="person"` placeholder icon inside an empty `<View>`, with a literal `{/* Image would go here */}` comment. **No `<Image>` component is actually rendered** — the fetched photo URL is never displayed on the Account screen, regardless of whether a photo was uploaded.

**`src/features/account/AccountScreen.tsx`** (line 247): passes `profile` straight into `ProfileCard`:
```tsx
<ProfileCard
  profile={profile}
  onEditPress={() => router.push('/profile')}
  loading={accountsLoading}
/>
```

**`src/features/passenger/components/ActiveTripCard.tsx`** (lines 96-108) — by contrast, this component **does** render a real image, for the driver's avatar (not the customer's own photo):
```tsx
<View className="w-14 h-14 rounded-full bg-gray-200 items-center justify-center">
  {trip.driver.avatar ? (
    <Animated.Image
      source={{ uri: trip.driver.avatar }}
      className="w-14 h-14 rounded-full"
    />
  ) : (
    <Ionicons name="person" size={28} color="#7B8387" />
  )}
</View>
```

**`src/features/passenger/PassengerHome.tsx`** — no reference to `profile`, `avatar`, or any profile-picture UI anywhere in this file (confirmed via search; PassengerHome shows no profile picture at all).

**Summary of `profile_photo_url` usage across the requested files:**

| Component | Reads `profile_photo_url`/`avatar`? | Renders actual image? |
|---|---|---|
| `PassengerHome.tsx` | No | N/A — no profile picture shown here at all |
| `ActiveTripCard.tsx` | Yes, via `trip.driver.avatar` | **Yes** — real `<Animated.Image source={{uri:...}}>` |
| `AccountScreen.tsx` | Passes `profile` (containing `.avatar`) into `ProfileCard` | Delegates to `ProfileCard` |
| `ProfileCard.tsx` | Yes, via `profile.avatar` | **No** — placeholder icon only, `<Image>` never wired up |

### 5.2 How the image is fetched from InsForge storage

Fetch (read) side — `src/services/accounts.ts`: the `customers` (and `drivers`) row is selected with `profile_photo_url` included directly in the column list, e.g.:
```ts
.select('id, auth_id, first_name, last_name, email, phone_number, account_status, profile_photo_url, profile_photo_key')
```
mapped to `profilePhotoUrl: data.profile_photo_url` in the returned account object — i.e. the URL is a plain public string column, not a signed/short-lived URL.

Upload (write) side — `src/services/uploads.ts`:
```ts
const DOCUMENT_BUCKETS: Record<DriverDocumentType, string> = {
  driverLicense: 'driver-documents',
  vehicleRegistration: 'driver-documents',
  insurance: 'driver-documents',
  profilePhoto: 'profile-photos',
};
export const PROFILE_PHOTOS_BUCKET = 'profile-photos';
```
Comment on lines 12-14: "Verification documents live in a private bucket (owner-only read via storage RLS); profile photos are public so they can render anywhere in the app without signed URLs." Files are uploaded to `{authId}/{keyPrefix}-{timestamp}.{ext}` in the `profile-photos` bucket, timestamped so a new upload always yields a fresh URL.

`src/services/profilePhoto.ts` (`updateSharedProfilePhoto`, `setDriverOnlyProfilePhoto`, `revertDriverPhotoToShared`) orchestrates: upload new object → update `customers.profile_photo_url` / `profile_photo_key` → mirror onto a linked `drivers` row (when `profile_photo_key IS NULL`) → delete the old object.

---

## 6. Fare Update During Trip

### 6.1 How fare is calculated during an active trip

Core formula — `src/lib/fareCalculator.ts`:
```ts
export const PRICING_RATES = {
    BASE_FARE: 25,
    PER_KM: 8,
    PER_MINUTE: 2,
    PER_MINUTE_WAITING: 1.5,
    MIN_FARE: 35,
};

export const calculateFare = (distanceKm: number, durationMinutes: number, waitingMinutes: number = 0): FareComponents => {
    const baseFare = PRICING_RATES.BASE_FARE;
    const distanceFare = distanceKm * PRICING_RATES.PER_KM;
    const timeFare = durationMinutes * PRICING_RATES.PER_MINUTE;
    const waitingFare = waitingMinutes * PRICING_RATES.PER_MINUTE_WAITING;

    const subtotal = baseFare + distanceFare + timeFare + waitingFare;
    const total = Math.max(subtotal, PRICING_RATES.MIN_FARE);
    ...
};
```
Plus a per-vehicle-type multiplier layer (`calculateFareForVehicle` / `VEHICLE_FARE_MULTIPLIERS`) used only for pre-booking vehicle-option estimates.

**`calculateFare` is called from exactly two call sites in the app:**

1. **`src/state/rideStore.ts:303`**, inside `requestRide()` — computed **once, before the trip exists**, from a route-estimate `distanceKm`/`durationMinutes` (from Directions/Distance Matrix), with `waitingMinutes` omitted (defaults to `0`):
   ```ts
   const fare = calculateFare(distanceKm, durationMinutes);
   const { order, errorMessage } = await createOrder({
     ...
     baseFare: fare.baseFare,
     fareAmount: fare.total,
   });
   ```
   This becomes `orderFare` / `activeTrip.fare` — the number the customer sees for the rest of the trip.

2. **`app/(driver)/trip.tsx:184`**, inside `handleSliderComplete()` — computed **once, only when the driver slides "Complete Trip"** at the very end:
   ```ts
   const distanceKm = parseFloat(distance);            // live distance-to-destination at that instant
   const durationMin = Math.ceil(elapsedTime / 60);     // real elapsed trip timer
   const waitingMin = Math.ceil(waitingDuration / 60);  // real waiting timer
   const fareData = calculateFare(distanceKm, durationMin, waitingMin);
   ```
   This final `fareData.total` is sent to the server via `completeTrip(receiptData)` → `completeOrderTrip(currentTrip.id, receiptData.totalFare)` (`src/state/driverStore.ts:389-393`), which persists the real `fare_amount` server-side.

**Finding: `calculateFare` is never called continuously/periodically during an in-progress trip.** It runs once pre-trip (estimate) and once at trip-completion (final real value) — there is no live recalculation while `status === 'in_progress'`.

### 6.2 Where waiting time and travel time feed into the fare

- **Waiting time**: `src/state/driverStore.ts` tracks `waitingStartTime`/`waitingDuration` (seconds) as driver-side state. It is only converted to `waitingMinutes` and fed into `calculateFare` at trip completion (`app/(driver)/trip.tsx:182,184`, `Math.ceil(waitingDuration / 60)`). It is not used anywhere else in fare math.
- **Travel/duration time**: `app/(driver)/trip.tsx` runs a 1-second interval timer (`elapsedTime`, lines 154-165) purely to display `formatTime(elapsedTime)` as "TRIP DURATION" on screen; `elapsedTime` only feeds into `calculateFare` once, at `handleSliderComplete`, as `durationMin = Math.ceil(elapsedTime / 60)`.
- **Distance**: recomputed live via `calculateDistanceKm(driverLocation, currentTrip.destination)` on every driver location update (`app/(driver)/trip.tsx:229-231`) for on-screen "Distance" display, but that live value is only plugged into `calculateFare` at the final slider-complete call — intermediate distance changes never trigger a fare recalculation.

### 6.3 What the customer and driver see for fare during the trip

- **Driver** (`app/(driver)/trip.tsx`, lines 306-318): shows a static "Earnings" stat tile bound to `currentTrip.estimatedFare` — set once from `Number(order.fare_amount)` when the trip data was loaded (`src/state/driverStore.ts:126`), never updated while `in_progress`:
  ```tsx
  <Text className="text-secondary text-xs mt-1">Earnings</Text>
  <Text className="text-success font-bold">K{currentTrip.estimatedFare}</Text>
  ```
- **Customer** (`src/features/passenger/components/ActiveTripCard.tsx`, lines 141-156): shows `K{trip.fare}`, where `trip.fare` is set once in `rideStore.ts` when the order is accepted (`fare: state.orderFare ?? 0`, line 388) and is **not** updated by the `'in_progress'` branch of `applyOrderUpdate` (lines 417-431), which only updates `status`, `startedAt`, `estimatedArrival`, and driver telemetry — `fare` is untouched until `completeRide()` overwrites it with the real `update.fare_amount` on the `'completed'` event (lines 433 onward, and `completeRide()` at line 496).

**Conclusion:** Both the customer and the driver see the same **static pre-trip estimated fare** for the entire duration of the trip (`driver_assigned` → `arriving` → `waiting` → `in_progress`). The real fare — computed from actual elapsed time, actual waiting time, and distance-at-completion — is calculated exactly once, at the moment the driver slides "Complete Trip," and only then propagates to both sides via the `'completed'` realtime event.

### 6.4 Is `calculateFare` called with real `waitingMinutes` and `durationMinutes` during the trip?

**No — not during the trip.** It is called with real (non-zero, live-tracked) `waitingMinutes`/`durationMinutes` exactly once, **at the end** of the trip (`app/(driver)/trip.tsx:178-184`, `handleSliderComplete`). During the trip itself (while `status === 'in_progress'`), `calculateFare` is not invoked at all — the pre-trip estimate (computed with `waitingMinutes` defaulted to `0` and route-estimated `durationMinutes`) remains what's displayed.

---

## Summary of Key Findings

1. `asset_SVG_car_birdview.svg` exists but is unused at runtime — `CarMarker.tsx` loads a plain PNG instead, and a comment in `AnimatedVehicleMarker.tsx` still incorrectly describes the marker as an SVG.
2. PassengerHome passes no `vehicles` or `driverLocation` prop to `<Map />`, so no nearby-driver or driver car markers ever render on the passenger home map; `findNearbyDrivers` output is only ever logged to console under `h3DebugMode`.
3. The live-GPS pickup field displays the reverse-geocoded address text (via `formatDisplayAddress`), never the literal string "Live location".
4. `showH3Grid` defaults to `true` in `PassengerHome.tsx`, and its toggle button is always visible — the red hex grid overlay is on by default for every customer, independent of the `h3DebugMode` flag (which defaults to `false` and only gates a console-log debug effect and a separate debug block).
5. No "cleanup item 3" list exists in the current `AGENTS.md` — could not confirm or deny completion of an item that isn't present in the file.
6. `cancelRide()`/`cancelOrder()` and the `ActiveTripCard` "Cancel" button apply unconditionally at every trip stage (including `in_progress`) — there is no guard, fee, or confirmation gated on driver acceptance.
7. `ProfileCard.tsx` never renders the customer's actual profile photo — it always shows a placeholder person icon with a `{/* Image would go here */}` stub, even though `profile.avatar`/`profile_photo_url` is correctly fetched and stored. `ActiveTripCard.tsx`, by contrast, does render the driver's avatar as a real image.
8. Fare is computed once pre-trip (estimate, `waitingMinutes = 0`) and once at trip completion (real values) — never live during the trip. Both customer and driver see the same static estimated fare throughout `in_progress`.

---

*End of audit report.*
