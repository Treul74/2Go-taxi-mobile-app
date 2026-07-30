-- fare_config today stores base_fare/per_km/per_minute/per_minute_waiting/
-- min_fare PRE-MULTIPLIED per vehicle type (e.g. comfort's base_fare=37.5 =
-- 25 * 1.5). That produces the correct grand total, but it means the
-- per-vehicle multiplier isn't exposed as its own value, and it silently
-- scales the individual line items -- which diverges from the app's actual
-- formula. calculateFareForVehicle() in src/lib/fareCalculator.ts computes
-- base_fare/distance_fare/time_fare/waiting_fare at the UNSCALED rate and
-- only multiplies the final total by VEHICLE_FARE_MULTIPLIERS[vehicleType]
-- (verified in audit_26-07-26_20-26_fare-formula-parity-check.md, section
-- 3.2). This migration adds an explicit vehicle_multiplier column (same
-- naming pattern as the existing night_rate_multiplier/peak_multiplier
-- columns) and reverts the per-row rate columns back to the unscaled base
-- rate, so calculate_fare_breakdown() can reproduce the app's formula
-- exactly, including which parts get scaled and which don't. No pricing
-- rule changes -- 25/8/2/1.5/35 x each vehicle's multiplier is the same
-- total as before, just no longer pre-multiplied into the stored rate.
ALTER TABLE public.fare_config
  ADD COLUMN vehicle_multiplier NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE public.fare_config
  ADD CONSTRAINT fare_config_vehicle_multiplier_check CHECK (vehicle_multiplier > 0);

UPDATE public.fare_config SET
  base_fare = 25,
  per_km = 8,
  per_minute = 2,
  per_minute_waiting = 1.5,
  min_fare = 35,
  vehicle_multiplier = CASE vehicle_type
    WHEN 'economy'  THEN 1
    WHEN 'comfort'  THEN 1.5
    WHEN 'bike'     THEN 0.5
    WHEN 'tricycle' THEN 0.7
    WHEN 'truck'    THEN 2.5
  END;

-- Return column list is changing (adding vehicle_multiplier, min_fare) so
-- the existing function must be dropped before it can be recreated with a
-- different RETURNS TABLE shape. Safe: confirmed via repo-wide grep (see
-- audit_26-07-26_20-45_fare-calculator-single-source-of-truth.md) that no
-- app code calls calculate_fare_breakdown/calculate_fare/queries fare_config
-- yet -- this function has no live callers to break.
DROP FUNCTION IF EXISTS public.calculate_fare_breakdown(TEXT, NUMERIC, NUMERIC, NUMERIC);

CREATE FUNCTION public.calculate_fare_breakdown(
  p_vehicle_type TEXT,
  p_distance_km NUMERIC,
  p_duration_minutes NUMERIC,
  p_waiting_minutes NUMERIC DEFAULT 0
) RETURNS TABLE (
  base_fare NUMERIC,
  distance_fare NUMERIC,
  time_fare NUMERIC,
  waiting_fare NUMERIC,
  subtotal NUMERIC,
  vehicle_multiplier NUMERIC,
  min_fare NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_config public.fare_config%ROWTYPE;
  v_distance_fare NUMERIC;
  v_time_fare NUMERIC;
  v_waiting_fare NUMERIC;
  v_subtotal NUMERIC;
BEGIN
  SELECT * INTO v_config FROM public.fare_config
  WHERE vehicle_type = p_vehicle_type AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active fare_config row for vehicle_type %', p_vehicle_type;
  END IF;

  v_distance_fare := p_distance_km * v_config.per_km;
  v_time_fare := p_duration_minutes * v_config.per_minute;
  v_waiting_fare := p_waiting_minutes * v_config.per_minute_waiting;
  v_subtotal := v_config.base_fare + v_distance_fare + v_time_fare + v_waiting_fare;

  RETURN QUERY SELECT
    ROUND(v_config.base_fare, 2),
    ROUND(v_distance_fare, 2),
    ROUND(v_time_fare, 2),
    ROUND(v_waiting_fare, 2),
    ROUND(v_subtotal, 2),
    v_config.vehicle_multiplier,
    ROUND(v_config.min_fare, 2),
    ROUND(v_config.vehicle_multiplier * GREATEST(v_subtotal, v_config.min_fare), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fare(
  p_vehicle_type TEXT,
  p_distance_km NUMERIC,
  p_duration_minutes NUMERIC,
  p_waiting_minutes NUMERIC DEFAULT 0
) RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT total FROM public.calculate_fare_breakdown(
    p_vehicle_type, p_distance_km, p_duration_minutes, p_waiting_minutes
  );
$$;

GRANT EXECUTE ON FUNCTION public.calculate_fare_breakdown(TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fare(TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
