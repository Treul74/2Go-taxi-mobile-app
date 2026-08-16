import { Location, VehicleType, RideMode, DriverInfo } from '@/types';

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

export interface VehicleOption {
  id: VehicleType;
  name: string;
  description: string;
  icon: string;
  estimatedFare: number;
  eta: number; // minutes
  capacity: number;
}

export interface RideRequest {
  id: string;
  pickup: Location;
  destination: Location;
  vehicleType: VehicleType;
  mode: RideMode;
  paymentMethod: 'cash' | 'mobile_money' | 'card';
  estimatedFare: number;
  eta: number;
  scheduledFor?: Date;
  bookingFor?: {
    name: string;
    phone: string;
  };
  driverInstructions?: string;
}
