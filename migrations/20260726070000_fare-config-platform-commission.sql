-- Moves the platform commission out of the hardcoded 0.10 in
-- handle_order_acceptance() and into fare_config, so it can vary per vehicle
-- type and be changed from the admin panel without a code/migration change.
--
-- fare_config.platform_commission_pct already exists (added out-of-band,
-- alongside vehicle_class_id/night_rate_multiplier/peak_multiplier/
-- cancellation_fee/driver_commission_pct -- none of which this migration
-- touches or assigns meaning to). It is currently unused by any trigger and
-- seeded at 0.00 for every vehicle type.
--
-- Also found while reviewing fare_config as instructed: the table is
-- currently wide open -- authenticated holds INSERT/UPDATE/DELETE on every
-- column, including base_fare/per_km/min_fare/vehicle_multiplier/is_active.
-- The original create-fare-config-table migration explicitly revoked this;
-- it was silently undone at some point, most likely when the later columns
-- were added out-of-band and whatever tool did so reapplied InsForge's
-- default "authenticated gets full CRUD" table grant. Re-closing this here,
-- since it's the same table this task is already touching and leaving it
-- open makes the new commission column pointless to protect.

-- 1. Re-close write access. Table-level, matching the original migration
-- exactly -- covers every column, including ones added since, without
-- needing a per-column REVOKE list.
REVOKE INSERT, UPDATE, DELETE ON public.fare_config FROM authenticated;
GRANT SELECT ON public.fare_config TO authenticated;

-- 2. Seed with today's real value so commission does not silently change
-- the moment the trigger starts reading it.
UPDATE public.fare_config SET platform_commission_pct = 10.00;

-- 3. Acceptance: read commission from fare_config instead of hardcoding it.
-- platform_commission_pct is 0-100 (see its existing CHECK constraint), so
-- service_fee_pct now stores that same percentage-scale value going forward
-- (previously it stored 0.10, a fraction -- see handle_order_completion
-- below for the matching unit fix).
CREATE OR REPLACE FUNCTION public.handle_order_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_commission_pct NUMERIC;
  v_fee NUMERIC;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT platform_commission_pct INTO v_commission_pct
    FROM public.fare_config
    WHERE vehicle_type = NEW.vehicle_type AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active fare_config row for vehicle_type %', NEW.vehicle_type;
    END IF;

    v_fee := round(NEW.fare_amount * (v_commission_pct / 100), 2);
    NEW.service_fee_pct := v_commission_pct;
    NEW.service_fee_amount := v_fee;
    PERFORM public.apply_wallet_transaction(NEW.driver_id, NEW.id, 'service_fee', -v_fee);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Completion: service_fee_pct is now percentage-scale (e.g. 10.00), not a
-- fraction (0.10) -- divide by 100 to match, so the final commission isn't
-- computed 100x too large.
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
      NEW.vehicle_type, NEW.actual_distance_km, v_duration_minutes, NEW.actual_waiting_minutes
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
