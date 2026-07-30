-- Merges fare_config into vehicle_classes. fare_config.vehicle_class_id has
-- a UNIQUE constraint (strict 1:1 with vehicle_classes) and there is no plan
-- for regional/multi-fare variants per class, so the join buys nothing and
-- every fare read pays for it (two round trips / a JOIN instead of one).
--
-- Reuses the existing vehicle_classes.status ('active'/'inactive') column
-- instead of adding a duplicate is_active boolean, per the vehicle_classes
-- table already having that column.
--
-- Two columns are carried over beyond the base fare_config columns the task
-- spec named, because dropping either would silently break the live
-- server-side pricing engine (calculate_fare_breakdown / the order creation
-- and completion triggers), which is explicitly out of bounds per AGENTS.md
-- ("never break a working feature"):
--   - vehicle_type: fare_config's actual 1:1 key that calculate_fare_breakdown()
--     and the order triggers look up by (matches orders.vehicle_type, a plain
--     TEXT column -- not vehicle_class_id). Carrying it onto vehicle_classes
--     preserves that lookup without also having to migrate orders.vehicle_type
--     to a FK, which is out of this task's scope. Nullable + UNIQUE: the
--     "Bicycle" vehicle_classes row has no fare_config counterpart and isn't
--     part of the ordering CHECK enum yet, so it stays NULL here too, same
--     as before this migration (no fare row existed for it either).
--   - vehicle_multiplier: added out-of-band alongside vehicle_class_id
--     (see 20260726010000_add-vehicle-multiplier-to-fare-config.sql) and is
--     read by every fare computation. Not in the task's column list, but
--     required for calculate_fare_breakdown() to keep producing the same
--     totals.
--
-- No admin screens reference fare_config or vehicle_classes in this repo
-- (repo-wide grep found none in src/ or app/; the admin dashboard is a
-- separate repo per AGENTS.md) -- so there is no in-repo screen to update
-- for this merge. The mobile app's own fare preview
-- (src/lib/fareCalculator.ts) is hardcoded and doesn't query either table
-- (see its own header comment) -- unaffected either way.

-- ============================================================
-- 1. Add fare_config's columns onto vehicle_classes
-- ============================================================

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

-- ============================================================
-- 2. Migrate existing fare_config data onto the matching row
--    (matched on fare_config.vehicle_class_id = vehicle_classes.id)
-- ============================================================

UPDATE public.vehicle_classes vc
SET
  vehicle_type = fc.vehicle_type,
  base_fare = fc.base_fare,
  min_fare = fc.min_fare,
  per_km = fc.per_km,
  per_minute = fc.per_minute,
  per_minute_waiting = fc.per_minute_waiting,
  cancellation_fee = fc.cancellation_fee,
  night_rate_multiplier = fc.night_rate_multiplier,
  peak_multiplier = fc.peak_multiplier,
  vehicle_multiplier = fc.vehicle_multiplier,
  platform_commission_pct = fc.platform_commission_pct,
  driver_commission_pct = fc.driver_commission_pct,
  -- fare_config.is_active folds into the pre-existing status column instead
  -- of a duplicate boolean; inactive fare rows demote an active class.
  status = CASE WHEN fc.is_active THEN vc.status ELSE 'inactive' END
FROM public.fare_config fc
WHERE fc.vehicle_class_id = vc.id;

-- Verify every fare_config row made it across before the table is dropped.
-- Aborts (and rolls back the whole migration) rather than silently losing
-- pricing data if a row didn't match a vehicle_classes.id for any reason.
DO $$
DECLARE
  v_fare_config_count INT;
  v_migrated_count INT;
BEGIN
  SELECT COUNT(*) INTO v_fare_config_count FROM public.fare_config;
  SELECT COUNT(*) INTO v_migrated_count
  FROM public.vehicle_classes vc
  JOIN public.fare_config fc ON fc.vehicle_class_id = vc.id
  WHERE vc.vehicle_type = fc.vehicle_type
    AND vc.base_fare = fc.base_fare
    AND vc.min_fare = fc.min_fare
    AND vc.per_km = fc.per_km
    AND vc.per_minute = fc.per_minute
    AND vc.per_minute_waiting = fc.per_minute_waiting
    AND vc.cancellation_fee = fc.cancellation_fee
    AND vc.night_rate_multiplier = fc.night_rate_multiplier
    AND vc.peak_multiplier = fc.peak_multiplier
    AND vc.vehicle_multiplier = fc.vehicle_multiplier
    AND vc.platform_commission_pct = fc.platform_commission_pct
    AND vc.driver_commission_pct = fc.driver_commission_pct;

  IF v_migrated_count != v_fare_config_count THEN
    RAISE EXCEPTION 'fare_config -> vehicle_classes migration mismatch: % of % rows verified',
      v_migrated_count, v_fare_config_count;
  END IF;
END $$;

-- ============================================================
-- 3. Point the fare engine at vehicle_classes instead of fare_config
--    (same signatures/behavior, just is_active -> status = 'active')
-- ============================================================

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
  vehicle_multiplier NUMERIC,
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
SET search_path = ''
AS $$
  SELECT total FROM public.calculate_fare_breakdown(
    p_vehicle_type, p_distance_km, p_duration_minutes, p_waiting_minutes
  );
$$;

GRANT EXECUTE ON FUNCTION public.calculate_fare_breakdown(TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fare(TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

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
    FROM public.vehicle_classes
    WHERE vehicle_type = NEW.vehicle_type AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active vehicle_classes row for vehicle_type %', NEW.vehicle_type;
    END IF;

    v_fee := round(NEW.fare_amount * (v_commission_pct / 100), 2);
    NEW.service_fee_pct := v_commission_pct;
    NEW.service_fee_amount := v_fee;
    PERFORM public.apply_wallet_transaction(NEW.driver_id, NEW.id, 'service_fee', -v_fee);
  END IF;
  RETURN NEW;
END;
$$;

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

-- ============================================================
-- 4. Drop fare_config now that vehicle_classes carries everything
--    and nothing left in the database reads from it.
-- ============================================================

DROP TABLE public.fare_config;

-- ============================================================
-- 5. Lock down direct access to vehicle_classes and re-expose a
--    public-safe projection.
--
-- Base table: unchanged admin-only RLS (admins_manage_vehicle_classes,
-- already in place) stays the single source of truth for full-row access,
-- including platform_commission_pct/driver_commission_pct. `authenticated`
-- keeps its table-level grant because the admin dashboard authenticates as
-- `authenticated` + is_admin() -- RLS decides rows, but Postgres still
-- requires the operation-level grant to reach the policy. `anon` never had
-- a matching policy (admins_manage_vehicle_classes is TO authenticated
-- only) so anon's prior write grants were dead but dangerous -- revoked.
--
-- Customer/Driver apps never get table-level access to vehicle_classes at
-- all. They read through vehicle_classes_public, a definer-owned view
-- (default view semantics -- NOT security_invoker) that runs with the
-- view owner's privileges independent of the caller's RLS/grants on the
-- base table, and only ever projects the public-facing columns. This is
-- enforced by Postgres column privileges, not app code: a client querying
-- vehicle_classes directly for platform_commission_pct gets "permission
-- denied for table vehicle_classes", not a value it has to know to ignore.
-- ============================================================

REVOKE ALL ON public.vehicle_classes FROM anon;

CREATE VIEW public.vehicle_classes_public AS
SELECT
  id,
  name,
  description,
  icon_svg_url,
  icon_svg_key,
  max_capacity,
  display_order,
  vehicle_type,
  base_fare,
  min_fare,
  per_km,
  per_minute,
  per_minute_waiting,
  cancellation_fee,
  night_rate_multiplier,
  peak_multiplier,
  vehicle_multiplier
FROM public.vehicle_classes
WHERE status = 'active';

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.vehicle_classes_public TO anon, authenticated;
