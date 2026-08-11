/**
 * 2Go Type Definitions
 */

// User & Roles
// Literal values intentionally kept as 'passenger'/'driver' (not renamed to
// 'customer'/'driver') -- this mirrors customers.account_type's DB enum
// value ('passenger'), so changing it here without a backend migration would
// desync app role state from the persisted account type. Domain-facing code
// should say "Customer", but this specific literal is a documented legacy
// exception. See AGENTS.md's Naming section and Phase 10F's terminology
// report in audit_export/.
export type UserRole = 'passenger' | 'driver';

// Matches the customers_account_status_check DB constraint.
export type CustomerAccountStatus = 'active' | 'suspended' | 'pending' | 'deleted';

// Backend account rows. One person may hold BOTH a customers row and a
// drivers row under the same email/phone — that is by design, not a conflict.
export interface CustomerAccount {
  id: string;
  authId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  accountStatus: CustomerAccountStatus;
  // The shared avatar object (profile-photos/{authId}/avatar-*), also
  // mirrored by a linked driver profile. See services/profilePhoto.ts.
  profilePhotoUrl: string | null;
  profilePhotoKey: string | null;
}

/**
 * A file stored in InsForge storage. url is for display; key is the object
 * path needed for download/delete. key is null when the file is reused from
 * elsewhere (e.g. driver profile photo linked from the customer profile)
 * rather than uploaded by this flow.
 */
export interface UploadedDocument {
  url: string;
  key: string | null;
}

export type DriverAccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// Matches the drivers_driver_status_check DB constraint.
export type DriverStatus = 'online' | 'offline';

export interface DriverAccount {
  id: string;
  authId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  accountStatus: DriverAccountStatus;
  vehicleType: VehicleType;
  // profilePhotoKey null = linked to the customer's shared avatar (the url
  // is a synced mirror); non-null = driver-specific photo, excluded from
  // shared-avatar sync. See services/profilePhoto.ts.
  profilePhotoUrl: string | null;
  profilePhotoKey: string | null;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  avatar?: string;
  rating: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: 'home' | 'work' | 'star';
}

// Ride Types
export type RideMode = 'taxi' | 'delivery';

export type VehicleType = 'economy' | 'comfort' | 'bike' | 'tricycle' | 'truck';

export type RideStatus =
  | 'idle'
  | 'planning'
  | 'matching'
  | 'active'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'mobile_money' | 'card';

export interface VehicleOption {
  id: VehicleType;
  name: string;
  description: string;
  icon: string;
  estimatedFare: number;
  eta: number; // minutes
  capacity: number;
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  hex9?: string; // H3 hexagon index (resolution 9)
  plusCode?: string; // Open Location Code for this point
  district?: string | null; // District/locality name, if resolved
}

export interface RideRequest {
  id: string;
  pickup: Location;
  destination: Location;
  vehicleType: VehicleType;
  mode: RideMode;
  paymentMethod: PaymentMethod;
  estimatedFare: number;
  eta: number;
  scheduledFor?: Date;
  bookingFor?: {
    name: string;
    phone: string;
  };
  driverInstructions?: string;
}

export interface ActiveTrip {
  id: string;
  status: 'driver_assigned' | 'arriving' | 'waiting' | 'in_progress' | 'completed';
  pickup: Location;
  destination: Location;
  driver: DriverInfo;
  vehicle: {
    model: string;
    color: string;
    plate: string;
  };
  estimatedArrival: number; // minutes
  fare: number;
  // When the order transitioned to 'accepted' — start of the cancellation window.
  acceptedAt: Date;
  startedAt?: Date;
  // Live position from the driver's telemetry ping (order.driver_current_lat/lng/heading),
  // null until the first realtime update arrives after acceptance.
  driverLocation?: { latitude: number; longitude: number } | null;
  driverHeading?: number;
}

export interface DriverInfo {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  rating: number;
  tripsCompleted: number;
  hex9?: string; // Last known H3 hexagon index
}


// Driver Types
export interface DriverStats {
  earningsToday: number;
  earningsWeek: number;
  tripsToday: number;
  tripsWeek: number;
  averageRating: number;
  acceptanceRate: number;
}

export interface IncomingRequest {
  id: string;
  pickup: Location;
  destination: Location;
  estimatedFare: number;
  distance: number; // km, from the driver's current location to pickup
  // Customer identity isn't visible pre-acceptance (RLS only grants a driver
  // read access to the customer of an order once driver_id is set to them).
  // Placeholder until then; patched with the real name/rating/id after accept.
  customerName: string;
  customerRating: number;
  customerId?: string;
  expiresAt: Date;
}

// Populated once completeOrderTrip() succeeds; read by the driver's
// trip-summary screen, then cleared when the driver returns home.
export interface TripSummary {
  tripId: string;
  customerName: string;
  customerId: string;
  distance: number; // km
  duration: number; // minutes
  waitingDuration: number; // minutes
  fareAmount: number;
  serviceFeeAmount: number;
  netEarnings: number;
}

// Trip facts the driver app reports at completion -- no fare fields. The
// server computes fare_amount/service_fee_amount/driver_earnings from
// distance/waitingDuration and its own server-stamped timestamps.
export interface TripCompletionInput {
  customerName: string;
  distance: number; // actual distance driven, km
  duration: number; // minutes, local display only -- not sent to the server
  waitingDuration: number; // minutes
  completedAt: string; // ISO timestamp
}

// Activity & History
export type RideHistoryStatus = 'completed' | 'cancelled' | 'scheduled';

export type CancellationReason =
  | 'changed_plans'
  | 'driver_too_far'
  | 'long_wait'
  | 'wrong_location'
  | 'found_alternative'
  | 'price_too_high'
  | 'other';

export interface RideHistoryItem {
  id: string;
  date: Date;
  pickup: Location;
  destination: Location;
  status: RideHistoryStatus;
  fare?: number;
  baseFare?: number;
  driver?: DriverInfo;
  vehicleType: VehicleType;
  mode: RideMode;
  rating?: number;
  duration?: number; // minutes
  cancellationReason?: CancellationReason;
  cancellationNote?: string;
}

// Messaging
export interface Conversation {
  id: string;
  participantName: string;
  participantAvatar?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  isOnline: boolean;
  rideId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: Date;
  isRead: boolean;
}

// Driver Onboarding
export type OnboardingStep = 'personal' | 'vehicle' | 'documents' | 'complete';

export interface DriverOnboardingData {
  currentStep: OnboardingStep;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    nationalId: string;
    address: string;
  } | null;
  vehicleInfo: {
    make: string;
    model: string;
    year: string;
    color: string;
    plate: string;
    vehicleType: VehicleType;
  } | null;
  documents: {
    driverLicense: UploadedDocument | null;
    vehicleRegistration: UploadedDocument | null;
    insurance: UploadedDocument | null;
    profilePhoto: UploadedDocument | null;
  };
  isComplete: boolean;
}

