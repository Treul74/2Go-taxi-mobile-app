# Database Schema Audit — Business Requirements Comparison

**Date:** 2026-07-23
**Scope:** Compare the live InsForge `public` schema (project `2go_Taxi`, queried directly via
`npx @insforge/cli db query` against `information_schema.columns`) against a supplied set of
data requirements for Users, Transporters, Vendors, Corporate/District Managers, Trips/Orders,
Vehicles, Districts, and supporting operational data (fares, payments, support, safety, audit).

**Method:** Live schema pulled directly from the database (not from AGENTS.md, which is stale —
e.g. it omits the `ratings`, `wallet_transactions`, and `admins` tables, and lists `drivers.plate_number`
where the live column is actually `license_plate`). Findings below are grounded in the live schema plus
migration history (`migrations/*.sql`) and `src/lib/fareCalculator.ts`.

**Live tables found:** `admins`, `customers`, `drivers`, `messages`, `orders`, `ratings`,
`saved_addresses`, `wallet_transactions`. No other `public` tables exist.

---

## Core Entities

| Data Needed | Exists? | Table/Column Name | Notes/Gaps |
|---|---|---|---|
| Users (Customers) | ✅ Yes | `customers` (id, auth_id, first_name, last_name, email, phone_number, country_code, profile_photo_url, gender, age, account_type, account_status, is_verified, email_verified, phone_verified, rating, total_ratings, total_completed_rides, total_cancelled_rides, preferred_payment_method, wallet_balance, push_token, created_at, updated_at) | Fully implemented. `account_type` is CHECK-constrained to `'passenger'` only (no other value is possible on this table). |
| Transporters (vehicle_type) | ⚠️ Partial | `drivers.vehicle_type` (CHECK: `economy`, `comfort`, `bike`, `tricycle`, `truck`) | Table exists and is populated, but the requirement's naming ("motorbike/vehicle") doesn't map cleanly onto the live 5-value enum, which itself diverges from AGENTS.md's documented 3-value naming (`rider`/`taxi`/`tricycle`). Confirm which taxonomy is canonical before building anything on top of it — this is a real, live discrepancy, not just doc drift, since the DB CHECK constraint enforces the 5-value set. A legacy `vehicle_class` column (economy/suv/luxury/sprinter) was dropped in `20260710223600_drop-drivers-vehicle-class.sql`. |
| Vendors (shop_name, product listings w/ price & availability) | ❌ No | — | No `vendors` table, no `products`/`listings` table anywhere in the schema. Must be created from scratch. |
| Corporate/District Managers (linked to district; linked to Transporters/Vendors/Customers they registered) | ⚠️ Partial | `admins` (id, auth_id, full_name, email, phone, province, district, city, description, account_status, created_at, updated_at) | An `admins` table exists with free-text `province`/`district`/`city` columns, but: (1) `district` is a plain TEXT field, not a foreign key into a normalized districts table; (2) there is no role/tier column distinguishing "corporate manager" from "district manager" from any other admin type; (3) there is no relationship table or FK column anywhere recording which customers/drivers an admin registered — no `registered_by`/`created_by_admin_id` on `customers` or `drivers`. Registration attribution and role tiering are both missing. |
| Trips/Orders (customer, transporter or vendor, service_type: ride/delivery/food, status, fare, timestamps) | ⚠️ Partial | `orders` (id, customer_id, driver_id, status, pickup/dropoff address+lat+lng, fare_amount, payment_method, base_fare, service_fee_pct, service_fee_amount, order_number, vehicle_type, requested_at/accepted_at/driver_arrived_at/trip_started_at/completed_at/cancelled_at, created_at, updated_at) | Ride-hailing orders are fully modeled. Gaps: no `vendor_id` column (orders can only link to a `driver_id`, not a vendor), and no `service_type` column at all — the schema currently assumes every order is a ride (`vehicle_type` is a vehicle class, not a service category). Delivery/food order types cannot be represented today. |
| Vehicles | ❌ No (denormalized) | Vehicle attributes live inline on `drivers`: `vehicle_make`, `vehicle_model`, `vehicle_year`, `license_plate` | There is no standalone `vehicles` table. A driver can only have exactly one vehicle (columns are 1:1 on the drivers row) — if a transporter needs to register/switch between multiple vehicles, or if vehicles need to be tracked independently of a driver (e.g. fleet ownership, inspections), this needs a real `vehicles` table with a FK back to `drivers`. |
| Districts | ❌ No | — | No `districts` table. `admins.district` is free text with no referential integrity — no canonical list of districts exists in the database. |

---

## Per-Screen Data Needs

| Data Needed | Exists? | Table/Column Name | Notes/Gaps |
|---|---|---|---|
| Booking records: pickup/dropoff/fare/status | ✅ Yes | `orders.pickup_address/pickup_lat/pickup_lng`, `orders.dropoff_address/dropoff_lat/dropoff_lng`, `orders.fare_amount`, `orders.status` (`pending`/`accepted`/`in_progress`/`completed`/`cancelled`/`expired`) | Complete for ride bookings. |
| Transporter profile: license | ⚠️ Partial | `drivers.drivers_license_url` / `drivers_license_key` | Only a photo/document upload is stored (URL + storage key). There is no structured license **number**, issue date, or expiry date field — if the manager dashboard needs to display/search by license number or flag expired licenses, that field doesn't exist. |
| Transporter profile: hire date | ❌ No | — | No `hire_date`/`onboarded_at`/`approved_at` column on `drivers`. Only `created_at` (row creation, i.e. signup) exists — there's no distinct timestamp for when the transporter was actually approved/hired. |
| Transporter profile: vehicle assignment | ⚠️ Partial | `drivers.vehicle_make/vehicle_model/vehicle_year/license_plate` | Inline columns, not a real assignment relationship (see "Vehicles" above — no separate vehicles table to "assign" from). |
| Transporter profile: ratings | ✅ Yes | `drivers.rating`, `drivers.total_ratings`; detail rows in `ratings` (customer→driver: `driving_skill`, `cleanliness`, `driver_communication`; driver→customer: `punctuality`, `payment`, `passenger_communication`) | Fully implemented, including category-level ratings (added in `20260723000001_add-rating-categories.sql`) and a driver→customer direction (`ratings.rated_by`), though per prior audit notes the driver→customer submission flow has no app-side UI yet — the backend is ready but unused. |
| Transporter profile: performance metrics | ✅ Yes | `drivers.total_completed_rides`, `drivers.total_cancelled_rides`, `drivers.total_earnings`, `drivers.wallet_balance` | Covered. |
| Corporate manager registration counts | ❌ No | — | No linkage exists between `admins` and the customers/drivers they registered (see Corporate/District Managers row above). Counts cannot be derived without this relationship. |
| Corporate manager revenue attribution | ❌ No | — | No column anywhere attributes an order's revenue/service fee to an admin/district. Would need to be derived transitively through a registration-link table once one exists. |
| Fare/pricing rules per vehicle class (base fare, per-km, time multipliers, surge) in a config table | ❌ No — hardcoded in app code | `src/lib/fareCalculator.ts`: `PRICING_RATES` (BASE_FARE, PER_KM, PER_MINUTE, PER_MINUTE_WAITING, MIN_FARE) and `VEHICLE_FARE_MULTIPLIERS` (bike 0.5, tricycle 0.7, economy 1, comfort 1.5, truck 2.5) | Confirmed: these are TypeScript constants shipped in the app bundle, not a database table. Changing a fare rate requires an app release, and there's no surge-pricing mechanism at all. `orders.base_fare` (default `5.00`) and `orders.service_fee_pct` (default `10.00`) are flat defaults stored per-order, not a per-vehicle-class rate table. This matches the "known gap" already flagged in AGENTS.md ("Fare formula not yet split by vehicle type" — now partially addressed client-side via multipliers, but still not server/config-driven). |
| Payment methods | ⚠️ Partial | `customers.preferred_payment_method` (`cash`/`airtel_money`/`mtn_money`/`card`), `orders.payment_method` | The *choice* of payment method is captured per customer and per order. |
| Transaction records | ⚠️ Partial | `wallet_transactions` (id, driver_id, order_id, type: `trip_earning`/`service_fee`/`withdrawal`/`adjustment`, amount, balance_after, created_at) | This is a driver-side wallet ledger only. There is no customer-facing payment transaction record (e.g. no row capturing an actual card charge, mobile-money reference/receipt number, or payment gateway status) — if a screen needs to show "payment history" or reconcile against a payment provider, that table doesn't exist yet. |
| Support tickets (linked customer/agent) | ❌ No | — | No `support_tickets` table, no agent concept anywhere in the schema. |
| Safety incidents | ❌ No | — | No table. |
| Vehicle inspections | ❌ No | — | No table (and no standalone `vehicles` table to attach inspections to). |
| Audit logs for admin actions | ❌ No | — | No `audit_log`/`admin_actions` table. `admins` table has no activity trail. |

---

## Summary of Missing Tables

To close the gaps above, the following new tables would need to be created:

- `vendors` (+ a `products`/`listings` table for shop_name, price, availability)
- `vehicles` (normalized, FK from `drivers`, to support multi-vehicle transporters and inspections)
- `districts` (normalized reference table; `admins.district` should FK into it)
- A registration-link mechanism (e.g. `registered_by_admin_id` FK columns on `customers`/`drivers`/`vendors`, or a join table) for corporate/district manager attribution
- `pricing_rules` (or similar) config table for base fare / per-km / per-minute / surge multiplier per vehicle class, replacing the hardcoded `PRICING_RATES` / `VEHICLE_FARE_MULTIPLIERS` constants
- `payment_transactions` (customer-facing, provider-agnostic charge/receipt records — distinct from the existing driver-only `wallet_transactions` ledger)
- `support_tickets`
- `safety_incidents`
- `vehicle_inspections`
- `audit_logs`

Existing tables would also need new columns: `orders.service_type` and `orders.vendor_id` (to support delivery/food orders), `drivers.hire_date` / license number+expiry fields, and a role/tier column on `admins`.
