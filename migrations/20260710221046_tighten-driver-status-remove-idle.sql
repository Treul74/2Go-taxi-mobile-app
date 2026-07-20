-- Step 2 of renaming drivers.driver_status from active/idle/offline to online/offline.
-- App code (goOnline/goOffline) now only ever writes 'online' or 'offline';
-- drop 'idle' from the allowed set.
ALTER TABLE drivers
DROP CONSTRAINT IF EXISTS drivers_driver_status_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM drivers
    WHERE driver_status IS NOT NULL
      AND driver_status NOT IN ('online', 'offline', 'active', 'idle')
  ) THEN
    RAISE EXCEPTION 'Unsupported driver_status values found before tightening the constraint';
  END IF;
END $$;

UPDATE drivers
SET driver_status = CASE driver_status
  WHEN 'active' THEN 'online'
  WHEN 'idle' THEN 'offline'
  ELSE driver_status
END
WHERE driver_status IN ('active', 'idle');

ALTER TABLE drivers
ADD CONSTRAINT drivers_driver_status_check
CHECK (driver_status IN ('online', 'offline'));
