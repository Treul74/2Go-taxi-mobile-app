-- Wires vehicle_classes.night_rate_multiplier / peak_multiplier into the
-- real server-side fare engine. These columns have existed since the
-- fare_config -> vehicle_classes merge (20260728183527) but were never read
-- by calculate_fare_breakdown() -- confirmed dead in
-- audit_export/audit_28-07-26_21-24_fare-vehicle-service-area-migration-check.md.
--
-- Windows (Zambia local time, confirmed against the brief, no prior
-- documented value to contradict):
--   Night: 22:00-05:00, every day
--   Peak:  07:00-09:00 and 17:00-19:00, weekdays (Mon-Fri) only
--   Night takes priority over peak (they don't overlap given these windows,
--   but the precedence is explicit per the brief: "if night ... else if peak").
--
-- Timezone: the session/server timezone defaults to GMT (confirmed via
-- `SHOW timezone`), but Zambia is UTC+2 year-round (no DST) -- so every
-- boundary check converts the input timestamptz via
-- `AT TIME ZONE 'Africa/Lusaka'` first. Evaluating hour/day-of-week against
-- the raw GMT value would shift every window by 2 hours and silently apply
-- the wrong rate.
--
-- Order of operations, preserving the existing formula structure exactly
-- per instructions -- only one new factor is inserted, nothing about how
-- vehicle_multiplier/min_fare already interact changes:
--   OLD: total = vehicle_multiplier * GREATEST(subtotal, min_fare)
--   NEW: total = vehicle_multiplier * surcharge_multiplier * GREATEST(subtotal, min_fare)
-- (surcharge_multiplier defaults to 1.0 outside night/peak windows, so this
-- is a no-op today for every row -- all five vehicle_classes rows currently
-- have night_rate_multiplier = peak_multiplier = 1.0; an admin sets real
-- values later, this migration only makes the columns load-bearing.)

-- ============================================================
-- 1. orders.surcharge_multiplier -- audit column, same treatment as
--    vehicle_multiplier (20260726050000): stamped by the trigger only, no
--    grant to authenticated, so it's unwritable by either app directly.
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS surcharge_multiplier NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_surcharge_multiplier_check CHECK (surcharge_multiplier > 0);

-- ============================================================
-- 2. calculate_fare_breakdown / calculate_fare -- new required
--    p_at_timestamp parameter (the moment the fare is being priced for),
--    inserted before the already-defaulted p_waiting_minutes since Postgres
--    requires defaulted parameters to be trailing. The old 4-arg signatures
--    are dropped, not just replaced -- CREATE OR REPLACE cannot change a
--    function's parameter list, it would otherwise create a second,
--    orphaned overload (same caution as the vehicle_multiplier migration).
-- ============================================================
DROP FUNCTION IF EXISTS public.calculate_fare_breakdown(TEXT, NUMERIC, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.calculate_fare(TEXT, NUMERIC, NUMERIC, NUMERIC);

CREATE FUNCTION public.calculate_fare_breakdown(
  p_vehicle_type TEXT,
  p_distance_km NUMERIC,
  p_duration_minutes NUMERIC,
  p_at_timestamp TIMESTAMPTZ,
  p_waiting_minutes NUMERIC DEFAULT 0
) RETURNS TABLE (
  base_fare NUMERIC,
  distance_fare NUMERIC,
  time_fare NUMERIC,
  waiting_fare NUMERIC,
  subtotal NUMERIC,
  vehicle_multiplier NUMERIC,
  surcharge_multiplier NUMERIC,
  min_fare NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_config public.vehicle_classes%ROWTYPE;
  v_distance_fare NUMERIC;
  v_time_fare NUMERIC;
  v_waiting_fare NUMERIC;
  v_subtotal NUMERIC;
  v_local_time TIMESTAMP;
  v_hour INT;
  v_isodow INT;
  v_surcharge_multiplier NUMERIC;
BEGIN
  SELECT * INTO v_config FROM public.vehicle_classes
  WHERE vehicle_type = p_vehicle_type AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active vehicle_classes row for vehicle_type %', p_vehicle_type;
  END IF;

  v_distance_fare := p_distance_km * v_config.per_km;
  v_time_fare := p_duration_minutes * v_config.per_minute;
  v_waiting_fare := p_waiting_minutes * v_config.per_minute_waiting;
  v_subtotal := v_config.base_fare + v_distance_fare + v_time_fare + v_waiting_fare;

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

  RETURN QUERY SELECT
    ROUND(v_config.base_fare, 2),
    ROUND(v_distance_fare, 2),
    ROUND(v_time_fare, 2),
    ROUND(v_waiting_fare, 2),
    ROUND(v_subtotal, 2),
    v_config.vehicle_multiplier,
    v_surcharge_multiplier,
    ROUND(v_config.min_fare, 2),
    ROUND(v_config.vehicle_multiplier * v_surcharge_multiplier * GREATEST(v_subtotal, v_config.min_fare), 2);
END;
$$;

CREATE FUNCTION public.calculate_fare(
  p_vehicle_type TEXT,
  p_distance_km NUMERIC,
  p_duration_minutes NUMERIC,
  p_at_timestamp TIMESTAMPTZ,
  p_waiting_minutes NUMERIC DEFAULT 0
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT total FROM public.calculate_fare_breakdown(
    p_vehicle_type, p_distance_km, p_duration_minutes, p_at_timestamp, p_waiting_minutes
  );
$$;

GRANT EXECUTE ON FUNCTION public.calculate_fare_breakdown(TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fare(TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, NUMERIC) TO authenticated;

-- ============================================================
-- 3. Triggers -- pass the timestamp that anchors "when the trip actually
--    happened" for each call site, instead of letting the function default
--    to now() at whatever moment it happens to run:
--    - Creation: NEW.requested_at (column DEFAULT now(), already populated
--      on NEW before this BEFORE INSERT trigger body runs -- this is the
--      moment the customer actually requested the ride).
--    - Completion: NEW.completed_at, stamped to now() one line above this
--      call, same as before this migration -- the moment the trip actually
--      finished, not a value re-derived by calling now() again later.
-- ============================================================
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
    NEW.vehicle_type, NEW.trip_distance_km::numeric, NEW.trip_duration_minutes::numeric,
    NEW.requested_at, 0
  );

  NEW.base_fare := v_breakdown.base_fare;
  NEW.distance_fare_amount := v_breakdown.distance_fare;
  NEW.time_fare_amount := v_breakdown.time_fare;
  NEW.waiting_fare_amount := v_breakdown.waiting_fare;
  NEW.vehicle_multiplier := v_breakdown.vehicle_multiplier;
  NEW.surcharge_multiplier := v_breakdown.surcharge_multiplier;
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
      NEW.vehicle_type, NEW.actual_distance_km::numeric, v_duration_minutes,
      NEW.completed_at, NEW.actual_waiting_minutes
    );

    NEW.base_fare := v_breakdown.base_fare;
    NEW.distance_fare_amount := v_breakdown.distance_fare;
    NEW.time_fare_amount := v_breakdown.time_fare;
    NEW.waiting_fare_amount := v_breakdown.waiting_fare;
    NEW.vehicle_multiplier := v_breakdown.vehicle_multiplier;
    NEW.surcharge_multiplier := v_breakdown.surcharge_multiplier;
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
