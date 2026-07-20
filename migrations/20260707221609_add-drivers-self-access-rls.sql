-- Drivers self-access RLS.
-- The drivers table previously only had admins_manage_drivers (is_admin()),
-- so a logged-in customer could not read or create their own driver profile.
-- These policies let an authenticated user manage only the drivers row whose
-- auth_id matches their own auth.uid(). A person can therefore hold both a
-- customers row and a drivers row under the same email/phone — that is not a
-- duplicate-account conflict.

CREATE POLICY "drivers_select_own" ON drivers
  FOR SELECT TO authenticated
  USING (auth_id = (SELECT auth.uid()));

CREATE POLICY "drivers_insert_own" ON drivers
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = (SELECT auth.uid()));

CREATE POLICY "drivers_update_own" ON drivers
  FOR UPDATE TO authenticated
  USING (auth_id = (SELECT auth.uid()))
  WITH CHECK (auth_id = (SELECT auth.uid()));

-- One driver profile per auth user; also lets the app upsert safely later.
ALTER TABLE drivers ADD CONSTRAINT drivers_auth_id_key UNIQUE (auth_id);
