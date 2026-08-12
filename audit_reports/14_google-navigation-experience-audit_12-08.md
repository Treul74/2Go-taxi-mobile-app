# Phase 11 — Part 8: Google Navigation Experience vs Custom Navigation Audit

## 1. THE TWO GOOGLE SDK EXPERIENCES

The Google Navigation SDK offers two distinct integration paths:

### A. Built-in Google Experience
This is the "out-of-the-box" implementation. It renders a complete, pre-packaged UI that looks identical to the consumer Google Maps app (the classic green turn banners, ETA pills, speed limit signs, and auto-following camera).

### B. Custom Navigation Experience
In this mode, you use the Navigation SDK as a headless data provider. Google feeds you raw navigation data (current route, distance to next turn, turn instructions, ETA), and you are responsible for rendering the map, plotting the route, orchestrating the camera, and building the UI.

---

## 2. COMPARISON & 2GO ARCHITECTURE IMPACT

| Feature | Built-in Google Experience | Custom Navigation Experience (2GO's approach) |
|---|---|---|
| **UI Control** | **Lost.** Google renders the UI. | **Retained.** 2GO renders the UI. |
| **2GO Branding** | **Lost.** You get standard Google Maps colors/fonts. | **Retained.** 2GO uses Deep Navy, Vibrant Orange-Red, etc. |
| **NavigationHUD** | **Lost.** Google's turn banners replace it. | **Retained.** 2GO renders its custom HUD. |
| **Turn Instructions** | **Lost.** Google formats and renders the text/icons. | **Retained.** 2GO parses the feed and renders custom icons. |
| **ETA & Route Progress** | **Lost.** Displayed in Google's bottom pill. | **Retained.** Displayed in 2GO's `NavigationBottomCard`. |
| **RideActionSlider** | **Conflict.** Would awkwardly float over Google UI. | **Retained.** Fits perfectly in the 2GO custom layout. |
| **CameraController** | **Lost.** Google controls zoom, pitch, and follow. | **Retained.** 2GO's `CameraController` orchestrates the view. |
| **AutoFitEngine** | **Lost.** Google handles padding natively. | **Retained.** 2GO calculates bounding boxes around custom chrome. |
| **Rerouting Logic** | **Lost.** Google recalculates invisibly. | **Retained / Fed.** Google triggers recalculation, 2GO updates Store. |

---

## 3. WHAT 2GO LOSES WITH "BUILT-IN"

If 2GO adopted the Built-in Google Experience, it would completely lose its visual identity during a ride. 
- The custom `NavigationTurnBanner` would be replaced by a generic Google banner.
- The `NavigationBottomCard` (which houses the crucial `RideActionSlider` for "Slide to Arrive" or "Start Trip") would have to be awkwardly layered on top of or crammed next to Google's unremovable ETA pill.
- The Driver workflow would feel disconnected, looking like they suddenly left the 2GO app and opened consumer Google Maps.

## 4. WHAT 2GO RETAINS WITH "CUSTOM"

If 2GO uses the Custom Navigation Experience (or simply keeps its current architecture), 2GO retains full ownership of:
- **`NavigationStore`**: The state machine remains the source of truth.
- **`CameraController` & `AutoFitEngine`**: Dynamic, brand-specific camera padding that respects 2GO's bottom sheets and sliders.
- **`NavigationHUD`**: The UI remains perfectly aligned with the 2GO design system outlined in `AGENTS.md`.

---

## 5. RECOMMENDATION

**Recommendation:** **CUSTOM NAVIGATION EXPERIENCE**

If 2GO ever moves to the Google Navigation SDK, it **MUST** use the Custom Navigation Experience (headless data feed) rather than the Built-in Experience. 

However, since 2GO has *already built* its own Custom Navigation Experience in JS (the 2GO Navigation Engine) using standard `react-native-maps` and Google Directions API, **there is zero benefit to adopting the Navigation SDK merely for the Custom Experience.** 

The current 2GO Navigation Engine already achieves exactly what the Custom Navigation Experience offers: it takes raw route data, feeds it into a unified `NavigationStore`, and renders a highly branded, custom UI (`NavigationHUD`, `RideActionSlider`) while orchestrating the camera via `CameraController`. 

Adopting the Built-in experience destroys the 2GO brand, and adopting the Custom experience via the SDK just duplicates the architecture 2GO already successfully built.
