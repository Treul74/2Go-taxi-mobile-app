-- Post-trip ratings:
-- 1. ratings: one row per completed order (order_id UNIQUE), submitted by the
--    customer, optional/skippable -- rateRide() previously only wrote to
--    local rideStore state with no backend at all.
-- 2. Trigger recomputes drivers.rating/total_ratings on insert (running
--    average), mirroring the rating/total_ratings columns already on both
--    customers and drivers.

CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_driver_id ON public.ratings (driver_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- Customers may rate their own completed order, exactly once (order_id
-- UNIQUE), and only for the driver actually assigned to it.
DROP POLICY IF EXISTS customers_insert_own_rating ON public.ratings;
CREATE POLICY customers_insert_own_rating
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = public.current_customer_id()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ratings.order_id
      AND o.customer_id = public.current_customer_id()
      AND o.driver_id = ratings.driver_id
      AND o.status = 'completed'
  )
);

DROP POLICY IF EXISTS customers_select_own_ratings ON public.ratings;
CREATE POLICY customers_select_own_ratings
ON public.ratings FOR SELECT
TO authenticated
USING (customer_id = public.current_customer_id());

DROP POLICY IF EXISTS drivers_select_own_ratings ON public.ratings;
CREATE POLICY drivers_select_own_ratings
ON public.ratings FOR SELECT
TO authenticated
USING (driver_id = public.current_driver_id());

-- Ratings are immutable once submitted (append-only) -- no UPDATE/DELETE grant.
REVOKE UPDATE, DELETE ON public.ratings FROM authenticated;
GRANT SELECT, INSERT ON public.ratings TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.drivers
  SET rating = round(((COALESCE(rating, 0) * total_ratings) + NEW.rating) / (total_ratings + 1), 2),
      total_ratings = total_ratings + 1
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rating_insert_trigger ON public.ratings;
CREATE TRIGGER rating_insert_trigger
AFTER INSERT ON public.ratings
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_rating();
