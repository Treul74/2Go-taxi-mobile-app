-- Shared profile photo between customer and driver profiles.
--
-- One person = one canonical avatar object in storage
-- (profile-photos/{auth_id}/avatar-*). Both profile rows reference it
-- instead of holding copies:
--
--   customers.profile_photo_url/_key  → owns the shared avatar object
--   drivers.profile_photo_key IS NULL → driver profile is LINKED to the
--     customer avatar; its profile_photo_url is a synced mirror that the
--     app updates whenever the shared avatar changes
--   drivers.profile_photo_key NOT NULL → driver explicitly chose their own
--     photo (a separate object); excluded from shared-avatar sync
--
-- drivers already gained profile_photo_key in
-- 20260707223856_add-driver-documents-and-storage-rls; customers gets the
-- matching key column here so the shared object can be deleted/replaced.

ALTER TABLE customers ADD COLUMN profile_photo_key TEXT;

COMMENT ON COLUMN customers.profile_photo_key IS
  'Storage key of the shared avatar object in profile-photos; url is its display URL';
COMMENT ON COLUMN drivers.profile_photo_key IS
  'NULL = linked to customer shared avatar (url is a synced mirror); non-null = driver-specific photo';
