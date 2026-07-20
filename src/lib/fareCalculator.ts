/**
 * Fare Calculation Utility
 * Standardized pricing model for the app
 */

import type { VehicleType } from '@/types';

export interface FareComponents {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    waitingFare: number;
    subtotal: number;
    total: number;
}

export const PRICING_RATES = {
    BASE_FARE: 25, // K25 start
    PER_KM: 8,     // K8 per km
    PER_MINUTE: 2, // K2 per min
    PER_MINUTE_WAITING: 1.5, // K1.5 per min waiting
    MIN_FARE: 35,  // Minimum fare
};

/**
 * Calculate final fare based on distance, duration and waiting time
 * @param distanceKm Distance in kilometers
 * @param durationMinutes Duration in minutes
 * @param waitingMinutes Waiting time in minutes
 */
export const calculateFare = (distanceKm: number, durationMinutes: number, waitingMinutes: number = 0): FareComponents => {
    const baseFare = PRICING_RATES.BASE_FARE;
    const distanceFare = distanceKm * PRICING_RATES.PER_KM;
    const timeFare = durationMinutes * PRICING_RATES.PER_MINUTE;
    const waitingFare = waitingMinutes * PRICING_RATES.PER_MINUTE_WAITING;

    const subtotal = baseFare + distanceFare + timeFare + waitingFare;
    const total = Math.max(subtotal, PRICING_RATES.MIN_FARE);

    return {
        baseFare,
        distanceFare: parseFloat(distanceFare.toFixed(2)),
        timeFare: parseFloat(timeFare.toFixed(2)),
        waitingFare: parseFloat(waitingFare.toFixed(2)),
        subtotal: parseFloat(subtotal.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
    };
};

// Multiplier applied to the base calculateFare() total to price each vehicle
// type off the same trip distance/duration. Closes the "not split by vehicle
// type" gap noted in AGENTS.md, scoped to display pricing only.
export const VEHICLE_FARE_MULTIPLIERS: Record<VehicleType, number> = {
    bike: 0.5,
    tricycle: 0.7,
    economy: 1,
    comfort: 1.5,
    truck: 2.5,
};

/**
 * Calculate the fare for a specific vehicle type over the same trip.
 * @param vehicleType Vehicle class the fare is being priced for
 * @param distanceKm Distance in kilometers
 * @param durationMinutes Duration in minutes
 * @param waitingMinutes Waiting time in minutes
 */
export const calculateFareForVehicle = (
    vehicleType: VehicleType,
    distanceKm: number,
    durationMinutes: number,
    waitingMinutes: number = 0
): FareComponents => {
    const base = calculateFare(distanceKm, durationMinutes, waitingMinutes);
    const multiplier = VEHICLE_FARE_MULTIPLIERS[vehicleType];
    const total = Math.max(base.subtotal * multiplier, PRICING_RATES.MIN_FARE * multiplier);

    return {
        ...base,
        total: parseFloat(total.toFixed(2)),
    };
};

export const formatCurrency = (amount: number) => {
    return `K${amount.toFixed(2)}`;
};
