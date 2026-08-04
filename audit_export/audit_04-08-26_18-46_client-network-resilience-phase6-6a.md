# Phase 6.6A — Client Network Resilience: Implementation Report

**Date:** 2026-08-04
**Scope:** Client-side network retry resilience only.
`CameraController`, `AutoFitEngine`, `NavigationStore`, `NavigationProvider`,
`GPSManager`, `RouteEngine` were not modified — verified below.

Builds directly on the findings in
`audit_export/audit_04-08-26_07-37_insforge-start-trip-timeout.md`: the
InsForge SDK does not retry its own client-side 30s `AbortController`
timeout, and none of this app's InsForge service functions throw on
failure — `postgrest-js`'s `PostgrestBuilder.then()` (used internally by the
InsForge SDK's `.database` client) catches every rejected fetch and resolves
it to `{ data: null, error: { message, details, hint, code } }` instead,
unless `.throwOnError()` is called (it never is in this codebase). So a
transient failure was a hard, unrecoverable dead end with a single generic
alert.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/lib/withRetry.ts` (new) | Generic, reusable retry helper with exponential backoff + transient-failure classifier |
| `src/state/driverStore.ts` | `beginTrip()` wraps its `startOrderTrip()` call in `withRetry`; added `startTripRetry` state field |
| `app/(driver)/navigation.tsx` | Reads `startTripRetry` from `driverStore`; renders a "Network connection interrupted. Retrying... Attempt N of M" banner above the "Slide to Start Trip" slider while a retry is in flight |

No other files were touched. `git diff` confirms the `driverStore.ts` change
is exactly the `beginTrip()` wrapping shown below (25 lines), and the
`navigation.tsx` change is exactly the `startTripRetry` destructure + the new
conditional banner block — the rest of that file's diff predates this phase
(it was already modified on disk before this task started, per the
session's initial `git status`).

`grep` confirms zero references to `CameraController`, `AutoFitEngine`,
`NavigationStore`, `NavigationProvider`, `GPSManager`, or `RouteEngine`
inside `withRetry.ts`, and no changes to any file under
`src/navigation/NavigationEngine/`.

---

## 2. Retry helper

`src/lib/withRetry.ts` — generic, promise-based, reusable across any InsForge
call:

```ts
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions<T> = {}
): Promise<T>
```

- **`maxRetries`** (default `2`) → 3 total attempts. Configurable per call site.
- **Exponential backoff**: `min(baseDelayMs * 2^(attempt-1), maxDelayMs)` →
  defaults `500ms`, `1000ms` (capped at `4000ms`).
- **Two failure shapes handled**, because this codebase's InsForge service
  functions resolve to `{ ..., errorMessage }` rather than throwing:
  - **Thrown errors** — classified internally (`AbortError` name, or message
    matching the transient pattern).
  - **Resolved "error-as-value" results** — the caller supplies
    `isRetryable(result)`; only retried if it returns `true`.
- **Transient-failure classifier** (`isTransientFailureMessage` /
  `isTransientError`) matches exactly the cases named in the task —
  `REQUEST_TIMEOUT` (matches "timed out"), `ECONNRESET`, `socket hang up`,
  `network unavailable/unreachable`, `AbortError`, plus `network request
  failed` / `failed to fetch` (the SDK's own generic network-failure
  wrapper). Everything else — 401/403/404, RLS denials, validation errors,
  "this ride was already taken" style business failures — does **not** match
  and is returned/thrown immediately on the first attempt, no retry.
- **Dev-only logging** via the existing `__DEV__` global (same convention
  already used in `CameraController.ts`, `NavigationProvider.tsx`,
  `AccountScreen.tsx`, `ErrorBoundary.tsx`) — every attempt and every retry
  decision is logged, never in production.
- **`onRetry` callback** — fires before each retry with
  `{ attempt, maxAttempts, delayMs, reason }`, used to drive the UI banner.

---

## 3. Retry timeline (from an actual run of the helper, see §4)

Simulated a flaky `startOrderTrip`-shaped function that fails transiently
twice, then succeeds:

```
Trip Start
Attempt 1 of 3
  -> InsForgeError: Request timed out after 30000ms   [T+0ms]
  -> transient, retrying in 500ms
Attempt 2 of 3                                         [T+500ms]
  -> InsForgeError: Request timed out after 30000ms
  -> transient, retrying in 1000ms
Attempt 3 of 3                                         [T+1500ms]
  -> Success                                           [T+1520ms]
```

3 total calls made, exactly matching `maxRetries: 2` (default). No 4th call
after success. UI banner shown during the two backoff windows:
`Attempt 2 of 3`, then `Attempt 3 of 3`.

For an always-failing transient case, the same 3 attempts run, then the
helper gives up and returns the last (still-failing) result — `beginTrip()`
sees a non-null `errorMessage`, returns `false`, and `navigation.tsx` shows
the existing `Alert.alert('Error', 'Could not start the trip. Please try
again.')` exactly as before, only after all 3 attempts are exhausted.

---

## 4. Validation report

Live device/app testing wasn't possible in this environment (no attached
driver device with an active accepted trip and a way to inject a real 30s
InsForge timeout on demand). Verified instead with:

**a) TypeScript** — `npx tsc --noEmit -p tsconfig.json`: **zero errors.**

**b) ESLint** — `npx eslint src/lib/withRetry.ts src/state/driverStore.ts
"app/(driver)/navigation.tsx"`: **zero errors**, 9 pre-existing warnings in
`navigation.tsx` (missing hook deps, unused vars) — none introduced by this
change, none touching lines this phase modified.

**c) Functional simulation** — ran `withRetry` directly (via `tsx`, no
mocking framework needed) against 4 scenarios matching the exact shape
`startOrderTrip()` / `beginTrip()` use:

| Scenario | Result |
|---|---|
| Transient failure twice, then success | ✅ Recovers automatically — 3 calls, final `errorMessage: null`, retry events reported at attempt 2/3 and 3/3 |
| Permanent business failure ("ride already taken") | ✅ **Not retried** — exactly 1 call, immediate failure |
| Always-transient (exhausted) | ✅ 3 calls total, then gives up and surfaces the final failure — no infinite retry |
| Thrown `AbortError`, recovers on 2nd attempt | ✅ 2 calls, recovers |

Checklist against the task's own validation criteria:

| Criterion | Status |
|---|---|
| One transient timeout recovers automatically | ✅ Simulated (scenario 1) |
| Successful retry starts the trip | ✅ `beginTrip()`'s post-`withRetry` logic (push notification, `tripStatus: 'in_progress'`) is unchanged and only runs when `errorMessage` is null, regardless of which attempt produced it |
| Permanent failures still show an error | ✅ Simulated (scenario 2) — non-transient messages never retry |
| Business logic unchanged | ✅ `startOrderTrip()` itself untouched; RLS transition, push notification, and `set()` calls in `beginTrip()` are byte-identical to before, just re-indented around the new wrapper |
| No duplicate requests after success | ✅ Simulated — call count stops exactly at the success attempt in all scenarios |
| No camera regressions | ✅ Zero references to any of the six excluded engine files in the diff |
| TypeScript clean | ✅ `tsc --noEmit` zero errors |

**Not verified (flagged, not silently assumed):** the actual React Native
UI render of the new banner (`bg-warning/10` / `text-warning`, matching the
existing `Pill.tsx` warning-variant convention) was not visually confirmed
in a running app — no dev server/simulator session was started for this
phase. Recommend a quick manual pass (kill Wi-Fi mid-"Slide to Start Trip"
on a device with the app running) before shipping.

---

## 5. Remaining backend issues (unchanged from the prior audit)

The retry helper mitigates the *symptom* — a driver no longer loses the
whole trip-start to one bad connection — but does not fix the *cause*. Per
the prior audit, InsForge's own gateway was observed logging `PostgREST
request failed, retrying (attempt 1/3) socket hang up` / `ECONNRESET`
roughly once every 30 seconds against this project, independent of query
shape or load (CPU 1–10%, DB connections 23/60, no locks, no slow queries).
That is a platform-side connection-pool/keep-alive issue between InsForge's
gateway and its PostgREST instance, not something fixable from this repo.
Recommended next step (still not taken, per the prior audit's own
recommendation): file it with `npx @insforge/cli feedback --type bug
--component backend ...`.

3 retries at 500ms/1000ms backoff (≈1.5–3s worst case before the 3rd
attempt even starts) comfortably rides out a single ~30s-hang-adjacent
hiccup happening "once every 30s" on average, but does not guarantee
recovery if the driver is unlucky enough to hit the instability on all 3
attempts in a row.

---

## 6. Readiness score

**7.5 / 10** — logic is verified correct and isolated (TypeScript clean,
lint clean, 4/4 simulated scenarios pass, zero engine-file involvement), and
directly addresses the exact failure mode the prior audit identified. Held
back from higher only by: (a) no live on-device network-kill test yet, and
(b) the underlying platform instability is still unresolved upstream — this
phase reduces the blast radius of that instability, it doesn't eliminate it.
