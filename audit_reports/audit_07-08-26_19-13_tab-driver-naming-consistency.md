# Audit: Customer vs Driver Route/Screen Naming Consistency

**Date:** 2026-08-07
**Scope:** `app/(tabs)/`, `app/(driver)/`, and directly-related component/hook/store
files. Read-only audit — no files were changed.

---

## 1. `app/(tabs)/` — file-by-file breakdown

| File | Tab bar label (as rendered) | Role scope | Name reflects role? |
|---|---|---|---|
| `app/(tabs)/index.tsx` | `"Home"` (customer) / `"Orders"` (driver) — same file, label picked at runtime by `role` | Shared file, renders `PassengerHome` or `DriverDashboard` | Generic — no role in filename |
| `app/(tabs)/activity.tsx` | `"Activity"` | Customer-only (`href: role === 'driver' ? null : undefined`) | Generic — no "customer"/"passenger" in filename |
| `app/(tabs)/wallet.tsx` | `"Wallet"` | Driver-only (`href: role === 'driver' ? undefined : null`) | Generic — no "driver" in filename |
| `app/(tabs)/navigate.tsx` | `"Navigate"` | Driver-only (dev/testing nav tool, per AGENTS.md) | Generic — no "driver" in filename |
| `app/(tabs)/messages.tsx` | `"Messages"` | Shared | Generic (appropriate — shared tab) |
| `app/(tabs)/account.tsx` | `"Account"` | Shared | Generic (appropriate — shared tab) |
| `app/(tabs)/explore.tsx` | N/A — `href: null`, hidden from the tab bar entirely | Unused Expo template leftover (`TabTwoScreen`, "Explore" title only exists in dead code) | Generic; not actually reachable via UI |
| `app/(tabs)/_layout.tsx` | — (layout/config file, not a screen) | — | — |

**Observation:** every file in `app/(tabs)/` uses a generic, role-neutral name.
None say "customer" or "passenger" anywhere in the filename — including
`activity.tsx`, which is exclusively a customer-facing tab, and `wallet.tsx` /
`navigate.tsx`, which are exclusively driver-facing tabs. Role scoping is
enforced entirely at runtime (`href: ... ? null : undefined` and the
`role === 'driver'` ternary), invisible from the file tree.

---

## 2. `app/(driver)/` — file-by-file breakdown

| File | Tab bar label | Driver/Transporter prefix in filename? | Exported component name |
|---|---|---|---|
| `app/(driver)/navigation.tsx` | N/A — pushed screen, not a tab | No | `DriverNavigationScreen` |
| `app/(driver)/trip.tsx` | N/A — pushed screen, not a tab | No | `DriverTripScreen` |
| `app/(driver)/trip-summary.tsx` | N/A — pushed screen, not a tab | No | `DriverTripSummaryScreen` |
| `app/(driver)/_layout.tsx` | — (layout/config file) | — | `DriverLayout` |

**Observation:** none of the three driver screens carry a `driver`/`transporter`
prefix in the *filename* — the `(driver)` route-group folder is the only thing
that marks them as driver-scoped. The "Driver" prefix only shows up one layer
in, on the exported component name (`DriverTripScreen`, etc.), not the file on
disk.

---

## 3. Naming inconsistencies found

### a. Filename collision between the two role groups
`app/(customer)/trip.tsx` and `app/(driver)/trip.tsx` share the **identical
basename** `trip.tsx`, distinguished only by the parenthesized route-group
folder, not by the file name itself. (`app/(customer)/` is a real, existing
route group — `_layout.tsx` registers `trip` as its one screen — but it is not
listed anywhere in AGENTS.md's documented folder structure, which only shows
`(driver)/navigation.tsx` and `(driver)/trip.tsx`. `(driver)/trip-summary.tsx`
is likewise undocumented. AGENTS.md's Folder Structure section is stale versus
the actual file tree.)

### b. Two different "driver" folder conventions in the URL namespace
- `app/(driver)/...` — a **route group** (parens, doesn't appear in the URL)
- `app/driver/onboarding.tsx` — a **plain path segment** (`driver` with no
  parens, does appear in the URL: `/driver/onboarding`)

Both represent "driver-scoped" routes, but use structurally different Expo
Router conventions for the same role. There is no equivalent `app/customer/`
plain-segment folder to compare against.

### c. `(driver)/` screens are internally prefixed, `(tabs)/` screens are not
Inside `(driver)/`, every exported component is prefixed (`DriverNavigation
Screen`, `DriverTripScreen`, `DriverTripSummaryScreen`) even though the file
names aren't. Inside `(tabs)/`, the driver-only screens (`wallet.tsx`,
`navigate.tsx`) export generically-named components (`WalletTab`,
`DriverNavigateScreen` — inconsistent with each other too: `navigate.tsx`'s
own default export is `DriverNavigateScreen`, prefixed, while `wallet.tsx`'s
is `WalletTab`, not prefixed, despite both being driver-only tabs).

### d. `src/features/passenger/` vs `src/features/driver/` — asymmetric legacy naming
- `src/features/passenger/` explicitly uses **"passenger"** — a term AGENTS.md's
  Naming section explicitly bans ("Never call this role 'Rider' or 'Passenger'
  in new code").
- `src/features/driver/` uses **"driver"**, which is not explicitly banned by
  name in AGENTS.md's Naming section, but is equally un-migrated to the
  documented umbrella term **"Transporter."**

Neither folder has been renamed to match AGENTS.md's Customer/Transporter
convention, but only one (`passenger`) uses a word that's on the explicit
ban list — the other (`driver`) is stale by omission rather than by explicit
violation.

### e. Driver-side stores are role-prefixed; the customer-side equivalent isn't
Per the Store Ownership table in AGENTS.md:
- `driverStore.ts`, `driverWalletStore.ts` — role-prefixed with "driver"
- `rideStore.ts` — owns "Customer ride planning, active trip (Customer side)"
  per AGENTS.md's own description, but the filename carries no
  customer/passenger prefix at all.

This is the same shape of inconsistency the task description called out for
component pairs (`PassengerHome.tsx` vs a `DriverX.tsx` that doesn't match) —
here it's inverted: the driver-side stores are prefixed and the customer-side
one is generic.

---

## 4. Tab bar label text — exact strings as rendered

Source: `app/(tabs)/_layout.tsx`, `Tabs.Screen options={{ title: ... }}`.

| Screen | Rendered label | Legacy "Passenger"/"Rider" text? | Matches AGENTS.md "Customer"/"Transporter"? |
|---|---|---|---|
| `index.tsx` (customer) | `Home` | No | N/A — role-neutral |
| `index.tsx` (driver) | `Orders` | No | N/A — role-neutral |
| `activity.tsx` | `Activity` | No | N/A — role-neutral |
| `wallet.tsx` | `Wallet` | No | N/A — role-neutral |
| `navigate.tsx` | `Navigate` | No | N/A — role-neutral |
| `messages.tsx` | `Messages` | No | N/A — role-neutral |
| `account.tsx` | `Account` | No | N/A — role-neutral |

**Every visible tab bar label is role-neutral.** None of the seven tabs
literally render "Passenger," "Rider," "Customer," or "Transporter" as label
text — the tab bar itself does not leak legacy language either way.

**However**, legacy "Passenger" language does leak into user-visible text on
screens reachable from these same route groups (outside the tab bar labels
themselves, but directly answering "confirm... or still uses legacy...
anywhere"):

| Location | Visible text | Context |
|---|---|---|
| `src/features/account/components/RoleSwitcher.tsx:130` | `"Passenger"` | Mode-switch tile label, rendered inside `AccountScreen` (reached from `app/(tabs)/account.tsx`) |
| `src/features/account/components/RoleSwitcher.tsx:170` | `"Driver"` | Paired mode-switch tile label, same component |
| `app/(driver)/trip.tsx:453` | `"Waiting for Passenger"` | Driver-side trip status text |
| `app/rating/driver.tsx:33` | `"Passenger"` (fallback) | Default name shown if `lastTripSummary.passengerName` is missing, on the driver rating screen |

None of these say "Customer" or "Transporter" — they use the pre-rename
"Passenger"/"Driver" pair, not "Rider" specifically (no literal "Rider" text
was found in any rendered UI string). The underlying `UserRole` type itself is
also still `'passenger' | 'driver'` (`src/types/index.ts:6`), so the legacy
language is present at the type level, not just in display strings.

---

## 5. Component/hook/store files that mirror this inconsistency

| Customer-side | Driver-side | Inconsistency |
|---|---|---|
| `src/features/passenger/PassengerHome.tsx` | `src/features/driver/DriverDashboard.tsx` | Different role-noun convention (`Passenger` vs `Driver` — neither is `Customer`/`Transporter`) **and** different suffix (`Home` vs `Dashboard`) |
| `src/features/passenger/` (folder) | `src/features/driver/` (folder) | One folder uses an explicitly-banned term (`passenger`); the other uses a term that isn't on the ban list but is equally unmigrated (`driver`) |
| `src/state/rideStore.ts` (owns customer trip state, per AGENTS.md) | `src/state/driverStore.ts`, `src/state/driverWalletStore.ts` | Driver stores are role-prefixed; the customer-equivalent store name is generic/unlabeled |
| — (no customer equivalent) | `src/hooks/useDriverTelemetryPing.ts` | Driver-prefixed hook with no matching customer-side hook to compare naming against — asymmetric, not necessarily wrong |
| `src/features/onboarding/DriverOnboarding.tsx` | — (no customer equivalent) | Only a driver/Transporter-application wizard exists; component is `Driver`-prefixed, not `Transporter`-prefixed, despite AGENTS.md calling the account type "Transporter" |

No file was found using `Customer` or `Transporter` as a prefix anywhere in
`src/features/`, `src/state/`, or `src/hooks/` — the entire codebase's
component/store/hook layer is still on the pre-AGENTS.md `passenger`/`driver`
vocabulary, just inconsistently so between the two sides (one folder name is
an explicitly banned word, the other isn't explicitly banned but is just as
stale).

---

## Summary

- Tab bar **label text** is clean — all seven tabs use role-neutral words
  (Home/Orders/Activity/Wallet/Navigate/Messages/Account), no legacy
  Passenger/Rider/Driver text visible there.
- **Filenames** under `(tabs)/` are uniformly generic (consistent with each
  other, at least).
- **Filenames** under `(driver)/` are uniformly *not* role-prefixed, but the
  exported component names inside them uniformly *are* — an internal/external
  naming split, consistent within `(driver)/` itself.
- The real inconsistencies are cross-cutting, not confined to `(tabs)/` or
  `(driver)/` alone: `trip.tsx` exists twice under different route groups,
  `driver` shows up as both a route-group and a plain path segment, and the
  `passenger`/`driver` vocabulary (not `Customer`/`Transporter`) still runs
  through folder names, store names, the `UserRole` type, and select
  user-visible strings (`RoleSwitcher`, driver trip screen, driver rating
  screen).

No changes were made to any file as part of this audit.
