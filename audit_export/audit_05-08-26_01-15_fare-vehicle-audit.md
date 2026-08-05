# Fare Calculation & Vehicle Type System Audit

**Date:** 2026-08-05
**Type:** Read-only audit. No files modified.
**Method:** Read `AGENTS.md` in full first (per instruction). Read `src/lib/fareCalculator.ts`, `src/state/rideStore.ts`, `src/features/passenger/components/RidePlannerSheet.tsx`/`VehicleCarousel.tsx`/`VehicleCard.tsx`, `src/features/passenger/components/MatchingOverlay.tsx`, `src/lib/fareSurcharge.ts`, `src/services/vehicleClasses.ts`, `src/services/serviceAreas.ts`, `src/services/orders.ts`, `src/features/onboarding/DriverOnboarding.tsx`, `src/types/index.ts`, `src/components/map/markers/CarMarker.tsx`, `src/components/map/Map.native.tsx`. Grepped the full `src/` and `app/` trees for `economy|comfort|bike|tricycle|truck`. Read every migration file under `migrations/` touching `vehicle_classes`, `fare_config`, `drivers.vehicle_type`, `orders.vehicle_type`, and `service_areas`.

**Important note on AGENTS.md accuracy:** AGENTS.md's "Database Tables" section (lines 174–179) and "Naming" section (lines 202–203) document `drivers.vehicle_type` as `'rider' | 'taxi' | 'tricycle'`. This is **stale** — confirmed against the live migration history (`20260709052838_add-driver-order-matching-and-acceptance.sql`, `20260710223600_drop-drivers-vehicle-class.sql`), the actual live `drivers_vehicle_type_check` CHECK constraint is `'economy' | 'comfort' | 'bike' | 'tricycle' | 'truck'` — the same 5-value `VehicleType` enum used everywhere else in the app (`src/types/index.ts:81`). There is no `'rider'`/`'taxi'` value anywhere in the current schema or app code. Everything below reports the **live** schema/code, not AGENTS.md's description of it.

---

## 1. Fare Calculator

### Full contents of `src/lib/fareCalculator.ts`

```ts
/**
 * Currency formatting utility.
 *
 * Fare calculation does not live here anymore. The vehicle-picker preview
 * reads live admin-configured rates from vehicle_classes_public directly
 * (see rideStore.ts's fetchVehicleOptions()/calculateVehicleFares()), and
 * the fare that actually gets charged/stored is always computed
 * server-side by calculate_fare_breakdown() -- see the BEFORE INSERT/UPDATE
 * triggers on orders. Never reintroduce a local fare formula or hardcoded
 * rate constants here.
 */

export const formatCurrency = (amount: number) => {
    return `K${amount.toFixed(2)}`;
};
```

That's the entire file. Despite AGENTS.md's "Fare Formula" section (lines 208–218) still describing a local formula and calling it "not yet split by vehicle type," this file **no longer computes any fare** — it's a pure currency formatter (`K${amount.toFixed(2)}`). AGENTS.md is stale here too: the formula *is* now split by vehicle type, just not in this file — it lives entirely server-side (§1.4 below). The file's own header comment is the accurate, current documentation.

### How is the night multiplier calculated?

Two parallel implementations, by design (one server-authoritative, one client-preview-only):

**Server (authoritative)** — `calculate_fare_breakdown()`, added in `migrations/20260728200758_apply-night-peak-surcharge-to-fare-calculation.sql:98-109`:
```sql
v_local_time := p_at_timestamp AT TIME ZONE 'Africa/Lusaka';
v_hour := EXTRACT(HOUR FROM v_local_time)::INT;
v_isodow := EXTRACT(ISODOW FROM v_local_time)::INT; -- 1=Monday .. 7=Sunday

IF v_hour >= 22 OR v_hour < 5 THEN
  v_surcharge_multiplier := v_config.night_rate_multiplier;
ELSIF v_isodow BETWEEN 1 AND 5
      AND ((v_hour >= 7 AND v_hour < 9) OR (v_hour >= 17 AND v_hour < 19)) THEN
  v_surcharge_multiplier := v_config.peak_multiplier;
ELSE
  v_surcharge_multiplier := 1.0;
END IF;
```
Night takes priority over peak (checked first). `p_at_timestamp` is `orders.requested_at` at creation and `orders.completed_at` at completion (not `now()` re-evaluated later — see §1.6).

**Client (display-only preview)** — `src/lib/fareSurcharge.ts:17-29`, `getActiveFareSurcharge()`:
```ts
const ZAMBIA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

export function getActiveFareSurcharge(at: Date = new Date()): FareSurchargeType {
  const lusaka = new Date(at.getTime() + ZAMBIA_UTC_OFFSET_MS);
  const hour = lusaka.getUTCHours();
  const isoDow = lusaka.getUTCDay() === 0 ? 7 : lusaka.getUTCDay();

  if (hour >= 22 || hour < 5) return 'night';
  if (isoDow >= 1 && isoDow <= 5 && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19))) {
    return 'peak';
  }
  return null;
}
```
This file's own header comment states it explicitly: "Display/informational only — the charged fare is always computed server-side; never let this drive what gets billed." It's consumed by `RidePlannerSheet.tsx:65-72` to show a "Night rate applies" / "Peak hour pricing" `Pill` badge, refreshed every 60s via `setInterval` in case the sheet is left open across a window boundary.

### How is the peak-hour multiplier calculated?

Same function, same file, same logic as above — `peak_multiplier` is applied instead of `night_rate_multiplier` when `v_isodow` is Mon–Fri and the hour falls in `07:00–09:00` or `17:00–19:00`. See exact ranges in §5.

### Where are these values defined?

`vehicle_classes.night_rate_multiplier` and `vehicle_classes.peak_multiplier` — real columns on the `vehicle_classes` table (added by `migrations/20260728183527_merge-fare-config-into-vehicle-classes.sql:48-49`), one value per vehicle type, admin-configurable. Currently every row defaults to `1.0` (no-op) per that migration's own comment (lines 27-29) until an admin sets real values.

### Are they hardcoded or fetched from DB?

**Fetched from DB**, both server-side and client-side:
- Server: `calculate_fare_breakdown()` selects `v_config.night_rate_multiplier` / `v_config.peak_multiplier` directly from the `vehicle_classes` row (`migrations/20260728200758...sql:86-87`).
- Client preview: `vehicle_classes_public` view exposes `night_rate_multiplier`/`peak_multiplier` (`migrations/20260728183527...sql:348-349`), fetched by `fetchActiveVehicleClasses()` (`src/services/vehicleClasses.ts:42-51`) into `rideStore.vehicleRates`. **However**, `RidePlannerSheet`'s badge (§1 above) doesn't actually read these DB values — it only reads the *time windows*, which are hardcoded identically in both `fareSurcharge.ts` and the SQL function (comment in `fareSurcharge.ts:1-11` explicitly says it "mirrors the server's ... window logic exactly"). The window boundaries (22:00, 05:00, 07:00, 09:00, 17:00, 19:00) are therefore duplicated hardcoded constants in two places (one SQL, one TS) — not read from any config table. Only the multiplier *amounts* are DB-driven; the time *windows* are hardcoded in both layers.

### What triggers a fare recalculation?

**Client preview (`vehicleOptions[].estimatedFare`):**
- `RidePlannerSheet.tsx:178-182` — a `useEffect` that calls `calculateVehicleFares()` whenever `pickup` or `destination` changes (both must be set).
- `calculateVehicleFares()` (`rideStore.ts:323-358`) calls Google's Distance Matrix API for the pickup→destination pair, then computes `rate.baseFare + distanceKm*rate.perKm + durationMinutes*rate.perMinute`, floors it at `rate.minFare`, multiplies by `rate.vehicleMultiplier` — **does not include the night/peak surcharge multiplier at all** on the client (only `vehicleMultiplier`, not `surchargeMultiplier` — see §1 gap below).
- On mount, `fetchVehicleOptions()` (`rideStore.ts:267-315`) sets a floor estimate (`vehicleMultiplier * minFare`) before any route exists.

**Server (authoritative, real charge):**
- `handle_order_creation_fare()` — a `BEFORE INSERT` trigger on `orders`, calls `calculate_fare_breakdown()` once at booking time using `trip_distance_km`/`trip_duration_minutes` (client-supplied estimate) and `requested_at`.
- `handle_order_completion()` — a `BEFORE UPDATE` trigger, recalculates using `actual_distance_km`/`actual_waiting_minutes` and `completed_at` when status transitions `in_progress → completed`. This is the final, billed fare.

**Gap found:** the client-side `calculateVehicleFares()` preview (`rideStore.ts:343-344`) never applies `rate.vehicleMultiplier`'s sibling, the night/peak `surchargeMultiplier` — it's fetched into `vehicleRates` (`VehicleRateConfig` interface, `rideStore.ts:142-149`) but that interface **doesn't even include a `surchargeMultiplier`/`nightRateMultiplier`/`peakMultiplier` field**, and `fetchVehicleOptions()` (`rideStore.ts:274-296`) never reads `row.night_rate_multiplier`/`row.peak_multiplier` off the fetched rows into `vehicleRates` at all. So during an active night/peak window, the per-vehicle price shown in the carousel (`VehicleCard`, `K{vehicle.estimatedFare}`) is **understated** relative to what the server will actually charge — only the standalone `Pill` badge (§1) tells the customer a surcharge applies, with no number attached.

---

## 2. Vehicle Types — Current State

### Where vehicle types are currently defined in the frontend

- **`VehicleType` enum** — `src/types/index.ts:81`: `'economy' | 'comfort' | 'bike' | 'tricycle' | 'truck'`. This is the single canonical frontend type, imported everywhere below.
- **Icon mapping** — `src/features/passenger/components/VehicleCard.tsx:23-29` (`vehicleIcons`), used both directly by `VehicleCard` and re-exported for `rideStore.ts:304` as a fallback when a DB row has no `icon_svg_url`.
- **Marker color/variant mapping** (map pins, separate concept from `VehicleType`) — `src/components/map/markers/CarMarker.tsx:10-17` (`VehicleMarkerVariant` = `'economy' | 'comfort' | 'premium' | 'offline'`). Per that file's own comment (lines 5-8), this is now vestigial — "No longer used to tint the car body ... kept only to distinguish the offline/unavailable state."

### Every hardcoded occurrence of `economy`/`comfort`/`bike`/`tricycle`/`truck`

| File | Line(s) | Context |
|---|---|---|
| `src/types/index.ts` | 81 | `VehicleType` enum definition (canonical) |
| `src/state/rideStore.ts` | 154, 696 | `selectedVehicle: 'economy'` — initial state and `resetRide()` default |
| `src/features/passenger/components/VehicleCard.tsx` | 24–28 | `vehicleIcons` Ionicons map, one entry per type |
| `src/features/passenger/PassengerHome.tsx` | 64 | `variant: 'economy' as VehicleMarkerVariant` — hardcoded marker color for simulated nearby-vehicle dots (`generateNearbyVehicles()`) |
| `src/services/orders.ts` | 298 | `vehicleType: row.vehicle_type ?? 'economy'` — fallback when mapping a ride-history row |
| `src/features/activity/components/RideListItem.tsx` | 14, 16–18 | Icon map for ride-history list items (only 4 of 5 types present — no `tricycle` entry, see gap below) |
| `src/features/onboarding/DriverOnboarding.tsx` | 104 | `(driverOnboarding.vehicleInfo?.vehicleType \|\| 'economy') as VehicleType` |
| `src/features/onboarding/DriverOnboarding.tsx` | 347–350 | Hardcoded 4-item vehicle-type picker for the Transporter application wizard — `economy`, `comfort`, `bike`, `truck` (**missing `tricycle`**, see gap below) |
| `src/components/map/Map.web.tsx` | 33 | `driverVehicleVariant = 'comfort'` default prop |
| `src/components/map/Map.native.tsx` | 302 | `driverVehicleVariant = 'comfort'` default prop |
| `src/components/map/Map.tsx` | 75 | Doc comment: "defaults to 'comfort'" |
| `src/components/map/markers/CarMarker.tsx` | 10, 13–16, 50 | `VehicleMarkerVariant` type + color map + default prop |
| `src/components/map/markers/AnimatedVehicleMarker.tsx` | 40 | `variant = 'economy'` default prop |
| `src/features/welcome/WelcomeScreen.tsx` | 44, 47, 52 | Onboarding slide copy/asset references ("Motorbike", "cars, motorbikes, or tricycles", truck image) — plain text/asset paths, not typed values |

**Note on `RideListItem.tsx:14-18`:** its icon map only has 4 entries (`economy`, `comfort`, `bike`, `truck`) — no `tricycle` key — so a completed `tricycle` ride in the customer's Activity tab would hit `undefined` on that lookup (not traced further here since this audit is read-only and scoped to fare/vehicle-type, not the Activity screen itself; flagged as a related gap).

### Is there an existing function that fetches vehicle types from the DB?

**Yes.** `fetchActiveVehicleClasses()` — `src/services/vehicleClasses.ts:38-52` — queries `vehicle_classes_public` (`.order('display_order')`) and returns typed rows including `vehicle_type`, all fare-rate columns, `icon_svg_url`, `max_capacity`, `display_order`. This is called from `rideStore.fetchVehicleOptions()` (`rideStore.ts:267-315`), which populates both `vehicleOptions` (display) and `vehicleRates` (pricing) state. **The passenger vehicle picker is DB-driven, not hardcoded** — this contradicts an earlier assumption in this repo's own memory/audit history; verified directly against current code.

The one hardcoded vehicle-type list still in the app is the **Transporter (driver) onboarding wizard's** vehicle-type picker (`DriverOnboarding.tsx:346-351`) — that one has no DB fetch at all, and (per the gap above) is missing `tricycle` as a selectable option even though the live `drivers_vehicle_type_check` constraint allows it.

### What does the `vehicle_classes`/`vehicle_types` table look like in InsForge?

No migration file creates the `vehicle_classes` base table — like `service_areas`, it was created out-of-band directly against the live database (confirmed: `migrations/20260728194010_enforce-service-area-on-order-creation.sql:15-19` documents the same out-of-band pattern for `service_areas`; the earliest migration touching `vehicle_classes` is the merge migration below, which only `ALTER`s it). Its base columns (`id`, `name`, `description`, `icon_svg_url`, `icon_svg_key`, `max_capacity`, `display_order`, `status`) are known only from what `vehicle_classes_public`'s `SELECT` list and the merge migration project/reference.

**Columns added by `migrations/20260728183527_merge-fare-config-into-vehicle-classes.sql:40-52`** (merging in the now-dropped `fare_config` table):

```sql
ALTER TABLE public.vehicle_classes
  ADD COLUMN vehicle_type TEXT,
  ADD COLUMN base_fare NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN min_fare NUMERIC NOT NULL DEFAULT 35,
  ADD COLUMN per_km NUMERIC NOT NULL DEFAULT 8,
  ADD COLUMN per_minute NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN per_minute_waiting NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN cancellation_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN night_rate_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN peak_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN vehicle_multiplier NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN platform_commission_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN driver_commission_pct NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.vehicle_classes
  ADD CONSTRAINT vehicle_classes_vehicle_type_check
    CHECK (vehicle_type IS NULL OR vehicle_type IN
      ('economy', 'comfort', 'bike', 'tricycle', 'truck')),
  ADD CONSTRAINT vehicle_classes_vehicle_type_key UNIQUE (vehicle_type),
  ADD CONSTRAINT vehicle_classes_night_rate_multiplier_check CHECK (night_rate_multiplier > 0),
  ADD CONSTRAINT vehicle_classes_peak_multiplier_check CHECK (peak_multiplier > 0),
  ADD CONSTRAINT vehicle_classes_cancellation_fee_check CHECK (cancellation_fee >= 0),
  ADD CONSTRAINT vehicle_classes_vehicle_multiplier_check CHECK (vehicle_multiplier > 0),
  ADD CONSTRAINT vehicle_classes_platform_commission_pct_check
    CHECK (platform_commission_pct >= 0 AND platform_commission_pct <= 100),
  ADD CONSTRAINT vehicle_classes_driver_commission_pct_check
    CHECK (driver_commission_pct >= 0 AND driver_commission_pct <= 100);
```

`vehicle_type` is nullable — the "Bicycle" `vehicle_classes` row (referenced in `rideStore.ts:278-280`'s comment) has no `vehicle_type` and is explicitly skipped by `fetchVehicleOptions()` since it has no valid `VehicleType`/`VehicleOption.id`.

**Access control** (same migration, lines 330–355): base table is admin-only (`REVOKE ALL ... FROM anon`); a `SECURITY DEFINER`-equivalent public view is exposed instead:

```sql
CREATE VIEW public.vehicle_classes_public AS
SELECT
  id, name, description, icon_svg_url, icon_svg_key, max_capacity, display_order,
  vehicle_type, base_fare, min_fare, per_km, per_minute, per_minute_waiting,
  cancellation_fee, night_rate_multiplier, peak_multiplier, vehicle_multiplier
FROM public.vehicle_classes
WHERE status = 'active';

GRANT SELECT ON public.vehicle_classes_public TO anon, authenticated;
```
Note `platform_commission_pct`/`driver_commission_pct` are deliberately **not** in this view — column-level privacy, enforced by Postgres, not app code.

---

## 3. Ride Planner — Vehicle Selection

### Where `RidePlannerSheet` gets its vehicle list from

`RidePlannerSheet.tsx:91-113` destructures `vehicleOptions` straight from `useRideStore()`; line 116 assigns it unfiltered to `vehicles` ("No filtered vehicles needed - use all vehicle options"). `vehicleOptions` is populated by `fetchVehicleOptions()` (§2), which the store itself doesn't auto-call on mount — it must be triggered by a screen (confirmed: not called inside `RidePlannerSheet` itself; presumably called once from `PassengerHome` or app-root on load — out of scope for this audit's file list, not traced further).

### Exact code that populates the `VehicleCarousel`

`RidePlannerSheet.tsx:393-400`:
```tsx
{/* Vehicle Carousel */}
<View className="mt-3">
  <VehicleCarousel
    vehicles={vehicles}
    selectedVehicle={selectedVehicle}
    onSelectVehicle={(id) => setVehicle(id)}
  />
</View>
```
`VehicleCarousel.tsx:20-38` just maps `vehicles` into `VehicleCard`s inside a horizontal `ScrollView` — no filtering, sorting, or hardcoded list of its own.

### Is `calculateVehicleFares()` reading from DB or hardcoded data?

**Reading from DB** — via `vehicleRates`, which is populated from `vehicle_classes_public` rows by `fetchVehicleOptions()` (see `VehicleRateConfig` interface, `rideStore.ts:142-149`). The only hardcoded piece inside `calculateVehicleFares()` itself is `Math.max(1, Math.round(durationMinutes))` for ETA flooring — a UX rounding rule, not a pricing constant.

### Full `calculateVehicleFares()` function

`src/state/rideStore.ts:323-358`:
```ts
// Calculates real per-vehicle fares/ETAs for the current pickup/destination
// pair, replacing the floor estimatedFare/eta on vehicleOptions with values
// derived from the actual route distance/duration. Uses the same rates
// (vehicleRates, from vehicle_classes_public) that calculate_fare_breakdown()
// uses server-side, so the preview always matches whatever an admin has
// configured -- never reimplement this formula with local constants.
calculateVehicleFares: async () => {
  const { pickup, destination, vehicleRates } = get();
  if (!pickup || !destination) return;

  set({ isFareCalculating: true });

  try {
    const matrix = await getDistanceMatrix([pickup], [destination]);
    const result = matrix?.[0];
    if (!result) return;

    const distanceKm = result.distance.value / 1000;
    const durationMinutes = result.duration.value / 60;
    const eta = Math.max(1, Math.round(durationMinutes));

    set((s) => ({
      vehicleOptions: s.vehicleOptions.map((vehicle) => {
        const rate = vehicleRates[vehicle.id];
        if (!rate) return { ...vehicle, eta };

        const subtotal = rate.baseFare + distanceKm * rate.perKm + durationMinutes * rate.perMinute;
        const total = rate.vehicleMultiplier * Math.max(subtotal, rate.minFare);

        return {
          ...vehicle,
          estimatedFare: parseFloat(total.toFixed(2)),
          eta,
        };
      }),
    }));
  } catch (error) {
    console.error('Failed to calculate vehicle fares:', error);
  } finally {
    set({ isFareCalculating: false });
  }
},
```
As noted in §1's gap: this formula omits the night/peak `surcharge_multiplier` term the server applies (`vehicle_multiplier * surcharge_multiplier * GREATEST(subtotal, min_fare)` server-side vs. `vehicle_multiplier * Math.max(subtotal, minFare)` here) — the displayed estimate can understate the real charge during a surcharge window.

---

## 4. "Find a Driver Faster"

### Every place this text (or similar) appears

Exactly one match, repo-wide (`app/` and `src/`): `src/features/passenger/components/MatchingOverlay.tsx:224`:
```tsx
<Text className="text-[22px] font-bold text-[#26344F]">Want to find a driver faster?</Text>
```

### What does tapping it do?

**Nothing — it's plain `<Text>`, not wrapped in a `Pressable`/`Button`/`TouchableOpacity`.** It's a static heading shown only in the overlay's `'expanded'` phase (the "widen search" screen, reached automatically 30s after matching starts, or manually via the "Details" toggle — `MatchingOverlay.tsx:79-83`, `221-240`). The two actionable buttons on that same screen are "Cancel ride" (`line 232`) and "Details" (`line 235`, which toggles back to the collapsed `'searching'` phase — it doesn't do anything related to finding a driver faster).

### What vehicle type does it use?

None. This screen doesn't read or offer any vehicle-type selection. The file's own top-level doc comment (`MatchingOverlay.tsx:42-49`) describes the expanded phase as showing "a countdown and alternate vehicle classes," but **no such vehicle-class UI exists in the actual render output** — the expanded-phase JSX (`lines 221-240`) contains only the heading, countdown text/progress bar, and the same two buttons as the collapsed phase. This is stale/aspirational documentation inside the component itself, not a hidden feature — confirmed by reading the full file, no other component is conditionally rendered in that branch.

### Is it hardcoded?

The text itself is a hardcoded string (not from any config/DB), and — per the above — it does not trigger any action at all; it's decorative copy on a screen that offers no vehicle-switching functionality despite what the surrounding comments describe.

---

## 5. Pricing Config

### Where are base fare, per-km rate, per-minute rate defined?

`vehicle_classes.base_fare`, `vehicle_classes.per_km`, `vehicle_classes.per_minute` (and `per_minute_waiting`, `min_fare`) — one row per vehicle type, admin-configurable, added by the merge migration (§2, defaults: `base_fare=25`, `min_fare=35`, `per_km=8`, `per_minute=2`, `per_minute_waiting=1.5` — these are just column `DEFAULT`s applied at migration time, not necessarily current live values, since the original per-vehicle-type seed values from `fare_config` (§6) were migrated in immediately after via `UPDATE`).

### Are night/peak multipliers in the DB or frontend constants?

**Multiplier amounts:** DB (`vehicle_classes.night_rate_multiplier`, `vehicle_classes.peak_multiplier`) — see §1/§2.
**Time windows** (when they apply): hardcoded identically in two places — the SQL function and `src/lib/fareSurcharge.ts` — not DB-driven at all. See §1's answer to "hardcoded or fetched" for the full explanation of this split.

### Exact multiplier logic

Server (`calculate_fare_breakdown`, `migrations/20260728200758...sql:102-109`):
```sql
IF v_hour >= 22 OR v_hour < 5 THEN
  v_surcharge_multiplier := v_config.night_rate_multiplier;
ELSIF v_isodow BETWEEN 1 AND 5
      AND ((v_hour >= 7 AND v_hour < 9) OR (v_hour >= 17 AND v_hour < 19)) THEN
  v_surcharge_multiplier := v_config.peak_multiplier;
ELSE
  v_surcharge_multiplier := 1.0;
END IF;
```
Applied as: `total = vehicle_multiplier * surcharge_multiplier * GREATEST(subtotal, min_fare)`.

### What time ranges are peak hours?

**07:00–09:00 and 17:00–19:00, Monday–Friday only** (Zambia/Africa-Lusaka local time, UTC+2 year-round, no DST). Both `fareSurcharge.ts:24` and the SQL function use `hour >= 7 && hour < 9` / `hour >= 17 && hour < 19` (half-open intervals — 09:00:00 and 19:00:00 themselves are *not* peak).

### What time ranges are night hours?

**22:00–05:00, every day** (no weekday restriction). `hour >= 22 || hour < 5` in both implementations.

---

## 6. DB Tables for Pricing

Grepped `migrations/` for `vehicle_types`, `pricing`, `fare_config`, `surge`, `multiplier` (case-insensitive). Relevant tables/objects, in chronological order:

| Migration | What it did |
|---|---|
| `20260724010642_create-fare-config-table.sql` | Created `fare_config` (now dropped) — one row per `vehicle_type`, columns `base_fare`/`per_km`/`per_minute`/`per_minute_waiting`/`min_fare`/`is_active`. Seed values noted below. |
| `20260724010648_create-calculate-fare-function.sql` | First `calculate_fare_breakdown()`/`calculate_fare()`, reading `fare_config`. |
| `20260726010000_add-vehicle-multiplier-to-fare-config.sql` | Added `fare_config.vehicle_multiplier`. |
| `20260726030000_server-side-fare-at-order-creation.sql` | Added the `BEFORE INSERT` trigger (`handle_order_creation_fare`) that stamps `fare_amount` server-side at booking. |
| `20260726040000_lock-down-order-money-columns.sql` | Revoked client write access to money columns on `orders`. |
| `20260726050000_stamp-waiting-fare-and-vehicle-multiplier-on-creation.sql` | Extended the creation trigger to also stamp `vehicle_multiplier`/waiting fare. |
| `20260726060000_server-side-fare-at-trip-completion.sql` | Added the completion-side trigger (`handle_order_completion`), final billed fare. |
| `20260726070000_fare-config-platform-commission.sql` | Added `fare_config.platform_commission_pct`/`driver_commission_pct`. |
| `20260726080000_fix-fare-breakdown-double-precision-cast.sql` | Numeric-precision bugfix, no schema change. |
| `20260728183527_merge-fare-config-into-vehicle-classes.sql` | **Dropped `fare_config`**; merged all its columns onto `vehicle_classes` (full column list in §2); repointed `calculate_fare_breakdown()`/triggers at `vehicle_classes`; created `vehicle_classes_public` view. |
| `20260728194010_enforce-service-area-on-order-creation.sql` | Unrelated to fare, but same family — added `is_within_service_area()` RPC and a `BEFORE INSERT` trigger on `orders` enforcing pickup-in-service-area (pickup only, not dropoff). |
| `20260728200758_apply-night-peak-surcharge-to-fare-calculation.sql` | Wired `night_rate_multiplier`/`peak_multiplier` (added in the merge migration but previously unread — confirmed dead by an earlier audit) into `calculate_fare_breakdown()`; added `orders.surcharge_multiplier` (server-stamped only, no client write grant). |

**Vehicle-type-related, not pricing:**
- `20260709044040_add-orders-vehicle-type-and-customer-rls.sql` — added `orders.vehicle_type TEXT`, `CHECK (... IN ('economy','comfort','bike','tricycle','truck'))`.
- `20260709052838_add-driver-order-matching-and-acceptance.sql` — added `drivers.vehicle_type TEXT NOT NULL DEFAULT 'economy'`, same 5-value CHECK, migrated off a legacy `vehicle_class` column.
- `20260710223600_drop-drivers-vehicle-class.sql` — dropped the legacy `drivers.vehicle_class` (had been `economy/suv/luxury/sprinter`, unrelated to the current 5-value enum), reasserted the `vehicle_type` CHECK.

**Original `fare_config` seed values** (`20260724010642...sql:43-48`, migrated forward into `vehicle_classes` by the merge, presumably since admin-edited):
```sql
INSERT INTO fare_config (vehicle_type, base_fare, per_km, per_minute, per_minute_waiting, min_fare) VALUES
  ('economy',  25,   8,    2,   1.5,  35),
  ('comfort',  37.5, 12,   3,   2.25, 52.5),
  ('bike',     12.5, 4,    1,   0.75, 17.5),
  ('tricycle', 17.5, 5.6,  1.4, 1.05, 24.5),
  ('truck',    62.5, 20,   5,   3.75, 87.5);
```
These matched `PRICING_RATES × VEHICLE_FARE_MULTIPLIERS` from `fareCalculator.ts` at the time (comment, same file, lines 40-42) — i.e., this table was originally seeded to reproduce the old hardcoded frontend formula exactly, before the frontend formula was deleted.

**No migration file creates the base `vehicle_classes` or `service_areas` tables** — both were created directly against the live DB outside the migrations/ history (confirmed via explicit comments in `20260728194010...sql:15-19` and the absence of any `CREATE TABLE public.vehicle_classes` anywhere in `migrations/`).

---

## Summary of Notable Gaps (read-only findings, not fixed)

1. **Client fare preview omits the night/peak surcharge multiplier** — `calculateVehicleFares()` (`rideStore.ts:343-344`) and `VehicleRateConfig` (`rideStore.ts:142-149`) never read/apply `night_rate_multiplier`/`peak_multiplier`, so the carousel's displayed price can be lower than what the server will actually charge during a surcharge window. Only a contextless badge (no number) hints at this.
2. **AGENTS.md's documented `drivers.vehicle_type` values (`rider`/`taxi`/`tricycle`) are stale** — the live schema and every piece of app code use the 5-value `economy`/`comfort`/`bike`/`tricycle`/`truck` enum instead. No `'rider'`/`'taxi'` value exists anywhere in the current database or code.
3. **`DriverOnboarding.tsx`'s vehicle-type picker (lines 346-351) is hardcoded and incomplete** — only offers `economy`/`comfort`/`bike`/`truck`, missing `tricycle` even though it's a valid, DB-constrained value used everywhere else (including the passenger-facing picker, which is fully DB-driven).
4. **`RideListItem.tsx`'s icon map (lines 14-18) is also missing a `tricycle` entry** — a completed tricycle ride's history row would hit an undefined icon lookup (not traced further, outside this audit's scope).
5. **"Want to find a driver faster?" is dead/decorative copy** — not interactive, and the surrounding component's own doc comment describes an "alternate vehicle classes" feature on that screen that doesn't actually exist in the rendered output.
6. **Time windows for night/peak are hardcoded in two places** (`fareSurcharge.ts` and the SQL function) rather than sourced from any DB config — only the multiplier *amounts* are DB-driven, not the *windows* themselves. A future admin wanting to change when surcharges apply (not just by how much) would need a code change in both places.

---

*Audit saved to `audit_export/audit_05-08-26_01-15_fare-vehicle-audit.md` per AGENTS.md's Audit Reports rule.*
