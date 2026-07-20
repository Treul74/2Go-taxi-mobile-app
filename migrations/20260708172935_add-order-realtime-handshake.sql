-- Real-time driver-customer handshake: live driver telemetry columns on orders,
-- plus InsForge Realtime publishing for per-order channels.
-- Additive only: no existing columns are dropped or modified.

-- 1. New columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_heading double precision,
  ADD COLUMN IF NOT EXISTS driver_current_lat double precision,
  ADD COLUMN IF NOT EXISTS driver_current_lng double precision,
  ADD COLUMN IF NOT EXISTS estimated_arrival_minutes integer,
  ADD COLUMN IF NOT EXISTS distance_to_pickup_km double precision,
  ADD COLUMN IF NOT EXISTS trip_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_arrived_at timestamptz;

-- 2. Realtime channel pattern: one channel per order (order:<order-id>)
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('order:%', 'Per-order driver-customer handshake updates', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

-- 3. Publish order updates to the order's channel
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
      'updated_at', NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS order_realtime_trigger ON public.orders;

CREATE TRIGGER order_realtime_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_order_update();

-- 4. Only the order's customer or driver may subscribe to its channel
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participants_subscribe_own_orders ON realtime.channels;

CREATE POLICY participants_subscribe_own_orders
ON realtime.channels FOR SELECT
TO authenticated
USING (
  pattern = 'order:%'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
    LEFT JOIN public.drivers d ON d.id = o.driver_id
    WHERE o.id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
      AND (
        c.auth_id = (SELECT auth.uid())
        OR d.auth_id = (SELECT auth.uid())
      )
  )
);
