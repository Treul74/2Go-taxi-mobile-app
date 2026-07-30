import { isInvalidTokenError } from '@/lib/auth';
import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import type { CustomerAccount, CustomerAccountStatus, DriverAccount, DriverStatus, UploadedDocument, VehicleType } from '@/types';

/**
 * Account lookups for the logged-in user.
 *
 * customers and drivers are separate tables: one person can hold a row in
 * both under the same email/phone. The signup-time "email/phone already
 * exists" check against customers (SignupScreen) must NOT be reused for the
 * Become a Driver flow — driver eligibility is checked against drivers only.
 */

interface CustomerRow {
  id: string;
  auth_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  account_status: CustomerAccountStatus;
  profile_photo_url: string | null;
  profile_photo_key: string | null;
}

interface DriverRow {
  id: string;
  auth_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  account_status: DriverAccount['accountStatus'];
  vehicle_type: VehicleType;
  profile_photo_url: string | null;
  profile_photo_key: string | null;
}

// insforge.auth.getCurrentUser() cannot be used here: in isServerMode
// (mobile), the SDK's internal tokenManager is never populated by
// signInWithPassword/verifyEmail/refreshSession, so getCurrentUser() always
// resolves to a null user even with a valid session. authStore captures the
// user id directly from those response bodies instead — see authStore.ts.
function getAuthUserId(): string | null {
  return useAuthStore.getState().authUserId;
}

/** Customer profile of the currently logged-in user, or null if none. */
export async function fetchCustomerAccount(): Promise<CustomerAccount | null> {
  const authId = await getAuthUserId();
  if (!authId) return null;

  let { data, error } = await insforge.database
    .from('customers')
    .select('id, auth_id, first_name, last_name, email, phone_number, account_status, profile_photo_url, profile_photo_key')
    .eq('auth_id', authId)
    .maybeSingle<CustomerRow>();

  // The access token minted at login can expire mid-session (e.g. by the
  // time a long trip ends) — refresh once and retry rather than reporting
  // "not signed in" for what is actually a stale token.
  if (isInvalidTokenError(error) && (await useAuthStore.getState().refreshSession())) {
    ({ data, error } = await insforge.database
      .from('customers')
      .select('id, auth_id, first_name, last_name, email, phone_number, account_status, profile_photo_url, profile_photo_key')
      .eq('auth_id', authId)
      .maybeSingle<CustomerRow>());
  }

  if (error || !data) return null;

  return {
    id: data.id,
    authId: data.auth_id,
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    email: data.email ?? '',
    phoneNumber: data.phone_number ?? '',
    accountStatus: data.account_status,
    profilePhotoUrl: data.profile_photo_url,
    profilePhotoKey: data.profile_photo_key,
  };
}

/**
 * Driver profile of the currently logged-in user, or null if they have never
 * applied. This is the ONLY duplicate check for the Become a Driver flow.
 */
export async function fetchDriverAccount(): Promise<DriverAccount | null> {
  const authId = await getAuthUserId();
  if (!authId) return null;

  let { data, error } = await insforge.database
    .from('drivers')
    .select('id, auth_id, first_name, last_name, email, phone_number, account_status, vehicle_type, profile_photo_url, profile_photo_key')
    .eq('auth_id', authId)
    .maybeSingle<DriverRow>();

  if (isInvalidTokenError(error) && (await useAuthStore.getState().refreshSession())) {
    ({ data, error } = await insforge.database
      .from('drivers')
      .select('id, auth_id, first_name, last_name, email, phone_number, account_status, vehicle_type, profile_photo_url, profile_photo_key')
      .eq('auth_id', authId)
      .maybeSingle<DriverRow>());
  }

  if (error || !data) return null;

  return {
    id: data.id,
    authId: data.auth_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phoneNumber: data.phone_number,
    accountStatus: data.account_status,
    vehicleType: data.vehicle_type,
    profilePhotoUrl: data.profile_photo_url,
    profilePhotoKey: data.profile_photo_key,
  };
}

/**
 * Persists the driver's online/offline availability to InsForge. The slide
 * toggle only flips the UI after this resolves successfully.
 */
export async function setDriverStatus(
  driverId: string,
  status: DriverStatus
): Promise<string | null> {
  const { error } = await insforge.database
    .from('drivers')
    .update({ driver_status: status })
    .eq('id', driverId);

  return error ? error.message : null;
}

export interface CreateDriverProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  licensePlate: string;
  vehicleType: VehicleType;
  documents: {
    driverLicense: UploadedDocument;
    vehicleRegistration: UploadedDocument;
    insurance: UploadedDocument;
    // key is null when reusing the customer profile photo (no re-upload)
    profilePhoto: UploadedDocument;
  };
}

/**
 * Creates the drivers row for the logged-in user (account_status defaults to
 * 'pending' — approval is an admin action). Returns the created account or an
 * error message. Never consults the customers table.
 */
export async function createDriverProfile(
  input: CreateDriverProfileInput
): Promise<{ account: DriverAccount | null; errorMessage: string | null }> {
  const authId = await getAuthUserId();
  if (!authId) {
    return { account: null, errorMessage: 'You need to be signed in to become a driver.' };
  }

  const year = parseInt(input.vehicleYear, 10);
  // Everything else (account_status 'pending', driver_status 'offline',
  // rating/ride counters/earnings at 0, null location, timestamps) comes from
  // the table defaults — the client never sends those fields.
  const row = {
    auth_id: authId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone_number: input.phone,
    vehicle_make: input.vehicleMake,
    vehicle_model: input.vehicleModel,
    vehicle_year: Number.isNaN(year) ? null : year,
    license_plate: input.licensePlate,
    vehicle_type: input.vehicleType,
    drivers_license_url: input.documents.driverLicense.url,
    drivers_license_key: input.documents.driverLicense.key,
    vehicle_registration_url: input.documents.vehicleRegistration.url,
    vehicle_registration_key: input.documents.vehicleRegistration.key,
    insurance_certificate_url: input.documents.insurance.url,
    insurance_certificate_key: input.documents.insurance.key,
    profile_photo_url: input.documents.profilePhoto.url,
    profile_photo_key: input.documents.profilePhoto.key,
  };

  // drivers.auth_id is UNIQUE, so a rejected applicant re-applying must
  // update their existing row (back to pending review) rather than insert.
  const existing = await fetchDriverAccount();
  if (existing && existing.accountStatus !== 'rejected') {
    return {
      account: existing,
      errorMessage:
        existing.accountStatus === 'suspended'
          ? 'Your driver account is suspended. Please contact support.'
          : 'You already have a driver profile.',
    };
  }

  const query = existing
    ? insforge.database
        .from('drivers')
        .update({ ...row, account_status: 'pending' })
        .eq('auth_id', authId)
    : insforge.database.from('drivers').insert([row]);

  const { data, error } = await query
    .select('id, auth_id, first_name, last_name, email, phone_number, account_status, vehicle_type, profile_photo_url, profile_photo_key')
    .single<DriverRow>();

  if (error || !data) {
    return {
      account: null,
      errorMessage: error?.message ?? 'Could not create your driver profile. Please try again.',
    };
  }

  return {
    account: {
      id: data.id,
      authId: data.auth_id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phoneNumber: data.phone_number,
      accountStatus: data.account_status,
      vehicleType: data.vehicle_type,
      profilePhotoUrl: data.profile_photo_url,
      profilePhotoKey: data.profile_photo_key,
    },
    errorMessage: null,
  };
}
