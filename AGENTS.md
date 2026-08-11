# AGENTS.md — 2Go

This file is the single source of truth for AI coding agents working on the 2Go project.

AI agents including Cursor, Claude Code, Codex, Windsurf, Antigravity, and similar tools MUST read this file before making any change to the project.

If a prompt conflicts with this file, stop and explain the conflict before proceeding.

---

# 1. Role

You are an expert React Native + Expo engineer building a production-grade ride-hailing and delivery application. You write clean, simple, readable code. You prioritize clarity over unnecessary abstraction. Think like a senior mobile engineer, you reuse existing architecture, and refactor only when repetition or complexity actually appears.

Write:

* Clean code
* Simple code
* Readable code
* Maintainable code
* Type-safe code
* Reusable components
* Minimal, targeted changes


Protect existing functionality.

Do not refactor working systems unless the task explicitly requires it.

Do not introduce new architecture simply because another approach appears cleaner.

---

# 2. Application Overview

2Go is a Zambia-based ride-hailing and delivery application.

The application has two user roles:

## Customer

Customer is the default account type.

Customers can:

* Create an account
* Book rides
* Request deliveries
* Select vehicle types
* Track Drivers
* View trip information
* Pay for services
* View ride history
* Rate Drivers
* Manage saved addresses
* Manage their profile
* Send and receive messages

Every new user becomes a Customer.

There is no role selection during signup.

## Driver

Driver is an upgraded account type.

A Customer can apply to become a Driver from the application.

Driver applications require approval before the Driver can go online and receive requests.

Driver vehicle types are:

* Rider — motorbike
* Taxi — car
* Tricycle/Truck — tricycle or truck

## Admin

2Go also has a separate web-based Admin dashboard.

The Admin dashboard is outside this mobile repository.

The Admin system is responsible for activities such as:

* Driver approval
* Platform monitoring
* Managing operational data
* Reviewing applications

---

# 3. Official Terminology

The application's official user terminology is:

* **Customer**
* **Driver**

These are the only user-role terms that should be introduced in new code, UI, comments, documentation, prompts, and features.

## Customer

Never introduce these as new role terminology:

* Passenger
* Rider
* Transporter

## Driver

Never introduce:

* Transporter

as a replacement for Driver.

### Vehicle terminology

The valid Driver vehicle types are:

```text
rider
taxi
tricycle
```

Their display meanings are:

```text
rider      → Motorbike
taxi       → Car
tricycle   → Tricycle/Truck
```

### Database legacy exception

The database currently contains the legacy value:

```text
passenger
```

inside the `customers.account_type` / `UserRole` system.

This is a persisted database value and MUST NOT be renamed casually.

The application-facing terminology remains:

**Customer**

Only existing database compatibility values may retain legacy terminology.

Do not introduce new legacy terminology elsewhere.

---

# 4. Technology Stack

Do not replace the following technologies without explicit approval.

* **React Native 0.81.5**
* **Expo SDK ~54.0.31**
* **TypeScript**
* **Expo Router ~6.0.21**
* **Zustand ^5.0.8**
* **NativeWind ^4.2.1**
* **react-native-maps 1.20.1**
* **h3-js ^4.4.0**
* **InsForge**
* **AsyncStorage**
* **React Native Reanimated**
* **Google Maps APIs**
* **Lucide / existing icon system**

Do not install new dependencies without asking first.

If an existing dependency can solve the problem, reuse it.

---

# 5. Styling System

NativeWind is the default styling system.

Use Tailwind / NativeWind classes for static styling.

Do not use `StyleSheet.create()` for normal UI styling.

`StyleSheet.create()` is permitted only when NativeWind cannot reliably support the requirement, including:

* Map absolute-fill containers
* Certain `react-native-maps` components
* Components that require native-only style properties
* Other genuinely unsupported NativeWind cases

Inline `style={{ ... }}` is allowed only for genuinely dynamic values such as:

* Calculated widths
* Dynamic positions
* Animated values
* Runtime measurements

Do not use inline styles for static values that could be represented with NativeWind.

---

# 6. 2Go Color System

The 2Go visual identity uses the following palette.

## Primary Palette

| Purpose    | Token              | HEX       |
| ---------- | ------------------ | --------- |
| Primary    | Deep Navy          | `#26344F` |
| Accent     | Vibrant Orange-Red | `#FE5035` |
| Background | Soft Ice Blue      | `#E7F1F9` |
| Secondary  | Slate Gray         | `#7B8387` |
| White      | White              | `#FFFFFF` |

## Status Colors

| Purpose          | HEX       |
| ---------------- | --------- |
| Success          | `#00D26A` |
| Warning / Rating | `#FFB800` |
| Error            | `#EF4444` |

## Color Usage Rules

The palette is not merely a list of colors.

Every screen must use the palette consistently according to the semantic purpose of the color.

### Deep Navy — `#26344F`

Use for:

* Primary text where appropriate
* Navigation elements
* Headers
* Main controls
* Primary dark UI surfaces
* Icons requiring the primary brand color
* Map/navigation elements where appropriate

### Vibrant Orange-Red — `#FE5035`

Use for:

* Primary actions
* Main CTA buttons
* Active states
* Important interactive controls
* Selected controls
* Brand emphasis
* Primary action indicators

Do not use orange-red as a decorative color everywhere.

It should communicate action and importance.

### Soft Ice Blue — `#E7F1F9`

Use as:

* Main application background
* Large background surfaces
* Light map-related UI surfaces
* Screen-level background areas

### Slate Gray — `#7B8387`

Use for:

* Secondary text
* Supporting information
* Inactive states
* Less-important metadata
* Secondary UI elements

### White — `#FFFFFF`

Use for:

* Cards
* Bottom sheets
* Inputs
* Floating controls
* Primary content surfaces
* Navigation surfaces where appropriate

### Status colors

`#00D26A` = success

`#FFB800` = warning / rating

`#EF4444` = error / destructive action

Status colors must not be used as general decorative colors.

---

# 7. Color Implementation Rules

Never randomly select colors that are visually similar to the approved palette.

Do not introduce:

* Alternative blues
* Alternative orange-red shades
* Random grays
* Random backgrounds
* Random accent colors

If a design requires a new color that is not covered by the palette:

1. Check whether an existing semantic token can be reused.
2. If not, explain why a new color is necessary.
3. Ask for approval before introducing a new brand color.

Centralize reusable color tokens in the project's theme/constants system.

Do not scatter raw HEX values throughout the codebase.

For example, do not repeatedly create:

```tsx
className="bg-[#FE5035]"
```

when an existing semantic token already represents the color.

The visual design must remain consistent across:

* Customer screens
* Driver screens
* Navigation screens
* Ride booking
* Delivery
* Wallet
* Messages
* Account
* Modals
* Bottom sheets
* Cards
* Buttons
* Forms
* Empty states
* Loading states
* Error states

---

# 8. Typography

Typography is part of the application's design system.

Use the project's approved font files from:

```text
src/assets/fonts/
```

or the project's configured font location.

Do not introduce another font family without explicit approval.

Do not use random system fonts when an approved project font is available.

Typography must be consistent across:

* Headings
* Screen titles
* Body text
* Labels
* Buttons
* Inputs
* Cards
* Navigation
* Bottom sheets
* Error messages
* Status indicators

Font weights must follow the existing typography system.

Do not create arbitrary font sizes or weights when an existing typography token can be reused.

If the project contains a configured typography system, use it rather than defining one-off values.

**Important:** The exact approved font family names must be taken from the project's existing font configuration/assets. Do not invent or substitute font names.

---

# 9. Folder Structure

The existing project structure must be preserved.

```text
app/
  _layout.tsx
  profile.tsx
  welcome.tsx
  auth.tsx
  signup.tsx
  otp.tsx

  (tabs)/
    _layout.tsx
    index.tsx
    activity.tsx
    wallet.tsx
    navigate.tsx
    messages.tsx
    account.tsx

  (driver)/
    _layout.tsx
    navigation.tsx
    trip.tsx

  chat/
    [id].tsx

  ride/
    [id].tsx

  driver/
    onboarding.tsx

src/
  assets/
    images/
    fonts/

  components/
    map/
    navigation/
    ui/
    system/

  constants/

  core/

  features/
    account/
    activity/
    driver/
    messaging/
    onboarding/
    customer/
    wallet/

  hooks/

  lib/
    google/

  services/

  state/

  types/
```

Do not move files or restructure directories unless explicitly required.

---

# 10. Component Reuse

Always check for an existing component before creating a new one.

Reusable components must be reused throughout the application.

Examples include:

* Buttons
* Cards
* Inputs
* Icon buttons
* Bottom sheets
* Chips
* Pills
* Headers
* Back buttons
* Loading indicators
* Empty states
* Error states
* Ride cards
* Vehicle cards
* Navigation components

If a reusable component does not exist and the component will be used more than once, create it in the appropriate shared component directory.

Do not duplicate the same UI implementation across multiple screens.

---

# 11. Navigation

2Go uses ONE global Navigation Engine.

The Navigation Engine is the single source of truth for navigation-related behavior.

The complete architecture is defined in:

```text
GO Navigation Engine Bible.md
```

Any AI agent working on navigation MUST read that document before making changes.

If this file conflicts with the Navigation Bible:

**The Navigation Bible takes precedence for navigation behavior.**

---

# 12. Navigation Engine Responsibilities

The Navigation Engine owns:

* Camera follow
* Camera rotation
* Camera bearing
* Camera pitch
* Camera zoom
* Camera padding
* Auto-fit camera
* Route rendering
* Polyline management
* GPS tracking
* Driver heading
* Turn instructions
* Navigation banner
* Marker animation
* ETA calculation
* Remaining distance
* Arrival detection
* Pickup detection
* Route progress
* Re-routing
* Road snapping
* Navigation state

Do not implement these systems independently inside screens.

---

# 13. Navigation Camera Rules

Screens MUST NOT directly control the navigation camera.

Screens must not independently call:

```text
animateCamera()
animateToRegion()
fitToCoordinates()
setCamera()
animateToCoordinate()
```

Instead, screens request navigation behavior from the Navigation Engine.

Examples:

```text
navigation.previewRoute()
navigation.startNavigation()
navigation.followDriver()
navigation.arrived()
navigation.completeTrip()
```

The Navigation Engine performs the actual camera behavior.

---

# 14. Navigation Modes

The Navigation Engine supports:

```text
IDLE
PREVIEW
MATCHING
DRIVER_TO_PICKUP
ARRIVED_PICKUP
TRIP_IN_PROGRESS
ARRIVED_DROPOFF
TRIP_COMPLETED
OFFLINE
```

Screens must use these navigation modes instead of creating independent navigation states.

---

# 15. Navigation Components

Reusable navigation components belong in:

```text
src/components/navigation/
```

Existing or approved components may include:

```text
NavigationEngineProvider
NavigationMap
NavigationCamera
NavigationRoute
NavigationMarkers
NavigationArrow
NavigationHUD
NavigationTurnBanner
NavigationBottomCard
NavigationControls
NavigationVoice
NavigationStateManager
NavigationSpeedCard
NavigationRouteProgress
NavigationAutoFit
NavigationCompass
NavigationArrivalCard
```

Do not duplicate these components elsewhere.

---

# 16. GPS Ownership

Only ONE global GPS watcher should exist for the application.

Do not create multiple competing Location subscriptions.

The Navigation Engine owns:

* Foreground tracking
* Background tracking
* Driver heading
* Speed
* Bearing
* Accuracy filtering
* Position interpolation

Screens consume GPS state.

Screens do not independently own GPS tracking.

---

# 17. Google Maps Rules

All Google Maps REST API communication goes through:

```text
src/lib/google/mapsApi.ts
```

Supported services include:

* Places Autocomplete
* Place Details
* Directions
* Distance Matrix
* Geocoding
* Reverse Geocoding
* Snap to Roads

Never call Google Maps REST endpoints directly from:

* Screens
* Components
* UI elements

All requests must go through the shared Maps API layer.

---

# 18. Map Architecture

Maintain the platform-specific map split:

```text
Map.native.tsx
Map.web.tsx
Map.tsx
```

Do not merge these files.

Native uses:

```text
react-native-maps
PROVIDER_GOOGLE
```

Web uses:

```text
@react-google-maps/api
```

---

# 19. Spatial Engine

The project uses:

```text
h3-js
```

at resolution 9 for Driver/Customer proximity discovery.

All H3 functionality must go through:

```text
src/core/spatialEngine.ts
```

Screens must never import or call `h3-js` directly.

---

# 20. Backend — InsForge

InsForge is the only backend platform.

Do not introduce:

* Clerk
* Auth0
* WorkOS
* Better Auth
* Supabase
* Neon
* Raw PostgreSQL clients

If these imports appear:

```text
@clerk/clerk-expo
@neondatabase/serverless
pg
```

flag them.

They must not be reintroduced.

InsForge provides:

* Database
* Authentication
* Storage
* Edge Functions
* Realtime
* AI gateway
* Payments

---

# 21. Authentication

Authentication uses InsForge native authentication.

Current method:

```text
Email + Password
```

Phone number is collected during signup and stored in the Customer record.

Everyone signs up as:

```text
Customer
```

There is no role picker during signup.

Driver status is obtained only after a Customer applies for Driver status and receives approval.

All authentication functions must go through:

```text
src/lib/auth.ts
```

Do not call authentication APIs directly from screens.

---

# 22. Authentication Persistence

Authentication/session state must survive application restarts.

Use the existing InsForge authentication/session mechanism together with the project's state/persistence architecture.

On application startup:

1. Check for an existing session.
2. Restore the user state.
3. Route authenticated users into the application.
4. Route unauthenticated users to authentication.
5. Handle a missing session gracefully.

The application must never crash because no session exists.

---

# 23. State Management

Use Zustand.

Each store owns one domain.

| Store               | Responsibility                                               |
| ------------------- | ------------------------------------------------------------ |
| `userStore`         | Account role, profile, saved addresses, Driver application   |
| `driverStore`       | Driver availability, location, stats, requests, current trip |
| `rideStore`         | Customer ride planning, active trip, ride history            |
| `messagingStore`    | Conversations and messages                                   |
| `driverWalletStore` | Earnings, balance, transactions                              |
| `settingsStore`     | Development/debug settings                                   |

Do not create a second store for information already owned by an existing store.

Do not duplicate state across stores without a clear reason.

---

# 24. Database

Current major InsForge tables include:

## customers

```text
id
auth_id
first_name
last_name
email
phone_number
country_code
profile_photo_url
gender
age
account_type
account_status
is_verified
email_verified
phone_verified
rating
total_ratings
total_completed_rides
total_cancelled_rides
preferred_payment_method
created_at
updated_at
```

## saved_addresses

```text
id
customer_id
label
address
lat
lng
icon
is_default
created_at
```

## drivers

```text
id
auth_id
first_name
last_name
email
phone_number
vehicle_type
plate_number
licence_photo
vehicle_photo
is_approved
account_status
driver_status
current_lat
current_lng
driver_heading
created_at
updated_at
```

## orders

```text
id
customer_id
driver_id
status
pickup_address
pickup_lat
pickup_lng
dropoff_address
dropoff_lat
dropoff_lng
vehicle_type
fare_amount
payment_method
base_fare
service_fee_pct
service_fee_amount
order_number
driver_heading
driver_current_lat
driver_current_lng
estimated_arrival_minutes
distance_to_pickup_km
requested_at
accepted_at
driver_arrived_at
trip_started_at
completed_at
created_at
updated_at
```

## messages

```text
id
order_id
sender_type
sender_id
message_text
created_at
```

Do not modify database structures casually.

Backend changes must be deliberate and verified.

---

# 25. Fare Calculation

The shared fare calculation lives in:

```text
src/lib/fareCalculator.ts
```

Do not duplicate the formula.

Current formula:

```text
fare =
  baseFare
  + (distanceKm × perKm)
  + (durationMinutes × perMinute)
  + (waitingMinutes × perMinuteWaiting)

fare = max(fare, minimumFare)
```

The formula is currently not fully split by vehicle type.

This is a known gap.

Any future fare-system change must preserve one source of truth.

Client-side displayed fares and backend-validated fares must eventually use the same pricing logic.

---

# 26. Distance Calculation

Use the shared implementation:

```text
src/lib/distance.ts
```

Never create an inline Haversine implementation.

---

# 27. Prompt and Audit Logging

The project uses exactly TWO folders for AI development logging:

```text
prompts/
audit_reports/
```

These are the only approved logging folders.

Do not create or use:

```text
prompt/
audit_report/
audit_export/
reports/
ai_logs/
```

or any other equivalent folder.

---

# 28. Logging Decision Gate

Before saving anything, determine what type of work was performed.

## Build / Change / Fix

If the user gave an instruction to:

* Build something
* Add something
* Change something
* Modify something
* Fix something
* Implement something
* Refactor something

save the exact prompt in:

```text
prompts/
```

This applies every time.

---

## Audit / Review

Save an audit report in:

```text
audit_reports/
```

only when:

1. The user explicitly requested an audit, review, investigation, verification, or check.

OR

2. A security-sensitive feature has just been completed and requires final verification.

Examples of security-sensitive work:

* Authentication
* Authorization
* Payments
* Secret keys
* RLS/security policies
* Sensitive data access

Routine feature development does NOT automatically create an audit report.

---

# 29. Logging Rules

## Routine feature/fix

Create:

```text
prompts/
```

Only.

## 11. Prompt & Audit Logging

There are two folders, two purposes, two different trigger conditions. They are never
interchangeable and never share a file. **Before saving anything, answer the decision gate
below first — do not skip straight to a filename or format.**

### Decision gate — answer this before saving anything

> **Was I just given an instruction to build, change, or fix something?**
> → Save it to `prompts/`. This happens **every single time**, no exceptions, regardless of
> what else you do afterward.
>
> **Am I separately investigating/verifying the app and reporting findings** (and only
> because either (a) the user explicitly asked for an audit/review/check, or (b) I just
> finished a security-sensitive feature — auth, payments, secret keys, RLS policies — and am
> confirming it as a final check)?
> → Also save a report to `audit_reports/`. This happens only on those two triggers, never
> automatically for routine feature work.

A single task can produce **one file, or two files, but never a file in the wrong folder**:
- Routine feature/fix → one file, in `prompts/`, only.
- Explicit audit request → one file, in `audit_reports/`, only (there may be no new prompt
  to log if the audit itself wasn't a build instruction).
- Security-sensitive feature just built → **two** files: the instruction in `prompts/`, and
  a separate findings report in `audit_reports/`.

If you're unsure which case applies, default to `prompts/` only — an under-logged audit is a
minor gap; a prompt's instructions mixed into an audit file (or vice versa) breaks both logs.

### 11.1 `prompts/` — every prompt, always

Maintain a folder called **`prompts/`** at the project root (not `prompt/`, not any other
name).

Every prompt sent in this project — build, fix, or change — gets its own numbered file here,
in the exact order it was sent, saved immediately after the task is completed. Never edit,
shorten, or paraphrase the saved prompt.

**File naming:** `NN_short-description_DD-MM.md`
- `NN` — zero-padded two-digit sequence number (01, 02, 03...), continuing from the highest
  existing number in the folder. Never reuse or renumber an earlier file.
- `short-description` — kebab-case summary of what the prompt implements.
- `DD-MM` — date sent, hyphens not slashes.

Example: `04_build-home-screen_11-08.md`

**File content — the prompt text only, nothing else:**
```
# Prompt 04 — Build home screen
<the exact prompt text as sent>
```

No findings, no test results, no "what was built" summary — that content belongs only in
`audit_reports/`, and only when Section 11's decision gate calls for one.

### 11.2 `audit_reports/` — only on the two triggers above

Maintain a folder called **`audit_reports/`** at the project root (not `audit_report/`, not
`audit_export/`, not any other name).

**File naming:** `NN_short-description_DD-MM.md`
- `NN` — zero-padded two-digit sequence number (01, 02, 03...), continuing from the highest existing number in the folder. If tied to a prompt, use the corresponding prompt's number. Never reuse or renumber an earlier file.
- `short-description` — kebab-case summary of what the audit covers.
- `DD-MM` — date of the audit, hyphens not slashes.

Example: `06_audit-driver-gps-lost_11-08.md`

Do NOT use formats like `audit_03-08-26_11-58_gps-subscription-audit.md`.

Tie the file number and label to the corresponding `prompts/` file if there is one. If an audit was run without a matching build prompt (a pure review request), number it sequentially within `audit_reports/` on its own using the highest sequence number.

**File content — findings only, never the original prompt text:**
what was audited, files reviewed, what works/doesn't/is missing, any security-sensitive code
touched, known issues or follow-ups, and the manual test result (pass/fail, on which device).

### Self-check before saving either file
- Does `prompts/` contain anything that reads like a report (findings, test results, "what
  was built")? That content is misplaced — it belongs in `audit_reports/`, or nowhere at all
  if no audit was triggered.
- Does `audit_reports/` contain anything that reads like an instruction ("build X," "fix Y")?
  That content is misplaced — it belongs in `prompts/`.
- Was a report written for a routine feature with no explicit audit request and nothing
  security-sensitive involved? It shouldn't exist — flag it to the user rather than leaving
  it in place.

# 33. Logging Self-Check

Before saving a prompt:

Ask:

> Is this the exact instruction that was given?

If yes, save it to `prompts/`.

Before saving an audit:

Ask:

> Is this a report of findings from an actual audit/review?

If yes, save it to `audit_reports/`.

Never place findings inside `prompts/`.

Never place build instructions inside `audit_reports/`.

There must be no `audit_export/` folder.

---

Usage:

```tsx
<BackButton />
```

or:

```tsx
<BackButton onPress={customFunction} />
```

Never:

* Create another back-arrow component
* Implement a back arrow inline
* Use `chevron-back`
* Add an unnecessary shadow wrapper
* Create a different back-button style for another screen

---
# 37. Decision Making

If the request is unclear:

Ask before implementing.

If an existing architecture already solves the problem:

Reuse it.

If a new library would simplify the implementation:

Explain:

1. Why it is needed.
2. What it would replace or improve.
3. What impact it has.

Then ask for permission before installing it.

Never install a new dependency without explicit approval.

---

# 39. Protected Customer/Driver Ride Lifecycle

The verified ride lifecycle is:

```text
Customer Request
↓
Driver Receives Request
↓
Driver Accepts Ride
↓
Navigation Engine Initializes
↓
Route Loads
↓
Polyline Displays
↓
AutoFit Executes
↓
Start Pickup
↓
Arrived
↓
Start Trip
↓
Trip Navigation
↓
Complete Trip
↓
Customer Rating
↓
Driver Rating
```

This workflow is considered protected.

Any modification that affects this workflow must be deliberate.

---

# 40. Regression Protection

Before modifying a protected system:

1. Identify the protected feature.
2. Explain potential regression risks.
3. Modify the smallest possible amount of code.
4. Reuse the existing architecture.
5. Verify the existing workflow after the change.

Do not:

* Replace working systems unnecessarily
* Create duplicate state
* Create duplicate GPS ownership
* Create duplicate navigation engines
* Create duplicate camera controllers
* Create duplicate route systems

---
