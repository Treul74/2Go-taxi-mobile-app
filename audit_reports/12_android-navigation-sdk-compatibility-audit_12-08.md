# Phase 11 — Part 5: Android Google Navigation SDK Compatibility Audit

## 1. ANDROID COMPATIBILITY MATRIX

| Requirement | Google Navigation SDK | Current 2GO Android (Expo 54) | Status |
|---|---|---|---|
| **minSdkVersion** | API 24 (Android 7.0) | `24` (Expo 54 default) | **Compatible** |
| **targetSdkVersion** | API 36+ | `35` (Expo 54 default) | **Compatible** (Easy to bump to 36) |
| **New Architecture** | Required for Beta RN Wrapper | Enabled (`newArchEnabled=true`) | **Compatible** |
| **Hermes** | Supported | Enabled (`hermesEnabled=true`) | **Compatible** |
| **Google Play Services** | Required on Device | Yes | **Compatible** |

---

## 2. COMPONENT DISPOSITION ANALYSIS

If the Google Navigation SDK were successfully integrated, the current 2GO Navigation Engine components would face the following fates:

| Component | Disposition | Reason |
|---|---|---|
| `NavigationMap.tsx` | **REPLACE** | Navigation SDK provides its own Native UI component (`NavigationView` / `SupportNavigationFragment`). You cannot wrap `react-native-maps` to achieve Navigation SDK functionality; it must be swapped entirely. |
| `Map.native.tsx` | **CONFLICT** | `react-native-maps` uses the standard Maps SDK (`com.google.android.gms:play-services-maps`). The Navigation SDK explicitly forbids coexisting with the standard Maps SDK in the same Android binary. |
| `CameraController.ts` | **REPLACE** | The Navigation SDK has a built-in native camera engine that automatically tilts, zooms, and follows the vehicle without jitter. The JS-based `CameraController.ts` would become obsolete. |
| `AutoFitEngine.ts` | **REPLACE** | The Navigation SDK automatically handles route bounding, padding, and UI chrome spacing (via its native padding APIs). |
| `MarkerAnimator.ts` | **REPLACE** | The SDK natively animates the vehicle marker, interpolating smoothly between GPS fixes without JS-bridge overhead. |
| `RouteEngine.ts` | **REPLACE** | The SDK fetches its own routes natively. Manual REST calls to Directions API and Polyline decoding in JS would no longer be necessary. |
| `GPSManager.ts` | **ADAPT** | The Navigation SDK requires access to location services natively to drive the navigator. `GPSManager.ts` would likely need to be adapted to subscribe to the SDK's location updates rather than `expo-location` to avoid battery-draining dual subscriptions. |

---

## 3. NATIVE CHANGES REQUIRED (Eventually)

To force this integration, the following native modifications would be necessary (likely via a custom Expo Config Plugin):

1. **`android/build.gradle`:** Add Google's maven repository for the Navigation SDK.
2. **`android/app/build.gradle`:** Add the `com.google.android.libraries.navigation:navigation` dependency.
3. **Dependency Resolution:** Strip or exclude `play-services-maps` from `react-native-maps` to resolve the Map SDK conflict, assuming `react-native-maps` can even compile against the Navigation SDK classes.
4. **`AndroidManifest.xml`:** Inject the `<meta-data>` tag for the Navigation SDK API key, and add the foreground service permission (`FOREGROUND_SERVICE_LOCATION`) required by the SDK for background navigation.
5. **MainApplication.kt:** Initialize the Navigation SDK natively on application boot.

---

## 4. THE MAP SDK CONFLICT

The absolute largest barrier is that **Android strictly prohibits shipping both the standard Google Maps SDK and the Google Navigation SDK in the same app**.

If 2GO adopts the Navigation SDK for the Driver app, you MUST remove `react-native-maps`. However, `react-native-maps` is currently used heavily on the Customer side (e.g., `CustomerHome.tsx`, `MapPickerModal.native.tsx`). 

You would have to either:
1. Re-write the entire Customer experience using the Navigation SDK's map views (which are optimized for driving, not simple UI picking).
2. Maintain a highly unstable, custom fork of `react-native-maps` that attempts to compile against the Navigation SDK instead of the Maps SDK.

---

## 5. RISKS AND SCORE

**Major Risks:**
*   **Total Engine Rewrite:** Integrating the SDK means throwing away 90% of the Phase 1-9 Navigation Engine work (`CameraController`, `MarkerAnimator`, `RouteEngine`).
*   **Customer Side Breakage:** The Android Map SDK conflict guarantees that standard customer map features will break unless entirely rewritten.
*   **Vendor Lock-in:** Moving from standard Maps API to the specialized Navigation SDK limits your ability to ever swap providers (e.g., Mapbox) because the routing and rendering logic become a black box.

**Android Readiness Score:** **2/10**

The project is technically modern enough (React Native 0.81, New Architecture) to run the SDK, but architecturally, it is fundamentally incompatible due to the hard reliance on `react-native-maps` and the completed JS-based Navigation Engine.
