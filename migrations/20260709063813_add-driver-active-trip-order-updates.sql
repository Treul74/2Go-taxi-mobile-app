-- Driver-side order updates for the active-trip flow (after acceptance):
-- 1. Location telemetry: driver_current_lat/lng/heading, refreshed on a 5s
--    interval while an order is assigned to the driver.
-- 2. Arrival: driver_arrived_at. Status stays 'accepted' -- the customer app
--    (rideStore.applyOrderUpdate) reads driver_arrived_at, not a status
--    change, to flip the trip card to "driver waiting at pickup".
-- 3. Start trip: status -> 'in_progress', trip_started_at.
--
-- No existing policy covers any of this: drivers_accept_pending_orders (from
-- add-driver-order-matching-and-acceptance) only matches status='pending'
-- driver_id IS NULL, so it cannot apply once an order is already accepted.
--
-- Scoped to {'accepted','in_progress'} on both sides so this cannot be used
-- to reach 'completed' or 'cancelled' -- trip completion gets its own policy
-- when that flow is built.

DROP POLICY IF EXISTS drivers_update_active_orders ON public.orders;
CREATE POLICY drivers_update_active_orders
ON public.orders FOR UPDATE
TO authenticated
USING (
  driver_id = public.current_driver_id()
  AND status IN ('accepted', 'in_progress')
)
WITH CHECK (
  driver_id = public.current_driver_id()
  AND status IN ('accepted', 'in_progress')
);
