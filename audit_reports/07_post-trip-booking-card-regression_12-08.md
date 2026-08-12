# Audit Report: Post-Trip Booking Card Regression

## PART 1 — AUDIT THE FLOW
1. Customer requests a ride, driver accepts, trip starts, trip completes.
2. The realtime order update sets `status` to `'completed'` and active trip is nullified.
3. The customer is shown the `FareReceiptModal`. Upon tapping "OK", they are routed to `/rating/[id]`.
4. In `app/rating/[id].tsx`, the customer can either submit a rating or skip.
5. In both cases (`handleSubmit` and `handleSkip`), the app calls `navigation.reset()` and `router.replace('/discover')`.
6. `router.replace('/discover')` takes the customer back to the home tabs, rendering `CustomerHome`.

## PART 2 — FIND THE STALE STATE
The stale state is the `status` field in `src/state/rideStore.ts`, which remains as `'completed'` because it was never reset to `'idle'`.
Other state such as `orderId`, `orderFare`, `activeTrip` are nullified when the trip completes, but `status` stays `'completed'` and `pickup`/`destination` routes are preserved.

## PART 3 — CHECK THE POST-RATING RESET
When the customer submits the final rating, `handleSubmit` and `handleSkip` in `app/rating/[id].tsx` only navigate away. They completely fail to call `resetRide()` on `rideStore`.
Because `resetRide()` is not called, the state fails to transition from the `'completed'` status to `'idle'` / READY FOR NEW RIDE. The trip information is left populated in the store.

## PART 4 — CHECK THE BOOKING CARD CONDITION
In `src/features/customer/CustomerHome.tsx`:
```tsx
{/* Ride planner (shown when idle or planning) */}
{(status === 'idle' || status === 'planning') && (
  <RidePlannerSheet onRequestRide={handleRequestRide} isMapDragging={isMapDragging} />
)}
```
The booking card (`RidePlannerSheet`) condition requires `status === 'idle'` or `status === 'planning'`.
Because `status` is still `'completed'` after returning from the rating screen, the condition is false.

- **New address entered**: Without the booking card, there's actually no place to easily enter a new address (as the card provides the input fields). If they click a quick destination, the status remains `'completed'`.
- **Why is the booking card hidden?**: Because `status === 'completed'`.

## FIX
Add `resetRide()` calls to `handleSubmit` and `handleSkip` in `app/rating/[id].tsx` to ensure `status` resets to `'idle'` and old route state is cleared.
