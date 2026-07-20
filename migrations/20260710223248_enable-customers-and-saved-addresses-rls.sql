-- Enable RLS on customers and saved_addresses, which were created without it.
-- customers previously had only "drivers_select_order_customer" (lets a driver
-- read a customer they share an order with) -- enabling RLS with just that
-- policy would have locked customers out of their own row entirely (no
-- self-select/update/insert path), breaking login, AccountScreen, and signup
-- (OtpScreen inserts the customer row as the newly authenticated user).
-- These self-access policies close that gap.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_own ON public.customers;
CREATE POLICY customers_select_own
ON public.customers FOR SELECT
TO authenticated
USING (auth_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_update_own ON public.customers;
CREATE POLICY customers_update_own
ON public.customers FOR UPDATE
TO authenticated
USING (auth_id = (SELECT auth.uid()))
WITH CHECK (auth_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_insert_own ON public.customers;
CREATE POLICY customers_insert_own
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (auth_id = (SELECT auth.uid()));

-- saved_addresses: enable RLS and give customers full CRUD on their own rows.
-- customer_id has no index yet -- add one since it's now an RLS predicate column.
CREATE INDEX IF NOT EXISTS idx_saved_addresses_customer_id
  ON public.saved_addresses (customer_id);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

-- WITH CHECK added (task spec only had USING) -- without it a customer could
-- INSERT/UPDATE an address row carrying another customer's customer_id.
DROP POLICY IF EXISTS customers_manage_own_addresses ON public.saved_addresses;
CREATE POLICY customers_manage_own_addresses
ON public.saved_addresses FOR ALL
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers WHERE auth_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers WHERE auth_id = (SELECT auth.uid())
  )
);
