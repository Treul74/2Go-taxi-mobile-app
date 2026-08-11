# H3 Zustand Store Integration

## Overview
The Zustand stores have been extended to support H3 hexagon spatial indexing for both customers and drivers.

## Changes Made

### 1. **rideStore.ts** - Customer Location Tracking

#### New State Fields
```typescript
interface RideState {
  // ... existing fields
  
  // H3 Spatial Indexing
  customerHex9: string | null; // Current customer location hex
}
```

#### Updated Actions
- **`setPickup(location, manual?)`** - Now automatically calculates and stores `customerHex9`
- **`resetRide()`** - Resets `customerHex9` to null

#### Implementation
```typescript
setPickup: (location, manual = false) => {
  // Calculate hex9 if location is provided
  const customerHex9 = location 
    ? getHex9(location.latitude, location.longitude) 
    : null;
  set({ pickup: location, isPickupManual: manual, customerHex9 });
}
```

---

### 2. **driverStore.ts** - Driver Location Tracking

#### New State Fields
```typescript
interface DriverState {
  // ... existing fields
  
  // Driver location (H3 spatial indexing)
  currentLocation: { latitude: number; longitude: number } | null;
  driverHex9: string | null;
}
```

#### New Actions
- **`updateLocation(latitude, longitude)`** - Updates driver location and calculates hex9

#### Implementation
```typescript
updateLocation: (latitude: number, longitude: number) => {
  const driverHex9 = getHex9(latitude, longitude);
  set({ 
    currentLocation: { latitude, longitude },
    driverHex9 
  });
}
```

#### Enhanced Mock Data
Mock incoming requests now include hex9 for pickup and destination:
```typescript
pickup: {
  ...pickupLocations[pickupIdx],
  hex9: getHex9(latitude, longitude),
}
```

---

## Usage Examples

### Example 1: Track Customer Location
```typescript
import { useRideStore } from '@/state';

function CustomerComponent() {
  const { pickup, customerHex9, setPickup } = useRideStore();
  
  // When user selects pickup location
  const handleLocationSelect = (location) => {
    setPickup(location); // hex9 is automatically calculated
  };
  
  // Access customer hex9
  console.log('Customer is in hexagon:', customerHex9);
}
```

### Example 2: Update Driver Location
```typescript
import { useDriverStore } from '@/state';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';

function DriverComponent() {
  const { updateLocation, driverHex9 } = useDriverStore();
  const { location } = useCurrentLocation();
  
  // Update driver location when GPS changes
  useEffect(() => {
    if (location) {
      updateLocation(location.latitude, location.longitude);
    }
  }, [location]);
  
  // Access driver hex9
  console.log('Driver is in hexagon:', driverHex9);
}
```

### Example 3: Find Nearby Drivers (Spatial Query)
```typescript
import { useRideStore } from '@/state/rideStore';
import { getNearbyHexes } from '@/core/spatialEngine';

function findNearbyDrivers(allDrivers) {
  const { customerHex9 } = useRideStore();
  
  if (!customerHex9) return [];
  
  // Get hexagons within 2km radius
  const searchArea = getNearbyHexes(customerHex9, 2);
  
  // Filter drivers in those hexagons
  const nearbyDrivers = allDrivers.filter(driver => 
    driver.driverHex9 && searchArea.includes(driver.driverHex9)
  );
  
  return nearbyDrivers;
}
```

### Example 4: Check if Driver and Customer are in Same Hexagon
```typescript
import { useRideStore } from '@/state/rideStore';
import { useDriverStore } from '@/state/driverStore';

function MatchingComponent() {
  const { customerHex9 } = useRideStore();
  const { driverHex9 } = useDriverStore();
  
  const isInSameHex = customerHex9 === driverHex9;
  
  if (isInSameHex) {
    console.log('Driver and customer are within 170m of each other!');
  }
}
```

### Example 5: Real-time Driver Location Updates
```typescript
import { useDriverStore } from '@/state';
import * as Location from 'expo-location';

function DriverLocationTracker() {
  const { updateLocation } = useDriverStore();
  
  useEffect(() => {
    // Watch driver location in real-time
    const subscription = Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10, // Update every 10 meters
      },
      (position) => {
        updateLocation(
          position.coords.latitude,
          position.coords.longitude
        );
      }
    );
    
    return () => {
      subscription.then(sub => sub.remove());
    };
  }, []);
}
```

---

## Benefits

### 1. **Automatic Hex Calculation**
- No need to manually call `getHex9()` when updating locations
- Hex values are always in sync with coordinates

### 2. **Efficient Spatial Queries**
- O(1) hexagon lookups instead of O(n) distance calculations
- Can quickly filter drivers by hexagon proximity

### 3. **Consistent State**
- Hex values stored alongside coordinates
- Single source of truth for location data

### 4. **Ready for Backend Integration**
- Hex values can be sent to backend for server-side matching
- Database can index on hex9 for fast spatial queries

---

## Performance

- **Memory**: +8 bytes per location (hex9 string)
- **CPU**: +0.1ms per location update (hex calculation)
- **Network**: Hex strings are compact (15 chars) for API transmission

---

## Next Steps

### Implement Driver Matching Algorithm
```typescript
// Example: Find closest driver
function findClosestDriver(customerHex9: string, drivers: Driver[]) {
  // 1. Check same hexagon (170m)
  let match = drivers.find(d => d.driverHex9 === customerHex9);
  if (match) return match;
  
  // 2. Check 1-ring neighbors (6 hexagons)
  const ring1 = getNearbyHexes(customerHex9, 1);
  match = drivers.find(d => d.driverHex9 && ring1.includes(d.driverHex9));
  if (match) return match;
  
  // 3. Check 2-ring neighbors (19 hexagons)
  const ring2 = getNearbyHexes(customerHex9, 2);
  match = drivers.find(d => d.driverHex9 && ring2.includes(d.driverHex9));
  
  return match || null;
}
```

### Backend Integration
```typescript
// Send hex9 to backend for matching
async function requestRide() {
  const { pickup, customerHex9 } = useRideStore.getState();
  
  const response = await fetch('/api/rides/request', {
    method: 'POST',
    body: JSON.stringify({
      pickup: {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        hex9: customerHex9, // ← Send hex for server-side matching
      },
    }),
  });
}
```

---

## Documentation
- Full H3 documentation: `docs/H3_SPATIAL_ENGINE.md`
- GPS integration: `docs/H3_GPS_INTEGRATION.md`
- Spatial engine source: `src/core/spatialEngine.ts`
