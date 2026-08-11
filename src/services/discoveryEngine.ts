import { getNearbyHexes } from '@/core/spatialEngine';
import { useDriverStore } from '@/state/driverStore';
import { useDriverWalletStore } from '@/state/driverWalletStore';
import type { DriverInfo } from '@/types';

/**
 * Discovery Engine Service
 *
 * Handles spatial discovery of drivers using H3 hexagon indexing.
 * Replaces brute-force geographical distance calculations with efficient
 * hexagon set membership checks.
 */

export interface DriverDiscoveryResult extends DriverInfo {
    hex9: string;
    vehicle: {
        model: string;
        color: string;
        plate: string;
    };
}

// A simulated pool of drivers in the area (Zambezi District)
const MOCK_DRIVER_POOL: DriverDiscoveryResult[] = [
    {
        id: 'driver_001',
        name: 'Peter Mwanza',
        hex9: '89967028b6bffff', // Zambezi Town
        phone: '+260 96 555 1234',
        rating: 4.9,
        tripsCompleted: 1250,
        avatar: 'https://i.pravatar.cc/150?img=12',
        vehicle: { model: 'Toyota Corolla', color: 'White', plate: 'ABC 1234' }
    },
    {
        id: 'driver_002',
        name: 'Grace Tembo',
        hex9: '89967028b2bffff', // Zambezi Hospital
        phone: '+260 97 555 5678',
        rating: 4.7,
        tripsCompleted: 890,
        avatar: 'https://i.pravatar.cc/150?img=47',
        vehicle: { model: 'Honda Fit', color: 'Silver', plate: 'XYZ 9876' }
    },
    {
        id: 'driver_003',
        name: 'Emmanuel Phiri',
        hex9: '89967028b63ffff', // Zambezi Market
        phone: '+260 95 555 9876',
        rating: 4.85,
        tripsCompleted: 2340,
        avatar: 'https://i.pravatar.cc/150?img=33',
        vehicle: { model: 'Toyota Vitz', color: 'Blue', plate: 'LMN 4567' }
    },
    {
        id: 'driver_004',
        name: 'Sarah Mwape',
        hex9: '899673924a7ffff', // Zambezi Council
        phone: '+260 99 555 0000',
        rating: 4.8,
        tripsCompleted: 540,
        avatar: 'https://i.pravatar.cc/150?img=25',
        vehicle: { model: 'Nissan Tiida', color: 'Red', plate: 'EFG 3210' }
    },
    {
        id: 'driver_005',
        name: 'David Tembo',
        hex9: '89967392513ffff', // Zambezi Airport
        phone: '+260 94 555 1111',
        rating: 4.6,
        tripsCompleted: 210,
        avatar: 'https://i.pravatar.cc/150?img=11',
        vehicle: { model: 'Mazda Demio', color: 'Black', plate: 'HIJ 7412' }
    },
];


/**
 * Find nearby drivers based on a customer's H3 hexagon.
 *
 * Uses k-ring radius 6 (~2km search area).
 *
 * @param customerHex9 - The H3 hexagon index (resolution 9) of the customer
 * @param radius - The search radius in hexagons (default: 6, approx 2km)
 * @returns Array of driver objects found within the search area
 */
export function findNearbyDrivers(customerHex9: string, radius: number = 6): DriverDiscoveryResult[] {
    if (!customerHex9) return [];

    // 1. Generate nearby hexes using k-ring (radius 6 = ~2km)
    const nearbyHexes = getNearbyHexes(customerHex9, radius);
    const searchSet = new Set(nearbyHexes);

    // 2. Identify drivers in the store or pool who match these hexes
    const { isOnline, driverHex9, stats } = useDriverStore.getState();

    const matches: DriverDiscoveryResult[] = [];

    // Check the current logged-in driver (if online)
    if (isOnline && driverHex9 && searchSet.has(driverHex9)) {
        // Use wallet store for consistent trip counts
        const { totalTripsToday } = useDriverWalletStore.getState();

        // Reconstruct a discovery result for the current app user if they are a driver
        matches.push({
            id: 'current_driver',
            name: 'You (Driver)',
            phone: '+260 555 5555',
            rating: stats.averageRating,
            tripsCompleted: totalTripsToday + 1250, // Base history + today's trips
            hex9: driverHex9,
            vehicle: { model: 'Simulator Car', color: 'Ghost', plate: 'SIM 123' }
        });
    }

    // Check the simulated driver pool
    const poolMatches = MOCK_DRIVER_POOL
        .filter(driver => searchSet.has(driver.hex9));

    return [...matches, ...poolMatches];
}
