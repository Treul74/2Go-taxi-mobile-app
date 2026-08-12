# Phase 11 — Google Navigation SDK Feasibility & Integration Audit

## 1. Audit Context & Scope
**Method:** Read `AGENTS.md`, `2GO Navigation Engine Bible.md`, and `src/navigation/NavigationEngine/Architecture.md` in full. Evaluated the feasibility of integrating the official Google Navigation SDK for Android/iOS while adhering strictly to the "Do NOT replace the Navigation Engine" constraint.

**Goal:** Determine if this architecture is viable:
```
                    2GO Navigation Engine
                             |
                    NavigationProvider
                             |
                    NavigationStore
                             |
                    Navigation Adapter
                             |
                  Google Navigation SDK
                             |
              Google navigation intelligence
```

## 2. Feasibility Verdict
**Verdict: Feasible, but highly complex.**
The proposed architecture perfectly aligns with the engine's SOLID foundation and Adapter pattern. `NavigationStore` is already decoupled from the map UI and GPS acquisition, making it theoretically possible to inject Google Navigation SDK as a headless intelligence provider during active trips.

However, executing this while strictly adhering to the 2GO Navigation Engine Bible introduces significant friction, primarily around **Camera Ownership** and **GPS Ownership**.

## 3. Architecture Fit (Adapter Pattern)
The existing architecture elegantly supports this integration via an adapter layer:

*   **State Translation:** A `GoogleNavAdapter` component would mount during `DRIVER_TO_PICKUP` or `TRIP_IN_PROGRESS`. It would observe `NavigationStore.mode` and `route` to call Google Nav SDK's native `startGuidance()` and `setDestination()` methods.
*   **Event Bridging:** Google Nav SDK fires native events for ETA updates, remaining distance, route progress, and turn instructions. The adapter would catch these over the React Native bridge and dispatch them to `NavigationStore` (e.g., updating `distanceRemainingMeters`, `etaSeconds`, `currentInstruction`).
*   **Decoupled UI:** 2GO's custom React Native UI (`NavigationHUD`, `TurnBanner`, `TripBottomCard`) would continue reading from `NavigationHooks.ts` exactly as they do today. They would remain entirely unaware that Google Nav SDK, rather than `RouteEngine.ts`, is calculating the numbers.

## 4. Friction Points & Bible Conflicts

### 4.1. Camera Ownership (The Bible vs. Google)
*   **The Bible:** Dictates precise camera control ("Vehicle always faces north. Road rotates underneath... Vehicle fixed 68% down the screen... Pitch 50°... Zoom 17.5").
*   **Google Nav SDK:** Has its own rigidly opinionated camera behaviors during active guidance. It controls pitch, zoom, and tilt automatically.
*   **Resolution:** We would have to suppress `CameraController.ts` and `AutoFitEngine.ts` during active trips, allowing the Google SDK's native camera to take over. This requires a documented exception to the Bible's rigid camera rules, acknowledging that Google's "smart camera" replaces our fixed-percentage calculations during `TRIP_IN_PROGRESS`.

### 4.2. GPS Ownership (`GPSManager.ts`)
*   **The Bible:** `GPSManager.ts` is strictly enforced as "the ONLY file allowed to create a location subscription".
*   **Google Nav SDK:** Uses its own internal location provider to achieve "road snapping" and advanced route intelligence.
*   **Resolution:** Running both simultaneously would cause battery drain and conflicting coordinates. `GPSManager.ts` would need a new `google-nav-sdk` profile/mode. During active trips, `GPSManager.ts` would `pause()` its `expo-location` watcher and instead accept road-snapped location updates *emitted by the Google Nav Adapter*. This preserves `GPSManager` as the single source of truth for the rest of the app (like `driverStore` persistence) while leveraging Google's superior snapped coordinates.

### 4.3. The Map Component (`react-native-maps`)
*   **The Problem:** Google Navigation SDK requires its own native view (`NavigationView` on Android, `GMSMapView` on iOS) to comply with its Terms of Service and visual turn-by-turn requirements.
*   **Resolution:** We cannot simply use `react-native-maps`. A custom React Native ViewManager must be written (in Kotlin and Swift) to wrap the Google Navigation SDK view. `NavigationMap.tsx` would need to conditionally render `react-native-maps` for `IDLE`/`PREVIEW`/`MATCHING` modes, and seamlessly swap to the custom `<GoogleNavigationView>` during `TRIP_IN_PROGRESS`.

## 5. Required Implementation Effort (Future Phases)
To implement this without breaking the engine, the following native work is required:
1.  **Native Modules:** Build Expo Config Plugins and custom Native ViewManagers (Kotlin/Swift) to embed Google Navigation SDK into React Native.
2.  **Bridging:** Expose Google's `RouteProgressEvent`, `NavInfo`, and `RoadSnappedLocation` to JavaScript.
3.  **UI Overlay:** Disable Google's default native UI headers/footers so the React Native `NavigationHUD` can overlay cleanly.
4.  **Adapter Component:** Write `NavigationAdapter.tsx` to sit between `NavigationStore` and the Native Module.

## 6. Conclusion
The 2GO Navigation Engine architecture is robust enough to accommodate the Google Navigation SDK. The adapter pattern keeps the React Native UI and business logic pure. However, it requires a massive native implementation effort and accepting that Google Nav SDK will take over camera and GPS responsibilities from `CameraController.ts` and `expo-location` during active trips.
