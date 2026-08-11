# Phase 9E — Navigation Engine Production Readiness Audit

**Date:** 2026-08-07
**Type:** Read-only architecture + production-readiness audit. No code modified — every claim below was produced fresh by `Read`/`Grep`/`Glob`/`tsc` in this pass, not carried forward from any prior report's own conclusions.
**Read first:** `AGENTS.md` (🔒 Protected Features), `2GO Navigation Engine Bible.md`.
**Scope:** the complete arc from Phase 7 (engine build) through Phase 9D (camera runtime cleanup) — twelve source files touched across nine migration/cleanup phases (`audit_07-08-26_19-37` through `audit_07-08-26_22-50`), all re-verified here as a single point-in-time snapshot rather than a chained summary.

---

## 1. Methodology

Every "one owner" claim below was re-derived with fresh repo-wide greps in this pass, cross-checked against `Glob` for file-count and a full `npx tsc --noEmit` run — not assumed from the phase reports that produced each change. Where this pass's own finding matches a prior report, it's stated as confirmed, not cited as truth-by-repetition.

---

## 2. Final architecture diagram

```
                         app/_layout.tsx (root, mounted once)
                              │
                    <NavigationProvider>  ── the ONE mount point
                              │
        ┌─────────────────────┼──────────────────────────┐
        │                     │                            │
        ▼                     ▼                            ▼
 userStore.role      GPSManager.onFix/          navigationEventBus
 ('passenger'/       onStatusChange              (MODE_CHANGED /
  'driver')          (the ONE GPS watcher,        TRANSITION_REJECTED,
        │            owned by GPSManager.ts —      dev-mode logging)
        ▼            zero other subscriptions
 NavigationStore      anywhere in the app)
   .actor
 ('customer'/                │
  'transporter')              ▼
        │             NavigationProvider.applyFixForActor(fix)
        └──────────────────────┤
                    ┌───────────┴────────────┐
                    ▼                          ▼
          actor==='transporter'      actor==='customer'
          (existing pipeline,         setCustomerGpsFix(fix)
           byte-identical              — no route-progress,
           since Phase 7):             no reroute check
           • route active?                     │
             → applyGpsFixWithProgress          ▼
           • no route? → setGpsFix       NavigationStore
           • route+pos → checkAndReroute   .customerLocation
                    │                     (no consumer yet —
                    ▼                      see §9, item 1)
          NavigationStore
    .driverLocation/heading/speed/route/progress
                    │
                    ▼
        ┌─────────────────────────── NavigationStore (Zustand, ONE instance) ───────────────────────────┐
        │ mode · actor · cameraState · route · driverLocation · customerLocation · heading · speed ·     │
        │ pickup · destination · etaSeconds · distanceRemainingMeters · gpsState · followMode · ...       │
        └───────────────┬───────────────────────────────┬────────────────────────┬─────────────────────┘
                         │                               │                         │
                         ▼                               ▼                         ▼
              CameraController.ts                NavigationHooks.ts        useNavigation.ts
              (subscribes to store,               (granular selectors       (NavigationActions:
               owns the ONE mapHandle              for UI components)        preview/requestMatch/
               singleton + the ONE                                            driverToPickup/
               applyPose()/recompute()                                        arrivedAtPickup/...)
               native animateCamera                                                  │
               call site for it)                                                     ▼
                         │                                                    Screens call
                         ▼                                                    navigation.X() —
              attachMap()/detachMap()                                         never touch the
              (NavigationMap.tsx,                                             store or camera
               PassengerHome.tsx —                                            directly
               both correctly unwrap
               {duration} before calling
               Map's exposed ref, fixed
               Phase 9D)
                         │
                         ▼
              <NavigationMap/> or PassengerHome's
              own raw <Map> (attached manually)
                         │
                         ▼
              src/components/map/Map.native.tsx / Map.web.tsx
              (react-native-maps / @react-google-maps/api;
               MarkerAnimator literally drives the web driver
               marker via useAnimatedMarkerWeb; native uses an
               equivalent, separate Reanimated implementation)

═══════════════════════ Screens — every one now either fully on the engine or a documented, reasoned exception ═══

  app/(driver)/navigation.tsx        ──▶ FULLY MIGRATED (unchanged since Phase 7)
  app/(driver)/trip.tsx              ──▶ FULLY MIGRATED (unchanged since Phase 7)
  src/features/driver/DriverDashboard.tsx ──▶ FULLY MIGRATED (Phase 9A — was the last driver camera-ownership gap)

  app/(customer)/trip.tsx            ──▶ FULLY MIGRATED (Phase 8A.1)
  RidePlannerSheet.tsx (Preview)     ──▶ FULLY MIGRATED (Phase 8B)
  PassengerHome.tsx (Preview/Matching)──▶ FULLY MIGRATED for those two modes (Phase 8B); raw <Map> internal
                                          fallback still governs IDLE/active by design (no CameraProfile there)
  MapPickerModal.native.tsx          ──▶ camera call migrated (Phase 8C); map deliberately NOT
                                          attachMap()-registered — a reasoned exception, not a gap
  app/(tabs)/navigate.tsx            ──▶ sanctioned dev/testing exception (AGENTS.md), unchanged since Phase 3.5
```

---

## 3. Per-subsystem audit

### 3.1 GPS

**One owner: `GPSManager.ts`.** Fresh grep for `watchPositionAsync`/`getCurrentPositionAsync`/`startLocationUpdatesAsync`/`stopLocationUpdatesAsync`/`TaskManager.defineTask` returns exactly four files: `GPSManager.ts` itself, and three files whose only matches are comments naming the banned APIs (`NavigationProvider.tsx`, `hooks/useNavigation.ts`, `src/hooks/useCurrentLocation.ts` — each re-read to confirm no call exists). `GPSManager.ts` itself was never edited in this entire arc — zero diff lines across nine phases. Phase 9B added actor-aware *routing* of fixes at the consumer end (`NavigationProvider`), not a second producer.

### 3.2 Camera

**One owner: `CameraController.ts`.** Fresh grep for `.animateCamera(`/`.animateToRegion(`/`.fitToCoordinates(` returns exactly three files: `CameraController.ts` (expected), `Map.native.tsx`'s own internal fallback effects (gated behind `disableInternalCamera`, the only camera implementation for `IDLE`/`OFFLINE`/states `CAMERA_PROFILES` has no opinion on, by design), and `app/(tabs)/navigate.tsx` (sanctioned exception). This is down from four at the Phase 8D snapshot — `DriverDashboard.tsx`'s direct `animateToRegion` call (the last screen-owned camera call in the app) was eliminated in Phase 9A. Phase 9D additionally fixed a real bug (two adapter files silently double-wrapping the animation duration before it reached the native call) and consolidated two diverging "apply a pose + record bookkeeping" code paths (`recompute()`, `recenterOnLocation()`) into one shared function, `applyPose`.

### 3.3 Route

**One owner: `RouteEngine.ts`.** Fresh grep for the raw `getDirections(`/`getAllRoutes(` wrapper returns exactly two files: `mapsApi.ts` (the wrapper's own definition) and `RouteEngine.ts` (its sole caller). Every screen-level fetch — both driver screens, `RidePlannerSheet.tsx`, `app/(tabs)/navigate.tsx` — goes through `RouteEngine.fetchRoute()`. `RouteEngine.ts` itself was never edited in this arc.

### 3.4 NavigationStore

**One instance: exactly one `create<NavigationStore>` call**, in `NavigationStore.ts` (confirmed via grep — zero other files construct a competing store). Grew additively across the arc: `setDriverLocation`/`setActor`/`setCustomerGpsFix` (Phases 8A.1, 9B) — all new *actions* on the existing single store, not new stores or parallel state. `customerLocation` now has a real producer (Phase 9B) but still zero consumers anywhere in `app/` (confirmed by a fresh grep for `useCustomerLocation()` under `app/` — zero hits) — see §9.

### 3.5 NavigationProvider

**Mounted exactly once**, at `app/_layout.tsx` (confirmed by grep — the only `<NavigationProvider>` JSX instantiation in the repo). Still owns exactly the same two engine-wide singletons it always has (the GPS listener, the event bus's dev-mode logger) plus, since Phase 9B, the `userStore.role → NavigationState.actor` mapping — explicitly the "integration boundary" role `types.ts`'s own `NavigationActor` doc comment had already designated for it, not a new architectural direction.

### 3.6 NavigationHUD

**One file: `NavigationHUD.tsx`** (confirmed via `Glob`). Phase 9C evaluated, in detail, whether any of the three screens still composing individual HUD widgets by hand (`navigation.tsx`, `trip.tsx`, `app/(customer)/trip.tsx`) could adopt the composite, and concluded none can without changing real behavior — each has screen-specific chrome (an animated bottom card, a `navigationEnabled` visibility gate, or a deliberately narrower widget subset) the composite's fixed, non-configurable layout cannot express. This is a genuine, documented **usage** gap (zero screens render `<NavigationHUD/>`), not a duplication problem — every screen using HUD pieces at all uses the *same* shared widget components underneath, confirmed by re-reading all three screens.

### 3.7 MarkerAnimator

**One file: `MarkerAnimator.ts`.** Phase 8D corrected a standing error in every prior audit ("zero consumers"): `src/components/map/Map.web.tsx` has genuinely consumed it (via `useAnimatedMarkerWeb.ts`, driving the web platform's driver marker) since the original engine-implementation commit, predating every audit in this lineage. The native platform still uses the pre-existing, behaviorally-equivalent `useAnimatedMarker`/Reanimated path rather than this file literally — documented as intentional in the file's own header (Reanimated shared values can't be reimplemented as plain functions "without becoming a different thing entirely"). Neither renderer ever drives the same `MapView`, so this is not competing ownership.

### 3.8 AutoFitEngine

**One file: `AutoFitEngine.ts`**, called exclusively from `CameraController.ts` (`fitPreview`/`fitCompleted`) — never edited in this arc. Its most significant status change isn't in the file itself but in *reachability*: Phase 8B attached `PassengerHome`'s map to `CameraController`, so `PREVIEW` mode's auto-fit (pickup + destination + route, chrome-aware padding) now genuinely executes on a Customer's own device during booking — previously fully built but, per the original audit, unreachable in the one flow it was designed for.

### 3.9 CameraController

Covered in depth in §3.2 and Phase 9D's own report. Summary: still the sole camera owner; its per-mode profile table, gating, and damping logic are completely unchanged across this entire arc; the only changes were (a) two new, narrowly-scoped exports for the `IDLE`/`OFFLINE` "no camera opinion" gap (`recenterOnLocation`, `animateCameraTo`, Phase 8C) and (b) a bug fix + internal consolidation (Phase 9D) that touched no mode-driven logic.

---

## 4. Verify checklist

| Requirement | Status | Evidence |
|---|---|---|
| ✓ One owner per subsystem | **Confirmed** | §3.1–3.9, each independently re-verified this pass |
| ✓ No duplicate state | **Confirmed** | One `NavigationStore` instance; `driverLocation`/`customerLocation` each have exactly one producer (`NavigationProvider`, actor-routed); no screen keeps a local mirror of engine state — every migrated screen reads via `NavigationHooks` selectors |
| ✓ No duplicate GPS | **Confirmed** | §3.1 — exactly one subscription-creating file in the entire app |
| ✓ No duplicate camera | **Confirmed** | §3.2 — exactly one file constructs an `animateCamera` call against the app's tracked navigation map; the two remaining exceptions (`Map.native.tsx`'s documented fallback, `navigate.tsx`) are scoped and non-competing, not a second owner |
| ✓ No duplicate routing | **Confirmed** | §3.3 — exactly one file calls the raw Directions wrapper |
| ✓ Protected features remain intact | **Confirmed** | §5 |

---

## 5. Protected features verification (AGENTS.md §"🔒 Protected Features")

| Protected item | Touched this arc? | Verdict |
|---|---|---|
| Complete Passenger Ride Lifecycle (`rideStore`: `requestRide`, `cancelRide`, `applyOrderUpdate`, `rateRide`) | No | **Intact** — every migration phase explicitly read these functions and confirmed zero edits; engine calls were added *alongside* business logic, never inside it |
| Complete Driver Ride Lifecycle (`driverStore`: `goOnline`, `goOffline`, `acceptRequest`, `confirmArrival`, `beginTrip`, `completeTrip`, `finishTrip`) | No | **Intact** — same pattern; `DriverDashboard`'s Phase 9A migration preserved `handleToggleOnline`/`handleAcceptRequest`'s business calls verbatim |
| Navigation Engine Runtime | Extended (actor resolution, Phase 9B) | **Intact** — additive; the Transporter-side pipeline is byte-identical to before, now reached via an explicit `if (actor === 'transporter')` fallthrough instead of unconditional execution |
| `GPSManager` | No | **Intact** — zero lines changed across the entire arc |
| `NavigationProvider` | Yes (Phase 9B) | **Intact, extended per its own documented design** — the `UserRole → NavigationActor` mapping was explicitly named as belonging here in `types.ts`'s pre-existing doc comment |
| `NavigationStore` | Yes (additive actions only) | **Intact** — no existing action, field, or transition rule was changed or removed |
| `RouteEngine` | No | **Intact** — zero lines changed |
| `NavigationMap` | Yes (Phase 9D, bug fix) | **Intact** — one adapter call corrected; no prop, behavior, or consumer-facing contract changed |
| `CameraController` | Yes (Phase 8C additive, Phase 9D consolidation) | **Intact** — mode-driven pipeline untouched; see §3.9 |
| `AutoFitEngine` | No | **Intact** — zero lines changed |
| `NavigationHUD` | No | **Intact** — zero lines changed (Phase 9C was evaluation-only) |
| `MarkerAnimator` | No | **Intact** — zero lines changed |

**Protected Driver Workflow** (Passenger Request → Accept → Navigation Engine Init → Route → Polyline → AutoFit → Start Pickup → Arrived → Start Trip → Trip Navigation → Complete Trip → Rating): every step's underlying business call (`acceptRequest`, `confirmArrival`, `beginTrip`, `completeTrip`, `finishTrip`, `rateRide`/`ratePassenger`) was confirmed unchanged, phase by phase, throughout this arc. `npx tsc --noEmit` passes at zero errors as of this pass, confirming no type-level contract was silently broken anywhere in the chain.

---

## 6. Production readiness score

**8.5 / 10** (up from Phase 8D's 7.5/10 at the arc's midpoint).

What changed since Phase 8D to earn the increase:
- The two concrete, named risks that report flagged as blocking a higher score are both resolved: the `animateCamera` duration double-wrapping bug (Phase 9D — was previously described as "a real, if narrow, latent bug... worth a fix... before this is called done") and `DriverDashboard`'s remaining direct camera call (Phase 9A).
- `customerLocation` now has a real, correct, actor-aware producer (Phase 9B) — previously a no-op field.
- The engine's ownership model was stress-tested against a genuinely tricky multi-screen-attach scenario (`PassengerHome` staying mounted under `/(customer)/trip` in the stack) and resolved correctly with `useFocusEffect`-based singleton handoff, rather than glossed over.

What still holds it at 8.5 rather than higher:
1. **Zero on-device verification, at any point across this entire ten-phase arc.** Every damping constant, animation duration, and "feels smooth" claim remains verified only by reading the math, never by running the app. This is the single largest residual risk to a genuine launch decision, and it hasn't diminished — it's the same caveat every phase since 7 has carried forward.
2. **`customerLocation` still has no consumer.** The producer is correct and tested at the type level, but nothing renders it — so this piece of Phase 9B's work is unverified in the one way that matters (does a Customer's own position, if a future screen ever shows it, actually appear correctly on a map).
3. **`NavigationHUD` composite remains unused** — not a defect (Phase 9C's evaluation is sound), but it means the "one reusable HUD" vision from the Bible is only proven at the individual-widget level, not the composed-layout level, anywhere in the app.

---

## 7. Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| No on-device / physical-hardware verification, ever | **High** | Applies to every camera timing constant, GPS accuracy tier, and marker interpolation in the app. Not new to this phase — a standing, explicitly-flagged gap since Phase 7. |
| `DriverDashboard`'s idle-map "follow" behavior now depends on continuous `recenterOnLocation()` calls (one per GPS fix, ~1/sec) while online | **Low-Medium** | Functionally correct (Phase 9A), but this is a different *code path* (one-shot bypass) than the damped, threshold-gated `recompute()` pipeline every other camera-driven screen uses — untested for perceptible jitter under real GPS noise, since the damping/threshold gating in `recompute()` doesn't apply to this path by design. |
| `MapPickerModal`'s map is deliberately never part of the tracked singleton | **Low** | Correct, reasoned architecture (Phase 8C) — flagged only because it's the one map surface `CameraController` structurally cannot reason about, so any future feature wanting engine camera behavior there would need new design work, not a quick wire-up. |
| `customerLocation` unconsumed | **Low** | No current feature needs it; risk is purely "dead code that could silently rot" if a future screen starts reading it without re-verifying the producer still matches expectations. |
| `Architecture.md` documentation lag | **Low** | Still narrates portions of the Rollout plan as future work that phases 7 through 9D have since completed. A reader-trust issue, not a runtime one. |
| Native vs. web marker-animation divergence | **Low** | Two different implementations of conceptually the same interpolation math (§3.7) — currently consistent by construction (both reuse the same underlying timing constants), but a future tuning change to one has no automatic mechanism to keep the other in sync. |

No risk in this table is rated **Critical** or blocking — every item is either a verification gap (needs a device, not a redesign) or a narrow, already-understood, low-blast-radius edge case.

---

## 8. Go/No-Go recommendation

**Conditional Go.**

The architecture itself is production-ready: single ownership holds across every subsystem audited, protected business logic is verifiably untouched, `tsc` passes clean, and the app's two account types (Customer and Transporter) now genuinely share one engine end-to-end — not just in the two screens that were true at Phase 7, but across booking, live tracking, and every camera-owning screen in the app.

The condition is narrow and specific: **do not ship without at least one real-device verification pass** covering (a) the driver-dashboard continuous-recenter path (§7, row 2) under actual GPS noise, (b) camera transition smoothness now that Phase 9D's duration fix means the engine's intended timings are actually reaching the native call for the first time, and (c) the Customer-side live-trip screen's camera/marker behavior end-to-end. None of these require code changes going in — they're verification, not remediation — but shipping an engine whose core "feels smooth, no shaking" promise has never once been observed on a physical device is the one gap this audit cannot close by reading code.
