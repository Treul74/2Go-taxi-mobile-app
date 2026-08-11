# Prompt 08 — Fix Start Pickup button being permanently disabled

Read AGENTS.md first and follow it strictly.

[TASK]
Fix the "Start Pickup" button on app/(driver)/navigation.tsx being
permanently disabled with no feedback. The audit confirmed this
traces back to the same class of issue as the earlier GPS "lost"
bug: if driverLocation is null when calculateRoute() runs, it
aborts silently (no error, no retry), leaving routeCoordinates
empty and the button disabled forever with the driver seeing
nothing.

1. Fix the silent early return in calculateRoute() (around line
   119) — when it aborts because driverLocation or currentTrip is
   null, log this (gated behind the dev-only logging flag from the
   earlier prompt) instead of returning silently, and ensure the
   existing useEffect that re-triggers calculation when
   driverLocation updates is actually firing correctly.

2. If driverLocation is still null after a reasonable wait (e.g.
   GPS hasn't acquired a fix yet), show a visible loading/waiting
   state on the button ("Waiting for location...") instead of a
   plain disabled button with no explanation — so the driver
   understands what's happening rather than seeing an unresponsive
   button.

3. Remove the redundant navigation.driverToPickup() call inside
   handleStartPickup() — the audit confirmed the mode is already
   DRIVER_TO_PICKUP by the time this screen mounts (set by
   DriverDashboard.handleAcceptRequest), so this call always throws
   a caught-and-swallowed NavigationTransitionError. Keep only
   navigation.setNavigationEnabled(true) and whatever else this
   handler is actually responsible for.

4. Confirm the route between driver location and pickup is drawn
   using the exact same RouteEngine.fetchRoute() → NavigationStore
   → Map.native.tsx Polyline rendering path already used for the
   customer's pickup-to-destination route preview — do not
   introduce any separate or duplicate route-drawing logic. If this
   screen is already using that same path (per the recent
   Navigation Engine migration), confirm it explicitly rather than
   rebuilding it.

[CONSTRAINTS]
Reuse the existing route-fetching and polyline-rendering
components exactly as already used elsewhere — do not create new
ones.
Do not change DriverDashboard.handleAcceptRequest's existing mode
transition.
Do not touch any protected auth or flow systems.
Confirm on a real device that tapping Start Pickup now either
shows the route immediately (if GPS is ready) or shows a clear
waiting state instead of doing nothing.
