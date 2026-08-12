# Phase 11 — Part 4: Google Navigation SDK Compatibility Audit

## 1. COMPATIBILITY MATRIX

| Environment | Compatible? | Reason |
|---|---|---|
| **Without Ejecting/Prebuild (Expo Go)** | **NO** | Google Navigation SDK is a native library requiring custom native modules, `AndroidManifest.xml` / `Info.plist` modifications, and Google Cloud credentials baked into the native layer. Expo Go does not support custom native modules. |
| **Expo Development Build** | **CONDITIONAL** | Requires creating a custom Expo Config Plugin (or using `npx expo prebuild`) to inject the SDK dependencies, API keys, and repository configurations into the native Android/iOS projects. |
| **Expo Prebuild (CNG)** | **YES** | Prebuild generates the necessary `android/` and `ios/` folders where the Navigation SDK dependencies can be natively integrated. |
| **EAS Build** | **YES** | EAS Build seamlessly builds applications containing custom native code and Config Plugins. |
| **Bare React Native** | **YES** | Fully supports the native Android and iOS setup instructions provided by Google. |

---

## 2. NATIVE & EXPO REQUIREMENTS COMPARISON

| Requirement | Google SDK Requirement | Current 2GO Project | Compatible? |
|---|---|---|---|
| **React Native** | `0.79+` (with New Architecture) | `0.81.5` | **YES** |
| **Expo SDK** | Native support / Config Plugin | `~54.0.35` | **YES** (via EAS/Prebuild) |
| **New Architecture** | Required (Fabric & TurboModules) | Enabled (`newArchEnabled: true`) | **YES** |
| **Android Version** | Min API 24, Target API 36+ | Managed by Expo SDK 54 defaults | **YES** |
| **iOS Version** | iOS 16.0+ | Managed by Expo SDK 54 defaults | **YES** |
| **Google Cloud** | Navigation SDK & Maps SDK Enabled | Assumed (Depends on backend/Google Cloud setup) | **CONDITIONAL** (Requires provisioning from Google Sales for Mobility Services) |

---

## 3. MAP SDK CONFLICT ANALYSIS (THE MAJOR BLOCKER)

There is a fundamental architectural conflict on Android between the Google Navigation SDK and the standard `react-native-maps` library currently used by 2GO.

*   **Google's Android Rule:** The official documentation explicitly states: *"The Navigation SDK replaces the standard Maps SDK. You cannot use both the Navigation SDK and the Maps SDK within the same application."*
*   **The Problem:** `react-native-maps` is built directly on top of the standard Google Maps SDK (`com.google.android.gms:play-services-maps`). 
*   **iOS Difference:** On iOS, this conflict does not exist because the Navigation SDK extends the Maps SDK, meaning both can co-exist within the same app bundle.

**Impact on 2GO:** 
Because 2GO uses `react-native-maps` for both legacy screens (e.g., `CustomerHome.tsx`) and the Navigation Engine (`NavigationMap.tsx`), adding the Google Navigation SDK to Android will cause a native Gradle dependency collision. You cannot have both standard Google Maps (`react-native-maps`) and Google Navigation SDK in the same Android binary.

---

## 4. BLOCKERS SUMMARY

### Major Blockers
1. **The Android Maps SDK Conflict:** You cannot natively compile an Android app that uses both `react-native-maps` (Standard Maps SDK) and the Google Navigation SDK. This means you either have to replace `react-native-maps` entirely across the whole application (including all Customer and legacy screens) or build a highly specialized custom fork of `react-native-maps` that compiles against the Navigation SDK instead of the standard Maps SDK.
2. **Access & Provisioning:** The React Native beta wrapper for the Navigation SDK requires contacting Google Sales for Mobility Services developer access. It is not a fully public drop-in library.

### Minor Blockers
1. **Config Plugin Requirement:** Because 2GO is an Expo project, someone must write a custom Expo Config Plugin to safely inject the SDK's heavy native configurations (maven repos, build.gradle tweaks, Info.plist entries) without breaking Continuous Native Generation (Prebuild).
2. **UI Component Paradigms:** The Google Navigation SDK takes full ownership of the camera, route rendering, and UI chrome (turn-by-turn banners, speed limits). 2GO's `CameraController.ts` and `AutoFitEngine.ts` would need to be partially bypassed or rewritten to defer to Google's internal camera engine.

---

## 5. COMPATIBILITY SCORE & RECOMMENDATION

**Score:** **3/10 (High Risk)**

**Recommendation:** 
Do **NOT** proceed with integrating the Google Navigation SDK at this time. 

The Android conflict is a critical, systemic blocker. Attempting to integrate it would force the entire application to abandon `react-native-maps`. Given that the 2GO Navigation Engine (Phase 1-9) has just been successfully stabilized to provide its own camera orchestration, route progress tracking, and marker animation using `react-native-maps`, ripping it out for a conflicting SDK would undo the entire architecture.

The current 2GO Navigation Engine architecture is already successfully acting as a powerful abstraction over the standard `react-native-maps` and Directions API. Stick with the current engine.
