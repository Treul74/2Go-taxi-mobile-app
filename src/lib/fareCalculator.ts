/**
 * Currency formatting utility.
 *
 * Fare calculation does not live here anymore. The vehicle-picker preview
 * reads live admin-configured rates from vehicle_classes_public directly
 * (see rideStore.ts's fetchVehicleOptions()/calculateVehicleFares()), and
 * the fare that actually gets charged/stored is always computed
 * server-side by calculate_fare_breakdown() -- see the BEFORE INSERT/UPDATE
 * triggers on orders. Never reintroduce a local fare formula or hardcoded
 * rate constants here.
 */

export const formatCurrency = (amount: number) => {
    return `K${amount.toFixed(2)}`;
};
