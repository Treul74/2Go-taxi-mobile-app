import { Platform } from 'react-native';
import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import type { UploadedDocument } from '@/types';

export type DriverDocumentType =
  | 'driverLicense'
  | 'vehicleRegistration'
  | 'insurance'
  | 'profilePhoto';

// Verification documents live in a private bucket (owner-only read via
// storage RLS); profile photos are public so they can render anywhere in
// the app without signed URLs.
const DOCUMENT_BUCKETS: Record<DriverDocumentType, string> = {
  driverLicense: 'driver-documents',
  vehicleRegistration: 'driver-documents',
  insurance: 'driver-documents',
  profilePhoto: 'profile-photos',
};

export const PROFILE_PHOTOS_BUCKET = 'profile-photos';

export interface LocalFileOptions {
  fileName?: string | null;
  mimeType?: string | null;
}

function fileExtension(nameOrUri: string, mimeType?: string): string {
  const fromName = nameOrUri.split('?')[0].split('.').pop();
  if (fromName && fromName.length <= 5 && !fromName.includes('/')) {
    return fromName.toLowerCase();
  }
  if (mimeType?.includes('pdf')) return 'pdf';
  if (mimeType?.includes('png')) return 'png';
  return 'jpg';
}

/**
 * Core upload: reads a locally picked file (expo-image-picker /
 * expo-document-picker URI) and sends it to InsForge storage under
 * `{authId}/{keyPrefix}-{timestamp}.{ext}`. Keys are timestamped (never
 * overwritten in place) so a changed photo always gets a fresh URL and no
 * stale image cache can survive; callers delete the old object afterwards.
 */
async function uploadLocalFile(
  bucket: string,
  keyPrefix: string,
  localUri: string,
  options?: LocalFileOptions
): Promise<{ document: UploadedDocument | null; errorMessage: string | null; requiresReauth?: boolean }> {
  // insforge.auth.getCurrentUser() cannot be used here: in isServerMode
  // (mobile), the SDK's internal tokenManager is never populated by
  // signInWithPassword/verifyEmail/refreshSession, so getCurrentUser() always
  // resolves to a null user even with a valid session. authStore captures the
  // user id directly from those response bodies instead — see authStore.ts
  // and the identical pattern in services/accounts.ts.
  const authId = useAuthStore.getState().authUserId;
  if (!authId) {
    return {
      document: null,
      errorMessage: 'Your session has expired. Please sign in again.',
      requiresReauth: true,
    };
  }

  let blob: Blob;
  try {
    const response = await fetch(localUri);
    blob = await response.blob();
  } catch {
    return { document: null, errorMessage: 'Could not read the selected file. Please try again.' };
  }

  const mimeType = options?.mimeType || blob.type || 'application/octet-stream';
  const ext = fileExtension(options?.fileName || localUri, mimeType);
  const key = `${authId}/${keyPrefix}-${Date.now()}.${ext}`;

  // The SDK sends the file via FormData. Native RN FormData streams files
  // from a { uri, name, type } descriptor (a Blob part serializes
  // incorrectly there); the web runtime needs the real Blob. The SDK also
  // reads .type/.size off the object for the upload strategy request.
  const file =
    Platform.OS === 'web'
      ? blob
      : ({
          uri: localUri,
          name: options?.fileName || `${keyPrefix}.${ext}`,
          type: mimeType,
          size: blob.size,
        } as unknown as Blob);

  const { data, error } = await insforge.storage.from(bucket).upload(key, file);

  if (error || !data) {
    return {
      document: null,
      errorMessage: error?.message ?? 'Upload failed. Check your connection and try again.',
    };
  }

  return { document: { url: data.url, key: data.key }, errorMessage: null };
}

/**
 * Uploads a driver document. For 'profilePhoto' this creates a
 * DRIVER-SPECIFIC photo object ({authId}/profilePhoto-*) — the explicit
 * "different photo for my driver profile" choice. The SHARED avatar used by
 * both profiles goes through uploadSharedAvatar instead.
 */
export async function uploadDriverDocument(
  docType: DriverDocumentType,
  localUri: string,
  options?: LocalFileOptions
): Promise<{ document: UploadedDocument | null; errorMessage: string | null; requiresReauth?: boolean }> {
  return uploadLocalFile(DOCUMENT_BUCKETS[docType], docType, localUri, options);
}

/**
 * Uploads the shared avatar ({authId}/avatar-* in profile-photos) — the one
 * canonical photo referenced by the customer profile and any linked driver
 * profile. Use updateSharedProfilePhoto (services/profilePhoto.ts) rather
 * than calling this directly, so the database references stay in sync.
 */
export async function uploadSharedAvatar(
  localUri: string,
  options?: LocalFileOptions
): Promise<{ document: UploadedDocument | null; errorMessage: string | null; requiresReauth?: boolean }> {
  return uploadLocalFile(PROFILE_PHOTOS_BUCKET, 'avatar', localUri, options);
}

/**
 * Best-effort delete of a replaced storage object. Failure is swallowed by
 * design: the database already points at the new object, so a leaked old
 * file is cosmetic, while surfacing an error here would wrongly fail an
 * update that actually succeeded.
 */
export async function removeStoredObject(bucket: string, key: string): Promise<void> {
  try {
    await insforge.storage.from(bucket).remove(key);
  } catch {
    // ignore — see above
  }
}
