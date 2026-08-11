/**
 * H3 Store Integration Examples
 *
 * Demonstrates how to use H3 spatial indexing with Zustand stores
 */

import { getNearbyHexes } from '@/core/spatialEngine';
import { useDriverStore } from '@/state/driverStore';
import { useRideStore } from '@/state/rideStore';

// ============================================
// Example 1: Customer Location Tracking
// ============================================

function exampleCustomerTracking() {
    const { pickup, customerHex9, setPickup } = useRideStore();

    // Simulate customer selecting pickup location
    const pickupLocation = {
        latitude: -15.4167,
        longitude: 28.2833,
        address: 'Cairo Road, Lusaka'
    };

    // Set pickup - hex9 is automatically calculated
    setPickup(pickupLocation);

    console.log('Customer Location:', pickup);
    console.log('Customer Hex9:', customerHex9);
    // Output: "89754e64992ffff"
}

// ============================================
// Example 2: Driver Location Updates
// ============================================

function exampleDriverLocationUpdates() {
    const { driverHex9, currentLocation, updateLocation } = useDriverStore();

    // Simulate driver moving
    const driverCoords = {
        latitude: -15.4170,
        longitude: 28.2835
    };

    // Update driver location - hex9 is automatically calculated
    updateLocation(driverCoords.latitude, driverCoords.longitude);

    console.log('Driver Location:', currentLocation);
    console.log('Driver Hex9:', driverHex9);
}

// ============================================
// Example 3: Find Nearby Drivers
// ============================================

interface Driver {
    id: string;
    name: string;
    driverHex9: string | null;
    currentLocation: { latitude: number; longitude: number } | null;
}

function findNearbyDrivers(allDrivers: Driver[]) {
    const { customerHex9 } = useRideStore.getState();

    if (!customerHex9) {
        console.log('No customer location set');
        return [];
    }

    // Strategy 1: Check exact hexagon match (within 170m)
    const exactMatch = allDrivers.filter(d => d.driverHex9 === customerHex9);
    if (exactMatch.length > 0) {
        console.log(`Found ${exactMatch.length} drivers in same hexagon!`);
        return exactMatch;
    }

    // Strategy 2: Check 1-ring neighbors (within ~500m)
    const ring1 = getNearbyHexes(customerHex9, 1);
    const ring1Match = allDrivers.filter(d =>
        d.driverHex9 && ring1.includes(d.driverHex9)
    );
    if (ring1Match.length > 0) {
        console.log(`Found ${ring1Match.length} drivers within 1 ring`);
        return ring1Match;
    }

    // Strategy 3: Check 2-ring neighbors (within ~1km)
    const ring2 = getNearbyHexes(customerHex9, 2);
    const ring2Match = allDrivers.filter(d =>
        d.driverHex9 && ring2.includes(d.driverHex9)
    );

    console.log(`Found ${ring2Match.length} drivers within 2 rings`);
    return ring2Match;
}

// ============================================
// Example 4: Real-time Proximity Check
// ============================================

function checkProximity() {
    const { customerHex9 } = useRideStore.getState();
    const { driverHex9 } = useDriverStore.getState();

    if (!customerHex9 || !driverHex9) {
        return { inSameHex: false, nearby: false };
    }

    // Check if in exact same hexagon (within 170m)
    if (customerHex9 === driverHex9) {
        console.log('🎯 Driver and customer are in the same hexagon!');
        return { inSameHex: true, nearby: true };
    }

    // Check if in neighboring hexagons (within ~500m)
    const nearbyHexes = getNearbyHexes(customerHex9, 1);
    if (nearbyHexes.includes(driverHex9)) {
        console.log('📍 Driver is in a neighboring hexagon');
        return { inSameHex: false, nearby: true };
    }

    console.log('📌 Driver is far from customer');
    return { inSameHex: false, nearby: false };
}

// ============================================
// Example 5: Mock Driver Matching Algorithm
// ============================================

function mockDriverMatching() {
    const { customerHex9 } = useRideStore.getState();

    if (!customerHex9) {
        throw new Error('Customer location not set');
    }

    // Mock driver pool
    const mockDrivers: Driver[] = [
        {
            id: 'driver_1',
            name: 'John Banda',
            driverHex9: '89754e64992ffff', // Same hex as customer
            currentLocation: { latitude: -15.4167, longitude: 28.2833 }
        },
        {
            id: 'driver_2',
            name: 'Mary Phiri',
            driverHex9: '89754e64993ffff', // Neighboring hex
            currentLocation: { latitude: -15.4170, longitude: 28.2840 }
        },
        {
            id: 'driver_3',
            name: 'Peter Mwanza',
            driverHex9: '89754e64990ffff', // Far away
            currentLocation: { latitude: -15.4500, longitude: 28.3000 }
        }
    ];

    console.log('\n=== Driver Matching Algorithm ===');
    console.log(`Customer Hex: ${customerHex9}`);

    // Find nearby drivers
    const nearbyDrivers = findNearbyDrivers(mockDrivers);

    if (nearbyDrivers.length > 0) {
        console.log(`\n✅ Matched with: ${nearbyDrivers[0].name}`);
        console.log(`   Driver Hex: ${nearbyDrivers[0].driverHex9}`);
        return nearbyDrivers[0];
    } else {
        console.log('\n❌ No nearby drivers found');
        return null;
    }
}

// ============================================
// Example 6: Spatial Query Performance Test
// ============================================

function performanceTest() {
    const { customerHex9 } = useRideStore.getState();

    if (!customerHex9) return;

    // Generate 1000 mock drivers
    const mockDrivers: Driver[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `driver_${i}`,
        name: `Driver ${i}`,
        driverHex9: `89754e6499${i.toString().padStart(4, '0')}`,
        currentLocation: {
            latitude: -15.4167 + (Math.random() - 0.5) * 0.1,
            longitude: 28.2833 + (Math.random() - 0.5) * 0.1
        }
    }));

    console.log('\n=== Performance Test ===');
    console.log(`Testing with ${mockDrivers.length} drivers`);

    const startTime = performance.now();
    const nearby = findNearbyDrivers(mockDrivers);
    const endTime = performance.now();

    console.log(`Found ${nearby.length} nearby drivers`);
    console.log(`Query time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log('✅ H3 spatial indexing is FAST!');
}

// ============================================
// Run Examples
// ============================================

export function runH3StoreExamples() {
    console.log('=== H3 Store Integration Examples ===\n');

    exampleCustomerTracking();
    exampleDriverLocationUpdates();
    mockDriverMatching();
    performanceTest();

    console.log('\n✅ All examples completed!');
}

export {
    checkProximity, exampleDriverLocationUpdates, exampleCustomerTracking, findNearbyDrivers, mockDriverMatching,
    performanceTest
};
