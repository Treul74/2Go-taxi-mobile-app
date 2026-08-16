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
// report in audit_reports/.
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

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  hex9?: string; // H3 hexagon index (resolution 9)
  plusCode?: string; // Open Location Code for this point
  district?: string | null; // District/locality name, if resolved
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

// Populated by specific domains

