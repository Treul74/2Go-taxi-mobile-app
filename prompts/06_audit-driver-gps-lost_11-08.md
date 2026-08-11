# Prompt 06 — Audit driver GPS lost
Read AGENTS.md first and follow it strictly.
Save this audit to audit_exports/ as instructed in AGENTS.md.

[TASK]
Audit only — do not change anything.

On the driver's idle home screen (IDLE mode, not navigating),
console logs show gps: "lost" and driverPosition: null
continuously, even though location permission is granted and GPS
works correctly elsewhere in the app (confirmed on the customer
side).

1. Show exactly how/when GPSManager.acquire() is called on the
   driver dashboard/home screen (DriverDashboard.tsx and/or
   NavigationMap.tsx) — what profile is requested, and under what
   condition.

2. Trace the GPS status lifecycle from acquire() through to the
   "lost" state — what specifically sets gps status to "lost"?
   Is it a timeout, a permission re-check failure, an explicit
   release() being called somewhere unexpectedly, or something
   else?

3. Compare this against how the customer side acquires GPS
   (confirmed working) — what is different about the driver idle
   screen's acquisition that could cause this discrepancy?

4. Check if GPSManager.release() or a teardown effect is being
   called on the driver home screen shortly after mount (e.g. from
   a cleanup function firing unexpectedly, a duplicate
   acquire/release pair, or a race condition between two effects).

5. Check whether the reference-counting acquire/release pattern
   documented in GPSManager.ts is being violated anywhere on this
   screen specifically (e.g. two different components on the same
   screen each acquiring and one releasing, dropping the shared
   subscription to zero references prematurely).

Report exact file/line references. Do not change anything.
