# Prompt 07 — Fix driver GPS lost
Read AGENTS.md first and follow it strictly.

[TASK]
Fix GPS acquisition failing on the driver's idle home screen. The
audit confirmed DriverDashboard.tsx requests the 'driverBestNavigation'
profile (Location.Accuracy.BestForNavigation) even while the driver
is simply idling online with no active trip. This accuracy level can
throw on many devices/environments (e.g. indoors), which
performStart() in GPSManager.ts catches by setting status to 'lost'
and aborting the watcher — silently, since DriverDashboard.tsx's
.catch() swallows the error entirely.

1. In DriverDashboard.tsx, change the acquire() call on the idle
   home screen from 'driverBestNavigation' to a less aggressive
   profile appropriate for idling — use 'driverBalanced' if it
   exists in GPSManager's profile table, otherwise use the same
   'customerBalanced' profile already confirmed working reliably
   on the customer side. Reserve 'driverBestNavigation' for when
   the driver actually enters active navigation (Navigate To
   Pickup / Trip In Progress modes), not while idling online.

2. Fix the silent error swallowing at DriverDashboard.tsx's
   acquire() .catch() block — if acquisition still fails for any
   reason, log the actual error (gated behind the dev-only logging
   flag from the previous prompt) instead of a bare empty catch, so
   this class of bug is visible in logs going forward instead of
   silently producing a permanently "lost" state with no trace.

3. In GPSManager.ts's performStart(), consider whether a failed
   'driverBestNavigation' acquisition should automatically retry
   with a lower accuracy profile as a fallback, rather than
   immediately setting status to 'lost' and giving up — ask before
   implementing this fallback if it adds meaningful complexity,
   since the profile-swap in step 1 may already fully resolve the
   issue on its own.

[CONSTRAINTS]
Do not change GPSManager's profile definitions/values themselves
— only which profile DriverDashboard.tsx requests while idle.
Do not change how 'driverBestNavigation' is used during active
navigation (Navigate To Pickup / Trip In Progress) — those modes
still need the higher accuracy.
Do not touch any protected auth or flow systems.
Confirm the driver's location marker now appears and gps status
shows a valid state instead of "lost" on the idle home screen.
