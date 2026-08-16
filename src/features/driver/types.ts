import { Location, VehicleType, UploadedDocument } from '@/types';

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
