-- Fare rates per vehicle type, managed from the admin panel instead of
-- hardcoded in the app (src/lib/fareCalculator.ts). Seeded below with values
-- equivalent to the current PRICING_RATES x VEHICLE_FARE_MULTIPLIERS in the
-- app so fares do not change on day one.
CREATE TABLE fare_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT NOT NULL UNIQUE CHECK (vehicle_type IN
    ('economy', 'comfort', 'bike', 'tricycle', 'truck')),
  base_fare NUMERIC NOT NULL DEFAULT 25,
  per_km NUMERIC NOT NULL DEFAULT 8,
  per_minute NUMERIC NOT NULL DEFAULT 2,
  per_minute_waiting NUMERIC NOT NULL DEFAULT 1.5,
  min_fare NUMERIC NOT NULL DEFAULT 35,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fare_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_read_fare_config" ON fare_config
  FOR SELECT TO authenticated
  USING (true);

-- Writes go through the admin panel using the project API key
-- (project_admin), which bypasses RLS and grants entirely. Explicitly strip
-- the broad default DML privileges InsForge grants to anon/authenticated on
-- public tables so no app-side client can write to this table.
REVOKE ALL ON fare_config FROM anon;
REVOKE INSERT, UPDATE, DELETE ON fare_config FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON fare_config TO authenticated;

CREATE TRIGGER fare_config_updated_at
  BEFORE UPDATE ON fare_config
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

-- Matches PRICING_RATES (base) x VEHICLE_FARE_MULTIPLIERS[vehicleType] from
-- src/lib/fareCalculator.ts at time of migration: economy=1, comfort=1.5,
-- bike=0.5, tricycle=0.7, truck=2.5.
INSERT INTO fare_config (vehicle_type, base_fare, per_km, per_minute, per_minute_waiting, min_fare) VALUES
  ('economy',  25,   8,    2,   1.5,  35),
  ('comfort',  37.5, 12,   3,   2.25, 52.5),
  ('bike',     12.5, 4,    1,   0.75, 17.5),
  ('tricycle', 17.5, 5.6,  1.4, 1.05, 24.5),
  ('truck',    62.5, 20,   5,   3.75, 87.5);
