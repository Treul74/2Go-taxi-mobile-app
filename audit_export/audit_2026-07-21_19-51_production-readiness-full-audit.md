# 2Go — Full Production Readiness Audit (Taxi App)

- **Date:** 2026-07-21 19:51
- **Scope:** Entire mobile repo (read-only). Cross-checked against standard features of production ride-hailing apps (Uber, Bolt, Yango, InDrive).
- **Branch:** `dev` (commit `722dcff` + working-tree changes)
- **Method:** Direct source reading of all screens, stores, services, hooks, and map components; repo-wide greps for safety/notification/offline/accessibility patterns.

**Legend:** ✅ implemented & working · 🟡 partially implemented · ❌ missing · Priority = importance for a production launch (High / Medium / Low)

---

## Executive Summary

The core happy path is real and backend-driven: signup → email OTP → customer row, booking → pending order → driver polling → accept → arrive → start → complete → wallet credit → rating, with live driver telemetry over realtime. That is a genuine skeleton of a ride-hailing product.

What separates it from Uber/Bolt/Yango/InDrive production standard, in order of severity:

1. **No push notifications at all** — no `expo-notifications` dependency; drivers only discover requests via an 8s foreground poll, customers only see updates while the app is open (`src/services/notifications.ts` is a `console.log` stub).
2. **No safety layer** — no SOS button, no trip sharing, no emergency contacts, no report flows (Account menu items are `Alert` stubs).
3. **Driver cannot actually call the customer** — both driver screens dial a hardcoded placeholder `tel:+260971234567`.
4. **Several booking options are UI-only** — Schedule ride, Book for someone else, and Driver instructions are captured in state but never written to the order; the driver never sees them.
5. **Profile edit is never persisted** — saves to Zustand only; overwritten on next backend fetch.
6. **No offline/no-connection handling anywhere** (no NetInfo, no retry banners).
7. **Nearby drivers on the customer map are simulated** (random jittering fake vehicles).
8. **Zero accessibility attributes** (`accessibilityLabel`/`accessibilityRole` appear nowhere in `src/`).

Details per requested section below.

---

## 1. Authentication & Onboarding

| Check | Status | Evidence |
|---|---|---|
| Phone verified before account active | ❌ | Verification is **email OTP** (`src/features/auth/OtpScreen.tsx` → `insforge.auth.verifyEmail`). Phone is collected at signup (`SignupScreen.tsx:271-292`), checked for uniqueness against `customers`, stored — never verified. DB has a `phone_verified` column (AGENTS.md) that the app never sets. |
| Profile completion step after signup | 🟡 | First/last name + phone collected inside signup itself; the `customers` row is created after OTP (`OtpScreen.tsx:122-131`). No follow-up step for photo, gender, age, or saved addresses (all DB columns exist). |
| Account deletion / deactivation | 🟡 | Backend statuses are enforced at startup: no `customers` row → forced sign-out; `suspended`/`deleted` → sign-out + alert (`app/_layout.tsx:79-95`). But there is **no in-app "Delete my account" option** (a Play Store / App Store policy requirement). |
| ToS / Privacy Policy acceptance | ❌ | No terms, privacy policy, or checkbox anywhere in `src/` (repo-wide grep: zero matches). |
| Referral code at signup | ❌ | Not present. |

Other notes:
- Google/Apple buttons show "coming soon" alerts (`SignupScreen.tsx:180-186`) — known gap, fine as long as they're removed or wired before launch.
- Forgot-password screen exists (`app/forgot-password.tsx`, `src/features/auth/ForgotPasswordScreen.tsx`).
- Signup duplicate-check queries `customers` by email/phone **before** auth signup (`SignupScreen.tsx:98-132`) — works, but it means an unauthenticated client can probe which emails/phones are registered (enumeration vector; also requires an open RLS read on `customers`). Worth a server-side rework.

**Priorities:** ToS/Privacy acceptance — **High** (legal). In-app account deletion — **High** (store policy). Phone (SMS) verification — **Medium-High** (standard in African ride-hailing markets where phone is the primary identity; email OTP is unusual for this market). Referral code — **Low**.

---

## 2. Customer Booking Flow

| Check | Status | Evidence |
|---|---|---|
| Pickup defaults to live GPS with "Live location" label | ✅ | `RidePlannerSheet.tsx:104-121` — GPS pickup shows fixed "Live location" text; real reverse-geocoded address kept on the pickup object. Manual pickups show the address. |
| Multiple stops | ❌ | Single pickup + single destination only (`rideStore`, `orders` table have no stops concept). |
| Schedule a ride for later | 🟡 **UI-only** | `ScheduleRideModal` sets `scheduledFor`; the Book button relabels to "Schedule Ride" (`RidePlannerSheet.tsx:390`). But `requestRide()` (`rideStore.ts:271-352`) never sends `scheduledFor` to `createOrder` — a "scheduled" booking is created as an ordinary immediate `pending` order that expires in 3 minutes. The Activity screen's "Scheduled" filter can never match anything (backend history only returns `completed`/`cancelled`). |
| Book for someone else | 🟡 **UI-only** | `BookForSomeoneModal` captures name/phone into `bookingFor` — never included in the order insert (`services/orders.ts:77-95`). The driver has no way to know they're picking up a different person. |
| Promo code / discount at checkout | ❌ | Nothing at checkout. Account → "Promotions" is a "Coming Soon" alert (`AccountScreen.tsx:96-103`). |
| Special instructions to driver | 🟡 **UI-only** | `InstructionsModal` fills `driverInstructions` — never sent to the backend; no field on `orders`; driver screens never display it. |
| Preferred payment method shown/selectable at booking | 🟡 | Selectable per booking (cash / mobile money / card, `RidePlannerSheet.tsx:29-33`) and persisted onto the order. But nothing reads/writes `customers.preferred_payment_method`, and the app's enum `'mobile_money'` (`types/index.ts:91`) does not match the DB enum `'airtel_money' / 'mtn_money'` documented in AGENTS.md — a data mismatch waiting to happen. |
| Estimated arrival time before confirming | 🟡 | Each vehicle card shows an "eta", but it's set to the **trip duration** from the Distance Matrix (`rideStore.calculateVehicleFares`, line 254: `eta = round(durationMinutes)`), not the time for a driver to reach the pickup. There is no real driver-proximity ETA (nearby drivers are simulated — see §7). |
| Fare estimate range vs fixed | 🟡 | Fixed amount ("Book Economy • K35"). Production apps show a range or clearly flag that the final fare may differ; here the final fare is recomputed from actual GPS distance at completion (§12) and can differ materially with no messaging to the customer. |

Also noted:
- `handleBookRide` fires a duplicate `getDirections` call purely to `console.log` the route (`RidePlannerSheet.tsx:240-250`) — wasted API quota in a production path.
- Vehicle taxonomy mismatch: app offers `economy/comfort/bike/tricycle/truck` (`types/index.ts:81`), while AGENTS.md defines Transporter types as `rider/taxi/tricycle`. Orders are matched to drivers by exact `vehicle_type` equality (`driverOrders.fetchPendingOrders`), so any mismatch between the two vocabularies silently produces zero matches.

**Priorities:** Wire schedule / book-for-someone / instructions into orders (or hide the options) — **High** (silently dropping user input is worse than not offering it). Real pickup ETA — **High**. Promo field — **Medium**. Multiple stops — **Medium**. Fare range messaging — **Medium**.

---

## 3. Active Trip — Customer Side

| Check | Status | Evidence |
|---|---|---|
| Call driver from trip screen | ✅ | `tel:` link with the real driver phone from `fetchOrderDriver` (`(customer)/trip.tsx:35-39`, `ActiveTripCard.tsx:93-95`). |
| Chat with driver during trip | 🟡 | Chat button routes to a **hardcoded mock conversation** `'/chat/conv_001'` — not linked to the actual driver; messages are not persisted and replies are simulated (AGENTS.md known gap). |
| SOS / emergency button | ❌ | Not on any screen (repo-wide grep: zero). |
| Share live trip status with a contact | ❌ | Not present. |
| "Driver is nearby" push notification | ❌ | No push infrastructure at all (`services/notifications.ts` is a console.log stub; `expo-notifications` not installed). |
| "Trip started" push notification | ❌ | Same — the in-app screen updates via realtime, but only while the app is foregrounded. |
| Vehicle color and plate shown | 🟡 | Plate + make/model shown; **color is always an empty string** (`fetchOrderDriver` hardcodes `color: ''`, `services/orders.ts:318-323`) so the card renders e.g. "` Toyota Corolla`". |
| Cancel within a time window after acceptance | ✅/🟡 | 60s window (`CANCELLATION_WINDOW_MS`, `rideStore.ts:30`) with a live countdown on `ActiveTripCard`. **But**: on the dedicated trip screen (`(customer)/trip.tsx:54`), the Cancel button stays visible for `driver_assigned`/`waiting` with no countdown, and `cancelRide` **silently no-ops** after the window (`rideStore.ts:462-466`) — the customer taps Cancel, the modal closes, and nothing happens with no explanation. |
| Wait time displayed while driver waits | ❌ | Customer only sees "Driver is waiting for you" + arrival banner. The waiting timer (which increases their fare at K1.5/min) is shown only to the driver. |

**Priorities:** SOS — **High** (see §10). Push notifications — **High** (see §8). Fix the silent-cancel no-op — **High** (trust/UX defect). Real per-trip chat thread — **Medium-High**. Vehicle color — **Low-Medium**. Customer-visible waiting timer — **Medium** (they're being billed for it). Trip share — **Medium**.

---

## 4. Trip Completion — Customer Side

| Check | Status | Evidence |
|---|---|---|
| Full receipt after completion | 🟡 | Rating screen (`app/rating/[id].tsx`) shows base fare, a combined "Distance & time" line, and total. **No distance, no duration, no waiting-time line** — the driver's summary (`(driver)/trip-summary.tsx`) is far more detailed than the customer's. `ride/[id].tsx` (history detail) exists but uses a static SVG map (known gap). |
| Receipt shows distance/time/waiting/fare breakdown | ❌ (customer) / ✅ (driver) | Waiting minutes are charged (`fareCalculator.ts`) but never itemised for the person paying. |
| Rating prompted immediately | ✅ | `applyOrderUpdate` → `router.replace('/rating/[id]')` on `completed` (`rideStore.ts:439-447`). Skippable; persisted via `submitRating`; DB trigger recomputes driver average. |
| Tip the driver | ❌ | Not present. |
| Completed trip saved to history immediately | ✅ | Optimistic local entry + backend backfill via `fetchRideHistory()` (`rideStore.completeRide`). |
| Report an issue with the trip | ❌ | Account → "Ride Issues" is an `Alert` stub; no per-trip report entry point. |

Also noted: `completeRide()` with no update (the `Complete (Demo)` button on `ActiveTripCard.tsx:242-249`) fabricates a random 15–35 min duration — a dev artifact still shipping in the customer UI.

**Priorities:** Customer fare breakdown incl. waiting time — **High** (billing transparency). Report-an-issue flow — **High**. Remove the demo Complete button — **High** (lets a customer locally "complete" a live order while the driver still drives it). Tipping — **Low-Medium**.

---

## 5. Driver Flow

| Check | Status | Evidence |
|---|---|---|
| Push notification for new requests | ❌ | Discovery is an 8-second **foreground poll** (`driverStore.ts:31, 185-188`). Backgrounding the app = no requests, silently. |
| Customer rating visible before accepting | ❌ (by design) | Request card deliberately anonymises the customer pre-acceptance (`RequestCard.tsx:89-93`, `driverStore.toIncomingRequest`). Name+rating are fetched only after accept (`fetchOrderCustomer`). Production apps show at least the rating pre-accept. |
| Pickup distance and time-to-pickup shown | 🟡 | Straight-line km shown and live-updated (`RequestCard`, `updateLocation`); **no ETA-to-pickup** on the request card. On the navigation screen ETA is a crude `distance × 2 min` heuristic until the Directions result lands (`(driver)/navigation.tsx:203`). |
| Turn-by-turn navigation auto-triggered | 🟡 | Good in-app turn-by-turn (steps HUD, maneuver icons, heading-up camera) but it starts only after tapping "Start Pickup"; no auto-start and no handoff to Google Maps/Waze as fallback. |
| Contact customer before/during trip | 🔴 **Broken** | Both call buttons dial a **hardcoded placeholder** `tel:+260971234567` (`(driver)/navigation.tsx:184-192`, `(driver)/trip.tsx:239-246`). The customer's real phone is never loaded into the trip. In production a driver literally cannot reach their passenger. |
| Driver SOS / emergency button | ❌ | Not present. |
| Waiting timer clearly shown | ✅ | Live mm:ss timer in the waiting card (`navigation.tsx:463-491`); waiting duration feeds the final fare. |
| Pre-trip checklist (seatbelt/AC etc.) | ❌ | Not present. (Low priority; only some markets do this.) |
| Report a no-show customer | ❌ | No driver-side cancel/no-show flow at all — once a ride is accepted the driver has no UI to cancel or report, only slide-to-arrive/start/complete. `driverStore.cancelTrip()` exists but nothing calls it, and it wouldn't update the order row anyway. |

**Priorities:** Real customer phone on the trip — **High (blocker)**. Driver cancel / no-show flow (with order status update so the customer isn't stranded) — **High**. Push for new requests — **High**. Show customer rating pre-accept — **Medium**. ETA to pickup — **Medium**. Checklist — **Low**.

---

## 6. Driver Earnings & Wallet

| Check | Status | Evidence |
|---|---|---|
| Daily/weekly earnings summary | 🟡 | WalletScreen shows today/week from the **real** wallet ledger (`fetchDriverWallet` → trigger-maintained `wallet_transactions`). But the Dashboard tab mixes in **mock** numbers: `driverStore.stats` is hardcoded (K450 today, 4.85 rating, 92% acceptance — `driverStore.ts:85-92`), and "+12% vs last week" / the 65% goal bar are hardcoded (`WalletScreen.tsx:240-244`). `DashboardStats` on the home screen also renders mock stats. |
| Service credit balance + low balance warning | 🟡 | "Balance limit K5.00" is a hardcoded constant always labelled "Safe" (`WalletScreen.tsx:13, 139-146`) — no real threshold logic, no warning state. |
| Earnings per trip in history | 🟡 | Transaction list shows per-trip amounts, but backend-synced entries have empty destination text (`driverWalletStore.fetchWallet` fills `''`) and no timestamps are rendered. Driver ride-history screen not built (AGENTS.md known gap). |
| Withdrawal flow | ❌ | No UI. `driverWalletStore.withdraw()` exists but is local-only (would desync from the backend ledger) and is never called. |
| Wallet transactions timestamped & itemised | 🟡 | DB ledger is proper (type, amount, `balance_after`, `created_at`); the UI shows neither dates nor service-fee line items (only `trip_earning` rows are surfaced). |
| Net earnings (gross − service fee) | ✅ | Trip summary shows fare − service fee = net (`trip-summary.tsx`), backed by `service_fee_amount` and the completion trigger. |

**Priorities:** Withdrawal flow — **High** (drivers must get paid out). Replace mock stats with real aggregates — **High** (showing fake earnings/rating to a real driver is a trust breaker). Timestamps + fee rows in the ledger UI — **Medium**. Low-balance warning — **Medium**.

---

## 7. Maps & Navigation

| Check | Status | Evidence |
|---|---|---|
| Nearby available drivers on customer map | 🟡 **Simulated** | 2–4 fake vehicles are randomly generated within 500 m and given idle jitter (`PassengerHome.tsx:27-106`). The real H3 discovery engine (`services/discoveryEngine.ts`) is only used for debug logging. Real online-driver positions exist in `drivers.current_lat/lng` but are never queried for display. |
| Driver marker animates smoothly | ✅ | `AnimatedVehicleMarker` + `animatedMarker.ts` interpolate coordinate changes; `useRoadSnappedVehicle` snaps to roads. Customer-side driver position updates every 5 s via telemetry pings (`useDriverTelemetryPing`) merged through realtime — smooth-animated on arrival. |
| Traffic shown during navigation | ❌ | `showsTraffic={false}` (`Map.native.tsx:288`); Directions calls don't request `departure_time=now` traffic models. |
| Map auto-follows driver during active trip | ✅ | Customer trip: `autoFollowDriver`; driver screens: camera-follow with 5 s interaction cooldown. |
| Route redrawn if driver goes off-route | 🟡 | No off-route detection. Pickup navigation fetches the route **once** and never rerolls (`navigation.tsx:150-154` — guard on `routeCoordinates.length === 0`); the in-trip screen has the opposite problem: it re-fetches Directions on **every GPS fix** (`(driver)/trip.tsx:125-140` depends on `driverLocation.lat/lng`, with 1 m/1 s updates) — an API-quota and battery burner. |
| ETA recalculated when traffic changes | ❌ | ETAs are static route durations or `km × 2 min` heuristics. |
| Map style toggle | ✅ | standard → terrain → hybrid on PassengerHome (`toggleMapType`). |

**Priorities:** Show real nearby drivers — **High** (fake supply misleads customers). Throttle/deduplicate the in-trip Directions refetch — **High** (cost + battery). Off-route re-route logic — **Medium**. Traffic — **Medium-Low** for Lusaka launch.

---

## 8. Notifications

| Check | Status |
|---|---|
| Push: new ride request (driver) | ❌ |
| Push: ride accepted (customer) | ❌ |
| Push: driver arriving (customer) | ❌ |
| Push: driver arrived (customer) | ❌ |
| Push: trip started (customer) | ❌ |
| Push: trip completed (both) | ❌ |
| Push: ride cancelled (both) | ❌ |
| In-app notifications when app open | 🟡 |
| Notification preferences configurable | ❌ |

Evidence: `expo-notifications` is not in `package.json`; there are no push tokens, no channels, no permission requests. `src/services/notifications.ts` is an explicit stub ("No OS push infrastructure exists yet") that `console.log`s the arrival event. In-app, state transitions ARE reflected live (realtime channel drives the customer UI; an arrival banner shows on the trip screen), but there is no toast/banner system for events happening on another screen, and Account's "Notifications & Privacy" entries are `Alert` stubs.

**Priority: High — this is the single largest gap vs. every production ride-hailing app.** Without push, a customer who locks their phone never learns the driver accepted/arrived, and a driver must keep the app open and lit to earn. This also interacts with §13: driver location streaming is foreground-only, so backgrounding kills both tracking and requests silently.

---

## 9. Ratings & Reviews

| Check | Status | Evidence |
|---|---|---|
| Customer rates driver after each trip | ✅ | Auto-prompted, optional, persisted (`ratings` table, unique per order). |
| Driver rates customer after each trip | ❌ | Trip summary has only "Done". No driver→customer rating; `customers.rating` exists in the DB but nothing in this app writes it. |
| Average rating updated after each rating | ✅ | DB trigger recomputes driver `rating`/`total_ratings` (referenced in `services/ratings.ts` doc comment). |
| Rating shown on driver profile | 🟡 | Shown to customers on trip cards/history. The driver's own dashboard shows the **mock** 4.85 (`driverStore.stats`), not their real average. |
| Customer sees driver rating before booking | ❌ | No driver is known before matching (broadcast model); rating first appears after acceptance. |
| Reviews/comments stored | ✅ | Optional comment persisted with the rating. |
| Minimum rating threshold for drivers | ❌ | No enforcement anywhere client-side; nothing documented server-side. |
| Customer sees own rating | 🟡 | Profile screen shows a rating — but it's the **mock** 4.8 (`fetchCustomerAccount` doesn't select `rating`; `loadAccounts` never maps it). |

**Priorities:** Driver→customer rating — **Medium-High** (two-sided trust is standard). Real averages instead of mocks (both sides) — **High** (data honesty). Threshold policy — **Low-Medium** (admin-side concern).

---

## 10. Safety

| Check | Status | Evidence |
|---|---|---|
| SOS button (customer & driver) | ❌ | Zero matches for SOS/emergency UI in `src/`. |
| Live location share with emergency contacts | ❌ | Not present (`expo-contacts` is installed but used only for Book-for-someone). |
| Trip recording / audio safety | ❌ | Not present. |
| Driver documents verified before approval | ✅ | 4-step onboarding uploads licence, registration, insurance, photo (`createDriverProfile`); account starts `pending`; only `approved` drivers can switch to driver mode (`AccountScreen.handleRoleChange`, `userStore.loadAccounts` demotes non-approved) and go online. Admin approval is on the web dashboard (out of repo scope). |
| Report driver / report customer flow | ❌ | Alert stubs only ("Safety Center" → `Alert.alert('Safety', 'Your safety is our priority')`). |
| Suspicious accounts flagged automatically | 🟡 | Suspended/deleted accounts are locked out at session check (`app/_layout.tsx`), which is enforcement, not detection. No client-side flagging (reasonable — this belongs server-side). |

**Priority: High overall.** For a production taxi app in this market, an SOS button (dial local emergency + share coordinates) and a trip-share link are table stakes; InDrive/Bolt/Yango all ship them. Document verification is genuinely done — the strongest safety element present.

---

## 11. Account & Profile

| Check | Status | Evidence |
|---|---|---|
| Edit name, email, phone | 🔴 **Not persisted** | `profile.tsx` → `handleSave` calls `updateProfile()` which only mutates the Zustand store — **no InsForge write exists for the customers row**. The next `loadAccounts()` (fires on every Account-tab visit and app start) overwrites edits with backend values. Changing email here also wouldn't touch the auth identity. |
| Upload/change profile photo | ✅ | Real storage upload + both DB rows via `updateSharedProfilePhoto` (`services/profilePhoto.ts`), mirrored locally. |
| Saved addresses (Home, Work) | 🟡 **Mock** | Hardcoded Lusaka mock addresses (`userStore.ts:72-89`); Add → "coming soon" alert; delete is local-only. The `saved_addresses` table exists but no service reads/writes it. They do work as quick destinations in booking. |
| Preferred payment method saved | ❌ | `customers.preferred_payment_method` never read/written; booking always resets to cash. |
| Ride history paginated & searchable | ❌ | Single unbounded fetch, newest-first (`fetchCustomerOrderHistory`), no pagination, no search. Fine at low volume, degrades with account age. |
| Customer sees own rating | 🟡 | Shows mock 4.8 (see §9). |
| Account deletion option | ❌ | Not present in-app (see §1). |
| Support/help section | 🟡 | Complete menu skeleton (ride issues, payments, contact, safety, about) — every item is an `Alert` stub; support phone is literally `+260 XXX XXX XXX`. |

**Priorities:** Persist profile edits — **High** (silent data loss). Real saved addresses on `saved_addresses` — **Medium-High** (table exists, feature is half-wired). Persist preferred payment — **Medium**. History pagination — **Medium**. Support content — **Medium**.

---

## 12. Payment

| Check | Status | Evidence |
|---|---|---|
| Cash payment | ✅ (recorded) | Default method, stored on the order. No driver-side "payment collected" confirmation step — the trip completes regardless. |
| Mobile money (Airtel/MTN) | Deferred by owner | UI option exists as `'mobile_money'`; note the enum mismatch vs DB `'airtel_money'/'mtn_money'` before implementing. |
| Card payment | Deferred by owner | UI option exists; no processing. |
| Payment method selectable per booking | ✅ | Modal in `RidePlannerSheet`. |
| Refund / dispute flow | ❌ | Nothing beyond the "Payment Issues" alert stub. |
| Fare shown before and after trip | ✅/🟡 | Estimate at booking; final fare on completion. Caveat: the final fare is recomputed by the **driver's device** from accumulated GPS distance (`(driver)/trip.tsx:202-228`) and written by the driver client (`completeOrderTrip(orderId, fareAmount)`), replacing the booked amount. GPS noise (1 m updates accumulate jitter) can inflate distance, and a fare authored client-side by the paid party is manipulable. The customer sees the changed number only on the rating screen, with no explanation of the difference. |

**Priorities:** Server-side (or at least server-validated/capped) final fare — **High** (fraud & dispute surface). Cash-collected confirmation — **Medium**. Refund/dispute flow — **Medium** (can start as a support form). Enum alignment for momo — **High at the moment momo is implemented**.

---

## 13. Performance & Technical

| Check | Status | Evidence |
|---|---|---|
| Skeleton loading on all fetching screens | 🟡 | Present: Activity history, driver request cards, ProfileCard, VehicleCard. Absent: WalletScreen (no loading state at all around `fetchWallet`), Discover, ride details, chat. |
| Errors handled gracefully with friendly messages | 🟡 | Good in auth/driver slide actions (alerts + retry). Bad in booking: `requestRide` failures (`auth not ready`, order-create failure) only `console.error` and snap back to idle — the customer taps Book and the sheet just returns with **no message** (`rideStore.ts:280-321`, `PassengerHome.handleRequestRide`). `fetchRideHistory` failure renders as "No rides yet" (indistinguishable from an empty account). |
| Offline / no-connection state | ❌ | No NetInfo, no connectivity banner, no queued retries anywhere. |
| console.log removed from production paths | 🟡 | Production-path hits: `services/notifications.ts:8`, `PassengerHome.tsx:319` (guarded by debug flag), `RidePlannerSheet.tsx:245` (route log on every booking), `Map.native.tsx:33`. Bulk of matches are in `__tests__/` and `__examples__/` files, which also ship in the bundle. |
| Location tracking battery-optimized | ❌ | Trip screens: `BestForNavigation` + 1 m / 1000 ms — defensible during navigation. DriverDashboard while merely online: `Accuracy.High`, 1 m / 1000 ms (`DriverDashboard.tsx:104-133`) — heavy for idling. Bigger issue: **all tracking is foreground-only** (no `expo-task-manager`/background location), so telemetry and request polling stop when the screen locks — mid-trip, the customer's map freezes. Also the watch subscription is torn down/rebuilt every time `isAutoFollow` flips (effect deps `[isOnline, isAutoFollow]`). |
| Images cached | 🟡 | `expo-image` is installed but **never used** — avatars/hero images use RN `Image`/`ImageBackground` with no cache policy. |
| Tested on 360 px width | ⚠️ Unverifiable | Not testable statically. Risk flags: fixed absolute offsets on PassengerHome (recenter button at `bottom: 420`, sheet `maxHeight: '80%'`), fixed 48×64 OTP boxes ×6 + gaps ≈ tight at 360 px. |

Additional technical findings:
- **Expired orders never resolve the customer UI**: orders expire after 3 min (`expires_at`, status `'expired'`), but `applyOrderUpdate` has no `'expired'` case (`rideStore.ts:356-455`) — if the sweep flips the row, the customer's matching overlay keeps "searching" indefinitely (the overlay's own 45 s countdown UI doesn't cancel the order either).
- Realtime has **no reconnect/resubscribe handling** — a dropped socket mid-trip silently freezes updates (no `onDisconnect` handling found).
- `app/(tabs)/navigate.tsx` is a dev tool intentionally kept, but it is exposed as a **visible tab for every approved driver** in production builds.
- AGENTS.md's bottom-tab animation spec (active tab = icon-only coloured circle, reanimated) is not implemented — active tab shows a static tinted rectangle **with** label (`(tabs)/_layout.tsx:62`).
- `useUserStore.savedAddresses`, `driverStore.stats`, `messagingStore` conversations remain mock data behind real-looking UI.

**Priorities:** Offline handling — **High**. Surface booking errors to the user — **High**. Background location for drivers — **High** (functional, not just battery). Handle `expired` order status — **High**. Idle-online tracking downshift — **Medium**. expo-image adoption — **Low-Medium**.

---

## 14. Accessibility & UX

| Check | Status | Evidence |
|---|---|---|
| Buttons ≥ 44 px touch targets | 🟡 Mostly | Inputs 58 px, icon buttons 48 px, primary buttons ~56 px — good. Sub-44 px: chat/call icon buttons `size="md"` (40 px), the 40×40 back button, star rating targets (36 px + 8 hitSlop ≈ ok), tab items are fine. |
| Text readable at min system font sizes | 🟡 | Heavy use of 10–11 px labels (`text-[10px]`, `text-[11px]` across WalletScreen, HUDs). No `allowFontScaling` suppression found (good — scaling works), but tiny bases scale up into layout overflow risk. |
| Loading states for all async operations | 🟡 | Most mutations have spinners/loading flags; gaps: WalletScreen fetch, booking failure path (see §13), profile Save (instant local write masquerading as a save). |
| Error messages specific & actionable | 🟡 | Auth flows: yes. Booking/matching: silent failures (§13). Generic "Error / try again" on driver slides is acceptable. |
| Bottom navigation safe-area compliant | ✅ | `height: 60 + insets.bottom`, `paddingBottom: max(insets.bottom, 8)` (`(tabs)/_layout.tsx:42-44`); screens use `SafeAreaView` edges consistently. |
| Forms keyboard-aware | 🟡 | Signup, planner sheet, chat: `KeyboardAvoidingView` present. **Profile edit screen has none** (`profile.tsx` — plain ScrollView; bottom fields will be covered on small devices). Android planner uses `behavior="height"` inside an absolute-fill overlay — worth on-device verification. |
| Screen-reader support | ❌ | **Zero** `accessibilityLabel` / `accessibilityRole` attributes in the entire `src/` tree. Icon-only buttons (call, chat, map toggles, slider) are unusable with TalkBack/VoiceOver. |

**Priorities:** Accessibility labels on interactive elements — **Medium-High** (also a store-review consideration). Keyboard avoidance on profile — **Medium**. Touch-target bumps — **Low**.

---

## Consolidated Priority List

### Launch blockers (High)
1. **Push notifications end-to-end** (expo-notifications + tokens + server triggers for the 7 lifecycle events) — §8
2. **Driver ↔ customer real phone contact** (remove hardcoded `+260971234567`; add customer phone to accepted-order payload) — §5
3. **SOS button + trip sharing** (both roles) — §10
4. **Persist profile edits to InsForge** (currently silent data loss) — §11
5. **Wire or hide UI-only booking options** (schedule, book-for-someone, driver instructions) — §2
6. **Driver cancel / no-show flow** that updates the order — §5
7. **Handle `expired` order status in the customer matching UI** — §13
8. **Surface booking errors to the customer** (no more silent `console.error` → idle) — §13
9. **Server-validated final fare** (driver client currently authors the charged amount) — §12
10. **Fix the silent cancel no-op after the 60 s window on the trip screen** — §3
11. **Remove the `Complete (Demo)` button from the customer trip card** — §4
12. **Replace mock data shown as real** (driver stats/rating, customer own rating, simulated nearby drivers, mock saved addresses) — §6, §7, §9, §11
13. **ToS/Privacy acceptance + in-app account deletion** — §1
14. **Background location for drivers** (tracking + requests die on screen lock) — §13
15. **Offline/no-connection state** — §13
16. **Driver withdrawal flow** — §6
17. **Throttle the per-GPS-fix Directions refetch on the driver trip screen** — §7

### Medium
- SMS phone verification; real pickup ETA; promo code field; customer waiting-time display; customer receipt breakdown (incl. waiting); report-an-issue flow; driver→customer rating; real per-trip chat threads; preferred payment persistence; real saved addresses (`saved_addresses` table); history pagination; low-balance warning + ledger timestamps; off-route re-routing; in-app toast/notification center; notification preferences; accessibility labels; keyboard-aware profile form; cash-collected confirmation; refund/dispute intake; support content (real phone/email); align `PaymentMethod` and `VehicleType` enums with the DB before matching/momo work.

### Low
- Referral codes; tipping; pre-trip checklist; traffic layer; map satellite parity on web; expo-image adoption; multiple stops; minimum-rating policy (admin-side); hide `navigate` dev tab in production; AGENTS.md tab-bar animation spec.

---

## What Is Genuinely Solid

Worth stating so the gaps above don't read as "nothing works":

- **Order lifecycle is real**: insert → realtime channel → accept race-safe (`eq('status','pending').is('driver_id', null)`) → arrive → start → complete, with server triggers for wallet credit and rating aggregates.
- **Auth/session hardening**: OTP-gated profile creation, startup session check that catches deleted/suspended accounts before the UI flashes, careful access-token syncing for realtime, duplicate-order cleanup on cancel races (`rideStore.requestRide` guards).
- **Driver approval pipeline**: document uploads, pending/approved/rejected/suspended states enforced in both the role switcher and store logic.
- **Navigation UX**: turn-by-turn HUD with maneuver icons, heading-up camera, waiting timer, slide-to-confirm actions with retry states.
- **Map architecture**: native/web split, road-snapped animated markers, H3 spatial engine cleanly wrapped, single `mapsApi.ts` gateway as mandated.
- **Fare engine**: single source of truth, per-vehicle multipliers, waiting-time billing, min-fare floors.

---

*Read-only audit — no files were modified. Generated by Claude (Fable 5) on 2026-07-21.*
