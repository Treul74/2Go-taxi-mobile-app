# GPS Subscription Audit — Phase 3.5 (GPS Layer Hardening)

**Date:** 2026-08-03
**Scope:** Every use of `Location.watchPositionAsync`, `Location.getCurrentPositionAsync`,
`Location.startLocationUpdatesAsync`, `Location.stopLocationUpdatesAsync`,
`Location.hasStartedLocationUpdatesAsync`, `TaskManager.defineTask`,
`TaskManager.isTaskRegisteredAsync` across the entire repository (excluding
`node_modules`).
**Method:** Full-repo grep for each API name, then manual read of every
matching source file to confirm real usage vs. documentation/audit-history
mentions.

---

## Summary

| # | File | APIs used | Kind | Verdict |
|---|---|---|---|---|
| — | `src/navigation/NavigationEngine/GPSManager.ts` | all 7 | owner | ✅ Legitimate — this is the intended single owner |
| 1 | `src/hooks/useCurrentLocation.ts` | `watchPositionAsync`, `getCurrentPositionAsync` | hook | ❌ Duplicate subscription — migrate |
| 2 | `src/features/passenger/components/MapPickerModal.native.tsx` | `getCurrentPositionAsync` | component | ❌ Duplicate one-shot read — migrate |
| 3 | `src/features/passenger/PassengerHome.tsx` | `getCurrentPositionAsync` | screen | ❌ Duplicate one-shot read — migrate |
| 4 | `src/features/driver/DriverDashboard.tsx` | `getCurrentPositionAsync`, `watchPositionAsync` | screen | ❌ Duplicate subscription — migrate |
| 5 | `app/(driver)/navigation.tsx` | `getCurrentPositionAsync`, `watchPositionAsync` | screen | ❌ Duplicate subscription — migrate |
| 6 | `app/(driver)/trip.tsx` | `getCurrentPositionAsync`, `watchPositionAsync` | screen | ❌ Duplicate subscription — migrate |
| 7 | `app/(tabs)/navigate.tsx` | `watchPositionAsync` | screen | ❌ Duplicate subscription — migrate |

**7 duplicate GPS-owning call sites found, all outside `GPSManager.ts`.**
None use `startLocationUpdatesAsync`, `stopLocationUpdatesAsync`,
`hasStartedLocationUpdatesAsync`, `TaskManager.defineTask`, or
`TaskManager.isTaskRegisteredAsync` — those (background-tracking) APIs are
only ever called from `GPSManager.ts`, so background-mode ownership was
already exclusive going into this phase. The violations are all
**foreground** subscriptions/one-shot reads.

Non-code matches (documentation/historical audit output — no action):
`2GO Navigation Engine Bible.md`, `docs/H3_STORE_INTEGRATION.md` (example
code in a doc, not imported anywhere), `audit_export/*.md`/`*.html`
(read-only historical snapshots), `src/navigation/NavigationEngine/README.md`
/ `Architecture.md` (describe the rule), `hooks/useNavigation.ts` (a
docstring line naming `watchPositionAsync()` as something screens must never
call — not a call itself).

---

## Detail per file

### 1. `src/hooks/useCurrentLocation.ts`
- `watchPositionAsync({ accuracy: Balanced, timeInterval: 60000, distanceInterval: 50 })` — continuous.
- `getCurrentPositionAsync({ accuracy: Balanced })` — one-shot, inside `refetch()`.
- **Consumers, concurrently mounted:** `useSnappedLocation` (→ `PassengerHome.tsx`, road-snapped) AND directly by `RidePlannerSheet.tsx` (raw, unsnapped) at the same time, since `RidePlannerSheet` renders inside `PassengerHome`. This is the one call site where **two independent consumers want tracking active simultaneously** — the migration must not let the second unmount kill the first's tracking.

### 2. `src/features/passenger/components/MapPickerModal.native.tsx`
- `getCurrentPositionAsync({ accuracy: Balanced })` — one-shot, inside `handleGoToMyLocation` ("my location" button on the drag-to-pick map).

### 3. `src/features/passenger/PassengerHome.tsx`
- `getCurrentPositionAsync({ accuracy: High })` with a `getLastKnownPositionAsync` fallback — one-shot, inside `handleRecenter` (recenter-map button).

### 4. `src/features/driver/DriverDashboard.tsx`
- Initial read: 3-tier fallback `getCurrentPositionAsync({accuracy: High})` → `Balanced` → `Low`, then `getLastKnownPositionAsync` as a last resort.
- Continuous: `watchPositionAsync` with the same 3-tier fallback (`High` → `Balanced` → `Low`), `distanceInterval`/`timeInterval` varying by which tier succeeded (1m/1000ms for High, 10m/5000ms otherwise).
- Gated by `isOnline`; effect dependency array is `[isOnline, isAutoFollow]` — **the native subscription is torn down and recreated every time `isAutoFollow` toggles** (confirmed pre-existing inefficiency, also flagged in `audit_export/audit_02-08-26_13-49_navigation-system-architecture.html`).

### 5. `app/(driver)/navigation.tsx`
- Initial read: `getCurrentPositionAsync({accuracy: BestForNavigation})`.
- Continuous: `watchPositionAsync({accuracy: BestForNavigation, distanceInterval: 1, timeInterval: 1000})`.
- Mount-once effect (`[]` deps).

### 6. `app/(driver)/trip.tsx`
- Same pattern as #5 (`BestForNavigation`, 1m/1000ms), mount-once effect.
- Additionally runs its own **bespoke fix-quality filter**, `trackGpsPoint`, to accumulate real distance driven for the fare receipt: rejects fixes with `accuracy > 50`, segment moves `< 8m`, non-positive elapsed time, or an implied speed `> 120 km/h`. This is a second, independent "is this fix good enough" implementation living outside `GPSManager` — conceptually the same job as `GPSManager`'s new quality scoring (Task 4), just narrower (boolean accept/reject vs. a 5-tier score) and single-purpose (distance accumulation only). **Left in place** for this pass (it's a fare-integrity calculation, not a subscription, and out of this phase's explicit scope) but flagged as a candidate to eventually consume `GPSManager`'s quality score instead of re-deriving its own accept/reject rule.

### 7. `app/(tabs)/navigate.tsx`
- Continuous only (no initial one-shot read): `watchPositionAsync({accuracy: BestForNavigation, distanceInterval: 1, timeInterval: 1000})`.
- Effect dependency array is `[isNavigating, isAutoFollow]` — same "restarts on every toggle" pattern as #4.

---

## Behavior-preserving migration notes (read before Task 1 changes)

- All four continuous "driver navigating" screens (#4 partially, #5, #6, #7)
  request `Accuracy.BestForNavigation`/`High` with `distanceInterval: 1`,
  `timeInterval: 1000` — this matches `GPSManager`'s existing
  `driverBestNavigation` profile almost exactly, **except** that profile's
  `distanceIntervalMeters` was `3`, not `1`. **Tightened to `1`** as part of
  this pass so migrating these screens changes nothing about update cadence.
- `GPSManager`'s `driverBestNavigation` profile also rejects any fix whose
  accuracy is worse than 30m. None of the 4 screens currently filter by
  accuracy on fixes it applies to state/camera at all (only `trip.tsx`'s
  separate `trackGpsPoint` fare-distance accumulator does, at a 50m
  threshold, for a different purpose). **This is a deliberate, flagged
  behavior improvement, not a silent regression**: after migration, a wildly
  inaccurate fix will no longer be able to snap the driver marker/camera to
  a wrong position — it's dropped before reaching any screen. This is
  exactly what centralizing onto `GPSManager` is for.
- `DriverDashboard.tsx`'s 3-tier accuracy fallback and `getLastKnownPositionAsync`
  last-resort read have no direct equivalent in `GPSManager` and are not
  replicated. `GPSManager.start()`'s own error handling (a clear thrown
  `GPSManagerError` instead of a silent multi-tier retry) is the intended
  replacement — flagged as a minor, deliberate simplification, not an
  oversight.
- `useCurrentLocation.ts`'s multi-consumer case requires reference counting
  (implemented as `GPSManager.acquire()`/`release()`, see Architecture.md)
  so one consumer unmounting doesn't kill tracking for a sibling still using
  it.
