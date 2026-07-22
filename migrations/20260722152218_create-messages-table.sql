-- Chat messages, one row per order thread. Persists chat so messages survive
-- app restart and actually reach the other party (previously simulated
-- client-side only -- see AGENTS.md known gap "Chat messages not persisted").
-- Read/send is polled by the app on a 5s interval, not realtime -- realtime
-- channel auth doesn't work under this SDK's server mode (see the
-- order:<id> / orders:pending channel comments in earlier migrations).

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'driver')),
  sender_id uuid NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_order_id_created_at ON public.messages (order_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Customers read/send messages on their own order.
DROP POLICY IF EXISTS customers_select_own_order_messages ON public.messages;
CREATE POLICY customers_select_own_order_messages
ON public.messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND o.customer_id = public.current_customer_id()
  )
);

DROP POLICY IF EXISTS customers_insert_own_order_messages ON public.messages;
CREATE POLICY customers_insert_own_order_messages
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'customer'
  AND sender_id = public.current_customer_id()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND o.customer_id = public.current_customer_id()
  )
);

-- Drivers read/send messages on orders assigned to them.
DROP POLICY IF EXISTS drivers_select_own_order_messages ON public.messages;
CREATE POLICY drivers_select_own_order_messages
ON public.messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND o.driver_id = public.current_driver_id()
  )
);

DROP POLICY IF EXISTS drivers_insert_own_order_messages ON public.messages;
CREATE POLICY drivers_insert_own_order_messages
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'driver'
  AND sender_id = public.current_driver_id()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND o.driver_id = public.current_driver_id()
  )
);

-- Append-only: no UPDATE/DELETE grant, matching the ratings table pattern.
REVOKE UPDATE, DELETE ON public.messages FROM authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
