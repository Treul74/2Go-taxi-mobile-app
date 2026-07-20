-- Trip completion (driver side) + wallet ledger + service fee at acceptance:
-- 1. drivers.wallet_balance: running balance, maintained only through
--    apply_wallet_transaction() -- client UPDATE access to it (and to the
--    other derived stat columns) is revoked below.
-- 2. wallet_transactions: append-only ledger. One row per service-fee
--    deduction (at acceptance) or trip-earning credit (at completion).
-- 3. Service fee (10% of fare_amount) is deducted from the driver's wallet at
--    the moment they accept a request -- not at completion -- per the app's
--    documented trip-status flow (AGENTS.md). service_fee_pct/
--    service_fee_amount columns already existed on orders but nothing ever
--    populated them.
-- 4. Trip completion: drivers_complete_orders RLS policy (the acceptance
--    migration reserved this transition for "when that flow is built") plus
--    a trigger that credits the full fare_amount to the driver's wallet and
--    bumps total_earnings/total_completed_rides. completed_at is always
--    server-set, never client-supplied.
-- 5. fare_amount added to the order_realtime broadcast payload so the
--    customer's completed-trip screen can show the real final fare without a
--    second fetch.

-- 1. wallet_balance
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0;

-- Client may never write these derived money/stat fields directly; every
-- other existing column keeps its current write access.
REVOKE UPDATE ON public.drivers FROM authenticated;
GRANT UPDATE (
  first_name, last_name, email, phone_number, profile_photo_url,
  account_status, driver_status, vehicle_make, vehicle_model, vehicle_year,
  vehicle_class, license_plate, current_lat, current_lng, location_updated_at,
  drivers_license_url, vehicle_registration_url, insurance_certificate_url,
  drivers_license_key, vehicle_registration_key, insurance_certificate_key,
  profile_photo_key, vehicle_type
) ON public.drivers TO authenticated;

-- 2. wallet_transactions (append-only ledger)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('trip_earning', 'service_fee', 'withdrawal', 'adjustment')),
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_driver_id
  ON public.wallet_transactions (driver_id, created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_select_own_wallet_transactions ON public.wallet_transactions;
CREATE POLICY drivers_select_own_wallet_transactions
ON public.wallet_transactions FOR SELECT
TO authenticated
USING (driver_id = public.current_driver_id());

-- Append-only: no client INSERT/UPDATE/DELETE grants at all -- every row is
-- written by apply_wallet_transaction() (SECURITY DEFINER), never the client.
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;

-- 3. Trusted wallet mutation helper -- the only path that may change wallet_balance.
CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(
  p_driver_id uuid, p_order_id uuid, p_type text, p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE public.drivers
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_driver_id
  RETURNING wallet_balance INTO v_new_balance;

  INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, balance_after)
  VALUES (p_driver_id, p_order_id, p_type, p_amount, v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid, uuid, text, numeric) TO authenticated;

-- 4. Service fee at acceptance (10% of fare_amount). BEFORE trigger so it can
-- both stamp the fee columns on NEW and apply the ledger side effect in one
-- pass; RLS WITH CHECK for drivers_accept_pending_orders evaluates the row
-- after BEFORE triggers run, so this doesn't fight that policy.
CREATE OR REPLACE FUNCTION public.handle_order_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee numeric;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    v_fee := round(NEW.fare_amount * 0.10, 2);
    NEW.service_fee_pct := 0.10;
    NEW.service_fee_amount := v_fee;
    PERFORM public.apply_wallet_transaction(NEW.driver_id, NEW.id, 'service_fee', -v_fee);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_acceptance_fee_trigger ON public.orders;
CREATE TRIGGER order_acceptance_fee_trigger
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_acceptance();

-- 5. Trip completion: credit full fare_amount, bump lifetime stats.
-- completed_at is always server-stamped here, regardless of what the client sends.
CREATE OR REPLACE FUNCTION public.handle_order_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
    NEW.completed_at := now();
    PERFORM public.apply_wallet_transaction(NEW.driver_id, NEW.id, 'trip_earning', NEW.fare_amount);
    UPDATE public.drivers
    SET total_earnings = total_earnings + NEW.fare_amount,
        total_completed_rides = total_completed_rides + 1
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_completion_trigger ON public.orders;
CREATE TRIGGER order_completion_trigger
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_completion();

-- 6. RLS: driver may move their own in_progress order to completed, setting
-- the final fare_amount (recalculated client-side from actual distance/
-- duration/waiting time, same trust model already used for fare_amount at
-- order creation). completed_at is trigger-maintained, not client-settable.
DROP POLICY IF EXISTS drivers_complete_orders ON public.orders;
CREATE POLICY drivers_complete_orders
ON public.orders FOR UPDATE
TO authenticated
USING (driver_id = public.current_driver_id() AND status = 'in_progress')
WITH CHECK (driver_id = public.current_driver_id() AND status = 'completed');

-- 7. fare_amount in the realtime broadcast payload, so the customer's
-- completed-trip screen shows the real final fare without a second fetch.
CREATE OR REPLACE FUNCTION public.notify_order_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'order:' || NEW.id::text,
    'order_updated',
    jsonb_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'driver_id', NEW.driver_id,
      'driver_heading', NEW.driver_heading,
      'driver_current_lat', NEW.driver_current_lat,
      'driver_current_lng', NEW.driver_current_lng,
      'estimated_arrival_minutes', NEW.estimated_arrival_minutes,
      'distance_to_pickup_km', NEW.distance_to_pickup_km,
      'trip_started_at', NEW.trip_started_at,
      'driver_arrived_at', NEW.driver_arrived_at,
      'completed_at', NEW.completed_at,
      'fare_amount', NEW.fare_amount,
      'updated_at', NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
