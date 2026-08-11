# Fare / Vehicle-Class / Service-Area — Database Migration Cross-Check

Date: 2026-07-28
Scope: Read-only audit cross-checking the mobile app's fare calculation,
vehicle classes, and service-area logic against what currently exists in the
InsForge database, to find any remaining local/hardcoded logic that should
now come from the backend instead. No code was changed as part of this task.
Live DB schema was queried directly via `npx @insforge/cli db query` in
addition to reading migration files and app source, since prior audits in
this repo have found the migrations folder alone to be an incomplete picture
(columns/tables added "out-of-band").

---

## 1. Fare Calculation Source of Truth

### `src/lib/fareCalculator.ts` — current contents

Still a full local calculation, **but now explicitly documented and used as
preview-only**, not the source of truth for money that gets persisted:

```ts
/**
 * Fare Calculation Utility
 * Standardized pricing model for the app
 *
 * Preview only. The database (calculate_fare_breakdown(), driven by
 * fare_config) is the sole source of truth for any fare that gets charged or
 * stored — see the BEFORE INSERT/UPDATE triggers on orders. This file exists
 * to price the vehicle picker and other pre-booking UI before the backend
 * has responded; never wire its output into an order insert/update again.
 */

export const PRICING_RATES = {
    BASE_FARE: 25, PER_KM: 8, PER_MINUTE: 2, PER_MINUTE_WAITING: 1.5, MIN_FARE: 35,
};

export const VEHICLE_FARE_MULTIPLIERS: Record<VehicleType, number> = {
    bike: 0.5, tricycle: 0.7, economy: 1, comfort: 1.5, truck: 2.5,
};
```

**Finding — stale comment:** the header says the DB source of truth is
"driven by `fare_config`". `fare_config` was dropped on 2026-07-28
(`migrations/20260728183527_merge-fare-config-into-vehicle-classes.sql`) and
merged into `vehicle_classes`. The comment should say `vehicle_classes`, not
`fare_config`. Not a functional bug (nothing in the app queries either name),
but it will mislead the next person who reads this file.

### Every fare calculation/estimation call site (exhaustive grep)

| File : Line | Call | Persisted to DB? |
|---|---|---|
| [fareCalculator.ts:37](src/lib/fareCalculator.ts#L37) | `calculateFare()` — definition | No — internal helper, only called by `calculateFareForVehicle` |
| [fareCalculator.ts:74](src/lib/fareCalculator.ts#L74) | `calculateFareForVehicle()` — definition | No |
| [rideStore.ts:280](src/state/rideStore.ts#L280) (`calculateVehicleFares()`) | `calculateFareForVehicle(vehicle.id, distanceKm, durationMinutes)` | **No** — display-only, populates `vehicleOptions[].estimatedFare` for the picker preview |
| [RidePlannerSheet.tsx](src/features/passenger/components/RidePlannerSheet.tsx), [VehicleCard.tsx](src/features/passenger/components/VehicleCard.tsx) | reads `vehicle.estimatedFare` | No — display only |

**No app code computes fare and writes it to the database anymore.** The two
call sites that used to do this (`rideStore.ts:327` `requestRide()`, and
`app/(driver)/trip.tsx:239` `handleSliderComplete()`) were changed (currently
uncommitted working-tree changes — see `git diff`) to stop calling
`calculateFare()`/`calculateFareForVehicle()` entirely:

- `requestRide()` now sends only `distanceKm`/`durationMinutes` (trip
  estimate inputs) to `createOrder()` — no `baseFare`/`fareAmount`.
- `handleSliderComplete()` now sends only `distance`/`waitingDuration`/
  `completedAt` (trip facts) to `completeTrip()` — no computed fare at all.

This matches Phase 2/3 of the previously-recommended trust-boundary fix
(`audit_26-07-26_20-19_fare-engine-trust-boundary.md`) — it has been
**implemented since that audit**, in the currently uncommitted changes to
`app/(driver)/trip.tsx`, `src/services/orders.ts`, `src/services/
driverOrders.ts`, `src/state/rideStore.ts`, `src/state/driverStore.ts`,
`src/types/index.ts`.

### Does `fare_config` (or equivalent) exist in InsForge?

**No — it was dropped.** Its columns now live directly on `vehicle_classes`
(confirmed live via `db query` against `information_schema.columns`):

```
base_fare, min_fare, per_km, per_minute, per_minute_waiting,
cancellation_fee, night_rate_multiplier, peak_multiplier,
vehicle_multiplier, platform_commission_pct, driver_commission_pct,
vehicle_type
```

So yes — a rate table per vehicle class exists, it just isn't called
`fare_config` anymore; it's `vehicle_classes`.

### Does it include night/peak surcharge multiplier columns?

**Yes** — `night_rate_multiplier` and `peak_multiplier` are both present on
`vehicle_classes` (confirmed live). See §4 for whether they're ever read.

### Is `PRICING_RATES`/`VEHICLE_FARE_MULTIPLIERS` still used instead of the DB?

**Yes, deliberately, for the pre-booking preview only.**
`src/lib/fareCalculator.ts` still hardcodes `PRICING_RATES` and
`VEHICLE_FARE_MULTIPLIERS` — the vehicle-picker's live-updating price
(`calculateVehicleFares()`) is computed from these local constants, not from
a query against `vehicle_classes`/`vehicle_classes_public`. The comment
frames this as intentional ("prices the vehicle picker... before the backend
has responded"), and the actual charge is now server-computed and
overwrites this estimate at booking/completion — so it is not a trust-boundary
bug. But it **is** a real remaining duplication: if an admin changes a rate
in `vehicle_classes` (e.g. raises `per_km` for `truck`), the picker preview
will silently keep showing the old hardcoded number until someone also edits
`fareCalculator.ts` by hand. This is exactly the "two sources of truth for
rates" gap flagged in Phase 5 of the trust-boundary audit's recommendations,
and it has **not** been closed — the client preview was never wired to read
`vehicle_classes_public` (which now carries `base_fare`/`per_km`/`per_minute`/
`per_minute_waiting`/`min_fare`/`vehicle_multiplier`, i.e. everything the
preview needs).

### Is the night/peak surcharge multiplier actually applied anywhere?

**No — confirmed dormant, in both the database and the app.** See §4 for the
full detail; the short version: the columns exist, nothing reads them.

---

## 2. Vehicle Classes

### All columns on `vehicle_classes` (live, via `db query`)

```
id, name, description, icon_svg_url, icon_svg_key, max_capacity, status,
display_order, created_at, updated_at,
vehicle_type, base_fare, min_fare, per_km, per_minute, per_minute_waiting,
cancellation_fee, night_rate_multiplier, peak_multiplier, vehicle_multiplier,
platform_commission_pct, driver_commission_pct
```

The base table is admin-only (RLS `is_admin()`); Customer/Transporter apps
are meant to read through `public.vehicle_classes_public`, a view that
projects everything except `platform_commission_pct`/`driver_commission_pct`,
filtered to `status = 'active'`.

### Does the vehicle picker read from this table? — **No.**

`src/state/rideStore.ts:129-175` (`defaultVehicleOptions`) is a fully
hardcoded array — not fetched from the database at all:

```ts
// Mock vehicle options
const defaultVehicleOptions: VehicleOption[] = [
  { id: 'economy',  name: 'Economy',  description: 'Affordable everyday rides', icon: 'car',      estimatedFare: 35,  eta: 5,  capacity: 4 },
  { id: 'comfort',  name: 'Comfort',  description: 'Premium vehicles',          icon: 'star',      estimatedFare: 65,  eta: 7,  capacity: 4 },
  { id: 'bike',     name: 'Bike',     description: 'Quick solo trips',          icon: 'bicycle',   estimatedFare: 18,  eta: 3,  capacity: 1 },
  { id: 'tricycle', name: 'Tricycle', description: 'For short trips & small loads', icon: 'navigate', estimatedFare: 25, eta: 6, capacity: 3 },
  { id: 'truck',    name: 'Truck',    description: 'For cargo & deliveries',    icon: 'truck',     estimatedFare: 120, eta: 15, capacity: 0 },
];
```

This is assigned directly as the store's initial `vehicleOptions` state
([rideStore.ts:201](src/state/rideStore.ts#L201)) and is what
`RidePlannerSheet.tsx`/`VehicleCard.tsx` render — only `estimatedFare` gets
overwritten later by `calculateVehicleFares()` (still from the hardcoded
`fareCalculator.ts` constants, not the DB — see §1). **`name`, `description`,
`icon`, `capacity`, and `eta` are never replaced with anything from
`vehicle_classes` at any point.**

Nowhere in `src/` or `app/` does any file query
`vehicle_classes_public`/`vehicle_classes` — confirmed via repo-wide grep,
zero matches outside the migration file that created the view. The view
exists and is grantable to `anon`/`authenticated`, but is completely unused
by the mobile app. Every field it was designed to expose for exactly this
purpose (`name`, `description`, `icon_svg_url`/`icon_svg_key`,
`max_capacity`, `display_order`, plus all the rate columns) sits unread.

### Does `VEHICLE_FARE_MULTIPLIERS` (or similar) still exist and get used?

**Yes.** `VEHICLE_FARE_MULTIPLIERS` in `fareCalculator.ts` (§1) is still
exported and still used by `calculateFareForVehicle()` for the preview.

**A second, separate hardcoded vehicle-keyed constant also exists:**
`src/features/passenger/components/VehicleCard.tsx:22-28`:

```ts
const vehicleIcons: Record<VehicleType, keyof typeof Ionicons.glyphMap> = {
  economy: 'car-outline', comfort: 'car-sport-outline', bike: 'bicycle-outline',
  tricycle: 'navigate-outline', truck: 'bus-outline',
};
```

This duplicates the icon selection that `vehicle_classes.icon_svg_url`/
`icon_svg_key` was added to the database specifically to hold. It isn't a
pricing constant, but it's the same class of "should come from the DB, is
instead hardcoded in the client" gap named in the task brief for vehicle
classes.

---

## 3. Service Areas Enforcement

### `service_areas` table structure (live, via `db query`)

```
id, name, area_code, polygon_coordinates (jsonb), status, estimated_demand,
fleet_size, base_fare_multiplier, service_types (array),
vehicle_type_ids (array), province, district, center_lat, center_lng,
area_type, radius_meters, created_at, updated_at
```

The table exists in the live database and is fully populated with the
schema the task describes (polygon coordinates, status, area type, plus a
`base_fare_multiplier` that isn't touched by anything in §1/§4 either).
**There is no migration file for this table in this repo's `migrations/`
folder** — it was created out-of-band, same pattern already noted for
`vehicle_classes`/`admins`/etc. in prior audits.

### Booking-location vs. service-area validation — **confirmed: none exists, anywhere.**

- **Client-side:** repo-wide case-insensitive grep for `service_area`,
  `serviceArea`, and `polygon` across `src/` and `app/` returns **zero**
  matches for anything service-area-related. (The one incidental
  `polygon`-adjacent hit, `Map.native.tsx`'s `Polygon` import, is the
  `react-native-maps` H3 debug-grid overlay — unrelated to service areas.)
  No screen in the booking flow (`RidePlannerSheet`, `LocationAutocomplete`,
  `LocationSearchModal`, `MapPickerModal`) ever reads `service_areas` or
  performs a point-in-polygon check against pickup/dropoff coordinates.
- **Server-side:** queried `information_schema.triggers` on `orders` directly
  — the only 7 triggers present are for realtime broadcast, fare computation
  (creation/acceptance/completion), and `updated_at` bookkeeping. None
  reference `service_areas`. Also searched every Postgres function body
  (`pg_proc.prosrc ILIKE '%service_area%'`) across the entire database —
  **zero matches**. No RLS policy, trigger, or function anywhere touches
  `service_areas`.

**This is confirmed as the critical missing piece the task anticipated: a
booking today can be created with a pickup/dropoff anywhere on Earth, and
nothing — not the app, not RLS, not a trigger — checks it against any
`service_areas` polygon before the order is accepted into `orders`.** The
table holds real configured areas (province/district/radius/polygon data)
that currently influence nothing.

### Where would this validation need to live?

Both, for the reasons below — client-side alone is not a security boundary,
and server-side alone gives a worse UX:

- **Server-side (required, not optional):** a `BEFORE INSERT` trigger on
  `orders` (the same pattern already used for
  `handle_order_creation_fare()`) doing a point-in-polygon check of
  `pickup_lat/lng` (and optionally `dropoff_lat/lng`) against active
  `service_areas.polygon_coordinates`, `RAISE EXCEPTION` if outside every
  active area. This is the only place that can't be bypassed by a modified
  client or a direct API call — matches the trust-boundary reasoning already
  applied to fare in this same set of migrations. Postgres has no built-in
  generic polygon type match for arbitrary `jsonb` coordinates without a
  helper (e.g. casting to `polygon`/using PostGIS `ST_Contains` if the
  project has PostGIS, or a plpgsql ray-casting function otherwise) — this
  is an implementation detail to resolve, not a blocker to the requirement.
- **Client-side (recommended in addition, not instead):** a pre-booking
  check in `RidePlannerSheet`/pickup selection so the customer sees "Service
  not available in this area" immediately, before submitting a request that
  the server would reject anyway. Without this, a booking outside coverage
  would only fail after the user finishes the whole planning flow and taps
  request, which is a worse experience than catching it at pickup-pin-drop
  time. This client check is a convenience/UX layer only — it must not be
  relied on as the actual enforcement, since it's trivially bypassable.

---

## 4. Night/Peak Hour Surcharge

### Where the columns live

`vehicle_classes.night_rate_multiplier` and `vehicle_classes.peak_multiplier`
(both `numeric`, both `CHECK (... > 0)`, both default `1.0`) — confirmed
live and carried over intact from the dropped `fare_config` table by the
2026-07-28 merge migration.

### Does any time-of-day logic exist to determine surcharge eligibility?

**No — confirmed absent from both the app and the database.**

- **Database:** `calculate_fare_breakdown(p_vehicle_type, p_distance_km,
  p_duration_minutes, p_waiting_minutes)` — read directly from the live
  function definition — takes **no time/timestamp parameter at all**. Its
  body does `SELECT * INTO v_config FROM vehicle_classes ...` (which pulls
  `night_rate_multiplier`/`peak_multiplier` into the local record along with
  everything else) but then only ever references `v_config.base_fare`,
  `.per_km`, `.per_minute`, `.per_minute_waiting`, `.min_fare`, and
  `.vehicle_multiplier` in the actual math:

  ```sql
  v_distance_fare := p_distance_km * v_config.per_km;
  v_time_fare := p_duration_minutes * v_config.per_minute;
  v_waiting_fare := p_waiting_minutes * v_config.per_minute_waiting;
  v_subtotal := v_config.base_fare + v_distance_fare + v_time_fare + v_waiting_fare;
  ...
  v_config.vehicle_multiplier * GREATEST(v_subtotal, v_config.min_fare)
  ```

  `night_rate_multiplier` and `peak_multiplier` are read into memory by the
  `SELECT *` and then never used again — there is no `now()`, `EXTRACT(HOUR
  FROM ...)`, or any conditional in this function or in
  `handle_order_creation_fare()`/`handle_order_completion()` (the two
  triggers that call it) that would decide whether "night" or "peak"
  applies.
- **App:** repo-wide grep for `night`, `peak`, `surcharge` (case-insensitive)
  across `src/` matches only the migration/audit files already covered
  above — zero hits in any `.ts`/`.tsx` app source file. The only
  `getHours()` usage anywhere in the app is
  [ScheduleRideModal.tsx:81,89](src/features/passenger/components/ScheduleRideModal.tsx#L81),
  which is unrelated — it's used to default/validate a user-picked schedule
  time for a future ride, not to detect the current time for pricing.

### Does the fare calculation factor in current time at all?

**No, at neither layer.** `calculate_fare_breakdown()` has no time input and
no time-based branch; `fareCalculator.ts`'s client preview likewise never
reads `Date.now()`/`new Date()` anywhere in its formula. Every ride today —
regardless of what hour, day, or demand condition it's booked in — is priced
identically. The `night_rate_multiplier`/`peak_multiplier` columns are
populated (default `1.0`, i.e. inert even if read) but structurally
unreachable: **this is dead configuration, not a bug that's merely disabled**
— there's no code path in the entire system, client or server, that could
apply them even if their default values were changed to something other than
`1.0`.

---

## 5. General Migration Check

### Remaining hardcoded pricing/fare/vehicle-type constants in the mobile app

| Constant | File | Status |
|---|---|---|
| `PRICING_RATES` | [fareCalculator.ts:23](src/lib/fareCalculator.ts#L23) | Hardcoded; used only for the pre-booking preview (not persisted) — but not read from `vehicle_classes`, so it will drift silently from admin-set rates over time |
| `VEHICLE_FARE_MULTIPLIERS` | [fareCalculator.ts:59](src/lib/fareCalculator.ts#L59) | Same as above — duplicates `vehicle_classes.vehicle_multiplier` |
| `defaultVehicleOptions` (name/description/icon/capacity/eta) | [rideStore.ts:129-175](src/state/rideStore.ts#L129-L175) | Hardcoded; never replaced by a `vehicle_classes`/`vehicle_classes_public` fetch — capacity/name/description/icon are permanently static regardless of what an admin sets in the DB |
| `vehicleIcons` | [VehicleCard.tsx:22-28](src/features/passenger/components/VehicleCard.tsx#L22-L28) | Hardcoded icon map duplicating `vehicle_classes.icon_svg_url`/`icon_svg_key` |
| Platform commission `0.10` | ~~trigger~~ | **Already migrated** — `handle_order_acceptance()`/`handle_order_completion()` now read `platform_commission_pct` from `vehicle_classes` (moved off the hardcoded `0.10` by `20260726070000_fare-config-platform-commission.sql`, carried forward by the merge migration) |

### Every InsForge table now involved in fare/vehicle/area logic — queried vs. unused

| Table / View | App queries it? | Notes |
|---|---|---|
| `vehicle_classes` | ❌ No (base table is admin-only by RLS/grant anyway) | Holds every rate + surcharge column; only the DB triggers/functions read it |
| `vehicle_classes_public` | ❌ **No — confirmed unused**, despite existing specifically for this | Would give the app real `name`/`description`/icon/capacity/rates without needing admin-only access |
| `orders` (new fare columns: `distance_fare_amount`, `time_fare_amount`, `waiting_fare_amount`, `vehicle_multiplier`, `driver_earnings`, `actual_distance_km`, `actual_waiting_minutes`) | ⚠️ Partially — `fare_amount`/`base_fare` are read back (e.g. `fetchCustomerOrderHistory` in `src/services/orders.ts`), but the itemized breakdown columns (`distance_fare_amount`, `time_fare_amount`, `waiting_fare_amount`, `vehicle_multiplier`) are stamped server-side and never read by any receipt/summary screen | The realtime broadcast (`notify_order_update()`) also only forwards `fare_amount`, not the itemized breakdown — so even if a screen wanted to show a live server-computed breakdown, the payload doesn't carry it today |
| `service_areas` | ❌ No — confirmed zero references anywhere in app code or database functions/triggers | See §3 — fully inert |
| `fare_config` | N/A — dropped 2026-07-28 | Superseded by `vehicle_classes` |

### Summary

| Check | Result |
|---|---|
| Fare charged/stored today is server-computed, not client-computed | ✅ Yes (implemented in currently-uncommitted working-tree changes since the last fare-trust audit) |
| Client-side fare preview still hardcoded, not DB-backed | ⚠️ Yes — `PRICING_RATES`/`VEHICLE_FARE_MULTIPLIERS`, intentional as a preview but an unclosed "two sources of truth for rates" gap |
| `vehicle_classes` has night/peak multiplier columns | ✅ Yes |
| Night/peak multipliers are ever applied | ❌ No — dead columns at every layer, no time-of-day logic exists anywhere in the app or DB |
| Vehicle picker reads real vehicle-class data from the DB | ❌ No — fully hardcoded array in `rideStore.ts`, `vehicle_classes_public` view exists and is unused |
| `service_areas` table is enforced against bookings | ❌ **No — confirmed zero enforcement, client or server** |
| Platform commission is DB-configurable | ✅ Yes — already migrated off the hardcoded `0.10` |
