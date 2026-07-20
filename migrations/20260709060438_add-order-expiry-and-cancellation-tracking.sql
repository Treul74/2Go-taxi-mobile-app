-- Order expiry + cancellation attribution:
-- 1. expires_at: created_at + 3 minutes. Pending orders past this point are
--    stale and must stop being shown to drivers / actionable by customers.
--    A scheduled function (see schedules: expire-stale-orders) sweeps
--    status='pending' AND expires_at < now() to status='expired' every
--    minute; RLS below closes the race window before that sweep runs.
-- 2. cancelled_at / cancelled_by: attribution for a 'cancelled' order --
--    previously cancelOrder() only flipped status with no record of who/when.
-- 3. 'expired' becomes a valid status, distinct from 'cancelled'.

-- 1. expires_at
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '3 minutes');

UPDATE public.orders
SET expires_at = created_at + interval '3 minutes'
WHERE status = 'pending' AND expires_at IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN expires_at SET NOT NULL;

-- 2. cancelled_at / cancelled_by
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_cancelled_by_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by = ANY (ARRAY['customer', 'system']));

-- 3. 'expired' status
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired']));

-- Sweep target: only pending rows are ever scanned for expiry.
CREATE INDEX IF NOT EXISTS idx_orders_pending_expires_at
  ON public.orders (expires_at)
  WHERE status = 'pending';

-- 4a. Drivers may only browse/accept pending orders that have not expired yet
-- (closes the race window between an order going stale and the next sweep).
DROP POLICY IF EXISTS drivers_select_pending_orders ON public.orders;
CREATE POLICY drivers_select_pending_orders
ON public.orders FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND driver_id IS NULL
  AND expires_at > now()
  AND public.is_approved_driver()
);

DROP POLICY IF EXISTS drivers_accept_pending_orders ON public.orders;
CREATE POLICY drivers_accept_pending_orders
ON public.orders FOR UPDATE
TO authenticated
USING (
  status = 'pending'
  AND driver_id IS NULL
  AND expires_at > now()
  AND public.is_approved_driver()
)
WITH CHECK (driver_id = public.current_driver_id() AND status = 'accepted');

-- 4b. Customer-initiated cancellation must attribute itself as 'customer'.
DROP POLICY IF EXISTS customers_cancel_own_orders ON public.orders;
CREATE POLICY customers_cancel_own_orders
ON public.orders FOR UPDATE
TO authenticated
USING (customer_id = public.current_customer_id())
WITH CHECK (
  customer_id = public.current_customer_id()
  AND status = 'cancelled'
  AND cancelled_by = 'customer'
);
