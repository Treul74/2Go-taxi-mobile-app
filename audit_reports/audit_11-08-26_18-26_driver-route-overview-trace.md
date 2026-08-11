# Audit Report: Driver Post-Accept Route Display Trace

**Date:** 2026-08-11
**Scope:** Investigation of the "waiting for location" state and missing static route polygon on the driver's post-accept navigation screen.

*(Note: Per `AGENTS.md` rules 27 & 33, this report is saved to `audit_reports/` rather than the requested `audit_exports/`.)*

## 1. Coordinates Used for the Route/Polygon
**File:** `app/(driver)/navigation.tsx`
**Current Behavior:** The screen currently conflates the overview route and the live navigation route into a single fetch. At line 141, it calls:
```typescript
const fetchedRoute = await fetchRoute(driverLocation, currentTrip.pickup);
```
It is explicitly trying to draw the `driverLocation -> pickup` route. Because this route relies on `driverLocation` (live GPS), the entire fetching and drawing process is held hostage until the GPS lock is acquired.

## 2. Customer Side Comparison
**File:** `app/(tabs)/navigate.tsx`
**Current Behavior:** The customer side successfully avoids this trap by fetching the static route between the selected points without waiting for live GPS. At line 167, it calls:
```typescript
const route = await fetchRoute(startLocation, destinationLocation);
```
Here, `startLocation` is the passenger's designated pickup, and `destinationLocation` is their dropoff. This relies purely on the static data available from the order, requiring zero live GPS input, which is why the route and camera fit appear instantly for the customer.

## 3. Availability of Order Coordinates on Acceptance
**File:** `src/types/index.ts`
**Current Behavior:** The `IncomingRequest` interface (which types `currentTrip`) is defined at line 179 as:
```typescript
export interface IncomingRequest {
  id: string;
  pickup: Location;
  destination: Location;
  ...
}
```
**Conclusion:** Yes. `currentTrip.pickup` and `currentTrip.destination` (the dropoff) are fully populated and immediately available the exact moment the driver accepts the order. There is absolutely no technical reason to wait for anything before utilizing these coordinates.

## 4. Why "Waiting for location..." is Showing
The logic on `app/(driver)/navigation.tsx` strictly gates *everything* on `driverLocation`.
- The `calculateRoute()` function (line 119) intentionally aborts if `!driverLocation`, leaving `routeCoordinates` empty.
- Because `routeCoordinates` is empty, the button's `disabled` prop remains `true`.
- The recent fix implemented a fallback UI to show "Waiting for location..." when `!driverLocation` is true.
- **The Core Flaw:** The screen is treating the live `driverLocation -> pickup` route as the *only* visual feedback, instead of immediately fetching and drawing the static `pickup -> destination` overview route using the already-available `currentTrip` data.

## 5. Intended Design vs. Current Reality
**What Currently Exists:**
- The screen relies on a single route fetch: `driverLocation -> currentTrip.pickup`.
- It saves this single route to `useNavigationStore().setRoute()`.
- It completely ignores the `currentTrip.destination` data for drawing an initial overview polygon.

**What Would Need to Change:**
To align with the Navigation Engine Bible's mandate (e.g., "The user should always see Driver, Pickup, Destination, Entire route without manually zooming"), the screen should conceptually separate the two routing needs:
1. **The Overview Route:** Immediately fetch `currentTrip.pickup -> currentTrip.destination` using `RouteEngine.fetchRoute()` and render it as a static overview polygon. This can be drawn instantly (zero loading state).
2. **The Navigation Leg:** Separately, calculate `driverLocation -> pickup` when GPS is available. The "Waiting for location..." loading state legitimately applies *only* to this dynamic leg, not the overview render. 

Currently, the single `NavigationStore.route` state property enforces a "one route at a time" limitation. To show both (the static trip overview + the dynamic path to pickup), either the `NavigationStore` or `NavigationMap` would need to be updated to support drawing a secondary preview route alongside the active navigation polyline, or the screen needs to fetch the static overview first, then replace it (or supplement it) once `driverLocation` resolves.
