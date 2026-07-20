# H3 Spatial Engine

## Overview
The spatial engine provides hexagon-based geospatial indexing using Uber's H3 library at resolution 9 (≈170m street-level precision).

## Installation
Already installed via `npm install h3-js`

## Usage

### Import
```typescript
import { getHex9, getNearbyHexes, getHexCenter } from '@/core/spatialEngine';
```

### Convert GPS to Hexagon
```typescript
// Example: Lusaka city center
const hex = getHex9(-15.4167, 28.2833);
console.log(hex); // "89754e64992ffff"
```

### Find Nearby Hexagons
```typescript
// Get hexagons within 1 ring (7 total: center + 6 neighbors)
const nearby = getNearbyHexes("89754e64992ffff", 1);

// Get hexagons within 2 rings (19 total)
const wider = getNearbyHexes("89754e64992ffff", 2);
```

### Get Hexagon Center
```typescript
const center = getHexCenter("89754e64992ffff");
console.log(center); // { latitude: -15.4167, longitude: 28.2833 }
```

## Use Cases

### 1. Driver-Passenger Matching
```typescript
// Passenger requests ride
const passengerHex = getHex9(passengerLat, passengerLng);

// Find nearby hexagons to search for drivers
const searchArea = getNearbyHexes(passengerHex, 2); // 2-ring radius

// Filter drivers in those hexagons
const nearbyDrivers = allDrivers.filter(driver => 
  searchArea.includes(driver.currentHex)
);
```

### 2. Service Area Coverage
```typescript
// Check if location is in service area
const locationHex = getHex9(lat, lng);
const serviceHexes = ['89754e64992ffff', '89754e649b7ffff', ...];

if (serviceHexes.includes(locationHex)) {
  console.log('Location is in service area');
}
```

### 3. Geospatial Clustering
```typescript
// Group nearby ride requests
const requests = [
  { id: 1, lat: -15.4167, lng: 28.2833 },
  { id: 2, lat: -15.4170, lng: 28.2835 },
];

const clusters = requests.reduce((acc, req) => {
  const hex = getHex9(req.lat, req.lng);
  if (!acc[hex]) acc[hex] = [];
  acc[hex].push(req);
  return acc;
}, {});
```

## Resolution 9 Details
- **Hexagon edge length**: ≈174 meters
- **Hexagon area**: ≈0.105 km²
- **Perfect for**: Street-level matching, neighborhood clustering
- **Total hexagons globally**: ~4.8 billion

## Performance
- `getHex9()`: O(1) - Instant conversion
- `getNearbyHexes()`: O(k²) where k = ring size
  - Ring 1: 7 hexagons
  - Ring 2: 19 hexagons
  - Ring 3: 37 hexagons
- `getHexCenter()`: O(1) - Instant conversion

## References
- [H3 Documentation](https://h3geo.org/)
- [h3-js GitHub](https://github.com/uber/h3-js)
