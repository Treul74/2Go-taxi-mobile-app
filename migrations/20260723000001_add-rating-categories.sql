-- Category ratings on top of the existing overall `rating` column.
-- Passenger rates driver on driving_skill / cleanliness / driver_communication.
-- Driver rates passenger on punctuality / payment / passenger_communication.
-- All nullable so existing rows and skipped categories are unaffected.

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS driving_skill smallint
    CHECK (driving_skill BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS cleanliness smallint
    CHECK (cleanliness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS driver_communication smallint
    CHECK (driver_communication BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS punctuality smallint
    CHECK (punctuality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS payment smallint
    CHECK (payment BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS passenger_communication smallint
    CHECK (passenger_communication BETWEEN 1 AND 5);
