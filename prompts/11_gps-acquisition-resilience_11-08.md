# Prompt 11 — GPS Acquisition Resilience

Make GPS acquisition resilient instead of failing outright when BestForNavigation accuracy can't be satisfied — this is a real device-level issue (observed on Android) that will affect real drivers in the field, not just a bug to patch once.

1. In GPSManager.ts's performStart(), when the requested accuracy profile fails (throws during Location.watchPositionAsync), do not immediately set status to 'lost'. Instead automatically retry with progressively lower accuracy: if 'driverBestNavigation' fails, retry with 'driverBalanced' (or the equivalent balanced profile), and if that also fails, retry with a low-accuracy profile before finally giving up. Log each fallback attempt (gated behind the existing dev-only logging flag).

2. While waiting for the first live GPS fix to resolve, call Location.getLastKnownPositionAsync() immediately and use its result (if available) as a temporary position so the driver isn't staring at an empty map while waiting for the first live tick.

3. Add a timeout (e.g. 8-10 seconds) on any "waiting for location" UI state. If GPS hasn't resolved by then, stop showing an indefinite spinner — show a clear message ("Still finding your location — check that Location Services are turned on") with a manual "Retry" button that re-triggers acquisition, rather than leaving the driver stuck with no explanation or recovery option.

4. If the OS-level Location Services check (e.g. Location.hasServicesEnabledAsync()) fails upfront, do not show "Still finding your location"; immediately show a distinct error directing the driver to their system settings.
