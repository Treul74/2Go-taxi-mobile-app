# Phase 11 — Part 2: Current Map Architecture Audit

## 1. Map Implementations Found

| File / Component | Used By | Map Provider | Purpose | Type |
|---|---|---|---|---|
| `src/components/navigation/NavigationMap.tsx` | `app/(driver)/navigation.tsx`, `app/(driver)/trip.tsx`, `app/(customer)/trip.tsx`, `src/features/driver/DriverDashboard.tsx` | Wraps `<Map>` | The Navigation Engine's main abstraction layer. Translates `NavigationStore` state into map props and attaches the `CameraController`. | Production / Shared |
| `src/components/map/Map.tsx` (and `.native.tsx` / `.web.tsx`) | `NavigationMap`, `CustomerHome.tsx`, `app/(tabs)/navigate.tsx` | `react-native-maps` | The core visual map layer. Handles markers, polylines, and H3 grids. | Production / Shared |
| `src/features/customer/components/MapPickerModal.native.tsx` | `DiscoverScreen.tsx`, `MatchingOverlay.tsx`, `RidePlannerSheet.tsx` | `react-native-maps` (`MapView`) | A standalone, drag-to-pick map modal bypassing `Map.tsx`. | Production / Custom |
| `src/components/map/MapPlaceholder.tsx` | `app/ride/[id].tsx`, Web Fallback, Missing API Key fallback | `expo-image` / Static UI | Displays a static image or gradient instead of a real map (e.g. for ride history). | Production / Shared |

## 2. Component Hierarchy

**For Navigation Engine Screens:**
```text
Screen (e.g. app/(driver)/navigation.tsx)
    ↓
<NavigationMap> (Reads NavigationStore)
    ↓
<Map> (Map.native.tsx)
    ↓
<MapView> (react-native-maps)
    ├── <Polyline> (Route)
    └── <AnimatedVehicleMarker> / <NavigationArrowMarker>
```

**For Legacy/Raw Map Screens:**
```text
Screen (e.g. CustomerHome.tsx)
    ↓
<Map> (Map.native.tsx)
    ↓
<MapView> (react-native-maps)
```

**For the Picker Modal:**
```text
MapPickerModal.native.tsx
    ↓
<MapView> (react-native-maps)
```

## 3. Architecture Ownership

| Responsibility | Component/File | Notes |
|---|---|---|
| **Camera** | `CameraController.ts` | Owns the camera *only* when `<NavigationMap>` is mounted. It calls `mapRef.current.animateCamera()` under the hood. Legacy screens bypass this and drive the camera themselves or use `<Map>`'s internal camera logic. |
| **GPS** | `GPSManager.ts` | The exclusive owner of real-time device location subscriptions, accuracy filtering, and bearing smoothing. |
| **Routes** | `NavigationStore.ts` & `RouteEngine.ts` | `RouteEngine` fetches Google Directions; `NavigationStore` caches the `route` object globally. |
| **Polylines** | `Map.native.tsx` | Responsible for actually rendering the React Native `<Polyline>` using the `routeCoordinates` passed down. |
| **Markers** | `Map.native.tsx` | Orchestrates the rendering of `<AnimatedVehicleMarker>`, `<NavigationArrowMarker>`, `<SearchPulseMarker>`, etc. |
| **Navigation State** | `NavigationStore.ts` | The global Zustand store managing `NavigationMode` (e.g., `MATCHING`, `TRIP_IN_PROGRESS`), ETA, and active step. Transition rules live in `NavigationModes.ts`. |

## 4. Screen Implementation Status

### Screens using the Navigation Engine (`<NavigationMap>`)
These screens adhere to the architecture and do not manage the map manually.
- `app/(driver)/navigation.tsx`
- `app/(driver)/trip.tsx`
- `src/features/driver/DriverDashboard.tsx`
- `app/(customer)/trip.tsx` (Migrated in Phase 8)

### Screens using Legacy Map Implementations
These screens manually instantiate `<Map>` or `<MapView>` and bypass the engine.
- `src/features/customer/CustomerHome.tsx` (Uses raw `<Map>`)
- `app/(tabs)/navigate.tsx` (Explicitly kept as a legacy Dev/Testing tool per `AGENTS.md`)
- `src/features/customer/components/MapPickerModal.native.tsx` (Uses raw `<MapView>`)
- `app/ride/[id].tsx` (Uses `<MapPlaceholder>`)
