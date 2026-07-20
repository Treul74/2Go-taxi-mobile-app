-- Customer booking support on orders:
-- 1. vehicle_type column, constrained to the app's five VehicleType values
--    (Economy, Comfort, Bike, Tricycle, Truck → lowercase ids).
-- 2. RLS so the customer app can create/read/cancel its own orders
--    (previously only admins_manage_orders existed, so client inserts were denied).
-- 3. Customers may read the driver row assigned to one of their orders
--    (drivers RLS is otherwise self-access only).

-- 1. vehicle_type
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_type text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_vehicle_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_vehicle_type_check
  CHECK (
    vehicle_type IS NULL
    OR vehicle_type = ANY (ARRAY['economy', 'comfort', 'bike', 'tricycle', 'truck'])
  );

-- 2. Recursion-safe helper: the customers row id for the logged-in user.
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.customers WHERE auth_id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated;

-- Customers see their own orders.
DROP POLICY IF EXISTS customers_select_own_orders ON public.orders;
CREATE POLICY customers_select_own_orders
ON public.orders FOR SELECT
TO authenticated
USING (customer_id = public.current_customer_id());

-- Customers create their own orders, always starting as an unassigned pending order.
DROP POLICY IF EXISTS customers_insert_own_orders ON public.orders;
CREATE POLICY customers_insert_own_orders
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = public.current_customer_id()
  AND status = 'pending'
  AND driver_id IS NULL
);

-- Customers may update their own orders only to cancel them
-- (driver-side status transitions get their own policies when that flow is wired).
DROP POLICY IF EXISTS customers_cancel_own_orders ON public.orders;
CREATE POLICY customers_cancel_own_orders
ON public.orders FOR UPDATE
TO authenticated
USING (customer_id = public.current_customer_id())
WITH CHECK (
  customer_id = public.current_customer_id()
  AND status = 'cancelled'
);

-- 3. Customers read the driver assigned to one of their orders (for the trip card).
DROP POLICY IF EXISTS customers_select_assigned_driver ON public.drivers;
CREATE POLICY customers_select_assigned_driver
ON public.drivers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.driver_id = drivers.id
      AND o.customer_id = public.current_customer_id()
  )
);
