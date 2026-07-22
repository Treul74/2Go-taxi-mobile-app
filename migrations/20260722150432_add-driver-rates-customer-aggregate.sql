-- Driver -> customer ratings (backend only):
-- ratings previously allowed exactly one row per order (order_id UNIQUE),
-- always customer -> driver. This adds a `rated_by` discriminator so a
-- second row (driver -> customer) can exist per order, and extends the
-- aggregate trigger to recompute customers.rating/total_ratings for that
-- direction, mirroring the existing drivers.rating/total_ratings logic from
-- migrations/20260709075617_add-ratings-and-driver-rating-aggregate.sql.
--
-- No app code changes: existing customer -> driver inserts (services/ratings.ts)
-- omit rated_by and keep working unchanged via the 'customer' default. There
-- is no driver-side submission UI/service yet -- this migration only makes
-- the backend ready for one.

ALTER TABLE public.ratings
  ADD COLUMN rated_by text NOT NULL DEFAULT 'customer'
  CHECK (rated_by = ANY (ARRAY['customer'::text, 'driver'::text]));

-- One rating per order per direction, instead of one rating per order.
ALTER TABLE public.ratings DROP CONSTRAINT ratings_order_id_key;
ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_order_id_rated_by_key UNIQUE (order_id, rated_by);

CREATE INDEX IF NOT EXISTS idx_ratings_customer_id ON public.ratings (customer_id);

-- Customers may rate their own completed order, exactly once, only for the
-- driver actually assigned to it, and only in the customer -> driver direction.
DROP POLICY IF EXISTS customers_insert_own_rating ON public.ratings;
CREATE POLICY customers_insert_own_rating
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  rated_by = 'customer'
  AND customer_id = public.current_customer_id()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ratings.order_id
      AND o.customer_id = public.current_customer_id()
      AND o.driver_id = ratings.driver_id
      AND o.status = 'completed'
  )
);

-- Drivers may rate the customer on their own completed order, exactly once,
-- only for the customer actually on it, and only in the driver -> customer
-- direction.
DROP POLICY IF EXISTS drivers_insert_own_rating ON public.ratings;
CREATE POLICY drivers_insert_own_rating
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  rated_by = 'driver'
  AND driver_id = public.current_driver_id()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ratings.order_id
      AND o.driver_id = public.current_driver_id()
      AND o.customer_id = ratings.customer_id
      AND o.status = 'completed'
  )
);

CREATE OR REPLACE FUNCTION public.handle_new_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.rated_by = 'driver' THEN
    UPDATE public.customers
    SET rating = round(((COALESCE(rating, 0) * total_ratings) + NEW.rating) / (total_ratings + 1), 2),
        total_ratings = total_ratings + 1
    WHERE id = NEW.customer_id;
  ELSE
    UPDATE public.drivers
    SET rating = round(((COALESCE(rating, 0) * total_ratings) + NEW.rating) / (total_ratings + 1), 2),
        total_ratings = total_ratings + 1
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$;
