# Post-Trip Flow Audit — Passenger & Driver

Read-only audit. No files were modified.

---

## 1. PASSENGER POST-TRIP FLOW

### What happens immediately after the order status changes to `completed`?

The customer's realtime subscription on the order (set up in `requestRide()`,
`src/state/rideStore.ts:359-361`) fires `applyOrderUpdate()` with the new
row. The `'completed'` case handles it:

`src/state/rideStore.ts:466-478`
```ts
case 'completed': {
  const trip = state.activeTrip;
  get().completeRide(update);
  // completeRide() already pushed a matching entry into rideHistory
  // under the same id, which the rating screen reads back out. The
  // fare popup is shown first; dismissFareReceipt() does the
  // navigation to rating once the customer taps OK.
  if (trip) {
    const fare = update.fare_amount != null ? Number(update.fare_amount) : trip.fare;
    set({ fareReceipt: { rideId: trip.id, fare, paymentMethod: state.paymentMethod } });
  }
  return;
}
```

### Which function handles this in rideStore?

`applyOrderUpdate()` (the `'completed'` branch above) delegates the actual
state teardown to `completeRide()`.

### Exact code path, step by step

1. `applyOrderUpdate('completed')` — `src/state/rideStore.ts:466`
2. → calls `completeRide(update)` — `src/state/rideStore.ts:543-589`
   - unsubscribes the realtime channel (`unsubscribeFromOrder`)
   - builds a `completedRide: RideHistoryItem` from `state.activeTrip` (fare
     from the order row, duration computed from `trip_started_at`/`completed_at`)
   - `set({ rideHistory: [completedRide, ...], status: 'completed', activeTrip: null, orderId: null, orderFare: null })`
   - fires `get().fetchRideHistory()` (fire-and-forget) to backfill the real
     history from InsForge, replacing the optimistic entry
3. Back in `applyOrderUpdate`, since `trip` (the old `activeTrip`) existed,
   sets `fareReceipt: { rideId, fare, paymentMethod }` — `rideStore.ts:475`
4. `activeTrip` is now `null` and `status` is `'completed'` (not `'active'`).
   `app/(customer)/trip.tsx:25-29` has a `useEffect` watching exactly this:
   ```ts
   useEffect(() => {
     if (status !== 'active' || !activeTrip) {
       router.replace('/(tabs)');
     }
   }, [status, activeTrip]);
   ```
   This fires **immediately** and silently replaces the trip screen with the
   tabs/home screen, underneath whatever is on top.
5. Meanwhile `FareReceiptModal` is mounted globally in the root layout
   (`app/_layout.tsx:327`, `{appReady && authed && <FareReceiptModal />}`),
   not inside the trip screen. Because `fareReceipt` is now non-null, the
   modal renders on top of whatever screen is currently active — in
   practice this means the customer sees the fare popup appear over the
   (tabs) home screen, after a same-frame swap from the trip screen.

### What is `fareReceipt` and where is it set?

`fareReceipt` is a `rideStore` field:

`src/state/rideStore.ts:83-86`
```ts
// Final fare popup shown right after a trip completes, before the rating
// screen. Set by applyOrderUpdate's 'completed' case instead of navigating
// straight to rating; dismissFareReceipt() clears it and navigates.
fareReceipt: { rideId: string; fare: number; paymentMethod: PaymentMethod } | null;
```

It's set only in `applyOrderUpdate`'s `'completed'` case (`rideStore.ts:475`,
shown above), and read by `FareReceiptModal` (`src/features/passenger/components/FareReceiptModal.tsx:20`).

### Exact `dismissFareReceipt()` code

`src/state/rideStore.ts:251-257`
```ts
// Dismisses the final-fare popup and takes the customer to the rating
// screen — the same navigation applyOrderUpdate's 'completed' case used to
// fire immediately.
dismissFareReceipt: () => {
  const { fareReceipt } = get();
  set({ fareReceipt: null });
  if (fareReceipt) {
    router.replace({ pathname: '/rating/[id]', params: { id: fareReceipt.rideId } });
  }
},
```

### Does it currently navigate to `app/rating/[id].tsx`?

**Yes.** `dismissFareReceipt()` calls `router.replace('/rating/[id]', { id: fareReceipt.rideId })`. This is wired up correctly.

### What screen does the passenger see after tapping OK on the receipt?

`app/rating/[id].tsx` — the star-rating screen (`RatingScreen`). It reads the
matching entry back out of `rideStore.rideHistory` by `id` for the fare
breakdown and driver name. Tapping **Submit Feedback** or **Skip** both call
`handleDone()` (`app/rating/[id].tsx:29-36`), which — if a star rating was
set — calls `rateRide(id, rating, comment)` (persists to InsForge via
`submitRating`, `src/services/ratings.ts`), then always
`router.replace('/(tabs)')`, landing on home.

---

## 2. DRIVER POST-TRIP FLOW

### What triggers navigation to `app/(driver)/trip-summary.tsx`?

`handleSliderComplete()` in `app/(driver)/trip.tsx`, after `completeTrip()`
succeeds (see below).

### Exact `handleSliderComplete` code in trip.tsx

`app/(driver)/trip.tsx:231-266`
```ts
const handleSliderComplete = async () => {
    // Prepare final receipt data — the actual distance driven this trip,
    // not the remaining distance to the destination.
    const distanceKm = distanceTraveledRef.current;
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
```

`completeTrip()` (`src/state/driverStore.ts:399-430`) persists
`status='completed'` + final `fare_amount` to the order row via
`completeOrderTrip()`, refreshes the wallet, and sets
`lastTripSummary` — which `trip-summary.tsx` reads. `currentTrip` is
deliberately **not** cleared here (see comment), so the trip screen's own
"no active trip → redirect" effect doesn't race this navigation.

### Exact `handleDone` code in trip-summary.tsx

`app/(driver)/trip-summary.tsx:19-28`
```ts
const handleDone = () => {
    router.replace('/rating/driver');
};

useEffect(() => {
    if (!lastTripSummary) {
      finishTrip();
      router.replace('/(tabs)');
    }
}, [lastTripSummary]);
```

### Where does the driver go after Done?

`app/rating/driver.tsx` — the passenger-rating screen (rate the passenger on
punctuality/communication/payment). **Not** directly home.

### Is `rating/driver.tsx` in the flow at all?

**Yes**, it is reached (`trip-summary.tsx`'s `handleDone` routes to it), but
see §3/§6 for a registration gap and a functional gap:

- It has **no explicit `<Stack.Screen name="rating/driver">` entry** in
  `app/_layout.tsx`, unlike `rating/[id]` (§3).
- Its "Submit Rating" button (`app/rating/driver.tsx:33-36`) does **not**
  call any submit/persist function — `handleDone` only calls `finishTrip()`
  and navigates home. The `punctuality`/`communication`/`payment` star state
  is captured locally and then discarded; nothing is sent to InsForge. This
  matches the driver→customer rating direction already known to be
  backend-only/unwired (see prior audit note on `rated_by`).

---

## 3. RATING SCREENS EXIST CHECK

| Screen | Exists? | Registered in `app/_layout.tsx` Stack? |
|---|---|---|
| `app/rating/[id].tsx` | Yes | **Yes** — explicit `<Stack.Screen name="rating/[id]" options={{ headerShown: false, gestureEnabled: false }} />` inside the `Stack.Protected guard={authed}` block (`app/_layout.tsx:281-287`) |
| `app/rating/driver.tsx` | Yes | **No** — no `<Stack.Screen name="rating/driver">` anywhere in `app/_layout.tsx`, and there is no `app/rating/_layout.tsx` either |

There is no `app/rating/_layout.tsx` — both files sit directly under the
root Stack (`app/_layout.tsx`) as flat routes named `rating/[id]` and
`rating/driver`.

**Consequence of the missing registration:** Expo Router still creates the
route for `rating/driver.tsx` automatically from the file system (explicit
`<Stack.Screen>` entries are only needed to *customize* a route, not to make
it reachable), so navigation to it from `trip-summary.tsx` still works.
However, because it was never listed inside
`<Stack.Protected guard={authed}>` the way `rating/[id]` was, it is **not
gated by the `authed` guard** and doesn't get the `gestureEnabled: false`
treatment `rating/[id]` got (to stop a swipe-back skipping the rating step).
A driver could swipe back off `rating/driver`, and the route is reachable
even in a signed-out navigation state.

---

## 4. FARE RECEIPT POPUP

### Where is it rendered on the passenger side?

Globally, once, in the root layout — **not** inside the trip screen:

`app/_layout.tsx:5, 327`
```ts
import { FareReceiptModal } from '@/features/passenger/components';
...
{appReady && authed && <FareReceiptModal />}
```

### Exact component and code

`src/features/passenger/components/FareReceiptModal.tsx`
```tsx
export function FareReceiptModal() {
  const fareReceipt = useRideStore((state) => state.fareReceipt);
  const dismissFareReceipt = useRideStore((state) => state.dismissFareReceipt);

  return (
    <Modal visible={!!fareReceipt} transparent animationType="fade" onRequestClose={dismissFareReceipt}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full bg-white rounded-4xl p-6 items-center">
          <Text className="text-primary text-lg">You&apos;ll Pay</Text>
          <Text className="text-accent font-bold text-4xl mt-2">
            K{(fareReceipt?.fare ?? 0).toFixed(2)}
          </Text>
          <Text className="text-secondary text-sm mt-2">
            {fareReceipt ? paymentMethodLabels[fareReceipt.paymentMethod] : ''}
          </Text>

          <View className="w-full mt-6">
            <Button variant="accent" size="lg" fullWidth onPress={dismissFareReceipt}>
              OK
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

### What does tapping OK call?

`onPress={dismissFareReceipt}` → `rideStore.dismissFareReceipt()` (§1), which
clears `fareReceipt` and `router.replace`s to `/rating/[id]`.

---

## 5. CURRENT NAVIGATION AFTER EACH TRIP

**PASSENGER:**
```
Trip completes (order status → 'completed', realtime push)
  → applyOrderUpdate('completed') runs completeRide() [rideStore.ts:466]
  → activeTrip becomes null / status becomes 'completed'
  → app/(customer)/trip.tsx's redirect effect fires → router.replace('/(tabs)')  (silent, in the background)
  → fareReceipt is set → FareReceiptModal renders on top (root layout, global)
  → passenger taps OK → dismissFareReceipt() → router.replace('/rating/[id]')
  → app/rating/[id].tsx (star rating, optional, skippable)
  → Submit Feedback / Skip → router.replace('/(tabs)')
  → home
```

**DRIVER:**
```
Trip completes (Slide to Complete Trip)
  → handleSliderComplete() [app/(driver)/trip.tsx:231] calls completeTrip()
  → driverStore sets lastTripSummary, tripStatus 'completed'
  → router.replace('/(driver)/trip-summary')
  → app/(driver)/trip-summary.tsx shows fare/earnings breakdown
  → driver taps Done → handleDone() → router.replace('/rating/driver')
  → app/rating/driver.tsx (rate passenger — UI only, does not persist)
  → Submit Rating / Skip for now → handleDone() → finishTrip() → router.replace('/(tabs)')
  → home
```

---

## 6. WHERE TO INSERT RATING SCREENS

Both rating screens are **already wired into the navigation flow** (contrary
to what the audit prompt's phrasing implies) — the gaps are registration and
persistence, not missing trigger points:

- **Passenger rating trigger** — already correct. It's
  `src/state/rideStore.ts:255` inside `dismissFareReceipt()`:
  `router.replace({ pathname: '/rating/[id]', params: { id: fareReceipt.rideId } })`.
  No change needed here. The only related gap is that `rating/[id]` is
  reached *after* a redirect-to-home has already fired underneath it
  (§1 step 4) — cosmetically fine since the modal/next screen fully covers
  it, but worth knowing if that home-screen flash is ever made visible
  (e.g. removing the fare modal).

- **Driver rating trigger** — already correct. It's
  `app/(driver)/trip-summary.tsx:19-21` inside `handleDone()`:
  `router.replace('/rating/driver')`. No change needed here either.

What actually needs fixing, with exact locations:

1. **Register `rating/driver` in the root Stack**, mirroring `rating/[id]`.
   File: `app/_layout.tsx`, inside the `<Stack.Protected guard={authed}>`
   block that currently starts at line 276 — add immediately after the
   existing `rating/[id]` entry (line 287):
   ```tsx
   <Stack.Screen
     name="rating/driver"
     options={{
       headerShown: false,
       gestureEnabled: false,
     }}
   />
   ```

2. **Wire up rating persistence in `app/rating/driver.tsx`.** `handleDone`
   (`app/rating/driver.tsx:33-36`) currently discards
   `punctuality`/`communication`/`payment` instead of submitting them. This
   needs a driver-rating equivalent of `rideStore.rateRide()` /
   `services/ratings.ts submitRating()` — per existing project memory, the
   `rated_by` column and backend side of driver→customer ratings exist, but
   no app code calls it yet. That wiring is outside the scope of this
   read-only audit.

---

## Summary of Findings

| # | Finding | File(s) |
|---|---|---|
| 1 | `rating/driver` is not declared as a `<Stack.Screen>` in the root Stack and falls outside the `authed` guard, unlike `rating/[id]` | `app/_layout.tsx` |
| 2 | `rating/driver`'s Submit Rating action does not persist the rating anywhere — punctuality/communication/payment stars are captured then discarded | `app/rating/driver.tsx:33-36` |
| 3 | Passenger's trip screen redirects to `/(tabs)` immediately on trip completion, before the fare receipt modal is dismissed — currently masked because the modal renders globally on top, but the underlying navigation already happened | `app/(customer)/trip.tsx:25-29`, `app/_layout.tsx:327` |
| 4 | Both rating screens' actual navigation trigger points (`dismissFareReceipt` for passenger, `trip-summary.handleDone` for driver) are correctly wired already — no insertion needed there | `src/state/rideStore.ts:251-257`, `app/(driver)/trip-summary.tsx:19-21` |
