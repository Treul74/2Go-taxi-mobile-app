# Audit Report: "Start Pickup" Handler Trace

**Date:** 2026-08-11
**Scope:** Investigation of the "Start Pickup" button unresponsiveness and execution trace on the Driver app.

*(Note on folder path: The prompt requested saving this to `audit_exports/`, but per `AGENTS.md` rules 27 & 33, `audit_exports/` is strictly forbidden. This report has been correctly saved to `audit_reports/`.)*

## 1. "Start Pickup" Button and Handler Location
- **File:** `app/(driver)/navigation.tsx`
- **Render Location:** Lines 420–429 (inside the bottom sheet/card).
- **Component:** It is a standard React Native `<Button>`.
- **onPress Handler:** `routeError ? calculateRoute : handleStartPickup`
- **What it currently calls:** When no error is present, tapping it calls `handleStartPickup()` (defined at line 160).
  ```typescript
  const handleStartPickup = async () => {
      safeTransition(() => navigation.driverToPickup(driverLocation ?? undefined));
      navigation.setNavigationEnabled(true);
  };
  ```

## 2. Trace of Execution (Tapped vs Expected)
- **Does it call `fetchRoute()` on tap?**
  No. By the time the button is rendered and tapped, `fetchRoute()` should have already completed. `calculateRoute()` is triggered automatically via a `useEffect` (lines 154-158) when the screen mounts if `routeCoordinates.length === 0`.
- **Does it call `navigation.driverToPickup()` on tap?**
  Yes, it attempts to call it via `safeTransition()`. However, as documented in the file's comments, the `NavigationStore.mode` was *already* transitioned to `DRIVER_TO_PICKUP` on the previous screen (`DriverDashboard.handleAcceptRequest`). Because the mode is already `DRIVER_TO_PICKUP`, attempting this transition again throws a `NavigationTransitionError`.
- **What it does today:**
  1. `safeTransition` catches the `NavigationTransitionError` from the redundant `driverToPickup()` call and silently logs a warning.
  2. `navigation.setNavigationEnabled(true)` is executed, which toggles the UI to replace the "Start Pickup" button with the "Slide to Arrive" `<RideActionSlider>`.
- **Why navigation / route drawing isn't triggered by the tap:**
  According to the Navigation Bible and current `navigation.tsx` wiring, the route drawing (`NavigationMap`) and camera following (`navigation.followDriver()`) are *not* waiting for this button tap. `navigation.followDriver()` is called on mount (line 108), and the route is fetched on mount. The button merely acknowledges the step and updates the UI state to the arrival slider.

## 3. Broken/Missing Wiring (Why it does not respond)
The button's `disabled` state is explicitly tied to the route calculation:
```typescript
disabled={isCalculating || (!routeCoordinates.length && !routeError)}
```
- If the route calculation silently fails, or if `driverLocation` is null preventing the calculation from starting, `routeCoordinates.length` remains `0`.
- Because `routeError` is `false` initially, the condition `(!routeCoordinates.length && !routeError)` evaluates to `true`.
- **Result:** The `<Button>` is rendered in a `disabled` state. In React Native, tapping a disabled button produces no visual feedback and silently swallows the `onPress` event. The button does not respond because it is legitimately disabled by the lack of route coordinates.

## 4. Console/Error Logs (Caught and Swallowed Errors)
- **`safeTransition`:** Catches `NavigationTransitionError` and swallows it into a `console.warn` (see `src/navigation/NavigationEngine/safeTransition.ts`). This is expected behavior for the redundant state transition.
- **`calculateRoute`:** Any actual network/Google API error from `fetchRoute()` is caught in a try/catch block, logged via `console.error('Error calculating route:', error);`, and sets `setRouteError(true)` (which changes the button to "Retry Route" and re-enables it).
- **The Silent Failure:** If `calculateRoute()` returns early before the try/catch (e.g., because `!driverLocation` or `!currentTrip` is true on line 119), no error is logged. The route is never fetched, the button stays disabled, and no logs are produced.

## 5. Location of the Button
**Confirmed:** The button is on `app/(driver)/navigation.tsx` (the map screen itself), *not* on `DriverDashboard.tsx`. The bug is not in triggering navigation to the screen (the app successfully navigated to `navigation.tsx`), but rather the route failing to populate once on the screen, trapping the button in a disabled state.

## 6. Availability of Coordinates at the Time of Tap
- **Pickup Coordinates:** Sourced from `useDriverStore().currentTrip.pickup`. This is highly likely to be populated, as the screen correctly renders the pickup address text at line 396 (`currentTrip.pickup.address`).
- **Driver's Current Location:** Sourced from `useDriverLocation()` (line 55), which listens to `NavigationStore` via `GPSManager`.
- **The Gap:** If `GPSManager` hasn't acquired a fix yet when `navigation.tsx` mounts, `driverLocation` is `null`. The `calculateRoute` function (line 119) guards against this and aborts silently. While there is a `useEffect` to re-trigger calculation when `driverLocation` updates, if GPS fails to report entirely, `driverLocation` remains null, `calculateRoute()` never fires, `routeCoordinates` stays empty, and the "Start Pickup" button remains silently disabled forever.
