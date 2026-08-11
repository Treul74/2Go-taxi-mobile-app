# Prompt 09 — Fix driver route overview
Read AGENTS.md first and follow it strictly.

[TASK]
Fix app/(driver)/navigation.tsx to show the pickup-to-destination
overview route immediately using data already available on
currentTrip, instead of blocking everything on driverLocation
(live GPS). The audit confirmed this screen currently only ever
fetches driverLocation -> currentTrip.pickup, and never uses
currentTrip.destination at all — so nothing draws until GPS
resolves, and the passenger's already-known drop-off point is
completely ignored.

1. On screen mount, immediately fetch the static overview route
   using RouteEngine.fetchRoute(currentTrip.pickup,
   currentTrip.destination) — this requires zero GPS and should
   render right away, with no loading state, exactly like the
   customer side already does for the same two points.

2. Fit the camera to show both pickup and destination immediately
   using this static route, via the existing AutoFitEngine fit
   function already used elsewhere (the same one confirmed working
   for PREVIEW/MATCHING modes) — so the driver sees the full trip
   shape the instant they land on this screen.

3. Separately and additionally, once driverLocation becomes
   available, fetch the second route: driverLocation ->
   currentTrip.pickup — this is the actual navigation leg the
   driver will drive. Show this as the live/active navigation
   polyline once GPS resolves.

4. Since NavigationStore currently only supports one active route
   at a time, add a second route slot rather than overwriting —
   either a new field (e.g. overviewRoute alongside route) on
   NavigationStore, or render the static overview route locally on
   this screen without going through NavigationStore at all if
   that's simpler and doesn't conflict with the engine's single-
   source-of-truth rule for the live navigation route specifically.
   Ask before choosing an approach if genuinely ambiguous.

5. The "Waiting for location..." state on the Start Pickup button
   should apply ONLY to the driver-to-pickup leg (step 3) — the
   overview route and map (steps 1-2) must never be gated on
   driverLocation.

6. Remove the current single fetchRoute(driverLocation,
   currentTrip.pickup) call that conflates both concerns, replacing
   it with the two separate, correctly-scoped fetches described
   above.

[CONSTRAINTS]
Reuse RouteEngine.fetchRoute(), AutoFitEngine's existing fit
functions, and Map.native.tsx's existing Polyline rendering — do
not create new routing or drawing logic.
Do not change how the customer side already handles this correctly
— use it only as the reference pattern.
Do not touch any protected auth or flow systems.
Confirm on a real device: the pickup-to-destination route and
camera fit appear immediately on screen load with no waiting, and
the driver-to-pickup live route/button only shows a waiting state
for that specific leg.
