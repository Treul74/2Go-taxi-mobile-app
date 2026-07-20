-- vehicle_class was a legacy column (economy/suv/luxury/sprinter) left over
-- from before vehicle_type (economy/comfort/bike/tricycle/truck) became the
-- source of truth. Confirmed not referenced by any RLS policy on drivers
-- (drivers_select_own, drivers_update_own, drivers_insert_own,
-- admins_manage_drivers, customers_select_assigned_driver) before dropping.
-- drivers_vehicle_class_check is dropped automatically with the column.
ALTER TABLE public.drivers DROP COLUMN IF EXISTS vehicle_class;

-- vehicle_type already carries the correct CHECK constraint
-- (economy/comfort/bike/tricycle/truck) -- reasserted here defensively.
ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_vehicle_type_check;
ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_vehicle_type_check
  CHECK (vehicle_type IN ('economy', 'comfort', 'bike', 'tricycle', 'truck'));
