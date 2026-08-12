# Phase 11 — Part 3: Navigation Engine Internal Architecture Audit

## OBJECTIVE
Determine what the current Navigation Engine owns, how its components communicate, and how it starts at runtime, to evaluate if the Google Navigation SDK can act as an underlying provider.

---

## PART 1 — NAVIGATION ENGINE INVENTORY

| Component | Responsibility | Inputs | Outputs | Consumers | Owner |
|---|---|---|---|---|---|
| `Architecture.md` | Technical documentation and rollout plan. | N/A | N/A | Engineers | N/A |
| `AutoFitEngine.ts` | Calculates bounding box and padding to fit routes/markers within map viewport while respecting UI chrome (bottom sheets, banners). | Route, Driver Location, Destination, UI Chrome, Viewport Size | `CameraAnimationState` (target pose) | `CameraController.ts` | Navigation Engine |
| `CameraAnimation.ts` | Math primitives for camera easing, thresholding, damping, and bearing interpolation. | Current Pose, Target Pose, Speed, Damping factors | Animated/Interpolated pose | `CameraController.ts` | Navigation Engine |
| `CameraController.ts` | Single camera owner. Subscribes to NavigationStore and orchestrates map animations/fitting. | `NavigationStore` state, MapView Handle, UI Chrome | `animateCamera` calls to map, updates `NavigationStore.cameraState` | `NavigationMap.tsx` | Navigation Engine |
| `GPSManager.ts` | Exclusive owner of GPS tracking. Handles foreground/background updates, permissions, accuracy profiles, and location quality scoring. | OS Location APIs (expo-location, expo-task-manager) | GPS fix events, Signal Status, Heading, Speed | `NavigationProvider.tsx`, event listeners | Navigation Engine |
| `MarkerAnimator.ts` | Interpolates vehicle marker positions smoothly between GPS ticks. | GPS Fixes | Animated coordinate values | `AnimatedVehicleMarker.tsx` | Navigation Engine |
| `NavigationEvents.ts` | Typed pub/sub event bus used to decouple components from circular dependencies. | Events (e.g. `MODE_CHANGED`, `ROUTE_RECALCULATED`) | Handlers | `NavigationStore.ts`, `NavigationProvider.tsx`, `RouteProgressTracker.ts` | Navigation Engine |
| `NavigationHooks.ts` | React hooks wrapping `NavigationStore` selectors for ergonomic component usage. | `NavigationStore` state | Specific state slices (e.g., `useActiveRoute`, `useNavigationMode`) | UI Components, `NavigationMap.tsx` | Navigation Engine |
| `NavigationMath.ts` | Pure math functions: Haversine distance, heading calculations, off-route distance, and dynamic zoom/pitch curves. | Coordinates, Speed | Distance, Zoom level, Pitch | `CameraController.ts`, `RouteEngine.ts` | Navigation Engine |
| `NavigationModes.ts` | The Navigation Engine state machine. Validates all mode transitions. | Current Mode, Target Mode | Transition Validation (Throws if invalid) | `NavigationStore.ts` | Navigation Engine |
| `NavigationStore.ts` | Global Zustand store for the engine. Owns navigation state: mode, route, actor position, camera state, GPS status. | Actions (e.g., `transition`, `setGpsFix`), `NavigationProvider.tsx` | Global Navigation State | Screens, Hooks, `CameraController.ts` | Navigation Engine |
| `README.md` | Top-level intro documentation. | N/A | N/A | Engineers | N/A |
| `RouteEngine.ts` | Owns route fetching, polyline decoding, ETA calculation, and progress math. | Pickup, Destination, `mapsApi.ts` responses | `RouteData`, `RouteProgress` | `RouteProgressTracker.ts` | Navigation Engine |
| `RouteProgressTracker.ts` | Orchestrates checking off-route drift and recalculating progress on every GPS tick. | `GPSFix`, `RouteData` | Updates `NavigationStore.progress`, initiates reroutes | `NavigationProvider.tsx` | Navigation Engine |
| `hooks/useNavigation.ts` | React hook exposing `NavigationActions` (e.g., `preview()`, `startTrip()`) to screens. | `NavigationStore` actions | Action methods | Screens (e.g., `trip.tsx`) | Navigation Engine |
| `providers/NavigationProvider.tsx` | The engine's mount point. Bootstraps GPS-to-Store piping and Route Progress tracking. | `GPSManager` events, `useUserStore` role | Synchronizes `NavigationStore` | Application Root (`_layout.tsx`) | Navigation Engine |
| `safeTransition.ts` | Utility to wrap mode transition calls and safely catch/swallow invalid transition errors. | Callback | Safe execution | Screens | Navigation Engine |
| `types.ts` | Shared TypeScript interfaces and types for the engine. | N/A | N/A | All Engine Components | N/A |

---

## PART 2 — RUNTIME ENTRY POINT

The Navigation Engine initializes and operates through a strictly unidirectional data flow driven by GPS updates:

1. **Application Root:**
   The App mounts `<NavigationProvider>` exactly once in the tree (via `app/_layout.tsx`).

2. **NavigationProvider (The Bridge):**
   The provider checks the user's role (`actor`) and subscribes to `GPSManager.onFix`. It does NOT start GPS itself—it relies on the active screen calling `GPSManager.start()` to configure the accuracy profile.

3. **GPSManager (The Source):**
   When the OS emits a location, `GPSManager` processes it (quality scoring, smoothing, speed derivation) and emits a `LOCATION_UPDATED` event through its internal pub/sub event bus.

4. **NavigationProvider + RouteProgressTracker (The Orchestrators):**
   `NavigationProvider` receives the fix. 
   - If no route is active, it calls `NavigationStore.setGpsFix`.
   - If a route is active, it calls `RouteProgressTracker.applyGpsFixWithProgress`. 
   `RouteProgressTracker` then uses `RouteEngine` to snap the position to the route, recalculate ETA/Distance, evaluate if a re-route is required, and pushes a unified update to `NavigationStore`.

5. **NavigationStore (The State Hub):**
   `NavigationStore` receives the updates and changes global state (`driverLocation`, `progress`, `etaSeconds`, etc.). 

6. **CameraController (The Automator):**
   `CameraController` is actively subscribed to `NavigationStore`. When state changes, it invokes `computeTargetPose` using math from `CameraAnimation` and `NavigationMath`. It then filters the update through damping and thresholds. If a camera move is warranted, it calls `animateCamera()` on the attached `mapHandle`.

7. **NavigationMap (The View):**
   `NavigationMap` (mounted by the active screen) reads from `NavigationHooks`, passes props to the underlying `<Map>`, and connects its local map ref to the `CameraController` via `attachMap()`. The underlying Map visualizes the `driverLocation`, polylines, and UI markers.
