-- Closes the order-creation trust gap documented in
-- audit_26-07-26_20-19_fare-engine-trust-boundary.md: today the Customer app
-- computes fare_amount/base_fare on-device (src/lib/fareCalculator.ts) and
-- inserts them directly -- a modified client can set fare_amount to any
-- value at booking time. From this migration on, the customer app may only
-- supply the inputs that determine price (pickup/dropoff, vehicle_type,
-- estimated trip_distance_km/trip_duration_minutes); the fare itself is
-- always computed server-side by calculate_fare_breakdown() (already backed
-- by fare_config -- see the two prior fare-engine migrations).
--
-- Scope: order CREATION only. Trip completion still has the same class of
-- issue (driver app writes the final fare_amount on UPDATE) -- deliberately
-- left untouched here since fixing it requires a different mechanism
-- (server-trusted trip facts, not just a formula swap) and touching it now
-- would break the currently-working completion flow with no replacement.
-- See Phase 3 of the referenced audit for that follow-up.

-- 1. Lock down INSERT to a column allowlist. fare_amount, base_fare,
-- distance_fare_amount, time_fare_amount, service_fee_pct, service_fee_amount
-- are deliberately excluded -- a client INSERT that even attempts to name
-- one of these columns is now rejected outright by Postgres, not merely
-- overwritten later. driver_id and every driver-assignment/lifecycle column
-- are excluded too (unchanged from before: RLS already requires driver_id
-- IS NULL at insert, this just makes it impossible to even try).
REVOKE INSERT ON public.orders FROM authenticated;
GRANT INSERT (
  customer_id, status, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, vehicle_type, payment_method,
  trip_distance_km, trip_duration_minutes, expires_at
) ON public.orders TO authenticated;

-- 2. Server-side fare computation at creation. Mirrors the existing
-- handle_order_acceptance()/handle_order_completion() triggers in style
-- (SECURITY DEFINER, SET search_path = '', stamps NEW fields directly).
-- Fails loudly (RAISE EXCEPTION) if the required trip estimate is missing,
-- rather than silently computing a bogus/zero fare -- this is also the
-- signal that the client hasn't been updated yet to send
-- trip_distance_km/trip_duration_minutes.
CREATE OR REPLACE FUNCTION public.handle_order_creation_fare()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_breakdown RECORD;
BEGIN
  IF NEW.trip_distance_km IS NULL OR NEW.trip_duration_minutes IS NULL THEN
    RAISE EXCEPTION 'trip_distance_km and trip_duration_minutes are required to create an order';
  END IF;

  SELECT * INTO v_breakdown
  FROM public.calculate_fare_breakdown(
    NEW.vehicle_type, NEW.trip_distance_km, NEW.trip_duration_minutes, 0
  );

  NEW.base_fare := v_breakdown.base_fare;
  NEW.distance_fare_amount := v_breakdown.distance_fare;
  NEW.time_fare_amount := v_breakdown.time_fare;
  NEW.fare_amount := v_breakdown.total;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_creation_fare_trigger ON public.orders;
CREATE TRIGGER order_creation_fare_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_creation_fare();
