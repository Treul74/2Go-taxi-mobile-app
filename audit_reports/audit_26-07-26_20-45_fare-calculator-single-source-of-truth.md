# Fare Calculator — Single Source of Truth Audit

Date: 2026-07-26
Scope: Architectural review of every call site of `calculateFare()` and
`calculateFareForVehicle()`, a search for duplicate pricing logic anywhere
else in the repo, and recommendations to prevent future accidental use of
the vehicle-agnostic function. Read-only — no code changed as part of this
task.

Context: two call sites (`rideStore.ts:327`, `trip.tsx:239`) were found
calling `calculateFare()` directly (bypassing the per-vehicle multiplier) and
were fixed earlier in this session. This audit verifies the fix is complete
and looks for anything else of the same shape.

---

## 1. Every call site of `calculateFare()` / `calculateFareForVehicle()`

Exhaustive grep across all `.ts`/`.tsx` files in the repo:

| File : Line | Call | Caller context |
|---|---|---|
| [fareCalculator.ts:31](src/lib/fareCalculator.ts#L31) | `export const calculateFare = (...) => {...}` | Definition |
| [fareCalculator.ts:68-82](src/lib/fareCalculator.ts#L68-L82) | `export const calculateFareForVehicle = (...) => {...}` | Definition — internally calls `calculateFare()` once (line 74) to get the unscaled base, then multiplies `.total` |
| [rideStore.ts:280](src/state/rideStore.ts#L280) | `calculateFareForVehicle(vehicle.id, distanceKm, durationMinutes)` | `calculateVehicleFares()` — populates the vehicle-picker preview for all 5 vehicle options |
| [rideStore.ts:327](src/state/rideStore.ts#L327) | `calculateFareForVehicle(state.selectedVehicle, distanceKm, durationMinutes)` | `requestRide()` — fare persisted to the order at booking time |
| [trip.tsx:239](app/(driver)/trip.tsx#L239) | `calculateFareForVehicle(vehicleType, distanceKm, durationMin, waitingMin)` | `handleSliderComplete()` — fare persisted at trip completion |

**Finding: zero remaining external call sites of `calculateFare()`.** The
only place `calculateFare()` is invoked anywhere in the app is
`fareCalculator.ts` line 74, internally, by `calculateFareForVehicle()`
itself. Every screen/store that needs a fare now goes through
`calculateFareForVehicle()`. This confirms the two fixes made earlier this
session closed every known gap — there is currently no live code path that
silently drops the vehicle multiplier.

---

## 2. Duplicate pricing logic search

Searched for re-implementations of the rate constants
(`PRICING_RATES`/`BASE_FARE`/`PER_KM`/`PER_MINUTE`/`MIN_FARE`/
`VEHICLE_FARE_MULTIPLIERS`) and for inline arithmetic shaped like the formula
(`distanceKm * n`, `durationMinutes * n`) anywhere outside
`fareCalculator.ts`.

### 2.1 — App layer (TypeScript): clean
- `PRICING_RATES` and `VEHICLE_FARE_MULTIPLIERS` are defined exactly once,
  in `fareCalculator.ts`, and referenced nowhere else by value.
- `defaultVehicleOptions` in [rideStore.ts:129-175](src/state/rideStore.ts#L129-L175) contains
  hardcoded `estimatedFare` values (35, 65, 18, 25, 120) — **this is not
  duplicate pricing logic**, it's static seed/mock data shown only until
  `calculateVehicleFares()` overwrites it with a real computed value once
  pickup/destination are set (confirmed by the comment directly above the
  array and by `calculateVehicleFares()`'s effect). Worth knowing about
  because if a screen ever reads `estimatedFare` before that recompute runs,
  it will show stale mock numbers — but it is not a second formula
  implementation.
- `driverWalletStore.ts:119` has a zeroed `breakdown: { baseFare: 0,
  distanceFare: 0, timeFare: 0, waitingFare: 0 }` — a placeholder shape for
  UI display where the wallet ledger table doesn't retain the breakdown, not
  a computed fare value.

### 2.2 — Database layer: a real duplicate exists, currently dormant

Two untracked, unapplied migration files
(`migrations/20260724010642_create-fare-config-table.sql` and
`...010648_create-calculate-fare-function.sql`, both still `??` in `git
status` — not committed, not referenced by any app code; confirmed via grep
that no file in `src/` calls `calculate_fare`, `calculate_fare_breakdown`, or
queries `fare_config`) define:

- `fare_config` table — one row per vehicle type, storing `base_fare`,
  `per_km`, `per_minute`, `per_minute_waiting`, `min_fare` pre-multiplied by
  each vehicle's rate.
- `calculate_fare_breakdown()` / `calculate_fare()` Postgres functions — a
  second, independent implementation of the exact same formula, in SQL
  instead of TypeScript.

A prior audit (`audit_26-07-26_20-26_fare-formula-parity-check.md`) verified
this SQL implementation is mathematically identical to
`calculateFareForVehicle()` for all five vehicle types today. That's good
news for correctness right now, but architecturally **this is precisely the
kind of duplication the brief asks to guard against** — two independent
formula implementations that happen to agree today only because someone
manually kept them in sync. If either side changes rates in the future
without the other, they will silently diverge with no build-time or runtime
signal.

**This is the most important finding of this audit**: even though the app
code itself is now clean (single call path through
`calculateFareForVehicle()`), the repo as a whole already contains a second,
parallel formula implementation waiting to be wired in. The recommendations
in §3 should be read as applying to both layers, not just the TypeScript one.

---

## 3. Recommendations to prevent future misuse of `calculateFare()`

Ordered strongest-to-weakest. None of these have been applied — audit only.

### 3.1 — Strongest: stop exporting `calculateFare` from the module's public surface
Since §1 confirms **no code outside `fareCalculator.ts` calls
`calculateFare()` anymore**, the safest fix is architectural, not
procedural: remove `export` from `calculateFare` (keep it as a
module-private helper) and export only `calculateFareForVehicle`,
`formatCurrency`, `FareComponents`, `VEHICLE_FARE_MULTIPLIERS` (if needed for
display), and `PRICING_RATES` (if still needed elsewhere). If it can't be
imported at all, it can't be accidentally imported wrong — this eliminates
the entire bug class rather than relying on a developer noticing a lint
warning or a code-review comment. This is a one-line change
(`export const` → `const`) with zero current callers to update.

### 3.2 — If `calculateFare` must stay exported (e.g. for unit tests importing it directly): add an ESLint guard
The repo already uses a flat ESLint config
([eslint.config.js](eslint.config.js)) on top of `eslint-config-expo/flat`,
so a `no-restricted-imports` rule is a small addition and needs no new
tooling:

```js
// eslint.config.js
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['src/lib/fareCalculator.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@/lib/fareCalculator',
          importNames: ['calculateFare'],
          message:
            'calculateFare() ignores vehicle class and always prices Economy. ' +
            'Use calculateFareForVehicle(vehicleType, distanceKm, durationMinutes, waitingMinutes) instead.',
        }],
      }],
    },
  },
]);
```
This turns the exact mistake made twice this session into a build-time
lint error with a message that tells the next developer the correct
function to call, instead of a silent runtime bug an audit has to catch
later.

### 3.3 — Naming as a second line of defense
If keeping both exported, renaming the low-level one away from the word
"Fare" reduces the chance of `calculateFare` looking like the obvious/default
choice next to `calculateFareForVehicle` in autocomplete. E.g.
`calculateBaseFareComponents()` or prefixing internal-only helpers with an
underscore convention already implied by the file (`_calculateFare`) signals
"not a public API" without needing tooling.

### 3.4 — TSDoc `@deprecated`/`@internal` annotation
Adding a `/** @internal — use calculateFareForVehicle instead */` JSDoc
comment above `calculateFare` makes most editors (VS Code/TS language
server) show a strikethrough and hover warning on every use site, at zero
build cost. Weaker than 3.1/3.2 since it doesn't fail CI, but nearly free to
add alongside either of them.

### 3.5 — Regression guard against re-introduction
A cheap, framework-agnostic backstop: a `package.json` script (or CI step)
that runs `grep -rn "calculateFare(" --include="*.ts" --include="*.tsx" .
| grep -v "src/lib/fareCalculator.ts"` and fails the build on any match.
This is exactly the check this audit performed by hand — automating it means
the next accidental `calculateFare()` call gets caught in CI instead of in a
pricing audit weeks later.

### 3.6 — Resolve the dormant DB-side duplicate before it goes live (§2.2)
Before `calculate_fare_breakdown()`/`fare_config` are ever wired into a
trigger or RPC call from app code, make an explicit decision about which
implementation is authoritative:
- **Option A (recommended given current architecture):** keep the client
  (`calculateFareForVehicle()`) as the sole source of truth, and drop or
  never apply the SQL migrations — simplest, matches how the app works
  today, and avoids maintaining two formulas.
- **Option B:** migrate to the DB function as the sole source of truth, and
  have the client call it via RPC instead of computing locally — more
  correct from a trust-boundary standpoint (closes the gap noted in
  `audit_26-07-26_20-19_fare-engine-trust-boundary.md`) but is a larger
  change (network round-trip on every fare calculation, breaking change to
  `calculateVehicleFares()`'s synchronous preview).
- Whichever is chosen, the other implementation should be deleted, not kept
  "just in case" — a second formula that isn't the source of truth is a
  liability even if unused today, since someone could wire it in later
  without realizing it's meant to be inert.

---

## 4. Summary

| Check | Result |
|---|---|
| Every `calculateFare()` call site identified | ✅ — 1 definition, 1 internal use (inside `calculateFareForVehicle`), 0 external callers |
| Every `calculateFareForVehicle()` call site identified | ✅ — 3 external callers, all vehicle-aware |
| Duplicate pricing logic in app (TypeScript) code | ✅ None found — `PRICING_RATES`/`VEHICLE_FARE_MULTIPLIERS` defined once |
| Duplicate pricing logic elsewhere in repo | ❌ Found — `migrations/20260724010642_...sql` + `...010648_...sql` reimplement the same formula in SQL, currently unapplied/unwired |
| Type system already prevents missing per-vehicle multipliers | ✅ `VEHICLE_FARE_MULTIPLIERS: Record<VehicleType, number>` forces every vehicle type to have a multiplier at compile time |
| Recommendation to prevent future `calculateFare()` misuse | Stop exporting it (§3.1) + ESLint guard (§3.2) as primary defenses; naming/TSDoc/CI-grep as supporting layers (§3.3–3.5); resolve the dormant SQL duplicate explicitly before it can be wired in (§3.6) |
