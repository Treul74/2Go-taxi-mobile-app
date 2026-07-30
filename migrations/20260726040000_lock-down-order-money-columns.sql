-- Security hardening: no authenticated session (Customer or Transporter app
-- -- both use the same 'authenticated' Postgres role, distinguished only by
-- RLS via current_customer_id()/current_driver_id()) may write to any money
-- column on orders, at INSERT or UPDATE. INSERT was already locked down in
-- 20260726030000_server-side-fare-at-order-creation.sql; this migration
-- closes the matching UPDATE gap and extends coverage to two fields that
-- don't have columns yet.
--
-- RLS was reviewed and is not the fix here: every policy on orders already
-- correctly restricts which ROWS/status-transitions a customer or driver may
-- touch -- none of them were ever meant to restrict which COLUMNS. The gap is
-- entirely at the GRANT level, which today allows UPDATE on every column
-- including fare_amount/base_fare/etc.
--
-- Known, accepted consequence: completeOrderTrip() (src/services/
-- driverOrders.ts) explicitly sets fare_amount in its own UPDATE statement.
-- That statement will now be rejected outright (permission denied), so trip
-- completion cannot succeed again until handle_order_completion() is
-- extended to compute the final fare server-side (see Phase 3 of
-- audit_26-07-26_20-19_fare-engine-trust-boundary.md) -- deliberately not
-- done in this migration, since it requires a product decision (tolerance
-- for driver-reported distance/waiting time) rather than a grants change.
-- Every other UPDATE call site (acceptOrder, updateDriverTelemetry,
-- markDriverArrived, startOrderTrip, cancelOrder, updateOrderPickup) never
-- touches a money column and is unaffected.

-- 1. Two fields the task lists that don't exist as columns yet. Added now,
-- locked down immediately below, so there is no window where they exist but
-- are unprotected. Nothing populates driver_earnings yet (deferred to the
-- Phase 3 completion-trigger work above); waiting_fare_amount is always 0
-- until that same follow-up adds real waiting-time tracking.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS waiting_fare_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_earnings NUMERIC NOT NULL DEFAULT 0;

-- 2. Revoke UPDATE entirely, then grant back everything except the 8 money
-- columns. Triggers/SECURITY DEFINER functions are unaffected by this --
-- Postgres only checks column privileges against the invoking client
-- statement's own column list, not against a trigger's internal NEW.col
-- assignments or a SECURITY DEFINER function's internal UPDATEs.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (
  id, customer_id, driver_id, status,
  pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng,
  payment_method, requested_at, completed_at, created_at, updated_at,
  order_number, driver_heading, driver_current_lat, driver_current_lng,
  estimated_arrival_minutes, distance_to_pickup_km, trip_started_at,
  driver_arrived_at, vehicle_type, accepted_at, expires_at,
  cancelled_at, cancelled_by, trip_distance_km, trip_duration_minutes
) ON public.orders TO authenticated;
