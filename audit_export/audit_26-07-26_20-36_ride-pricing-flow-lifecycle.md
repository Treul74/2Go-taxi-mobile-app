# Ride Pricing Flow — Full Lifecycle Vehicle-Class Audit

Date: 2026-07-26
Scope: Read-only trace of vehicle-class handling across the entire ride
lifecycle — vehicle selection, ride request, order creation, driver
acceptance, trip completion, and receipt generation. No code was changed as
part of this task.

Context: two bugs matching this exact failure pattern were found and fixed
earlier today in this session:
- `src/state/rideStore.ts:327` (`requestRide()`) — was calling vehicle-agnostic
  `calculateFare()`, now calls `calculateFareForVehicle(state.selectedVehicle, ...)`.
- `app/(driver)/trip.tsx:239` (`handleSliderComplete()`) — was calling
  vehicle-agnostic `calculateFare()`, now calls
  `calculateFareForVehicle(vehicleType, ...)` with `vehicleType` sourced from
  `useDriverStore`.

This audit verifies those fixes hold end-to-end and checks every other stage
of the lifecycle for the same class of bug.

---

## 1. Lifecycle trace

| Stage | File : Line | Vehicle class source | Fare call | Verdict |
|---|---|---|---|---|
| Vehicle selection (picker preview) | [rideStore.ts:280](src/state/rideStore.ts#L280) `calculateVehicleFares()` | iterates all `vehicleOptions` (all 5 types) | `calculateFareForVehicle(vehicle.id, distanceKm, durationMinutes)` | ✅ Correct |
| Vehicle selection (card render) | [VehicleCard.tsx:22-28](src/features/passenger/components/VehicleCard.tsx#L22-L28), [RidePlannerSheet.tsx:265](src/features/passenger/components/RidePlannerSheet.tsx#L265) | `Record<VehicleType,…>` icon map (TS enforces all 5 keys) + `vehicleOptions.find(id === selectedVehicle)` | display only, reads `estimatedFare` set above | ✅ Correct |
| Ride request (fare persisted at booking) | [rideStore.ts:327](src/state/rideStore.ts#L327) `requestRide()` | `state.selectedVehicle` | `calculateFareForVehicle(state.selectedVehicle, distanceKm, durationMinutes)` | ✅ Correct (fixed this session) |
| Order creation (DB write) | [orders.ts:91-94](src/services/orders.ts#L91-L94) `createOrder()` | passes through `input.vehicleType` / `input.baseFare` / `input.fareAmount` verbatim | no recompute — trusts caller | ✅ Consistent (writes whatever `requestRide()` computed, which is now vehicle-aware) |
| Driver acceptance (matching) | [driverOrders.ts:35-52](src/services/driverOrders.ts#L35-L52) `fetchPendingOrders()` | `.eq('vehicle_type', vehicleType)` — driver's registered type from `useDriverStore` | N/A (no fare calc, filter only) | ✅ Correct — a driver only ever sees orders matching their own registered vehicle type |
| Driver acceptance (claim) | [driverOrders.ts:100-121](src/services/driverOrders.ts#L100-L121) `acceptOrder()` | n/a | only sets `status`/`driver_id`/`accepted_at` — does not touch `vehicle_type` or `fare_amount` | ✅ Correct — original vehicle-aware fare from order creation is preserved untouched |
| Trip completion (fare persisted at completion) | [trip.tsx:239](app/(driver)/trip.tsx#L239) `handleSliderComplete()` | `vehicleType` from `useDriverStore` (guarded: `if (!currentTrip \|\| !vehicleType) return null;`) | `calculateFareForVehicle(vehicleType, distanceKm, durationMin, waitingMin)` | ✅ Correct (fixed this session) |
| Trip completion (DB write) | [driverOrders.ts:201-236](src/services/driverOrders.ts#L201-L236) `completeOrderTrip()` | n/a | writes `fare_amount` verbatim from caller, no recompute | ✅ Consistent (writes whatever `handleSliderComplete()` computed, now vehicle-aware) |
| Receipt — customer | [FareReceiptModal.tsx](src/features/passenger/components/FareReceiptModal.tsx) | n/a | reads `fareReceipt.fare`, itself sourced from the realtime `order_updated` payload's `fare_amount` (the DB value written by `completeOrderTrip`) | ✅ Correct — displays the real persisted (vehicle-aware) fare |
| Receipt — driver | [trip-summary.tsx](app/(driver)/trip-summary.tsx) | n/a | reads `lastTripSummary.fareAmount`, sourced from `completeTrip()`'s `totals.fareAmount` (read back from the same DB row) | ✅ Correct |
| Ride history / activity list | [orders.ts:298](src/services/orders.ts#L298) `fetchCustomerOrderHistory()` | `row.vehicle_type ?? 'economy'` | n/a, display only | ✅ Correct — `'economy'` here is only a null-coalescing fallback for a genuinely missing DB value, not a hardcoded override |

**Net result: with today's two fixes applied, all six stages named in the
brief now use the same vehicle class consistently, and the multiplier is
applied exactly once, at the two places fare is actually persisted
(`requestRide()` and `handleSliderComplete()`). No stage silently reverts to
Economy pricing anymore.**

---

## 2. Multiplier correctness per vehicle class

`VEHICLE_FARE_MULTIPLIERS` ([fareCalculator.ts:53-59](src/lib/fareCalculator.ts#L53-L59)) is typed `Record<VehicleType, number>`, so TypeScript itself guarantees no vehicle type can be added to `VehicleType` without a corresponding multiplier (and vice versa — no orphaned key possible). Verified values:

| Vehicle | Multiplier | Applied in picker preview | Applied at booking | Applied at completion |
|---|---|---|---|---|
| Economy | 1.0 | ✅ | ✅ | ✅ |
| Comfort | 1.5 | ✅ | ✅ | ✅ |
| Bike | 0.5 | ✅ | ✅ | ✅ |
| Tricycle | 0.7 | ✅ | ✅ | ✅ |
| Truck | 2.5 | ✅ | ✅ | ✅ |

All five multiply the same base formula (`baseFare + distanceKm·perKm + durationMinutes·perMinute + waitingMinutes·perMinuteWaiting`, floored at `MIN_FARE`), scaled once via `Math.max(base.subtotal * multiplier, MIN_FARE * multiplier)`. Formula itself was not touched, per instructions.

---

## 3. Remaining gap found: Tricycle is unreachable at driver registration

This is **not** a pricing-formula bug — the multiplier math is correct
end-to-end for all 5 types, as shown above. It's a gap one stage upstream of
everything in this audit's scope, but it defeats the pricing correctness in
practice for one vehicle class:

**[DriverOnboarding.tsx:346-351](src/features/onboarding/DriverOnboarding.tsx#L346-L351)** — the vehicle-type picker a Transporter uses to register offers only:

```ts
const vehicleTypes: { id: VehicleType; label: string }[] = [
  { id: 'economy', label: 'Economy' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'bike', label: 'Bike' },
  { id: 'truck', label: 'Truck' },
];
```

`tricycle` is missing from this list, even though it's a full member of
`VehicleType` and has a correct multiplier (0.7) wired everywhere else. Effect:

- No driver can ever complete onboarding with `vehicle_type = 'tricycle'` in
  the `drivers` table through the normal application flow.
- A customer who selects **Tricycle** in the vehicle picker gets a correctly
  multiplier-priced preview and a correctly priced order — but
  `fetchPendingOrders('tricycle')` ([driverOrders.ts:35-52](src/services/driverOrders.ts#L35-L52)) and `fetchNearbyDriverPushTokens('tricycle', …)` ([driverOrders.ts:65-88](src/services/driverOrders.ts#L65-L88)) will never match a real driver, because no driver row can carry that value.
- The order sits `pending` until it expires (`ORDER_EXPIRY_MINUTES = 3`,
  [orders.ts:24](src/services/orders.ts#L24)) — from the customer's side this looks identical to "no
  drivers nearby," not "this vehicle class doesn't exist yet," which is a
  worse failure mode to debug/support.

**Recommendation:** add `{ id: 'tricycle', label: 'Tricycle' }` to
`vehicleTypes` in `DriverOnboarding.tsx` (not made here — read-only audit).
This is the actual remaining place where "Economy" (or rather, one of the
four reachable types) pricing is effectively all that ever gets used in
production for real Tricycle trips, because no Tricycle driver can exist to
receive them.

---

## 4. Secondary observations (informational, out of strict scope)

- **`AGENTS.md` is stale in two places** relevant to this audit:
  - It still documents the `drivers` table's `vehicle_type` as
    `('rider'/'taxi'/'tricycle')` and the "Naming" section calls these the
    *only* valid values — but the codebase's actual `VehicleType` (used by
    `fareCalculator.ts`, `driverStore.ts`, `DriverOnboarding.tsx`, `orders`
    table writes, etc.) is `'economy' | 'comfort' | 'bike' | 'tricycle' |
    'truck'`. The doc and the code disagree; the code is what's live.
  - The "Fare Formula" section still says "Not yet split by vehicle type —
    known gap to address," which was true before this session's two fixes
    but is no longer accurate.
  - Neither is a runtime bug, but both should be updated so the next
    prompt/agent isn't working from a stale premise.
- **Untracked migrations** (`migrations/20260724010642_...` and
  `...010648_...`, both currently `??` in git status, not applied/wired into
  any app code — confirmed via grep, no `calculate_fare`/`fare_config`
  reference anywhere in `src/`) define a parallel server-side fare formula
  and a `fare_config` table. A prior audit
  (`audit_26-07-26_20-26_fare-formula-parity-check.md`) already verified the
  DB formula is mathematically identical to the client's per-vehicle
  totals — that finding still holds and isn't re-litigated here, just noted
  because it's part of the same fare-calculation surface area.
- **Trust boundary**: `createOrder()` and `completeOrderTrip()` both persist
  whatever `baseFare`/`fareAmount` the client computed, with no server-side
  recomputation/verification against `vehicle_type`. This was flagged in
  `audit_26-07-26_20-19_fare-engine-trust-boundary.md` and is unchanged by
  today's fixes — worth remembering that fixing the vehicle-multiplier bug
  did not also close that separate trust-boundary gap.

---

## 5. Summary

| Check | Result |
|---|---|
| Vehicle selection uses correct multiplier | ✅ |
| Ride request persists correct multiplier | ✅ (fixed this session) |
| Order creation preserves vehicle class/fare | ✅ |
| Driver acceptance matches only same vehicle class, doesn't alter fare | ✅ |
| Trip completion persists correct multiplier | ✅ (fixed this session) |
| Receipt generation (customer + driver) displays the real persisted fare | ✅ |
| All 5 vehicle classes (Economy/Comfort/Bike/Tricycle/Truck) multiplier-correct in code | ✅ |
| Tricycle actually reachable end-to-end in production | ❌ — driver onboarding never offers it, so no tricycle driver can exist to receive tricycle-priced orders |
