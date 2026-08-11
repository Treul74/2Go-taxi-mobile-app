# Audit Report — Driver GPS "Lost" Status on Idle Screen

This audit investigates why the driver's idle home screen continuously shows a "lost" GPS status, while the customer map works correctly.

## 1. How/when GPSManager.acquire() is called on the Driver Dashboard
In `src/features/driver/DriverDashboard.tsx` (lines 52-63), `GPSManager.acquire()` is called within a `useEffect` hook. 
- **Condition:** It only runs if `isOnline` is `true`. (If the driver is offline, GPS is never acquired).
- **Profile Requested:** It requests the `'driverBestNavigation'` profile in `'foreground'` mode.

## 2. Tracing the GPS status lifecycle to "lost"
The status becomes "lost" because the underlying Expo Location API throws an error during initialization:
1. `DriverDashboard.tsx` calls `GPSManager.acquire('foreground', 'driverBestNavigation')`.
2. This invokes `GPSManager.start()`, which delegates to `performStart()` in `src/navigation/NavigationEngine/GPSManager.ts`.
3. `performStart()` successfully acquires permissions and sets the status to `'acquiring'`.
4. It attempts to start the subscription via `Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, ... })`.
5. On many devices (especially indoors or when "precise location" isn't fully satisfied by hardware at that exact moment), requesting `BestForNavigation` immediately throws an exception.
6. The `catch (error)` block in `performStart()` executes (GPSManager.ts, lines 823-830). It explicitly sets `trackingState = 'error'`, calls `setStatus('lost')`, and throws a `START_FAILED` error.
7. This error is swallowed in `DriverDashboard.tsx` line 55: `.catch(() => { // Silently handle location errors })`, leaving the UI state permanently "lost".

## 3. Comparison with the Customer side
The customer side successfully acquires GPS because it uses a less aggressive accuracy profile.
- In `src/hooks/useCurrentLocation.ts` (line 88), which powers the customer map, the app calls:
  `GPSManager.acquire('foreground', 'customerBalanced')`
- The `'customerBalanced'` profile translates to `Location.Accuracy.Balanced` (GPSManager.ts, line 232).
- `Location.Accuracy.Balanced` is far more forgiving and succeeds in environments where `BestForNavigation` throws "unsatisfied device settings". 

## 4. Checking for unexpected release() or teardown
There is no premature teardown. The `release()` call in `DriverDashboard.tsx` is strictly bound to the `useEffect` cleanup (line 61). It only fires when `isOnline` changes to `false` or the screen unmounts.

## 5. Checking for reference-counting violations
There are no reference-counting violations on the driver home screen. `DriverDashboard.tsx` is the sole consumer of GPS on that screen, making exactly one `acquire()` call and providing exactly one `release()` callback in its effect cleanup.

---
**Conclusion:** The driver's map fails to track location because it aggressively requests the highest possible navigation accuracy (`driverBestNavigation`) even when the driver is just idling. On devices or in environments (e.g., indoors) where `BestForNavigation` is unsatisfied, Expo throws an error, aborting the watcher and leaving the status as "lost".
