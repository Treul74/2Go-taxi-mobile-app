# Fare Engine Trust Boundary — Investigation & Implementation Plan

Date: 2026-07-26
Scope: Read-only investigation of how ride fares are computed, transmitted, and
stored, ahead of a refactor to make the backend (InsForge Postgres) the sole
source of truth for fare values. No code was changed as part of this task.

---

## 1. Current implementation

### 1.1 Client-side fare formula
`src/lib/fareCalculator.ts` holds the only fare formula in the app today:

```
fare = baseFare + (distanceKm * perKm) + (durationMinutes * perMinute)
       + (waitingMinutes * perMinuteWaiting)
fare = max(fare, minimumFare)
```

`PRICING_RATES` is a hardcoded constant, and `VEHICLE_FARE_MULTIPLIERS` scales
the total per vehicle type (`bike` 0.5, `tricycle` 0.7, `economy` 1, `comfort`
1.5, `truck` 2.5). This file runs **on-device**, in both the Customer and
Transporter (driver) apps.

### 1.2 Where the client-computed fare gets written to the database

**Order creation (Customer app)** — `src/state/rideStore.ts:308-336` calls
`getDistanceMatrix()` for distance/duration, runs `calculateFare()` locally,
then `src/services/orders.ts:createOrder()` inserts directly into `orders`:

```
fare_amount: input.fareAmount,   // client-computed
base_fare:   input.baseFare,     // client-computed
```

**Trip completion (Transporter app)** — `app/(driver)/trip.tsx:234-249` takes
the driver's on-device GPS-tracked distance/time/waiting, runs
`calculateFare()` locally again, and `src/state/driverStore.ts` →
`src/services/driverOrders.ts:completeOrderTrip()` updates:

```
fare_amount: fareAmount   // client-computed, this becomes the FINAL fare
```

### 1.3 What the database does with that client-supplied number

From `migrations/20260709075443_add-driver-wallet-ledger-and-trip-completion.sql`:

- `handle_order_acceptance()` (BEFORE UPDATE trigger): computes
  `service_fee_amount = NEW.fare_amount * 0.10` and debits the driver's wallet
  by that amount — using whatever `fare_amount` the **customer's app** wrote
  at order creation.
- `handle_order_completion()` (BEFORE UPDATE trigger): credits the driver's
  wallet the full `NEW.fare_amount` and bumps `drivers.total_earnings` —
  using whatever `fare_amount` the **driver's app** wrote at completion.

From `migrations/20260709044040_add-orders-vehicle-type-and-customer-rls.sql`
and `20260709052838_add-driver-order-matching-and-acceptance.sql`, the RLS
`WITH CHECK` clauses on `orders` only constrain `customer_id`/`driver_id`/
`status` transitions — **`fare_amount`, `base_fare`, `service_fee_pct`, and
`service_fee_amount` are never restricted by RLS or column-level GRANTs**.
InsForge grants broad default INSERT/UPDATE privileges to `authenticated` on
all columns of a public table unless a migration explicitly revokes them
(this pattern is already used deliberately for `drivers` — see the
`REVOKE UPDATE ... GRANT UPDATE (<allowlist>)` block in the same migration —
and for the new `fare_config` table, but was **never applied to `orders`**).

**Net effect: both the initial fare and the final fare that drives real money
(wallet credits, service fee debits, driver lifetime earnings) are 100%
client-supplied and unvalidated today.** A modified client (or a direct API
call with a valid session token) can set `fare_amount` to any value at order
creation, and to any different value again at completion — directly inflating
driver payouts or zeroing out the platform's service fee.

### 1.4 Existing groundwork already in the repo (uncommitted)

Two migrations already exist locally but aren't wired into anything:

- `migrations/20260724010642_create-fare-config-table.sql` — a `fare_config`
  table (rates per vehicle type: `base_fare`, `per_km`, `per_minute`,
  `per_minute_waiting`, `min_fare`, `is_active`), correctly locked down
  (`REVOKE INSERT/UPDATE/DELETE FROM authenticated`, admin-panel-only writes).
  Seeded with values matching today's `PRICING_RATES × VEHICLE_FARE_MULTIPLIERS`.
- `migrations/20260724010648_create-calculate-fare-function.sql` —
  `calculate_fare_breakdown(vehicle_type, distance_km, duration_minutes,
  waiting_minutes)` and a `calculate_fare(...)` NUMERIC wrapper, both
  `GRANT EXECUTE ... TO authenticated`.

This is a solid foundation for a **read-only pricing preview** RPC, but on its
own it changes nothing: nothing stops a client from calling `calculate_fare`
to get a "fair" number for display and then writing a completely different
number into `orders.fare_amount` on insert/update, since those columns still
have open write access and the completion/acceptance triggers still trust
`NEW.fare_amount` unconditionally.

### 1.5 Fields the task asks to stop trusting from the client

| Field | Sent today? | Where |
|---|---|---|
| `fareAmount` / `fare_amount` | ✅ Yes | order creation + trip completion |
| `totalFare` | ✅ Yes (as `fareData.total` → `fare_amount`) | trip completion receipt |
| `driverEarnings` | ⚠️ Not sent explicitly, but implied — wallet credit = `NEW.fare_amount` in full | trigger, driven by client value |
| `serviceFee` / `service_fee_amount` | ⚠️ Not sent directly by client, but *derived server-side from a client-controlled `fare_amount`* | acceptance trigger |
| `distanceCost` / `distance_fare` | ✅ Computed client-side, not persisted as its own column today (only the summed `fare_amount`/`base_fare` are persisted) | fareCalculator, receipt |
| `timeCost` / `time_fare` | ✅ Same as above | fareCalculator, receipt |
| `waitingCost` / `waiting_fare` | ✅ Same as above | fareCalculator, receipt |
| `surgeAmount` | ❌ Doesn't exist anywhere yet — no surge pricing implemented | — |

So the real gap isn't just "stop sending `fare_amount`" — the client
currently is the *only* place the fare is ever computed, and the database has
no columns to store a full breakdown even if it wanted to.

---

## 2. What must change

1. **Stop the client from ever writing money fields.** Revoke column-level
   write access to all fare/earnings columns on `orders` and `drivers` from
   `authenticated`, the same pattern already used for `drivers.wallet_balance`
   et al. The client should not be able to set `fare_amount`, `base_fare`,
   `service_fee_pct`, `service_fee_amount`, or (new) `driver_earnings`,
   `distance_fare`, `time_fare`, `waiting_fare`, `surge_amount` directly —
   full stop, not just "the app UI doesn't currently send those."
2. **Move fare computation server-side, for both the estimate and the final
   fare.** The existing `calculate_fare_breakdown()` RPC already does the
   estimate math; it needs to become the *only* path, invoked automatically
   by the database itself rather than merely available for the client to call
   and then ignore.
3. **Store the full breakdown**, not just a total, so it can be audited,
   refunded, and matches what the receipt UI already displays
   (`base_fare`, `distance_fare`, `time_fare`, `waiting_fare`,
   `vehicle_multiplier`, `service_fee_amount`, `driver_earnings`, `fare_amount`).
4. **Compute the final fare from server-trusted trip facts, not a client
   number.** At completion, distance/duration/waiting must come from data the
   server can verify or reasonably trust more than a bare client-supplied
   total — at minimum, computed from timestamps already server-stamped
   (`trip_started_at`, `completed_at` are already server-set) plus a
   driver-reported distance, with sanity bounds. This is the one place a pure
   "just move the formula into a trigger" isn't sufficient by itself — see
   Phase 3 below for the tightened approach.
5. **Keep `fare_config` as the single rate table** (already correctly locked
   down) so pricing changes go through the admin panel, not app releases.

---

## 3. Implementation plan

### Phase 1 — Database: breakdown columns + lock down write access
- Add columns to `orders`: `distance_fare`, `time_fare`, `waiting_fare`,
  `vehicle_multiplier`, `driver_earnings`, `surge_amount` (numeric, default 0;
  `base_fare`, `fare_amount`, `service_fee_pct`, `service_fee_amount` already
  exist).
- `REVOKE UPDATE ON public.orders FROM authenticated;` then `GRANT UPDATE
  (<explicit allowlist>)` for only the columns each role legitimately needs
  to touch (customer: pickup edits, cancellation; driver: telemetry,
  arrival/status transitions) — mirroring the `drivers` table pattern in
  `20260709075443`. No money column goes in either allowlist.
- Same treatment on `INSERT`: money columns dropped from what
  `customers_insert_own_orders` can supply; the row starts with fare columns
  NULL/0 and gets populated server-side.

### Phase 2 — Server-side fare calculation at order creation
- Change the customer insert path to send only: `pickup_lat/lng`,
  `dropoff_lat/lng`, `vehicle_type`, `estimated_distance_km`,
  `estimated_duration_minutes`, payment method. (Estimated distance/duration
  stay client-supplied — they come from Google Distance Matrix and are only
  used to *offer* a price before a driver is even assigned; they are not
  money fields themselves.)
- Add a `BEFORE INSERT` trigger on `orders` that calls
  `calculate_fare_breakdown()` using those estimate inputs and stamps
  `base_fare`, `distance_fare`, `time_fare`, `waiting_fare`,
  `vehicle_multiplier`, `fare_amount` onto `NEW` itself — so even though the
  client can't write those columns, it also doesn't need to: the trigger
  fills them in before the row lands, and `.select()` on the insert response
  gives the client back the authoritative number to show in the UI.
- Update `src/services/orders.ts` (`CreateOrderInput`) and
  `src/state/rideStore.ts` to drop `baseFare`/`fareAmount` from the insert
  payload and read the authoritative `fare_amount` back from the insert
  response instead of trusting its own local calculation.

### Phase 3 — Server-side fare calculation at trip completion
This is the highest-value fix, since it's what currently drives real wallet
credits.
- Driver app stops computing/sending `fareAmount` on completion. It still
  needs to report *trip facts* the server can't observe directly — realistic
  driven distance (from the GPS trail already tracked in
  `distanceTraveledRef`) and waiting minutes — but no money value.
- Add columns to capture these facts if not already present: e.g.
  `actual_distance_km`, `actual_waiting_minutes` (duration is derivable from
  `trip_started_at`/`completed_at`, both already server-stamped).
- Replace the client-fare write in `completeOrderTrip()` with an update that
  only sets `status = 'completed'` plus the two trip-fact columns.
- Extend `handle_order_completion()` (the existing BEFORE UPDATE trigger) to:
  1. Compute `duration_minutes` itself from `now() - trip_started_at`
     (ignoring any client-sent duration).
  2. Clamp `NEW.actual_distance_km`/`actual_waiting_minutes` against sane
     bounds (e.g. reject/clamp against the original estimated distance by
     some tolerance factor, or at minimum reject negative/absurd values) —
     this is the guard that stops a modified client from reporting
     "500km driven in 2 minutes" to farm wallet credits.
  3. Call `calculate_fare_breakdown()` with the server-derived
     distance/duration/waiting and stamp the full breakdown + `fare_amount`
     onto `NEW`.
  4. Compute `driver_earnings = fare_amount - service_fee_amount` and stamp
     it too, so it's stored explicitly rather than only derivable.
  5. Keep crediting the wallet via `apply_wallet_transaction()`, now using
     the server-computed `NEW.fare_amount`/`NEW.driver_earnings` instead of
     a client value.
- Update `app/(driver)/trip.tsx` and `src/state/driverStore.ts` to stop
  calling `calculateFare()` for the authoritative total; keep a local
  estimate only if the receipt UI needs to show *something* before the
  server responds, then replace it with the row the update returns.

### Phase 4 — Service fee at acceptance
- `handle_order_acceptance()` already computes `service_fee_amount` from
  `NEW.fare_amount` server-side at the trigger level — this is already
  correct in principle *once* `fare_amount` itself is trustworthy (Phase 2
  makes that true). No client input is involved here today; just confirm the
  10% constant should keep living here or move to `fare_config` as a
  platform-wide commission rate (recommend moving it to `fare_config` so
  commission is also admin-configurable per vehicle type, not a hardcoded
  `0.10` in a trigger).

### Phase 5 — Type/service layer cleanup
- `src/lib/fareCalculator.ts`: keep `calculateFare`/`calculateFareForVehicle`
  only as a **local preview/display estimate** (e.g. showing a price range
  before the user taps "Request"), clearly comment that it is never the
  value written to the database. Alternatively, replace its internal
  constants with a read of `fare_config` (already `SELECT`-able by
  `authenticated`) so even the preview uses admin-set rates instead of a
  hardcoded duplicate — closes the "two sources of truth for rates" gap.
- Update `CreateOrderInput`/`CompletedOrderTotals` types and any other
  TypeScript interfaces to drop the money fields the client no longer sends.
- Update `OrderUpdatePayload`/`notify_order_update()` broadcast payload to
  include the new breakdown fields so the customer's live trip screen and
  receipt can render them without a second fetch (mirrors how `fare_amount`
  was already added to that payload in `20260709075443`).

### Phase 6 — Migration sequencing (new files, in order)
1. `add-order-fare-breakdown-columns.sql` — new columns on `orders`.
2. `lock-down-orders-money-columns.sql` — REVOKE/GRANT allowlists on
   `orders` for both `authenticated` INSERT and UPDATE.
3. `add-order-creation-fare-trigger.sql` — BEFORE INSERT trigger using
   `calculate_fare_breakdown()`.
4. `rework-order-completion-fare-trigger.sql` — replace
   `handle_order_completion()` with the server-derived-inputs version;
   add `actual_distance_km`/`actual_waiting_minutes` columns.
5. (optional) `move-commission-rate-to-fare-config.sql` — add a
   `commission_pct` column to `fare_config`, update
   `handle_order_acceptance()` to read it instead of the hardcoded `0.10`.

### Phase 7 — App changes (after migrations are applied)
- `src/services/orders.ts`, `src/state/rideStore.ts` — Phase 2 changes.
- `src/services/driverOrders.ts`, `src/state/driverStore.ts`,
  `app/(driver)/trip.tsx` — Phase 3 changes.
- `src/lib/fareCalculator.ts` — Phase 5 preview-only reframe.
- Any receipt/summary screens reading the new breakdown columns
  (`app/(driver)/trip-summary.tsx`, `app/ride/[id].tsx`, rating/receipt
  screens) — read server breakdown instead of local calc.

### Phase 8 — Verification
- Confirm via a non-admin authenticated session (e.g. `psql` with an
  `authenticated` JWT, or direct REST call) that `UPDATE orders SET
  fare_amount = ...` and `INSERT ... fare_amount ...` are now rejected by
  Postgres grants, not just ignored by the app.
- Walk a full trip end-to-end in the running app (per the "test before
  reporting done" rule) and confirm the receipt, wallet balance, and
  `wallet_transactions` ledger all reflect the server-computed number, not
  whatever a tampered request might send.

---

## 4. Open questions before implementation

- **Tolerance/clamping rule for `actual_distance_km`/waiting minutes at
  completion** — how far can a driver's reported distance diverge from the
  original route estimate before it should be rejected vs. clamped vs.
  flagged for review? Needs a product decision, not just an engineering one.
- **Commission rate**: keep the `0.10` hardcoded in the trigger, or move it
  into `fare_config` (recommended, since `fare_config` already exists
  specifically to avoid hardcoded pricing constants)?
- **Surge pricing**: task lists `surgeAmount` as a field to never trust from
  the client, but no surge logic exists anywhere yet. Recommend adding the
  column now (default 0) so the schema is ready, but treat actually
  *computing* surge as out of scope until that feature is designed.
