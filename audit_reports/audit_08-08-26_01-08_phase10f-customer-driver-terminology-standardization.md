# Phase 10F — Standardize Domain Terminology (Customer / Driver)

**Date:** 2026-08-08
**Scope:** Repo-wide terminology pass. Eliminate "Passenger" and "Transporter"
as domain vocabulary in favor of "Customer" and "Driver", per the phase
prompt. No application behaviour, business logic, navigation logic, GPS
logic, camera logic, route logic, ride lifecycle, or database behaviour was
changed. `tsc --noEmit` passes clean after every change in this phase.

Built on top of a same-day audit that had already found and documented this
exact inconsistency: `audit_export/audit_07-08-26_19-13_tab-driver-naming-consistency.md`.

---

## 0. Decisions made before renaming (user-confirmed)

This phase directly conflicted with AGENTS.md's own Naming section, which
declared "Transporter" (not "Driver") the canonical role name. Per AGENTS.md's
own rule ("if anything in a prompt conflicts with this file, ask before
proceeding"), three scoping questions were put to the user before any file was
touched:

1. **Canonical term conflict** — resolved: **Driver is canonical; AGENTS.md
   itself was rewritten** to match (not left stale).
2. **The `UserRole` literal** (`'passenger' | 'driver'`, mirrors the DB's
   `customers.account_type` enum value `'passenger'`) — resolved: **left
   untouched**, documented as a legacy exception, to avoid desyncing app role
   state from the persisted account type without a backend migration.
3. **File/folder renames** (e.g. `src/features/passenger/` →
   `src/features/customer/`) — resolved: **yes, rename fully**, including
   fixing every resulting import.

---

## 1. Files modified

### Renamed (git mv / folder rename)
- `src/features/passenger/` → `src/features/customer/`
- `src/features/customer/PassengerHome.tsx` → `CustomerHome.tsx`
  (component `PassengerHome` → `CustomerHome`)

### Edited — app code
- `src/features/index.ts`, `src/features/customer/index.ts`
- `src/state/rideStore.ts` (`passengerHex9` field → `customerHex9`)
- `src/state/driverStore.ts` (`ratePassenger` → `rateCustomer`,
  `passengerName`/`passengerRating` → `customerName`/`customerRating`)
- `src/state/driverWalletStore.ts` (`TripReceipt.passengerName` →
  `customerName`)
- `src/state/__examples__/h3-store-examples.ts` (fully renamed — demo file,
  unused elsewhere, referenced the now-renamed `rideStore` field)
- `src/types/index.ts` (`IncomingRequest`/`TripSummary`/`TripCompletionInput`
  `passengerName`/`passengerRating` → `customerName`/`customerRating`;
  `UserRole` kept as documented legacy exception — see §3)
- `src/services/discoveryEngine.ts` (`findNearbyDrivers` param
  `passengerHex9` → `customerHex9`)
- `src/services/driverOrders.ts` (fallback display name `'Passenger'` →
  `'Customer'`)
- `src/components/map/Map.tsx`, `Map.native.tsx` (prop `passengerHex9` →
  `customerHex9`; comments)
- `src/components/map/markers/CarMarker.tsx` (comment)
- `src/hooks/useCurrentLocation.ts`, `useAnimatedMarkerWeb.ts`,
  `useNotificationTapNavigation.ts` (GPS profile literal + comments)
- `src/features/account/components/RoleSwitcher.tsx` (`passengerScale`/
  `passengerStyle` vars → `customerScale`/`customerStyle`; "Passenger" tile
  label → "Customer"; literal `'passenger'` role comparisons preserved)
- `src/features/discover/DiscoverScreen.tsx`, `src/features/driver/
  DriverDashboard.tsx`, `src/features/driver/components/RequestCard.tsx`
  (comments)
- `app/(tabs)/index.tsx` (renders `CustomerHome`), `app/(tabs)/_layout.tsx`,
  `app/(tabs)/navigate.tsx`, `app/_layout.tsx` (imports + comments)
- `app/(driver)/trip.tsx`, `app/(driver)/navigation.tsx`,
  `app/(driver)/trip-summary.tsx` (`handleCallPassenger`/
  `handleChatPassenger` → `handleCallCustomer`/`handleChatCustomer`;
  `passengerRow`/`passengerName` styles → `customerRow`/`customerName`; UI
  text "Waiting for Passenger" → "Waiting for Customer")
- `app/(customer)/trip.tsx` (comment)
- `app/chat/[id].tsx` (`currentTrip?.customerName`)
- `app/rating/driver.tsx` (`ratePassenger` → `rateCustomer`; local var/UI text)
- `src/constants/mockData.ts` (`mockPassengers`/`getPassengerById` →
  `mockCustomers`/`getCustomerById` — unused elsewhere)

### Edited — Navigation Engine (Protected Features, per AGENTS.md §"Protected
Features" — terminology-only, no behaviour change; verified with `tsc`)
- `src/navigation/NavigationEngine/types.ts` (`NavigationActor`:
  `'customer' | 'transporter'` → `'customer' | 'driver'`; `GPSProfile`:
  `'passengerBalanced'` → `'customerBalanced'`; doc comments)
- `src/navigation/NavigationEngine/GPSManager.ts` (`PROFILE_OPTIONS.
  passengerBalanced` → `customerBalanced`; every consumer of that key;
  doc comments, including stale file-path references now pointing at
  `src/features/customer/...`)
- `src/navigation/NavigationEngine/providers/NavigationProvider.tsx`
  (`setActor(userRole === 'driver' ? 'transporter' : 'customer')` →
  `'driver' : 'customer'`; doc comments)
- `src/navigation/NavigationEngine/NavigationModes.ts` (all 13 "Transporter"
  doc-comment occurrences — pure prose, no literal values — → "Driver")
- `src/navigation/NavigationEngine/CameraController.ts`,
  `AutoFitEngine.ts`, `NavigationStore.ts` (doc comments)
- `src/navigation/NavigationEngine/MarkerAnimator.ts` (exported constant
  `PASSENGER_MARKER_PROFILE` → `CUSTOMER_MARKER_PROFILE`; doc comments)

### Edited — documentation
- `AGENTS.md` (App Overview, Naming, Folder Structure, Store Ownership,
  Database Tables note, Protected Workflow diagram, Back Button Standard —
  see §4)
- `2GO Navigation Engine Bible.md` (4 "Passenger" occurrences → "Customer")
- `src/navigation/NavigationEngine/Architecture.md`,
  `src/navigation/NavigationEngine/README.md`
- `docs/H3_STORE_INTEGRATION.md`, `docs/H3_SPATIAL_ENGINE.md`,
  `docs/H3_GPS_INTEGRATION.md`

### Deliberately NOT touched
- `audit_export/*.md` — frozen historical audit records; AGENTS.md's Audit
  Reports rule says not to modify that folder except by adding new
  timestamped files. Renaming their prose would falsify history.
- Any DB table/column name, or any literal value that round-trips to the
  backend (see §3).

---

## 2. Terminology mapping

| Legacy | Canonical | Notes |
|---|---|---|
| Passenger | Customer | Component/file/variable/UI-text/doc renames |
| Transporter | Driver | Component/file/variable/UI-text/doc renames |
| Rider | Customer | Was already banned by AGENTS.md pre-Phase-10F; no occurrences found in code |
| `passengerHex9` | `customerHex9` | rideStore field, Map prop, function params |
| `passengerName` / `passengerRating` | `customerName` / `customerRating` | Trip/receipt/request types and every consumer |
| `ratePassenger` | `rateCustomer` | driverStore action |
| `handleCallPassenger` / `handleChatPassenger` | `handleCallCustomer` / `handleChatCustomer` | driver trip/navigation screens |
| `mockPassengers` / `getPassengerById` | `mockCustomers` / `getCustomerById` | mockData.ts |
| `PASSENGER_MARKER_PROFILE` | `CUSTOMER_MARKER_PROFILE` | MarkerAnimator.ts |
| `'passengerBalanced'` (GPSProfile) | `'customerBalanced'` | types.ts, GPSManager.ts, every caller |
| `NavigationActor: 'transporter'` | `NavigationActor: 'driver'` | NavigationEngine/types.ts |
| `src/features/passenger/` | `src/features/customer/` | folder rename |
| `PassengerHome` (component) | `CustomerHome` | file + export rename |

---

## 3. Remaining legacy terminology (intentional, documented)

Two exceptions remain by design — both are literal values that cross a
persistence/DB boundary, not naming choices:

1. **`UserRole = 'passenger' | 'driver'`** (`src/types/index.ts`) — mirrors
   `customers.account_type`'s DB enum value `'passenger'`. Every runtime
   comparison against it keeps the `'passenger'` literal: `userStore.ts`,
   `messagingStore.ts`, `services/messages.ts` (`fetchOrderConversations`'s
   `role` param), and `RoleSwitcher.tsx`'s role-comparison ternaries (its
   *display* text and internal variable names were renamed; only the literal
   comparisons were kept).
2. **`ratings.passenger_communication`** (`src/services/ratings.ts:72`) — an
   actual DB column name in the `ratings` table, inserted as-is via
   `insforge.database.from('ratings').insert(...)`.

No other "Passenger"/"Transporter"-shaped strings remain in `app/` or `src/`
(verified by a full-repo grep after the pass completed).

---

## 4. Updated domain language guide

AGENTS.md's Naming section now reads (summary — see the file for full text):

> The project's official domain language is **Customer** and **Driver** — the
> only two user-role terms that should appear in new code, UI text, comments,
> or documentation. "Rider", "Passenger", and "Transporter" are retired.

A new "Legacy terminology exceptions" subsection documents the two items in
§3 above, so future agents don't attempt to "fix" them without realizing
they're DB-boundary literals.

AGENTS.md's App Overview, Folder Structure (`passenger/` → `customer/` paths,
`PassengerHome` → `CustomerHome`, "Transporter" → "Driver" throughout),
Store Ownership table, Database Tables note on `account_type`, the Protected
Workflow diagram ("Passenger Request"/"Passenger Rating" → "Customer
Request"/"Customer Rating"), and the Back Button Standard section were all
updated to match.

---

## 5. Consistency report

- ✅ No functionality changed — every edit was a rename (identifier, file,
  prop, comment, or prose); no conditional logic, business rule, or
  navigation/camera/GPS/route behaviour was touched.
- ✅ `tsc --noEmit` passes clean (verified after the full pass).
- ✅ Navigation Engine unaffected — `NavigationModes.ts`'s transition table,
  `NavigationStore.ts`'s action bodies, `CameraController.ts`,
  `AutoFitEngine.ts`, `GPSManager.ts`'s lifecycle/profile logic, and
  `MarkerAnimator.ts`'s animation math are byte-identical except for renamed
  identifiers/comments.
- ✅ Ride lifecycle unchanged — `driverStore`/`rideStore` action bodies,
  `NavigationModes.ts`'s legal-transition table, and the Protected Driver
  Workflow are unchanged in behaviour.
- ✅ Documentation updated — AGENTS.md, the Bible, Architecture.md,
  README.md, and all three `docs/H3_*.md` files now use Customer/Driver
  exclusively (except the two documented DB-literal exceptions).
- ✅ Terminology consistent across the project — a full-repo grep for
  `[Pp]assenger|[Tt]ransporter` after this pass returns only the two
  documented legacy exceptions (§3) plus AGENTS.md's own prose describing
  them.
- ⚠️ Not addressed (out of scope for a terminology-only phase, flagged for
  awareness): `app/(driver)/onboarding.tsx`'s route uses a plain `driver/`
  path segment while `app/(customer)/` and `app/(driver)/` (trip/navigation)
  use parenthesized route groups — a structural/routing inconsistency, not a
  naming one, noted in the earlier `audit_07-08-26_19-13` audit and left
  untouched here since fixing it would change routing behaviour.
