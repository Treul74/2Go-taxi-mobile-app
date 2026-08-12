# Phase 11 — Part 13: Google Navigation Integration Risk Audit

## OBJECTIVE
Identify and classify every significant risk of introducing the Google Navigation SDK into the 2GO architecture.

---

## RISK REGISTER

### 1. Android
*   **Classification:** **CRITICAL**
*   **Risk:** Fatal Binary Collision
*   **Cause:** Google explicitly prohibits the Navigation SDK and standard Maps SDK (`play-services-maps`) from existing in the same Android binary.
*   **Impact:** App will fail to compile. Forces the removal of `react-native-maps`.
*   **Mitigation:** None. Must completely remove `react-native-maps` and rewrite all Android map implementations.

### 2. Maps
*   **Classification:** **CRITICAL**
*   **Risk:** Customer Experience Breakage
*   **Cause:** Ripping out `react-native-maps` to satisfy the Android conflict.
*   **Impact:** Customer-side screens (like `CustomerHome.tsx`, `MapPickerModal.native.tsx`) lose their mapping engine and break entirely.
*   **Mitigation:** Rewrite the entire Customer application using the Navigation SDK's driving-oriented map view, which is poorly suited for static UI picking.

### 3. Architecture
*   **Classification:** **CRITICAL**
*   **Risk:** Destruction of 2GO Navigation Engine
*   **Cause:** SDK natively owns Camera, Routes, and Markers.
*   **Impact:** Forces the deletion of `CameraController.ts`, `RouteEngine.ts`, `MarkerAnimator.ts`, and `AutoFitEngine.ts`. Wastes all previous engineering efforts and breaks the unidirectional JS state flow.
*   **Mitigation:** Rewrite the `NavigationEngine` to act merely as a thin wrapper around the SDK rather than the orchestrator.

### 4. Vendor Lock-in
*   **Classification:** **CRITICAL**
*   **Risk:** Inability to switch Map Providers
*   **Cause:** Embedding a proprietary turn-by-turn Native SDK.
*   **Impact:** If Google raises prices or deprecates the SDK, 2GO cannot easily swap to Mapbox or OSRM. 
*   **Mitigation:** None. 

### 5. HUD
*   **Classification:** **CRITICAL**
*   **Risk:** Loss of Brand Identity
*   **Cause:** Using the Built-In Google Experience overrides the UI.
*   **Impact:** 2GO's visual identity (Deep Navy, Vibrant Orange-Red) and custom `RideActionSlider` workflows are overridden by generic Google UI.
*   **Mitigation:** Use the Custom Navigation Experience (headless data feed) and rebuild the HUD from scratch to listen to SDK callbacks instead of `NavigationStore`.

### 6. iOS
*   **Classification:** **HIGH**
*   **Risk:** Platform Divergence
*   **Cause:** iOS supports coexistence of Maps/Navigation SDKs, but Android does not.
*   **Impact:** If implemented on iOS only, 2GO must maintain two entirely different codebases (JS Engine on Android, Native SDK on iOS).
*   **Mitigation:** Keep the current JS-based 2GO Navigation Engine on both platforms.

### 7. Expo
*   **Classification:** **HIGH**
*   **Risk:** Breaking Continuous Native Generation (Prebuild)
*   **Cause:** SDK requires heavy `build.gradle`, `Podfile`, and `Info.plist` modifications.
*   **Impact:** Moving to Bare Workflow destroys Expo's easy upgrade path.
*   **Mitigation:** Write complex, custom Expo Config Plugins to inject the native SDK dependencies safely during Prebuild.

### 8. GPS
*   **Classification:** **HIGH**
*   **Risk:** Dual-Subscribing Battery Drain
*   **Cause:** Both `expo-location` (via `GPSManager.ts`) and the Navigation SDK requesting high-accuracy location simultaneously.
*   **Impact:** Severe battery drain and device overheating.
*   **Mitigation:** `GPSManager.ts` must be rewritten to pull coordinates from the Navigation SDK's internal location listener rather than `expo-location`.

### 9. NavigationStore & NavigationProvider
*   **Classification:** **HIGH**
*   **Risk:** State Machine Inversion
*   **Cause:** The SDK calculates its own ETA, Progress, and State.
*   **Impact:** `NavigationProvider` can no longer feed the store based on raw GPS. The store becomes a passive listener to the SDK's black box.
*   **Mitigation:** Rewrite `NavigationStore` actions to sync with SDK event callbacks.

### 10. Billing / API Keys
*   **Classification:** **HIGH**
*   **Risk:** Google Sales Gatekeeping
*   **Cause:** Navigation SDK access is restricted for Mobility Services.
*   **Impact:** Cannot launch the app until Google Sales explicitly provisions the Google Cloud Project API keys.
*   **Mitigation:** Contact Google Sales immediately; separate Maps SDK and Navigation SDK API keys strictly.

### 11. Camera & Routing
*   **Classification:** **MEDIUM**
*   **Risk:** Loss of Granular Control
*   **Cause:** SDK handles camera padding and route fetching internally.
*   **Impact:** Cannot easily insert 2GO-specific dynamic padding (e.g., sliding up the `NavigationBottomCard`) without fighting the native camera engine.
*   **Mitigation:** Heavy use of the SDK's native padding API, which may lag behind React Native state updates.

### 12. React Native
*   **Classification:** **MEDIUM**
*   **Risk:** Beta Wrapper Instability
*   **Cause:** The official React Native Navigation SDK wrapper is in Beta.
*   **Impact:** Potential memory leaks, bridging crashes, or lack of support for edge cases.
*   **Mitigation:** Extensive QA testing on the New Architecture (Fabric).

### 13. App Store & Google Play
*   **Classification:** **MEDIUM**
*   **Risk:** App Rejection
*   **Cause:** Navigation SDK requires persistent Background Location and Audio permissions.
*   **Impact:** Apple/Google severely scrutinize apps requesting turn-by-turn background location.
*   **Mitigation:** Provide video evidence to reviewers showing exact use cases for background tracking.

### 14. Performance & Battery
*   **Classification:** **LOW**
*   **Risk:** Overhead of loading monolithic SDK
*   **Cause:** Navigation SDK is significantly larger than standard Maps SDK.
*   **Impact:** Increased App binary size (.aab / .ipa) and higher memory footprint on low-end devices.
*   **Mitigation:** Ensure code splitting; accept the binary size increase.

### 15. Markers
*   **Classification:** **LOW**
*   **Risk:** Rigid Styling
*   **Cause:** SDK handles vehicle marker.
*   **Impact:** Difficult to apply highly custom SVG or dynamic status indicators to the driver vehicle.
*   **Mitigation:** Use native bitmap generation for markers.
