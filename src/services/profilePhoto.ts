import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import type { UploadedDocument } from '@/types';
import {
  PROFILE_PHOTOS_BUCKET,
  removeStoredObject,
  uploadDriverDocument,
  uploadSharedAvatar,
  type LocalFileOptions,
} from './uploads';

/**
 * Shared profile photo sync.
 *
 * One person = one canonical avatar object in storage
 * (profile-photos/{authId}/avatar-*). The customers row owns it
 * (profile_photo_url + profile_photo_key); a drivers row with
 * profile_photo_key IS NULL is LINKED to it and its profile_photo_url is a
 * mirror kept in sync here. A non-null drivers.profile_photo_key means the
 * driver explicitly chose their own photo ({authId}/profilePhoto-*) and is
 * excluded from sync.
 *
 * Which function to call from a "change photo" button:
 *  - customer side, always            → updateSharedProfilePhoto
 *  - driver side, photo still linked  → updateSharedProfilePhoto
 *  - driver side, "use a different
 *    photo for my driver profile"     → setDriverOnlyProfilePhoto
 *  - driver side, "back to my
 *    profile photo"                   → revertDriverPhotoToShared
 */

interface PhotoResult {
  document: UploadedDocument | null;
  errorMessage: string | null;
}

// insforge.auth.getCurrentUser() cannot be used here: in isServerMode
// (mobile), the SDK's internal tokenManager is never populated by
// signInWithPassword/verifyEmail/refreshSession, so getCurrentUser() always
// resolves to a null user even with a valid session. authStore captures the
// user id directly from those response bodies instead — see authStore.ts
// and the identical pattern in services/accounts.ts.
function getAuthUserId(): string | null {
  return useAuthStore.getState().authUserId;
}

/**
 * Replaces the shared avatar: uploads the new object, points the customers
 * row at it, mirrors the new URL onto a linked drivers row (key stays NULL),
 * then deletes the replaced object. A driver with their own photo is left
 * untouched.
 */
export async function updateSharedProfilePhoto(
  localUri: string,
  options?: LocalFileOptions
): Promise<PhotoResult> {
  const authId = await getAuthUserId();
  if (!authId) {
    return { document: null, errorMessage: 'You need to be signed in to change your photo.' };
  }

  const { data: customer, error: customerError } = await insforge.database
    .from('customers')
    .select('id, profile_photo_key')
    .eq('auth_id', authId)
    .maybeSingle<{ id: string; profile_photo_key: string | null }>();

  if (customerError || !customer) {
    return { document: null, errorMessage: 'Could not load your profile. Please try again.' };
  }
  const oldKey = customer.profile_photo_key;

  const { document, errorMessage } = await uploadSharedAvatar(localUri, options);
  if (errorMessage || !document) {
    return { document: null, errorMessage: errorMessage ?? 'Upload failed. Please try again.' };
  }

  const { error: updateError } = await insforge.database
    .from('customers')
    .update({ profile_photo_url: document.url, profile_photo_key: document.key })
    .eq('auth_id', authId);

  if (updateError) {
    // The new object is orphaned — remove it and keep the old references.
    if (document.key) await removeStoredObject(PROFILE_PHOTOS_BUCKET, document.key);
    return { document: null, errorMessage: 'Could not save your new photo. Please try again.' };
  }

  // Mirror onto a linked driver profile (profile_photo_key IS NULL marks the
  // link; the key must stay NULL). Matching zero rows — no driver profile, or
  // a driver-specific photo — is the expected non-linked case.
  const { error: mirrorError } = await insforge.database
    .from('drivers')
    .update({ profile_photo_url: document.url })
    .eq('auth_id', authId)
    .is('profile_photo_key', null);

  // Delete the replaced object only once nothing references it. If the
  // mirror update failed, a linked driver row still shows the old URL, so
  // the old object must survive; the rows re-converge on the next change.
  if (oldKey && !mirrorError) {
    await removeStoredObject(PROFILE_PHOTOS_BUCKET, oldKey);
  }

  return { document, errorMessage: null };
}

/**
 * Explicitly gives the driver profile its OWN photo, detaching it from the
 * shared avatar: uploads a driver-specific object and points only the
 * drivers row at it. The customer profile keeps the shared avatar.
 */
export async function setDriverOnlyProfilePhoto(
  localUri: string,
  options?: LocalFileOptions
): Promise<PhotoResult> {
  const authId = await getAuthUserId();
  if (!authId) {
    return { document: null, errorMessage: 'You need to be signed in to change your photo.' };
  }

  const { data: driver, error: driverError } = await insforge.database
    .from('drivers')
    .select('id, profile_photo_key')
    .eq('auth_id', authId)
    .maybeSingle<{ id: string; profile_photo_key: string | null }>();

  if (driverError || !driver) {
    return { document: null, errorMessage: 'Could not load your driver profile. Please try again.' };
  }
  const oldKey = driver.profile_photo_key;

  const { document, errorMessage } = await uploadDriverDocument('profilePhoto', localUri, options);
  if (errorMessage || !document) {
    return { document: null, errorMessage: errorMessage ?? 'Upload failed. Please try again.' };
  }

  const { error: updateError } = await insforge.database
    .from('drivers')
    .update({ profile_photo_url: document.url, profile_photo_key: document.key })
    .eq('auth_id', authId);

  if (updateError) {
    if (document.key) await removeStoredObject(PROFILE_PHOTOS_BUCKET, document.key);
    return { document: null, errorMessage: 'Could not save your new photo. Please try again.' };
  }

  // A non-null old key was a previous driver-specific photo — nothing else
  // references it. A null old key means the row was linked to the shared
  // avatar, which the customer profile still uses: never delete it.
  if (oldKey) await removeStoredObject(PROFILE_PHOTOS_BUCKET, oldKey);

  return { document, errorMessage: null };
}

/**
 * Re-links a driver profile to the shared avatar ("use my profile photo
 * again"): mirrors the customer's current photo URL, nulls the driver key,
 * and deletes the abandoned driver-specific object.
 */
export async function revertDriverPhotoToShared(): Promise<{ errorMessage: string | null }> {
  const authId = await getAuthUserId();
  if (!authId) {
    return { errorMessage: 'You need to be signed in to change your photo.' };
  }

  const [{ data: customer }, { data: driver }] = await Promise.all([
    insforge.database
      .from('customers')
      .select('profile_photo_url')
      .eq('auth_id', authId)
      .maybeSingle<{ profile_photo_url: string | null }>(),
    insforge.database
      .from('drivers')
      .select('profile_photo_key')
      .eq('auth_id', authId)
      .maybeSingle<{ profile_photo_key: string | null }>(),
  ]);

  if (!customer || !driver) {
    return { errorMessage: 'Could not load your profile. Please try again.' };
  }

  const { error } = await insforge.database
    .from('drivers')
    .update({ profile_photo_url: customer.profile_photo_url, profile_photo_key: null })
    .eq('auth_id', authId);

  if (error) {
    return { errorMessage: 'Could not update your driver photo. Please try again.' };
  }

  if (driver.profile_photo_key) {
    await removeStoredObject(PROFILE_PHOTOS_BUCKET, driver.profile_photo_key);
  }

  return { errorMessage: null };
}
