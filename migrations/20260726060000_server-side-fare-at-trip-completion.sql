-- Closes the trip-completion trust gap flagged since
-- audit_26-07-26_20-19_fare-engine-trust-boundary.md (Phase 3): today
-- handle_order_completion() trusts NEW.fare_amount verbatim, written by the
-- Transporter app's completeOrderTrip(). That write already fails as of
-- 20260726040000 (fare_amount UPDATE revoked from authenticated) -- this
-- migration is what makes trip completion work again, server-side.
--
-- The app may no longer supply the final fare at all. It supplies trip
-- facts the server cannot observe itself -- actual distance driven and
-- waiting time -- and the trigger derives everything else:
--   vehicle_type   -- already on the row from creation, not resent.
--   trip_started_at -- already on the row from the accepted->in_progress
--                     transition, not resent.
--   completed_at   -- server-stamped now(), same as before this migration.
--   duration       -- NOT app-supplied; computed as completed_at -
--                     trip_started_at. Trusting a client-sent duration
--                     would reopen the same class of gap this migration
--                     closes.
--
-- Not in scope (deliberately): tolerance/fraud checks on actual_distance_km
-- (e.g. rejecting an implausible distance/time ratio) -- flagged in the
-- referenced audit as needing a product decision on acceptable tolerance,
-- not a default to invent here. Also not in scope: reconciling this final
-- commission against the estimate-based fee already debited from the
-- driver's wallet at acceptance -- that mechanic is unchanged; only the
-- inputs to fare_amount/service_fee_amount/driver_earnings become
-- server-trusted instead of client-trusted.

-- 1. New trip-fact columns. Nullable, no default -- the trigger's own
-- explicit NULL check (mirroring handle_order_creation_fare's pattern) is
-- what turns "missing" into a clear error rather than a silent bad fare.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS actual_distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS actual_waiting_minutes NUMERIC;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_actual_distance_km_check CHECK (actual_distance_km >= 0),
  ADD CONSTRAINT orders_actual_waiting_minutes_check CHECK (actual_waiting_minutes >= 0);

-- 2. These are genuine driver-supplied inputs, not money -- grant UPDATE
-- explicitly (unlike vehicle_multiplier/driver_earnings, which were
-- deliberately left with zero grants since nothing legitimate ever writes
-- them from the client). Additive: does not touch any existing privilege.
GRANT UPDATE (actual_distance_km, actual_waiting_minutes)
  ON public.orders TO authenticated;

-- 3. Server-side fare computation at completion.
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

    -- Platform commission, recomputed against the FINAL fare (service_fee_pct
    -- was already set to 0.10 by handle_order_acceptance and is unchanged
    -- here -- only the amount it's applied to becomes the final fare instead
    -- of the accept-time estimate).
    NEW.service_fee_amount := round(NEW.fare_amount * NEW.service_fee_pct, 2);
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
