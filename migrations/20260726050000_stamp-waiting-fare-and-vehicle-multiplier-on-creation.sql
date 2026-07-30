-- Completes handle_order_creation_fare() (the BEFORE INSERT trigger added in
-- 20260726030000_server-side-fare-at-order-creation.sql) so all six
-- calculate_fare_breakdown() outputs relevant at booking time are explicitly
-- stamped, not just four of them:
--   base_fare, distance_fare_amount, time_fare_amount, fare_amount -- already
--   stamped since 20260726030000.
--   waiting_fare_amount -- column exists (20260726040000) but was never
--   written by the trigger; it only read as 0 by coincidence of its
--   DEFAULT 0, not because the breakdown's waiting_fare was actually stored.
--   vehicle_multiplier -- no column existed at all; added here.
--
-- vehicle_multiplier is a new column, so it starts with zero privileges for
-- any non-owner role -- it is not added to any authenticated INSERT/UPDATE
-- grant, so it is unwritable by the Customer or Transporter app without
-- needing a REVOKE (same reasoning already applied to driver_earnings).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_multiplier NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_vehicle_multiplier_check CHECK (vehicle_multiplier > 0);

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
  NEW.waiting_fare_amount := v_breakdown.waiting_fare;
  NEW.vehicle_multiplier := v_breakdown.vehicle_multiplier;
  NEW.fare_amount := v_breakdown.total;

  RETURN NEW;
END;
$$;
