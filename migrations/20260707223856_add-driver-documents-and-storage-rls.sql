-- Driver onboarding: verification document storage keys + storage access.
--
-- 1. drivers already has url columns for the verification documents
--    (drivers_license_url, vehicle_registration_url, insurance_certificate_url,
--    profile_photo_url). Each gains a matching _key column: the storage object
--    key is required for later download/delete, the url is for display.
--    profile_photo_key stays NULL when the driver reuses the photo already
--    attached to their customer profile (no duplicate upload).

ALTER TABLE drivers
  ADD COLUMN drivers_license_key       TEXT,
  ADD COLUMN vehicle_registration_key  TEXT,
  ADD COLUMN insurance_certificate_key TEXT,
  ADD COLUMN profile_photo_key         TEXT;

-- 2. storage.objects ships with RLS enabled and zero policies on fresh
--    installs, so authenticated users cannot upload anything yet.
--    Buckets: driver-documents (private), profile-photos (public).
--    Writes are owner-only in both; reads are owner-only for documents and
--    open for profile photos.

CREATE POLICY storage_objects_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket = 'driver-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY storage_objects_public_read_profile_photos ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket = 'profile-photos');

CREATE POLICY storage_objects_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket IN ('driver-documents', 'profile-photos')
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY storage_objects_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (uploaded_by = (SELECT auth.jwt() ->> 'sub'))
  WITH CHECK (uploaded_by = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY storage_objects_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (uploaded_by = (SELECT auth.jwt() ->> 'sub'));

GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT USAGE ON SCHEMA storage TO anon;
