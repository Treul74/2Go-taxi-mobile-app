# Post-Login Routing Audit — Discover Screen & Role Handling

**Date:** 2026-07-18
**Scope:** Where the Discover screen is rendered/routed, and how (or whether) the
app decides which screen a user lands on after login based on role. Audit only —
no code was changed.

---

## 1. Where the Discover screen lives

- Route file: [app/discover.tsx](app/discover.tsx) — a thin wrapper with no
  logic of its own:
  ```tsx
  import { DiscoverScreen } from '@/features/discover';
  export default function DiscoverPage() {
    return <DiscoverScreen />;
  }
  ```
- Implementation: [src/features/discover/DiscoverScreen.tsx](src/features/discover/DiscoverScreen.tsx).
  Entirely Customer-oriented content — delivery/food banners, a "Where to?"
  search bar that starts a ride booking, recent ride destinations, a promo
  banner, and a restaurants carousel. There is no driver-facing branch, data,
  or copy anywhere in this file.
- Registered in the root stack in [app/_layout.tsx:162](app/_layout.tsx#L162),
  inside the `Stack.Protected guard={authed}` group, declared **first** —
  the comment at [app/_layout.tsx:156-160](app/_layout.tsx#L156-L160) confirms
  this is deliberate so it's the default initial route of that group ahead of
  `(tabs)`.

## 2. What currently decides the post-login destination

Three places all send an authenticated user to the same hardcoded route,
and **none of them inspect role**:

| Site | Code |
|---|---|
| [src/features/auth/LoginScreen.tsx:73-74](src/features/auth/LoginScreen.tsx#L73-L74) | `await setAuthed(true, ...); router.replace('/discover');` |
| [src/features/auth/OtpScreen.tsx:139-140](src/features/auth/OtpScreen.tsx#L139-L140) | `await setAuthed(true, ...); router.replace('/discover');` |
| [app/_layout.tsx:118-123](app/_layout.tsx#L118-L123) | `hasLandedOnLaunch` effect: fires once per app start whenever `appReady && authed`, unconditionally `router.replace('/discover')` — this is what re-lands a *returning*, already-logged-in session on Discover on a fresh cold launch |

All three are literal, unconditional `router.replace('/discover')` calls. No
`role`, `driverAccount`, or `customerAccount` value is read at any of these
call sites.

Role-aware routing does exist, but **one level deeper**, only reachable once
something has already navigated into `(tabs)`:

- [app/(tabs)/index.tsx](app/(tabs)/index.tsx) — `role === 'driver' ? <DriverDashboard /> : <PassengerHome />`
- [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx) — tab bar itself is role-conditional (Activity tab hidden for drivers, Wallet/Navigate tabs hidden for passengers, "Orders" vs "Home" title/icon)

Nothing upstream of `(tabs)` ever routes a user there automatically based on
role — a user only reaches it via the Discover screen's "Where to?" flow
(`goToHomeWithDestination` / `handleDelivery` in DiscoverScreen.tsx, both of
which `router.push('/(tabs)')`) or the bottom tab bar itself once already
inside `(tabs)`.

## 3. How `role` itself is determined — the deeper issue

[src/state/userStore.ts](src/state/userStore.ts):

- `role: UserRole` initializes to the hardcoded literal `'passenger'`
  ([userStore.ts:91](src/state/userStore.ts#L91)) and is **not persisted** —
  every fresh app load starts from this default regardless of which account
  type actually logged in.
- `loadAccounts()` ([userStore.ts:113-143](src/state/userStore.ts#L113-L143)),
  which runs on every session restore (called from `app/_layout.tsx`'s session
  check) and fetches both `customerAccount` and `driverAccount`, only ever
  **demotes** `'driver' → 'passenger'` when the fetched driver row is no
  longer `'approved'`. It never promotes `'passenger' → 'driver'`, even when
  an approved `driverAccount` is present.
- The only place `role` is ever set to `'driver'` is
  [AccountScreen.tsx:43-46](src/features/account/AccountScreen.tsx#L43-L46),
  via the `RoleSwitcher` UI, gated on `driverAccount?.accountStatus === 'approved'`.
  This is a manual, in-app toggle the user must tap each session — it is
  never invoked automatically anywhere in the login/launch flow.

## 4. Conclusion — does driver "fall through" to the customer route?

**Yes, confirmed.** There is no explicit routing decision for Transporters at
all at login/launch time. Every authenticated session — Customer or approved
Transporter alike — is unconditionally sent to `/discover` (a Customer-only
screen), because:

1. The three post-login navigation call sites hardcode `/discover` with no
   role check.
2. Even if they did check `role`, `role` itself defaults to `'passenger'` on
   every fresh load and is never derived from the fetched `driverAccount` —
   only a manual `RoleSwitcher` tap (reachable from Account, which is itself
   only reachable from within the Customer-oriented Discover/tabs UI) ever
   sets it to `'driver'`.

So a Transporter's only path to `DriverDashboard` today is: log in → land on
Discover (Customer content) → open the menu → Account tab/screen → manually
switch role via RoleSwitcher → navigate to the Home tab. There is no
automatic redirect to driver-facing UI anywhere in the stack.

## Files referenced

- `app/_layout.tsx`
- `app/discover.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/_layout.tsx`
- `src/features/discover/DiscoverScreen.tsx`
- `src/features/auth/LoginScreen.tsx`
- `src/features/auth/OtpScreen.tsx`
- `src/features/account/AccountScreen.tsx`
- `src/state/userStore.ts`
