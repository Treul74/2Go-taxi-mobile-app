# Prompt 10 — Simplify start pickup button
Read AGENTS.md first and follow it strictly.

[TASK]
Simplify app/(driver)/navigation.tsx's initial screen so it works
exactly like this, with no GPS dependency blocking anything:

1. The moment the driver lands on this screen after accepting,
   immediately fetch and show the route between currentTrip.pickup
   and currentTrip.destination using RouteEngine.fetchRoute() — this
   uses only data already on the order, no GPS needed at all.

2. Fit the map to show both pickup and destination points with this
   route drawn between them, immediately, with zero loading state.

3. The "Start Pickup" button must be enabled immediately once this
   screen loads — it does NOT wait for driverLocation, does NOT
   wait for any second route, does NOT check any GPS-dependent
   condition. Remove the "Waiting for location..." state and the
   disabled condition tied to driverLocation entirely from this
   button.

4. Tapping "Start Pickup" transitions the screen into the next
   phase (arrived-at-pickup slider), using the same
   navigation.driverToPickup() / setNavigationEnabled() actions
   already in place — just without gating the button itself on GPS
   first.

5. Once navigation is enabled, the driver's live location marker
   and any live-tracking route to pickup can update in the
   background as GPS resolves — but this must never block or delay
   the button being tappable in the first place.

[CONSTRAINTS]
Do not remove the pickup-to-destination overview route/fit from
the previous fix — keep that working exactly as it is now.
Do not add any new loading state, spinner, or "waiting for X"
condition to this button.
Do not touch any protected auth or flow systems.
Test the full flow end to end: accept -> screen loads with route
visible -> Start Pickup tappable immediately -> Arrived -> Start
Trip -> Complete Trip.
