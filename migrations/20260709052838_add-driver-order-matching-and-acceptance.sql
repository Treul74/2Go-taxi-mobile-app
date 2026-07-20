-- Driver-side order acceptance flow:
-- 1. drivers.vehicle_type: real 5-value app vehicle type (economy/comfort/
--    bike/tricycle/truck), mirroring orders.vehicle_type. vehicle_class
--    (economy/suv/luxury/sprinter) is a different, coarser taxonomy that
--    cannot represent bike/tricycle at all -- it stays for now (still
--    NOT NULL, still written by the client) but is no longer used for
--    order-matching. Existing rows are backfilled best-effort from
--    vehicle_class; the original bike/tricycle choice, if any, wasn't
--    preserved there so this is an approximation for pre-existing rows only.
-- 2. orders.accepted_at: set when a driver accepts a pending order.
-- 3. Driver-side RLS on orders (previously only customers had policies here)
--    and a mirrored customers policy so an accepted order's driver can read
--    the customer's name/rating.
-- 4. Realtime broadcast of pending orders to approved drivers via a single
--    'orders:pending' channel, separate from the existing per-order
--    'order:<id>' customer-facing channel.

-- 1. drivers.vehicle_type
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS vehicle_type text;

UPDATE public.drivers
SET vehicle_type = CASE vehicle_class
  WHEN 'suv' THEN 'comfort'
  WHEN 'sprinter' THEN 'truck'
  ELSE 'economy'
END
WHERE vehicle_type IS NULL;

ALTER TABLE public.drivers
  ALTER COLUMN vehicle_type SET NOT NULL,
  ALTER COLUMN vehicle_type SET DEFAULT 'economy';

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_vehicle_type_check;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_vehicle_type_check
  CHECK (vehicle_type = ANY (ARRAY['economy', 'comfort', 'bike', 'tricycle', 'truck']));

-- 2. orders.accepted_at
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Recursion-safe helpers, mirroring public.current_customer_id().
CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.drivers WHERE auth_id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.current_driver_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_approved_driver()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE auth_id = (SELECT auth.uid()) AND account_status = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_approved_driver() TO authenticated;

-- 3a. Drivers browse unclaimed pending orders (initial list load / reconnect).
DROP POLICY IF EXISTS drivers_select_pending_orders ON public.orders;
CREATE POLICY drivers_select_pending_orders
ON public.orders FOR SELECT
TO authenticated
USING (status = 'pending' AND driver_id IS NULL AND public.is_approved_driver());

-- 3b. Drivers see orders assigned to them.
DROP POLICY IF EXISTS drivers_select_own_orders ON public.orders;
CREATE POLICY drivers_select_own_orders
ON public.orders FOR SELECT
TO authenticated
USING (driver_id = public.current_driver_id());

-- 3c. Drivers accept an unclaimed pending order. USING re-checks on every row
-- so a race between two drivers only lets the first UPDATE through -- once
-- driver_id is set, the row no longer matches USING for anyone else.
DROP POLICY IF EXISTS drivers_accept_pending_orders ON public.orders;
CREATE POLICY drivers_accept_pending_orders
ON public.orders FOR UPDATE
TO authenticated
USING (status = 'pending' AND driver_id IS NULL AND public.is_approved_driver())
WITH CHECK (driver_id = public.current_driver_id() AND status = 'accepted');

-- 3d. Mirror of customers_select_assigned_driver: the driver assigned to an
-- order may read that order's customer (name/rating for the trip card).
DROP POLICY IF EXISTS drivers_select_order_customer ON public.customers;
CREATE POLICY drivers_select_order_customer
ON public.customers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.customer_id = customers.id
      AND o.driver_id = public.current_driver_id()
  )
);

-- 4. Realtime channel for pending-order discovery.
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('orders:pending', 'Broadcast of pending/claimed orders to approved drivers', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.notify_pending_order()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'orders:pending',
    'pending_order',
    jsonb_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'driver_id', NEW.driver_id,
      'vehicle_type', NEW.vehicle_type,
      'pickup_address', NEW.pickup_address,
      'pickup_lat', NEW.pickup_lat,
      'pickup_lng', NEW.pickup_lng,
      'dropoff_address', NEW.dropoff_address,
      'dropoff_lat', NEW.dropoff_lat,
      'dropoff_lng', NEW.dropoff_lng,
      'fare_amount', NEW.fare_amount,
      'created_at', NEW.created_at
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS order_pending_broadcast_trigger ON public.orders;

CREATE TRIGGER order_pending_broadcast_trigger
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_pending_order();

-- Only approved drivers may subscribe to the pending-orders broadcast.
DROP POLICY IF EXISTS drivers_subscribe_pending_orders ON realtime.channels;
CREATE POLICY drivers_subscribe_pending_orders
ON realtime.channels FOR SELECT
TO authenticated
USING (pattern = 'orders:pending' AND public.is_approved_driver());
