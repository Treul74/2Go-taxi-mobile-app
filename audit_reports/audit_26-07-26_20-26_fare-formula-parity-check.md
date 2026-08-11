# Fare Formula Parity Check — Mobile App vs Database

Date: 2026-07-26
Scope: Read-only comparison of `src/lib/fareCalculator.ts` against
`fare_config` + `calculate_fare_breakdown()`/`calculate_fare()`. No code was
changed as part of this task.

Verdict: **the grand totals are mathematically identical** for a given
vehicle type, distance, duration, and waiting time — but there are four real
differences, one of which means today's app **does not actually apply the
vehicle-aware formula at all** where it counts (order creation and trip
completion).

---

## 1. Rate tables — identical

Client `PRICING_RATES` (`src/lib/fareCalculator.ts`):
```
BASE_FARE: 25, PER_KM: 8, PER_MINUTE: 2, PER_MINUTE_WAITING: 1.5, MIN_FARE: 35
```

Client `VEHICLE_FARE_MULTIPLIERS`:
```
bike: 0.5, tricycle: 0.7, economy: 1, comfort: 1.5, truck: 2.5
```

DB `fare_config` seed rows (`migrations/20260724010642_...sql`) are exactly
`PRICING_RATES × VEHICLE_FARE_MULTIPLIERS`, per row:

| vehicle_type | base_fare | per_km | per_minute | per_minute_waiting | min_fare | multiplier implied |
|---|---|---|---|---|---|---|
| economy | 25 | 8 | 2 | 1.5 | 35 | 1.0 ✓ |
| comfort | 37.5 | 12 | 3 | 2.25 | 52.5 | 1.5 ✓ |
| bike | 12.5 | 4 | 1 | 0.75 | 17.5 | 0.5 ✓ |
| tricycle | 17.5 | 5.6 | 1.4 | 1.05 | 24.5 | 0.7 ✓ |
| truck | 62.5 | 20 | 5 | 3.75 | 87.5 | 2.5 ✓ |

Every value checks out exactly against `25×m`, `8×m`, `2×m`, `1.5×m`,
`35×m`. **No discrepancy here.**

## 2. Grand total formula — identical (algebraically proven)

Client (`calculateFareForVehicle`):
```
base   = calculateFare(distanceKm, durationMinutes, waitingMinutes)   // uses unscaled PRICING_RATES
total  = max(base.subtotal * multiplier, MIN_FARE * multiplier)
       = multiplier * max(base.subtotal, MIN_FARE)          // multiplier > 0, distributes
       = multiplier * calculateFare(...).total
       = multiplier * max(25 + 8·d + 2·t + 1.5·w, 35)
```

DB (`calculate_fare_breakdown`, per-vehicle config rates already = `25m, 8m, 2m, 1.5m, 35m`):
```
subtotal = base_fare_m + per_km_m·d + per_minute_m·t + per_minute_waiting_m·w
         = m·(25 + 8·d + 2·t + 1.5·w)
total    = GREATEST(subtotal, min_fare_m) = m · max(25+8d+2t+1.5w, 35)
```

Both reduce to the same expression: **`total = multiplier × max(25 + 8·distanceKm + 2·durationMinutes + 1.5·waitingMinutes, 35)`**. Confirmed identical for all five vehicle types. **No discrepancy in the total, in isolation.**

## 3. Differences found

### 3.1 — Critical: the app doesn't actually call the vehicle-aware formula where fare gets persisted
This is the important finding. `calculateFareForVehicle()` (the one that
matches the DB) is only used for the **vehicle-picker preview**:
- `src/state/rideStore.ts:280` — `calculateVehicleFares()`, populates
  `vehicleOptions[].estimatedFare` for display only.

But the two places that actually **write `fare_amount` to the database**
both call the *vehicle-agnostic* `calculateFare()` directly, with no
multiplier applied at all:
- `src/state/rideStore.ts:327` — `requestRide()`:
  `const fare = calculateFare(distanceKm, durationMinutes);` then sends
  `baseFare: fare.baseFare, fareAmount: fare.total` regardless of
  `state.selectedVehicle`.
- `app/(driver)/trip.tsx:238` — `handleSliderComplete()`:
  `const fareData = calculateFare(distanceKm, durationMin, waitingMin);`
  again with no vehicle multiplier, regardless of the trip's vehicle type.

**Effect:** for any ride booked as `bike`, `tricycle`, `comfort`, or `truck`,
the fare the customer sees in the vehicle picker (scaled) is *not* the fare
actually charged/stored at booking or completion (always the 1.0×/economy
rate). E.g. a `truck` ride previews at 2.5× but is actually booked and
charged at 1×. This is a pre-existing bug in the app, independent of the DB
work — and it means **today's real `orders.fare_amount` rows do not match
what `calculate_fare()`/`calculate_fare_breakdown()` would produce** for any
non-economy `vehicle_type`, even though the formulas themselves agree.

If Phase 2/3 of the refactor plan wires `calculate_fare_breakdown()` into
insert/completion triggers keyed off `vehicle_type`, the newly-computed fares
will match the picker preview (correct) but will **differ from what the
current buggy client would have charged** for non-economy vehicles — worth
flagging as an intentional behavior change, not a regression.

### 3.2 — Breakdown line items don't match, even though totals do
`calculateFareForVehicle()` returns `baseFare`, `distanceFare`, `timeFare`,
`waitingFare`, `subtotal` **unscaled** (straight from the inner
`calculateFare()` call using base `PRICING_RATES`) — only `.total` gets
multiplied. Example for a `comfort` ride: client breakdown shows
`baseFare: 25`, but the DB's `calculate_fare_breakdown()` returns
`base_fare: 37.5` for `comfort` (since it reads the already-scaled
`fare_config` row). Same divergence applies to `distance_fare`, `time_fare`,
`waiting_fare`.

Net: **totals agree, but a fare breakdown UI fed by the client's
`calculateFareForVehicle()` and one fed by the DB's
`calculate_fare_breakdown()` would show different numbers for every
non-economy vehicle type**, despite both landing on the same grand total.

### 3.3 — Rounding precision
Client rounds `distanceFare`, `timeFare`, `waitingFare`, `subtotal`, `total`
to 2 decimal places (`parseFloat(x.toFixed(2))`) before returning — but
computes `subtotal`/`total` internally from the *unrounded* raw values first
(no compounding rounding error). The DB function performs no rounding at
all — `calculate_fare_breakdown()` returns raw `NUMERIC` values at full
precision (e.g. `8.333333... km × 8 = 66.666664`, not `66.67`). Not a formula
bug, but real output will differ at the cents level unless the DB rounds to
2dp on the way out (recommend `ROUND(x, 2)` on each returned column) or the
app rounds on read — currently neither side is guaranteed to match the
other's displayed number to the cent.

### 3.4 — No client-side equivalent of `is_active` / "not found" handling
`calculate_fare_breakdown()` raises an exception if no **active**
`fare_config` row exists for the given `vehicle_type` (e.g. an admin
disables a vehicle type). The client's `VEHICLE_FARE_MULTIPLIERS` is a static
map with no "inactive" concept — the vehicle picker would still show and
price that vehicle type client-side even if the backend would now reject it.
Not a formula mismatch, just a gap the client will need to handle once the
DB function becomes load-bearing (e.g. catch the RPC/insert error and hide
that vehicle option).

---

## 2. Summary

| Check | Match? |
|---|---|
| Base Fare (rate table) | ✅ Identical |
| Distance Charge (rate) | ✅ Identical |
| Time Charge (rate) | ✅ Identical |
| Waiting Charge (rate) | ✅ Identical |
| Minimum Fare (rate) | ✅ Identical |
| Vehicle Multiplier (rate table → fare_config rows) | ✅ Identical |
| Grand total formula (algebraic) | ✅ Identical |
| Grand total as **actually persisted today** (order creation / trip completion) | ❌ Diverges for bike/tricycle/comfort/truck — vehicle multiplier is silently skipped at both write sites |
| Breakdown line items (base/distance/time/waiting shown individually) | ❌ Diverges for any non-economy vehicle — client leaves them unscaled, DB scales them |
| Output rounding/precision | ❌ Diverges — client rounds to 2dp, DB returns full precision |

**Recommendation:** do not wire `calculate_fare_breakdown()` into the
insert/completion triggers yet without deciding how to handle 3.1 (intended
behavior change for non-economy vehicles — likely desired, since it fixes a
real bug, but should be called out explicitly to the user/product owner
before it ships) and 3.3 (add `ROUND(..., 2)` to the DB function's returned
columns so its output is cent-exact and comparable to what the app currently
displays). No code was modified — holding per instructions until formulas
are confirmed to match exactly, including these edge cases.
