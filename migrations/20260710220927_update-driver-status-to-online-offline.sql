-- Step 1 of renaming drivers.driver_status from active/idle/offline to online/offline.
-- Widen the constraint first (keep 'idle' temporarily) so this step can land
-- independently of the app-code update that follows.
ALTER TABLE drivers
DROP CONSTRAINT IF EXISTS drivers_driver_status_check;

UPDATE drivers SET driver_status = 'online'
WHERE driver_status IN ('active', 'idle');

ALTER TABLE drivers
ADD CONSTRAINT drivers_driver_status_check
CHECK (driver_status IN ('online', 'offline', 'idle'));
