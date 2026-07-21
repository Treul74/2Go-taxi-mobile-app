# Audit — Trip Completion Flow (READ-ONLY)

**Date:** 21-07-2026 21:15
**Scope:** `app/(driver)/trip-summary.tsx`, `app/(driver)/trip.tsx`, `src/state/driverStore.ts` (plus call-site search across the repo)
**No code was changed.**

---

## 1. HOOKS ORDER in `trip-summary.tsx`

Every hook call, in order of appearance:

| # | Line | Hook |
|---|------|------|
| 1 | 17 | `useDriverStore()` — the only hook in the component |

```tsx
export default function DriverTripSummaryScreen() {
  const { lastTripSummary, finishTrip } = useDriverStore();   // line 17 — hook
  ...
```

**Is there any early return BEFORE any hook?** **No.** The single hook (`useDriverStore`, line 17) is the first statement in the component body. The early return comes after it.

**Exact early return found (lines 24–27, AFTER the hook):**

```tsx
  if (!lastTripSummary) {
    handleDone();
    return null;
  }
```

Hooks-order verdict: **safe** — with only one hook and the return placed after it, the Rules of Hooks are not violated (hook count is identical on every render path).

⚠️ Side observation (not a hooks-order issue): this early-return branch calls `handleDone()` **during render**, which triggers `finishTrip()` (a Zustand `set`) and `router.replace('/(tabs)')` as render-phase side effects. React expects navigation/state mutations in an effect or event handler, not mid-render. It works in practice as a guard for "arrived here with no summary," but it is a render-phase side effect.

---

## 2. DONE BUTTON in `trip-summary.tsx`

**Exact handler code (lines 19–22):**

```tsx
  const handleDone = () => {
    finishTrip();
    router.replace('/(tabs)');
  };
```

Wired to the button at lines 76–78:

```tsx
        <Button variant="accent" fullWidth onPress={handleDone}>
          Done
        </Button>
```

**What it does exactly:**
1. Calls `finishTrip()` from `driverStore` — resets local trip state only: `currentTrip: null`, `tripStatus: 'idle'`, `tripStartTime: null`, `waitingStartTime: null`, `waitingDuration: 0`, `lastTripSummary: null`.
2. Navigates with `router.replace('/(tabs)')` — replaces the stack entry, landing the driver back on the tab home (which renders `DriverDashboard` for a Transporter).

**Is `goOffline` being called?** **No.** Neither the Done handler nor anything else in `trip-summary.tsx` calls `goOffline`. The file's own doc comment (lines 10–15) states this is intentional:

```tsx
/**
 * Post-trip summary shown to the driver after Slide to Complete Trip
 * succeeds. Reads driverStore.lastTripSummary (set by completeTrip()). Done
 * only navigates home — the driver stays online, and trip state is left
 * as-is (no store resets, no offline calls).
 */
```

(Minor doc drift: the comment says "no store resets," but `finishTrip()` **does** reset the trip-related slice of the store. It does not touch `isOnline`, so the "driver stays online" part is accurate.)

**Navigation after:** `router.replace('/(tabs)')` — a replace, not a push, so the summary screen is removed from the back stack; back-navigation cannot return to it.

---

## 3. TRIP COMPLETION FLOW in `trip.tsx`

**What triggers navigation to `trip-summary.tsx`:** the `RideActionSlider` labelled "Slide to Complete Trip" (lines 376–379) fires `onComplete={handleSliderComplete}`. Inside the handler, navigation happens **only after** `completeTrip(receiptData)` resolves `true` — on failure an alert is shown and the driver stays on the trip screen.

**Exact slide-to-complete handler (lines 231–266):**

```tsx
    const handleSliderComplete = async () => {
        // Prepare final receipt data — the actual distance driven this trip,
        // not the remaining distance to the destination.
        const distanceKm = distanceTraveledRef.current;
        const durationMin = Math.ceil(elapsedTime / 60);
        const waitingMin = Math.ceil(waitingDuration / 60);

        const fareData = calculateFare(distanceKm, durationMin, waitingMin);

        const receiptData = {
            tripId: currentTrip.id,
            passengerName: currentTrip.passengerName,
            pickupAddress: currentTrip.pickup.address,
            destinationAddress: currentTrip.destination.address,
            distance: distanceKm,
            duration: durationMin,
            waitingDuration: waitingMin,
            totalFare: fareData.total,
            breakdown: {
                baseFare: fareData.baseFare,
                distanceFare: fareData.distanceFare,
                timeFare: fareData.timeFare,
                waitingFare: fareData.waitingFare,
            }
        };

        const success = await completeTrip(receiptData);
        if (!success) {
            Alert.alert('Error', 'Could not complete the trip. Please check your connection and try again.');
            return;
        }

        // currentTrip stays set until finishTrip() (called from the summary
        // screen) so this navigation doesn't race the "no active trip" redirect.
        router.replace('/(driver)/trip-summary');
    };
```

Related guard in the same file — `trip.tsx` redirects home when `currentTrip` is null (lines 221–229):

```tsx
    // Redirect if no active trip
    useEffect(() => {
        if (!currentTrip) {
            router.replace('/(tabs)');
        }
    }, [currentTrip]);

    if (!currentTrip) {
        return null;
    }
```

This is why `completeTrip()` deliberately leaves `currentTrip` set on success (see §4/§5) — clearing it before navigating would race this redirect and could bounce the driver to `/(tabs)` instead of the summary.

---

## 4. GOOFFLINE in `driverStore.ts`

**Exact function code (lines 201–228, including its comment):**

```ts
  // Slide left -> go offline: persists driver_status first, same
  // confirm-before-UI-change contract as goOnline, then tears down the
  // pending-orders poll and expiry timer.
  goOffline: async (driverId) => {
    try {
      const errorMessage = await setDriverStatus(driverId, 'offline');
      if (errorMessage) {
        console.error('Failed to go offline:', errorMessage);
        return false;
      }

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (expiryInterval) {
        clearInterval(expiryInterval);
        expiryInterval = null;
      }
      set({ isOnline: false, vehicleType: null, incomingRequests: [], isRequestsLoading: false });

      return true;
    } catch (error) {
      console.error('Failed to go offline:', error)
      // do not rethrow — caller should not crash
      return false;
    }
  },
```

**Wrapped in try/catch?** **Yes** — the entire body. Errors are logged and swallowed (`return false`), never rethrown.

**InsForge call it makes:** `setDriverStatus(driverId, 'offline')` from `src/services/accounts.ts:108`, which performs:

```ts
  const { error } = await insforge.database
    .from('drivers')
    .update({ driver_status: status })   // status = 'offline'
    .eq('id', driverId);
```

i.e. `UPDATE drivers SET driver_status = 'offline' WHERE id = <driverId>`. On failure it returns the error message string; `goOffline` then returns `false` without changing local state.

**All `goOffline` call sites in the codebase (Grep, whole repo):**

| Location | Context |
|---|---|
| `src/state/driverStore.ts:65` | Interface declaration |
| `src/state/driverStore.ts:204` | Implementation |
| `src/features/driver/DriverDashboard.tsx:169` | Unmount cleanup effect — if still online when the dashboard unmounts, calls `useDriverStore.getState().goOffline(id)` |
| `src/features/driver/DriverDashboard.tsx:182` | `handleToggleOnline` — the slide-to-go-offline toggle: `await goOffline(driverAccount.id)`, alert on failure |
| `migrations/20260710221046_tighten-driver-status-remove-idle.sql:2` | Comment only (documents that app code writes only 'online'/'offline') |

**`goOffline` is never called anywhere in the trip completion flow** — not in `trip.tsx`, not in `trip-summary.tsx`, not in `completeTrip()`/`finishTrip()`.

---

## 5. DRIVER STATUS after trip

(The prompt cut off mid-sentence; answered as "what is the driver's status after the trip completes.")

After Slide to Complete Trip → summary → Done, the driver **remains online**, by design:

- **Backend (`drivers.driver_status`):** stays `'online'`. `completeOrderTrip()` updates the **order** (status `'completed'` + final fare; `completed_at` and the wallet ledger are server-side per the comment at `driverStore.ts:389-394`), but nothing in the completion path touches `drivers.driver_status`. The only writers of `'offline'` are the dashboard toggle and the dashboard unmount cleanup.
- **Local store after `completeTrip()` succeeds:** `tripStatus: 'completed'`, `lastTripSummary` populated, `currentTrip` **deliberately left set** (comment at lines 392–394) so trip.tsx's navigation to the summary doesn't race its own no-active-trip redirect. `isOnline` remains `true`; the pending-orders poll (`pollInterval`) and request-expiry timer keep running throughout the trip and after it.
- **Local store after Done (`finishTrip()`):** `currentTrip: null`, `tripStatus: 'idle'`, timers/durations zeroed, `lastTripSummary: null`. `isOnline`, `vehicleType`, `stats`, and location state are untouched.
- **Net effect:** the driver lands back on DriverDashboard still online and immediately eligible for new incoming requests (the poll was never stopped). Since `finishTrip()` runs while the driver is on `/(tabs)` (or navigating there), and DriverDashboard has not unmounted-while-online, the unmount `goOffline` at `DriverDashboard.tsx:169` is not triggered by this flow.

**Consistency check:** local state and backend agree at every step of the happy path. One edge worth knowing: if `completeTrip()` succeeds but the driver never presses Done and instead kills the app, `drivers.driver_status` remains `'online'` in InsForge with no client alive — there is no server-side staleness sweep visible in this audit's scope.

---

## Summary of findings

1. **No hooks-order violation** in `trip-summary.tsx` — one hook, early return after it. However, the `!lastTripSummary` guard performs navigation + store reset **during render** (render-phase side effect).
2. **Done** = `finishTrip()` (local trip-state reset only) + `router.replace('/(tabs)')`. **`goOffline` is not called** — intentional per the file's doc comment. The comment's "no store resets" phrasing is slightly stale.
3. Navigation to the summary happens only after `completeTrip()` confirms the backend write; `currentTrip` is intentionally kept set until Done to avoid racing trip.tsx's no-trip redirect — the two files' comments corroborate each other.
4. `goOffline` is fully try/catch-wrapped, persists `driver_status='offline'` via `setDriverStatus` → `insforge.database.from('drivers').update(...)`, confirms before mutating UI state, and is only called from DriverDashboard (toggle + unmount cleanup).
5. After a completed trip the driver **stays online** locally and in InsForge; the polling loop keeps running, so new requests can arrive immediately.
