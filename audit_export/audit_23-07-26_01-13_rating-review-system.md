# Rating/Review System Audit

Read-only audit. No files were modified.

---

## 1. Passenger Rating Screen

**File:** [app/rating/[id].tsx](app/rating/[id].tsx)

Reached from `rideStore.dismissFareReceipt()` after the customer taps OK on
the post-trip fare receipt popup:

```ts
// src/state/rideStore.ts:251-257
dismissFareReceipt: () => {
  const { fareReceipt } = get();
  set({ fareReceipt: null });
  if (fareReceipt) {
    router.replace({ pathname: '/rating/[id]', params: { id: fareReceipt.rideId } });
  }
},
```

### Exact current rating UI code

```tsx
// app/rating/[id].tsx
import { Button, Card, Input } from '@/components/ui';
import { useRideStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Post-trip rating screen. Reached from rideStore.applyOrderUpdate when an
 * order's status flips to 'completed'. Rating is optional and can be
 * skipped -- a submitted rating is persisted to InsForge (rideStore.rateRide),
 * which also updates the driver's average rating.
 */
export default function RatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideHistory = useRideStore((state) => state.rideHistory);
  const rateRide = useRideStore((state) => state.rateRide);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ride = rideHistory.find((r) => r.id === id);

  const handleDone = async () => {
    if (id && rating > 0) {
      setSubmitting(true);
      await rateRide(id, rating, comment.trim() || undefined);
      setSubmitting(false);
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-6" edges={['top', 'bottom']}>
      <Card variant="elevated" padding="lg" radius="2xl" className="w-full">
        <View className="items-center py-4">
          <View className="w-16 h-16 rounded-full bg-success/10 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text className="text-primary font-bold text-xl mb-1">
            Trip Completed
          </Text>
          {ride?.fare != null && (
            <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
              {ride.baseFare != null && (
                <>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-secondary text-sm">Base fare</Text>
                    <Text className="text-primary text-sm">K{ride.baseFare.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
                    <Text className="text-secondary text-sm">Distance & time</Text>
                    <Text className="text-primary text-sm">
                      K{(ride.fare - ride.baseFare).toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
              <View className="flex-row justify-between">
                <Text className="text-primary font-bold">Total fare</Text>
                <Text className="text-primary font-bold">K{ride.fare.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {ride?.driver && (
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-gray-200 items-center justify-center mb-2">
                <Ionicons name="person" size={32} color="#7B8387" />
              </View>
              <Text className="text-primary font-semibold text-base">
                {ride.driver.name}
              </Text>
            </View>
          )}

          <Text className="text-secondary text-sm mb-3">
            How was your trip?
          </Text>

          <View className="flex-row items-center mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} hitSlop={8}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? '#FFB800' : '#CBD5E1'}
                  style={{ marginHorizontal: 4 }}
                />
              </Pressable>
            ))}
          </View>

          {rating > 0 && (
            <Input
              placeholder="Leave a comment (optional)"
              value={comment}
              onChangeText={setComment}
              multiline
              className="w-full mb-4"
            />
          )}
        </View>

        <Button variant="accent" fullWidth onPress={handleDone} disabled={rating === 0} loading={submitting}>
          Submit Rating
        </Button>
        <Button variant="ghost" fullWidth className="mt-2" onPress={handleDone} disabled={submitting}>
          Skip
        </Button>
      </Card>
    </SafeAreaView>
  );
}
```

### What rating fields exist currently

- A single **overall star rating**, 1–5, via inline `Pressable` + `Ionicons`
  star icons (not a reusable component — see §4).
- One optional free-text **comment** field (`Input`, `multiline`), only shown
  once a star is tapped.
- No sub-category fields (no driving skill, cleanliness, punctuality, etc.)
  — see §3 and §6.

### How the rating is submitted to InsForge

`handleDone()` calls `rideStore.rateRide(id, rating, comment)`:

```ts
// src/state/rideStore.ts:591-606
// Records the customer's optional star rating (1-5, skippable) and
// persists it to InsForge -- a trigger recomputes the driver's rating
// average. Updates the local history entry optimistically either way.
rateRide: async (rideId, rating, comment) => {
  const ride = get().rideHistory.find((r) => r.id === rideId);

  set((s) => ({
    rideHistory: s.rideHistory.map((r) => (r.id === rideId ? { ...r, rating } : r)),
  }));

  if (!ride?.driver) return;
  const errorMessage = await submitRating(rideId, ride.driver.id, rating, comment);
  if (errorMessage) {
    console.error('Failed to submit rating:', errorMessage);
  }
},
```

`rateRide` calls `submitRating()` in [src/services/ratings.ts](src/services/ratings.ts):

```ts
// src/services/ratings.ts
import { insforge } from '@/lib/insforge';
import { fetchCustomerAccount } from './accounts';

/**
 * Post-trip customer -> driver ratings.
 *
 * One rating per completed order (ratings.order_id is UNIQUE) -- an insert
 * recomputes the driver's rating/total_ratings average via a trigger, see
 * migrations/20260709075617_add-ratings-and-driver-rating-aggregate.sql.
 * Rating is optional; skipping it means no row is ever inserted.
 */
export async function submitRating(
  orderId: string,
  driverId: string,
  rating: number,
  comment?: string
): Promise<string | null> {
  const customer = await fetchCustomerAccount();
  if (!customer) return 'You need to be signed in to rate this trip.';

  const { error } = await insforge.database.from('ratings').insert([
    {
      order_id: orderId,
      customer_id: customer.id,
      driver_id: driverId,
      rating,
      comment: comment || null,
    },
  ]);

  return error ? error.message : null;
}
```

This is the only file in the codebase that inserts into `ratings` — consistent
with the `AGENTS.md` pattern that all InsForge calls go through `src/lib`/`src/services`,
never directly from a component.

### Which table/fields store the rating

Table `public.ratings` (see §3 for full schema). The insert writes:
`order_id`, `customer_id`, `driver_id`, `rating`, `comment`. It omits
`rated_by`, which defaults to `'customer'`.

### What happens after submission

1. `rideStore.rateRide` optimistically updates the local `rideHistory` entry
   with the chosen `rating` regardless of network outcome.
2. `submitRating` inserts into `ratings`.
3. A DB trigger (`rating_insert_trigger` → `handle_new_rating()`) recomputes
   `drivers.rating` and `drivers.total_ratings` as a running average.
4. On error, it's only `console.error`'d — no user-facing error state, no
   retry.
5. Regardless of success/failure/skip, `handleDone()` calls
   `router.replace('/(tabs)')`, returning the customer to the tab home.

---

## 2. Driver Rating Screen

**Does not exist.** Confirmed by:

- No file under `app/` or `src/features/` renders a star-input UI for the
  driver to rate the customer.
- The driver's only post-trip screen is
  [app/(driver)/trip-summary.tsx](app/(driver)/trip-summary.tsx), reached
  from `driverStore.completeTrip()` after "Slide to Complete Trip." It shows
  only a fare/earnings breakdown and a single **Done** button — no rating
  UI of any kind:

```tsx
// app/(driver)/trip-summary.tsx
import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { useDriverStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Post-trip summary shown to the driver after Slide to Complete Trip
 * succeeds. Reads driverStore.lastTripSummary (set by completeTrip()). Done
 * only navigates home — the driver stays online, and trip state is left
 * as-is (no store resets, no offline calls).
 */
export default function DriverTripSummaryScreen() {
  const { lastTripSummary, finishTrip } = useDriverStore();

  const handleDone = () => {
    finishTrip();
    router.replace('/(tabs)');
  };

  useEffect(() => {
    if (!lastTripSummary) {
      finishTrip();
      router.replace('/(tabs)');
    }
  }, [lastTripSummary]);

  if (!lastTripSummary) return null;

  const { passengerName, distance, duration, waitingDuration, fareAmount, serviceFeeAmount, netEarnings } = lastTripSummary;

  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-6" edges={['top', 'bottom']}>
      <Card variant="elevated" padding="lg" radius="2xl" className="w-full">
        <View className="items-center py-4">
          <View className="w-16 h-16 rounded-full bg-success/10 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text className="text-primary font-bold text-xl mb-1">
            Trip Completed
          </Text>
          <Text className="text-secondary text-sm mb-6">
            {passengerName} &middot; {distance.toFixed(1)} km &middot; {duration} min
          </Text>

          <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
            <Text className="text-secondary text-xs mb-3">TRIP BREAKDOWN</Text>

            <View className="flex-row justify-between mb-2">
              <Text className="text-secondary text-sm">Distance</Text>
              <Text className="text-primary font-medium text-sm">{distance.toFixed(1)} km</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-secondary text-sm">Travel time</Text>
              <Text className="text-primary font-medium text-sm">{duration} min</Text>
            </View>
            <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
              <Text className="text-secondary text-sm">Waiting time</Text>
              <Text className="text-primary font-medium text-sm">{waitingDuration} min</Text>
            </View>

            <View className="flex-row justify-between mb-2">
              <Text className="text-primary text-sm">Final fare</Text>
              <Text className="text-primary font-medium text-sm">{formatCurrency(fareAmount)}</Text>
            </View>
            <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
              <Text className="text-secondary text-sm">Service fee</Text>
              <Text className="text-secondary text-sm">-{formatCurrency(serviceFeeAmount)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-primary font-bold">You earned</Text>
              <Text className="text-success font-bold text-lg">{formatCurrency(netEarnings)}</Text>
            </View>
          </View>
        </View>

        <Button variant="accent" fullWidth onPress={handleDone}>
          Done
        </Button>
      </Card>
    </SafeAreaView>
  );
}
```

There is also no `src/services/*` function that inserts a `ratings` row with
`rated_by: 'driver'` anywhere in the codebase — `src/services/ratings.ts` is
the only ratings insert path and it is customer-only (§1).

---

## 3. Ratings Table (InsForge/DB)

Defined across two migrations:

- `migrations/20260709075617_add-ratings-and-driver-rating-aggregate.sql` — creates the table, customer→driver only.
- `migrations/20260722150432_add-driver-rates-customer-aggregate.sql` — adds `rated_by`, extends the trigger for driver→customer (backend only, unused by app code — see §6).

### Exact current schema (after both migrations)

```sql
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  rated_by text NOT NULL DEFAULT 'customer' CHECK (rated_by = ANY (ARRAY['customer', 'driver'])),
  CONSTRAINT ratings_order_id_rated_by_key UNIQUE (order_id, rated_by)
);

CREATE INDEX idx_ratings_driver_id ON public.ratings (driver_id);
CREATE INDEX idx_ratings_customer_id ON public.ratings (customer_id);
```

RLS: `authenticated` role has `SELECT, INSERT` only (no `UPDATE`/`DELETE` —
ratings are append-only/immutable once submitted).

- `customers_insert_own_rating` — customer may insert `rated_by='customer'`
  for their own completed order, matching the assigned driver.
- `drivers_insert_own_rating` — driver may insert `rated_by='driver'` for
  their own completed order, matching the assigned customer. **(Policy
  exists; nothing in app code currently uses it — see §2/§6.)**
- `customers_select_own_ratings` / `drivers_select_own_ratings` — each side
  can read only ratings tied to their own id.

Aggregate trigger `rating_insert_trigger` → `handle_new_rating()`: on every
insert, recomputes a running average onto `drivers.rating`/`total_ratings`
(if `rated_by='customer'`) or `customers.rating`/`total_ratings` (if
`rated_by='driver'`).

### What columns exist currently

`id`, `order_id`, `customer_id`, `driver_id`, `rating`, `comment`,
`created_at`, `rated_by`. That's it.

### Is there a column for each rating category (driving, cleanliness, etc.)?

**No.** There is exactly one numeric field, `rating smallint CHECK (1-5)` —
a single overall score. There are no columns for driving skill,
cleanliness, communication, punctuality, or payment. `comment` is the only
other user-supplied field, and it's unstructured free text.

### Or is it just a single overall score?

Confirmed: **single overall score only**, plus one free-text comment.

---

## 4. Rating Component

**No reusable star rating component exists anywhere in `src/components/`.**

`src/components/ui/` contains: `BackButton.tsx`, `BottomSheet.tsx`,
`Button.tsx`, `Card.tsx`, `Chip.tsx`, `collapsible.tsx`, `Divider.tsx`,
`icon-symbol.ios.tsx`, `icon-symbol.tsx`, `IconButton.tsx`, `Input.tsx`,
`Pill.tsx`, `RideActionSlider.tsx`, `SegmentedControl.tsx`,
`SkeletonBox.tsx` — no `Star*`, `Rating*`, or similar file.

The 5-star selector in `app/rating/[id].tsx` (§1) is written inline in that
one screen: a `.map([1,2,3,4,5])` over `Pressable` + `Ionicons`
(`star`/`star-outline`), with local `useState` for the selected value. It
is not extracted into a component and accepts no props — it's screen-local
JSX, not reusable.

Read-only star *display* (not input) appears in a couple of other places as
plain text/number, not a star icon component, e.g.:

```tsx
// app/(customer)/trip.tsx:119
{activeTrip.driver.rating.toFixed(1)} • {activeTrip.driver.tripsCompleted} trips
```

This is just `driver.rating.toFixed(1)` rendered as text — no star graphics,
no shared component.

---

## 5. Current Flow

### After trip completes — passenger

1. `driverStore.completeTrip()` sets order `status='completed'` server-side.
2. The customer's realtime order subscription fires `rideStore.applyOrderUpdate`
   with the `'completed'` case, which calls `completeRide(update)` and sets
   a `fareReceipt` popup (final fare summary) — this is the "Trip Completed"
   receipt shown before rating.
3. The customer taps OK on the fare receipt, calling
   `dismissFareReceipt()`, which does
   `router.replace({ pathname: '/rating/[id]', params: { id: fareReceipt.rideId } })`.
4. `app/rating/[id].tsx` renders.

So: **fare receipt popup → tap OK → rating screen.** It is not triggered
directly off the `'completed'` status; it's gated behind the receipt
dismissal.

### After trip completes — driver

1. Driver performs "Slide to Complete Trip" → `driverStore.completeTrip()`
   → order `status='completed'`, `lastTripSummary` populated, `tripStatus: 'completed'`.
2. Driver is navigated to `app/(driver)/trip-summary.tsx`, which shows the
   fare/earnings breakdown.
3. Tapping **Done** calls `finishTrip()` and returns to `/(tabs)`.

**No rating step is triggered for the driver at any point** — there is
nothing to trigger, since no driver rating screen exists (§2).

### Is rating optional (skip) or required?

**Optional, for the passenger.** `app/rating/[id].tsx` has an explicit
**Skip** button (`Button variant="ghost"`) that calls the same `handleDone`
but bypasses submission because `rating === 0`. The **Submit Rating** button
is `disabled={rating === 0}`, but skipping entirely is always available and
still routes to `/(tabs)`. No rating is ever forced.

For the driver, the question is moot — there is no rating step to skip or
require.

---

## 6. What Is Missing

### Driver rating categories (Overall, Driving skill, Cleanliness, Communication)

| Piece | Status |
|---|---|
| Driver rating UI/screen | **Missing** — `trip-summary.tsx` has no rating input at all (§2) |
| `src/services/*` insert call for `rated_by: 'driver'` | **Missing** — no code calls this anywhere |
| DB support for a single overall driver→customer rating | **Exists** — `rated_by` column, `drivers_insert_own_rating` RLS policy, and the trigger's `customers.rating`/`total_ratings` branch were added in `migrations/20260722150432_add-driver-rates-customer-aggregate.sql`, but nothing in app code uses them yet |
| DB columns for category sub-scores (driving skill, cleanliness, communication) | **Missing** — `ratings` has only one `rating smallint` column total; there is no per-category column for either direction, and no such columns were added by any migration |

To build this end-to-end: a driver-side rating screen (mirroring
`app/rating/[id].tsx`) wired from `trip-summary.tsx`'s Done flow, a new
`src/services/ratings.ts` function that inserts
`{ order_id, customer_id, driver_id, rating, comment, rated_by: 'driver' }`,
**and** a schema change (new migration) adding whatever category columns are
wanted, since none currently exist for any direction.

### Passenger rating categories (Overall, Punctuality, Communication, Payment)

| Piece | Status |
|---|---|
| Overall rating (customer→driver) | **Exists** — fully wired, §1 |
| Punctuality column | **Missing** |
| Communication column | **Missing** |
| Payment column | **Missing** |
| Any per-category UI (multiple star rows) | **Missing** — `app/rating/[id].tsx` renders exactly one star row bound to one `rating` state value |

Same conclusion as the driver side: the `ratings` table has room for exactly
one score (`rating smallint`) per direction (`rated_by`). Adding named
categories (Punctuality, Communication, Payment, Driving skill,
Cleanliness, or any others) requires a new migration to add columns (or a
normalized child table) — there is currently no category concept anywhere
in the schema, the service layer, or the UI, for either direction.

### Summary

The **only** working piece of the rating system end-to-end is: passenger
submits **one overall 1–5 star score** (+ optional comment) for the driver,
optionally, after trip completion. Everything else — driver-rates-passenger
UI/service, and category-level scoring for either direction — does not
exist in app code. The backend (`rated_by` column, RLS policy, trigger
branch) is ready to accept driver→customer overall ratings, but nothing
calls it.
