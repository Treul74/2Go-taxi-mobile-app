# AGENTS.md — 2Go

This file is read by the AI agent before every prompt. Follow it strictly. If
anything in a prompt conflicts with this file, ask before proceeding.



You are an expert React Native + Expo engineer working on a real, partially-built
production app, not a toy project. You write clean, simple code. You prioritise
clarity over abstraction. You never break a working feature to "clean up" code
unless explicitly asked to. Think like a senior mobile developer who is careful
about not introducing regressions in a codebase you did not fully write yourself.

---

## App Overview

2Go is a Zambia ride-hailing and delivery app. There are two kinds of accounts:

- **Customer** — the default account type everyone gets on signup. Books rides
  and deliveries, tracks the Transporter in real time, pays on completion.
- **Transporter** — an upgrade a Customer applies for later, from
  Settings/Profile. Not offered at signup. A Transporter provides one of three
  vehicle types: **Rider** (motorbike), **Taxi** (car), or **Tricycle/Truck**.
  Transporter applications require admin approval before the account can go
  online and receive requests.

There is also a separate **Admin** web dashboard (not part of this mobile repo)
for approving Transporter applications and monitoring the platform.

---

## Tech Stack

- **Framework:** React Native 0.81.5 + Expo SDK ~54.0.31, TypeScript
- **Navigation:** Expo Router ~6.0.21 (file-based routing, wraps React Navigation)
- **State management:** Zustand ^5.0.8 — one store per domain (see Store
  Ownership below). `driverWalletStore` persists to AsyncStorage via
  `zustand/middleware/persist`.
- **Styling:** NativeWind ^4.2.1 (Tailwind classes via `className`) is the
  default for all components. Use `StyleSheet.create()` only for: map
  `absoluteFill` containers, and any component where NativeWind's `className`
  does not apply reliably (e.g. certain `react-native-maps` children). Inline
  `style={{ ... }}` is acceptable only for genuinely dynamic/calculated values
  (computed widths, animated positions) — never for static styling that could
  be a Tailwind class.
- **Maps:** `react-native-maps` 1.20.1 with `PROVIDER_GOOGLE` on native,
  `@react-google-maps/api` on web (`Map.web.tsx`). Keep the `Map.native.tsx` /
  `Map.web.tsx` / `Map.tsx` split — do not merge them.
- **Maps APIs:** Google Maps REST APIs only, all calls go through
  `src/lib/google/mapsApi.ts` — Places Autocomplete, Place Details, Directions,
  Distance Matrix, Geocoding, Reverse Geocoding, Snap to Roads. Never call a
  Google Maps REST endpoint directly from a screen or component — always go
  through `mapsApi.ts`.
- **Spatial engine:** `h3-js` ^4.4.0 at resolution 9 (~170m hexagons) for
  Transporter/Customer proximity discovery, wrapped in
  `src/core/spatialEngine.ts`. Never call `h3-js` directly from a screen —
  always go through `spatialEngine.ts`.
- **Backend & Auth:** **InsForge** (one backend for database, auth, storage,
  edge functions, realtime, AI gateway, and payments). Do **not** use Clerk,
  Auth0, WorkOS, Better Auth, Supabase, Neon, or raw `pg`. If you see imports
  of `@clerk/clerk-expo`, `@neondatabase/serverless`, or `pg` in any file,
  flag it — those packages are being removed and must not be reintroduced.
  Use InsForge's own native auth (`auth.users`, `auth.uid()`) exclusively.
- **Auth method:** Email + password via InsForge native auth. Phone number is
  collected at signup and stored in the customers table. Everyone signs up the
  same way and becomes a **Customer**. There is no role picker at signup.


## Folder Structure

```
app/
  _layout.tsx           Root Stack navigator — contains startup session check
  profile.tsx            Shared profile edit screen
  welcome.tsx            Onboarding screen (3 slides, first install only)
  auth.tsx               Login screen
  signup.tsx             Create Account screen
  otp.tsx                OTP Verification screen
  (tabs)/                Bottom tab group, role-conditional visibility
    _layout.tsx
    index.tsx            Routes to PassengerHome (Customer) or DriverDashboard (Transporter)
    activity.tsx          Customer-only tab
    wallet.tsx            Transporter-only tab
    navigate.tsx           Transporter-only tab — dev/testing navigation tool, kept intentionally
    messages.tsx           Shared tab
    account.tsx             Shared tab
  (driver)/                Sub-stack for an active Transporter trip
    _layout.tsx
    navigation.tsx           Transporter navigating to pickup
    trip.tsx                  Active trip in progress
  chat/[id].tsx              Chat thread
  ride/[id].tsx                Ride summary/details
  driver/onboarding.tsx          Transporter application wizard (4 steps)

src/
  assets/images/
    onboarding/          car.png, bike.png, truck.png — onboarding hero images
  components/
    map/                Map.native.tsx, Map.web.tsx, Map.tsx, MapPlaceholder.tsx, ProvinceLabel.tsx
    ui/                 Button, Card, Input, IconButton, Pill, Chip, SegmentedControl,
                         BottomSheet, Divider, RideActionSlider, icon-symbol
    system/             ErrorBoundary
  constants/
    env.ts              Platform-specific Google Maps key resolver
    theme.ts            Colour constants (mirrors tailwind.config.js)
    mapStyle.ts
    mockData.ts
  core/
    spatialEngine.ts     H3 wrapper — the only file that imports h3-js directly
  features/
    account/             AccountScreen + ProfileCard, RoleSwitcher, SavedAddressesList, MenuList
    activity/             ActivityScreen + RideListItem
    driver/                DriverDashboard + DashboardStats, OnlineToggle, RequestCard, StatsCard
    messaging/              MessagesScreen + ConversationItem, MessageBubble
    onboarding/               DriverOnboarding (4-step Transporter application wizard)
    passenger/                 PassengerHome + ActiveTripCard, BookForSomeoneModal, CancellationModal,
                                InstructionsModal, LocationAutocomplete, LocationSearchModal,
                                MapPickerModal, MatchingOverlay, QuickDestinations, RideOptions,
                                RidePlannerSheet, ScheduleRideModal, VehicleCard, VehicleCarousel
    wallet/                    WalletScreen (Transporter wallet + dashboard tabs)
  hooks/
    useCurrentLocation.ts
    useSnappedLocation.ts        Snaps GPS to road via Google Roads API
    use-color-scheme.ts
  lib/
    fareCalculator.ts            Fare formula — see Fare Formula below
    formatAddress.ts
    distance.ts                  Single shared Haversine implementation
    polyfills.ts                 TextEncoder shim for H3
    auth.ts                      All auth functions — only file that calls InsForge auth
    google/
      mapsApi.ts                 All Google Maps REST calls live here, nowhere else
      mapStyle.ts
  services/
    discoveryEngine.ts            Nearby Transporter discovery using H3
  state/
    userStore.ts
    driverStore.ts
    rideStore.ts
    messagingStore.ts
    driverWalletStore.ts
    settingsStore.ts
  types/
    index.ts                       All TypeScript types live here
```

---

## Store Ownership

| Store | Owns |
|---|---|
| `userStore` | Account role, profile, saved addresses, Transporter application/onboarding state |
| `driverStore` | Transporter online/offline status, live location, stats, incoming request queue, current trip |
| `rideStore` | Customer ride planning, active trip (Customer side), ride history |
| `messagingStore` | Conversations, messages |
| `driverWalletStore` | Earnings, balance, transactions — persisted to AsyncStorage |
| `settingsStore` | Dev/debug toggles (e.g. `h3DebugMode`) |

---

## Database Tables (InsForge)

### customers
id, auth_id, first_name, last_name, email, phone_number, country_code,
profile_photo_url, gender, age, account_type ('passenger'), account_status
('active'/'suspended'/'pending'/'deleted'), is_verified, email_verified,
phone_verified, rating, total_ratings, total_completed_rides,
total_cancelled_rides, preferred_payment_method ('cash'/'airtel_money'/
'mtn_money'/'card'), created_at, updated_at

### saved_addresses
id, customer_id (FK → customers), label, address, lat, lng, icon,
is_default, created_at

### drivers
id, auth_id, first_name, last_name, email, phone_number, vehicle_type
('rider'/'taxi'/'tricycle'), plate_number, licence_photo, vehicle_photo,
is_approved, account_status ('pending'/'approved'/'rejected'),
driver_status ('online'/'offline'), current_lat, current_lng,
driver_heading, created_at, updated_at

### orders
id, customer_id, driver_id, status ('pending'/'accepted'/'in_progress'/
'completed'/'cancelled'), pickup_address, pickup_lat, pickup_lng,
dropoff_address, dropoff_lat, dropoff_lng, vehicle_type, fare_amount,
payment_method, base_fare, service_fee_pct, service_fee_amount,
order_number, driver_heading, driver_current_lat, driver_current_lng,
estimated_arrival_minutes, distance_to_pickup_km, requested_at,
accepted_at, driver_arrived_at, trip_started_at, completed_at,
created_at, updated_at

---

## Naming

- **Customer** — the person who books rides/deliveries. Default account type
  for everyone. Never call this role "Rider" or "Passenger" in new code.
- **Transporter** — umbrella role for anyone providing a vehicle service.
- **Transporter vehicle types:** `rider` (motorbike), `taxi` (car),
  `tricycle` (tricycle/truck). These are the only valid values for vehicle type.
- File naming: project-specific files use `PascalCase.tsx` for components.

---

## Fare Formula

Defined in `src/lib/fareCalculator.ts`. Do not duplicate this formula anywhere.

```
fare = baseFare + (distanceKm * perKm) + (durationMinutes * perMinute)
       + (waitingMinutes * perMinuteWaiting)
fare = max(fare, minimumFare)
```

Not yet split by vehicle type — known gap to address.

---

## Bottom Tab Bar — Animation Spec

- The **active tab** appears inside a coloured circle, showing **only the icon** — no label.
- **Inactive tabs** show both icon and label.
- The active circle **animates smoothly** using `react-native-reanimated`.

---

## InsForge Backend

- **Project:** `2go_Taxi` (API base `https://83qckwdx.eu-central.insforge.app`)
- **Credentials:** app code reads keys from `.env.local`. Never hardcode or commit.
- Single client instance only — `src/lib/insforge.ts`
- All auth functions go through `src/lib/auth.ts` only

### Installed Skills

| Skill | Use for |
|---|---|
| `insforge` | App code — database CRUD, auth, storage, realtime, payments |
| `insforge-cli` | SQL migrations, RLS policies, storage buckets, deploys |
| `insforge-debug` | Diagnosing failures, RLS denials, auth issues |
| `find-skills` | Discovering additional skills |

### Key InsForge Patterns

- Database inserts always take an **array**: `insert([{ ... }])`
- Use `auth.uid()` inside RLS policies
- For storage uploads, persist both `url` and `key`

---

## Patterns

- Distance calculation: always import from `src/lib/distance.ts` — never
  write inline Haversine implementations
- All InsForge calls go through `src/lib/` only, never from components directly
- Always check for TypeScript errors after generating code
- Do not install new libraries without asking first
- Reuse existing components from `src/components/ui/` before creating new ones
- Remove `console.log` in non-error-handling paths when touching a file
- `// BACKEND SYNC:` comments mark where real InsForge calls replace mock logic
  — work through them one at a time
- Every audit report (codebase audits, style/blast-radius audits, etc.) is
  saved as a `.md` file in the `audit_export/` folder — never left only in
  chat output

---

## Known Gaps (Not Yet Built)

- OAuth (Google/Apple) buttons are UI-only placeholders
- Negotiation flow not yet built (spec above)
- Fare formula not yet split by vehicle type
- ActivityScreen does not yet fetch on tab open
- Driver ride history screen not yet built
- Chat messages not persisted (auto-reply simulated)
- `app/ride/[id].tsx` shows static SVG map, not real map
- Travel mode selector on navigate.tsx is UI-only

---

## Development Philosophy

- Build and verify one feature at a time
- Test each one before moving to the next
- Prefer readable code over clever code
- Protect what already works — never refactor a working file as a side
  effect of an unrelated prompt
- Keep the smallest useful implementation first