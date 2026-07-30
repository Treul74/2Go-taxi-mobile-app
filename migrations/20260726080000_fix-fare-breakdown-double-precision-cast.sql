-- Deployment-blocking bug found during end-to-end QA (branch
-- qa-pricing-lifecycle): calculate_fare_breakdown()'s distance parameter is
-- NUMERIC, but orders.trip_distance_km and orders.actual_distance_km are
-- DOUBLE PRECISION. Postgres does not implicitly cast double precision to
-- numeric for function-argument resolution (only integer->numeric is
-- implicit) -- so both handle_order_creation_fare() and
-- handle_order_completion() have been calling calculate_fare_breakdown()
-- with an argument list that does not match any existing function
-- signature, since the migrations that created them
-- (20260726030000, 20260726060000). Confirmed directly:
--   SELECT calculate_fare_breakdown('economy', 10::double precision, 15, 0);
--   -> ERROR: function calculate_fare_breakdown(unknown, double precision,
--      integer, integer) does not exist
-- This means every order creation and every trip completion currently
-- fails outright. Every previous verification in this project avoided a
-- live INSERT/completion UPDATE (to avoid broadcasting synthetic orders to
-- real drivers / crediting real wallets), so this was never exercised
-- end-to-end until now. Fix: cast the double precision columns to numeric
-- at the call site in both trigger functions. No formula/behavior change --
-- purely a type-resolution fix.

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
    NEW.vehicle_type, NEW.trip_distance_km::numeric, NEW.trip_duration_minutes::numeric, 0
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

CREATE OR REPLACE FUNCTION public.handle_order_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duration_minutes NUMERIC;
  v_breakdown RECORD;
BEGIN
  IF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
    IF NEW.actual_distance_km IS NULL OR NEW.actual_waiting_minutes IS NULL THEN
      RAISE EXCEPTION 'actual_distance_km and actual_waiting_minutes are required to complete a trip';
    END IF;

    NEW.completed_at := now();
    v_duration_minutes := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.completed_at - NEW.trip_started_at)) / 60
    );

    SELECT * INTO v_breakdown
    FROM public.calculate_fare_breakdown(
      NEW.vehicle_type, NEW.actual_distance_km::numeric, v_duration_minutes, NEW.actual_waiting_minutes
    );

    NEW.base_fare := v_breakdown.base_fare;
    NEW.distance_fare_amount := v_breakdown.distance_fare;
    NEW.time_fare_amount := v_breakdown.time_fare;
    NEW.waiting_fare_amount := v_breakdown.waiting_fare;
    NEW.vehicle_multiplier := v_breakdown.vehicle_multiplier;
    NEW.fare_amount := v_breakdown.total;

    NEW.service_fee_amount := round(NEW.fare_amount * (NEW.service_fee_pct / 100), 2);
    NEW.driver_earnings := NEW.fare_amount - NEW.service_fee_amount;

    PERFORM public.apply_wallet_transaction(NEW.driver_id, NEW.id, 'trip_earning', NEW.fare_amount);
    UPDATE public.drivers
    SET total_earnings = total_earnings + NEW.fare_amount,
        total_completed_rides = total_completed_rides + 1
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$;
