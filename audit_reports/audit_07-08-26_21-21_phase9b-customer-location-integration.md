# Phase 9B — Integrate Customer Location into Navigation Engine

**Date:** 2026-08-07
**Type:** Migration (code modified). Closes the gap named in `audit_07-08-26_20-29_phase8d-...md` (§14 item 5): `NavigationState.customerLocation` had no producer anywhere in the app.
**Read first:** `AGENTS.md`, `2GO Navigation Engine Bible.md`.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/navigation/NavigationEngine/types.ts` | Added two `NavigationDataActions` methods: `setActor` and `setCustomerGpsFix`. |
| `src/navigation/NavigationEngine/NavigationStore.ts` | Implemented both. |
| `src/navigation/NavigationEngine/providers/NavigationProvider.tsx` | Resolves `NavigationState.actor` from `userStore.role`, and branches its existing single `GPSManager.onFix` handler on that value: Transporter fixes keep the exact existing `driverLocation`/route-progress/reroute pipeline; Customer fixes now publish to `customerLocation` via `setCustomerGpsFix`. |

No screen was modified. No new `GPSManager` subscription was created anywhere.

---

## 2. Why this lived in `NavigationProvider`, and why a mapping was needed at all

`NavigationState.actor` (`'customer' | 'transporter' | null`) already existed, and `driverLocation`/`customerLocation`'s own doc comments in `types.ts` already described the intended design: *"the Transporter's current position — this device's own GPS if `actor === 'transporter'`, otherwise synced from the backend"* / *"The Customer's current position — this device's own GPS if `actor === 'customer'`..."*. Nothing, anywhere, ever set `actor`. That doc comment for `NavigationActor` also already named the fix: *"The engine does not read or write `UserRole`; a mapping lives at the integration boundary (`NavigationProvider`), not here."* — `NavigationProvider` was always the designed home for this, not a new architectural decision.

**Without this fix, a real bug already existed, not just a missing field.** `NavigationProvider`'s `onFix` handler wrote every incoming fix straight to `driverLocation`, unconditionally, regardless of whose device it came from. A Customer's own device already runs a *continuous* `GPSManager` subscription during booking (`useCurrentLocation`/`useSnappedLocation`, both `GPSManager.acquire`-based per `Architecture.md`'s "Multi-consumer" note) — and per Phase 8B's own finding, Expo Router's stack keeps `PassengerHome` mounted underneath `app/(customer)/trip.tsx` rather than unmounting it. So while a Customer was watching their live trip (Phase 8A.1's migrated screen, which correctly writes the *driver's* network-synced position into `driverLocation` via `setDriverLocation`), their own phone's GPS fixes — still flowing in the background from the still-mounted booking screen — were *also* landing in `driverLocation`, racing with and periodically overwriting the correct value with the Customer's own coordinates. This phase's actor-based branching fixes that as a direct consequence, not a separate change: a Customer fix now only ever reaches `customerLocation`.

---

## 3. Data flow diagram

```
                     userStore.role ('passenger' | 'driver')
                              │
                              ▼ (reactive, re-fires on RoleSwitcher toggle)
                  NavigationProvider's role→actor effect
                              │
                              ▼
              NavigationStore.actor ('customer' | 'transporter')
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                             │
        ▼                                             ▼
  the ONE GPSManager.onFix                    (read by applyFixForActor
  subscription (unchanged —                    on every fix, not cached
  still exactly one, still                      in a stale closure)
  owned by GPSManager.ts)
        │
        ▼
  NavigationProvider.applyFixForActor(fix)
        │
        ├── actor === 'transporter' ─────────────────────────────────┐
        │     (existing pipeline, byte-identical to before)          │
        │     • route active?  → applyGpsFixWithProgress(fix, route) │
        │     • no route?      → setGpsFix(fix)                      │
        │     • route+position → checkAndReroute(...)                │
        │                                                             ▼
        │                                          NavigationStore.driverLocation /
        │                                          heading / speed / route / progress
        │
        └── actor === 'customer' ───────────────────────────────────┐
              setCustomerGpsFix(fix)                                 │
              (no route-progress, no reroute check —                 │
               meaningless for a Customer's own position)            ▼
                                                    NavigationStore.customerLocation /
                                                    gpsState (shared, actor-agnostic)
```

`GPSManager.onStatusChange` → `setGpsStatus` is untouched — GPS signal status describes this device's own localization regardless of which actor it belongs to, so it was never actor-gated and still isn't.

---

## 4. Validation report

- ✓ **One GPS owner** — confirmed by a repo-wide grep for `watchPositionAsync`/`getCurrentPositionAsync`/`startLocationUpdatesAsync`/`stopLocationUpdatesAsync`/`TaskManager.defineTask`: the same four files as every prior audit in this arc (`GPSManager.ts` itself, plus three files whose only matches are comments naming the banned APIs). This phase added zero new hits.
- ✓ **`customerLocation` always reflects the latest GPS fix** — `GPSManager.getCurrentFix()` (one-shot reads, e.g. `PassengerHome`'s recenter button, `MapPickerModal`'s "go to my location") and the continuous watcher both emit through the same `LOCATION_UPDATED` event (confirmed by reading `GPSManager.ts` — `getCurrentFix` calls `emit('LOCATION_UPDATED', ...)` at line 995, same event `onFix` subscribes to at line 191) — so every fix, one-shot or continuous, now reaches `applyFixForActor` and updates `customerLocation` while `actor === 'customer'`. Also seeded immediately on mount from `GPSManager.getLastFix()` (the same cache-seed the Transporter path already had, now routed through the same actor branch).
- ✓ **No duplicate subscriptions** — `GPSManager.onFix`/`onStatusChange` are still called exactly once each, in the same `useEffect`, with the same empty dependency array as before. The only change is what the *existing* single listener does with a fix once it has one — an `if/return` added inside the same callback, not a second `on(...)`/`acquire()` call anywhere.
- ✓ **Existing ride lifecycle unchanged** — the Transporter branch of `applyFixForActor` is line-for-line the same logic the file already ran unconditionally (`setGpsFix`/`applyGpsFixWithProgress`/`checkAndReroute`), just now reached only when `actor === 'transporter'` instead of always. Since every existing driver screen (`DriverDashboard`, `navigation.tsx`, `trip.tsx`) is only ever used by an account with `userStore.role === 'driver'`, `actor` resolves to `'transporter'` for all of them, every time — the driver-side pipeline behaves identically to before this change. `rideStore`/`driverStore` business logic was not touched.
- ✓ **TypeScript passes** — `npx tsc --noEmit`, exit code 0, zero errors.

Two `__DEV__`-only `console.log` calls inside the fix handler, explicitly marked `// TEMPORARY (Phase 7R.1 runtime verification) — remove after verification` in the code itself, were removed while this block was already being edited (per `AGENTS.md`'s "Remove `console.log` in non-error-handling paths when touching a file") — no behavior change, dev-only logging only.

---

## 5. What was deliberately not done

- **`customerLocation` has no consumer yet.** This phase is the producer only, per its own brief ("Implement a single producer"). Nothing currently reads `NavigationState.customerLocation` (confirmed unchanged from the Phase 8D audit) — the natural next step, should it be wanted, is `app/(customer)/trip.tsx` or a future "walk to pickup" feature reading it via a new `useCustomerLocation()` `NavigationHooks` selector (the selector itself already exists — it's the field's `useCustomerLocation` hook in `NavigationHooks.ts` — only nothing calls it from a screen yet).
- **No screen was changed.** The fix is entirely inside the engine's own integration boundary (`NavigationProvider`) — no screen needed to know `actor` exists for this phase to work, matching "Reuse `NavigationProvider` where appropriate" literally.
- **`actor` reset on role switch does not clear stale `driverLocation`/`customerLocation` values.** If a user toggles role mid-session (RoleSwitcher), the *other* actor's last-known position remains in the store until a fresh fix overwrites it — same "no explicit reset" characteristic `IDLE_RESET_FIELDS` already accepts for mode transitions (`cameraState`/`gpsState`/etc. persist across trips by design). Not treated as a defect: no screen reads the "wrong" actor's field today, and this wasn't asked for.
