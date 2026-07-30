-- Server-side fare calculation, replacing the local formula in
-- src/lib/fareCalculator.ts. calculate_fare_breakdown returns every line
-- item the app already displays (driver trip receipt, order creation);
-- calculate_fare is a thin NUMERIC-returning wrapper over it for simple
-- total-only callers (e.g. admin panel).
CREATE OR REPLACE FUNCTION public.calculate_fare_breakdown(
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
    v_config.base_fare,
    v_distance_fare,
    v_time_fare,
    v_waiting_fare,
    v_subtotal,
    GREATEST(v_subtotal, v_config.min_fare);
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
