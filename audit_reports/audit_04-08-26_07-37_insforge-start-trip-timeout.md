# Audit: InsForge Start Trip Timeout — Execution Trace

**Date:** 2026-08-04
**Scope:** Read-only execution trace. No code, RLS, triggers, or navigation
engine files were modified. `CameraController`, `AutoFitEngine`,
`NavigationStore`, `NavigationProvider`, `GPSManager` were not touched.

**Symptom:** Driver slides "Start Trip" and the app throws:

```
InsForgeError: Request timed out after 30000ms
```

---

## 1. Exact file / function chain

```
app/(driver)/navigation.tsx  handleStartRide()          (line 205)
  -> driverStore.beginTrip()                              src/state/driverStore.ts:376
       -> startOrderTrip(currentTrip.id)                  src/services/driverOrders.ts:170
            -> insforge.database.from('orders')
                 .update({ status: 'in_progress', trip_started_at })
                 .eq('id', orderId)
                 .eq('status', 'accepted')
                 .select('id, customers(push_token)')
                 .single()
                 -> @insforge/sdk HttpClient.handleRequest()  node_modules/@insforge/sdk/dist/index.mjs:519
                      -> fetch(PATCH /api/database/records/orders, { signal: AbortController })
```

`insforge` client is instantiated once in `src/lib/insforge.ts` with
`isServerMode: true` and no explicit `timeout` option, so the SDK falls back
to its own default:

```js
// node_modules/@insforge/sdk/dist/index.mjs:357
this.timeout = config.timeout ?? 3e4;   // 30000ms
```

```js
// node_modules/@insforge/sdk/dist/index.mjs:437-487
if (this.timeout > 0 || callerSignal) {
  controller = new AbortController();
  if (this.timeout > 0) timer = setTimeout(() => controller.abort(), this.timeout);
  ...
}
...
catch (err) {
  if (err?.name === "AbortError") {
    if (controller && controller.signal.aborted && this.timeout > 0 && !callerSignal?.aborted) {
      throw new InsForgeError(`Request timed out after ${this.timeout}ms`, 408, "REQUEST_TIMEOUT");
    }
  }
}
```

This confirms the error string exactly: the SDK **did dispatch a real network
request** (`fetch()` was called — the AbortError branch only fires once a
`fetch()` is in flight), waited 30000ms with no response, and the
`AbortController` cancelled it. This is not a client-side query-building bug
or an infinite loop before the network call — it's a genuine "request sent,
no response came back in time."

---

## 2. Timestamps per await (`beginTrip`)

Based on `src/state/driverStore.ts:376-400`, the only two awaited operations are:

```
[T+0ms]      beginTrip() entered, currentTrip read from store
[T+~5ms]     await startOrderTrip(currentTrip.id)  <-- stalls here
[T+30000ms]  InsForgeError: Request timed out after 30000ms  (thrown inside startOrderTrip's insforge call)
```

`startOrderTrip` (`src/services/driverOrders.ts:170-185`) has exactly one
`await` — the InsForge PATCH — and it never resolves within the window. The
`sendPushNotification()` call after it, and the `set({ tripStatus:
'in_progress', ... })` that follows, are never reached; `handleStartRide`
(`app/(driver)/navigation.tsx:205-216`) never sees `success === true`, so
`navigation.startTrip()` and `router.push('/(driver)/trip')` never fire —
this is why `NavigationStore` never transitions to `TRIP_IN_PROGRESS`. The
navigation engine is not broken; it simply never receives the signal because
the promise chain upstream of it never completes.

---

## 3. Endpoint / request

- **Method:** `PATCH`
- **Path:** `/api/database/records/orders` (InsForge's PostgREST-compatible
  layer — `insforge.database.from(table)` resolves to
  `this.postgrest.from(table)`, `node_modules/@insforge/sdk/dist/index.mjs:1479-1480`)
- **Query params:** `id=eq.<orderId>&status=eq.accepted&select=id,customers(push_token)`
- **Body:** `{ "status": "in_progress", "trip_started_at": "<ISO8601>" }`
- **Headers:** bearer token from `TokenManager` (session persisted via
  `authStore`/AsyncStorage, `isServerMode: true` mode), `Prefer:
  return=representation` (implied by `.select().single()`)
- **Client timeout:** 30000ms, no override anywhere in the codebase (`grep`
  for `timeout` in `src/lib/insforge.ts` and all `startOrderTrip`/`beginTrip`
  call sites returns nothing)
- **Retry policy (client SDK):** none surfaced to the caller on timeout —
  `retryCount` only applies to retryable HTTP statuses (5xx) returned by a
  completed response, not to a hung/no-response socket.

---

## 4. Backend inspection (live, via `insforge-debug`)

Live checks against the `2go_Taxi` project
(`https://83qckwdx.eu-central.insforge.app`):

| Check | Result |
|---|---|
| `diagnose db --check locks` | `[]` — no locks held |
| `diagnose db --check slow-queries` | `[]` — nothing in `pg_stat_statements` |
| `diagnose db --check connections` | `23 / 60` active — healthy headroom |
| `diagnose metrics --range 1h` | CPU 1–10%, no spike — not resource-starved |
| `db policies` (orders, customers) | All four relevant policies present and correct: `drivers_update_active_orders` (USING/CHECK `driver_id = current_driver_id() AND status IN ('accepted','in_progress')`) permits the `accepted -> in_progress` transition; `drivers_select_order_customer` on `customers` permits the embedded `customers(push_token)` read for the driver on their own order, with no status restriction |
| `logs postgres.logs` | Routine checkpoints + a `cron job 4` running every 60s (order-expiry sweep) — nothing anomalous |
| `logs insforge.logs` (gateway, 1000-entry window, ~11.5 min) | See below |

**This rules out the row-lock / trigger-contention hypothesis** I initially
formed from the static trace (the `AFTER UPDATE` `notify_order_update()` →
`realtime.publish()` trigger on `orders`, combined with the unawaited 5s
telemetry ping in `src/hooks/useDriverTelemetryPing.ts`). Real `PATCH
/orders` requests were observed completing in 80–380ms end-to-end
(`2026-08-04T05:22:01.117Z PATCH /orders 200 2 312ms`, and similar every ~60s
throughout the window), going through the exact same trigger. The trigger
path is fast; it is not the bottleneck. Flagging this so it isn't
mis-remembered as the cause in a future pass.

### The actual signal: gateway ↔ PostgREST connection instability

`insforge.logs` for the same window contains **21 occurrences in ~11.5
minutes** (roughly one every 30s) of:

```
warn - PostgREST request failed, retrying (attempt 1/3) socket hang up
warn - PostgREST request failed, retrying (attempt 1/3) read ECONNRESET
```

Example lines:

```
2026-08-04T05:21:36.225Z warn - PostgREST request failed, retrying (attempt 1/3) socket hang up
2026-08-04T05:23:21.459Z warn - PostgREST request failed, retrying (attempt 1/3) socket hang up
2026-08-04T05:23:21.662Z warn - PostgREST request failed, retrying (attempt 1/3) socket hang up
2026-08-04T05:26:37.156Z warn - PostgREST request failed, retrying (attempt 1/3) read ECONNRESET
2026-08-04T05:27:07.329Z warn - PostgREST request failed, retrying (attempt 1/3) socket hang up
```

This is the InsForge API gateway's *own* internal HTTP client — the one it
uses to forward a request to its PostgREST instance — failing with a dropped
connection and silently retrying. CPU/memory are low, so this isn't a
resource-starvation crash loop; the pattern (constant low-level rate,
independent of request type — GETs and PATCHes both affected) is consistent
with a stale/reused keep-alive socket in the gateway's connection pool to
PostgREST (PostgREST or an intermediate proxy closing idle connections that
the gateway still tries to reuse).

Under normal conditions the gateway's retry (up to 3 attempts) absorbs this
transparently — which is exactly what was observed: every `PATCH /orders` in
this window that we *can* see (a scheduled job hitting the endpoint every
~60s) still completed in under 400ms despite the surrounding hang-up noise.
But this means **every** request to `/api/database/records/*`, including the
driver's `startOrderTrip` PATCH, carries a background risk of hitting one of
these socket failures. If a request is unlucky enough to hit a hang-up on
more than one retry attempt in sequence, or the reconnect cycle stalls
instead of failing fast, the cumulative wait can exceed the client's 30s
budget — surfacing to the app as exactly the observed `InsForgeError:
Request timed out after 30000ms`, with **no corresponding successful or
failed request ever logged**, because the gateway itself never got a usable
response from PostgREST to relay back.

This also explains a secondary observation: no `PATCH /orders` from an
`okhttp`-tagged client (the mobile app's own network stack) appears anywhere
in the fetched log window — only a scheduled job (`user-agent
Deno/2.8.2+abab4aa`, ~60s cadence) and `GET` polling traffic. The driver's
own start-trip attempt(s) are not visible in the gateway's completed-request
log at all, consistent with the request having stalled inside the
gateway↔PostgREST hop and never producing a loggable outcome.

---

## 5. Response

**No response was ever returned to the client** for the `startOrderTrip`
PATCH. The client's own `AbortController` fired at exactly 30000ms and
raised `InsForgeError` locally — this is a client-side abort of a still-open
request, not a server-returned error. Backend-side, there is no matching
completed or failed request in `insforge.logs`/`postgREST.logs` for a
driver-originated `PATCH /orders` in the inspected window, which is
consistent with the request having been swallowed by a
gateway→PostgREST `socket hang up` and never surfaced as a completed
transaction on either side.

---

## 6. Root cause

**Primary:** Intermittent connection instability between the InsForge API
gateway and its PostgREST layer (`socket hang up` / `ECONNRESET`, observed
at roughly 1 occurrence per 30 seconds across all query types in this
project). This is platform/infrastructure-level, not a defect in
`beginTrip()`, `startOrderTrip()`, the RLS policies, or the `orders`
realtime trigger — all of which were verified live and are correctly
configured and fast (80–380ms) when a request completes normally.

**Contributing factor (client-side):** The InsForge SDK client
(`src/lib/insforge.ts`) is configured with no request timeout override, no
manual retry-on-timeout, and no AbortSignal exposed to the caller. A single
unlucky socket-hangup sequence on the gateway side has no mitigation on the
app side — `beginTrip()` has exactly one shot at the 30s window and no retry
path, so when the gateway-level flakiness lands on this particular request,
the driver is stuck with a hard failure and an unhelpful generic alert
(`Alert.alert('Error', 'Could not start the trip. Please try again.')` in
`app/(driver)/navigation.tsx:214`) rather than an automatic retry that would
likely succeed given how transient these hang-ups are.

**Ruled out:**
- Row-level locking / lock contention on the `orders` row — confirmed empty
  via `diagnose db --check locks`.
- Slow query / missing index — confirmed empty via `diagnose db --check
  slow-queries`; DB connections healthy (23/60).
- RLS denial on the write or on the embedded `customers(push_token)` select
  — both policies verified present and correctly scoped for this exact
  transition.
- The `order_realtime_trigger` (`notify_order_update()` /
  `realtime.publish()`) being inherently slow — the exact same trigger fires
  on every observed successful `PATCH /orders` in the log window, completing
  in under 400ms.
- CPU/memory exhaustion on the backend instance — metrics flat at 1–10% CPU
  through the window.

---

## 7. Minimal fix (not implemented — audit only)

Two independent, additive changes, neither of which touches the navigation
engine:

1. **Client resilience** in `src/services/driverOrders.ts` /
   `src/state/driverStore.ts`: wrap `startOrderTrip` (and ideally
   `acceptOrder`, `markDriverArrived`, `completeOrderTrip` — same pattern) in
   a short bounded retry (e.g. 1–2 retries with a short backoff) specifically
   for the timeout/network-failure case, since the evidence shows these
   backend hang-ups are transient and a same-request retry would very likely
   succeed within a second or two.
2. **Backend**: report the recurring `PostgREST request failed, retrying
   (attempt 1/3) socket hang up` / `ECONNRESET` pattern to InsForge as a
   platform issue (`npx @insforge/cli feedback --type bug --component
   backend ...`) — this is outside app code and not something fixable from
   this repo.

No change to `beginTrip()`'s business logic, the RLS policies, or the
`orders` trigger is needed — all three are confirmed correct.
