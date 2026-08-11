# Phase 7B — Professional AutoFit: Implementation Report

**Date:** 2026-08-04
**Scope:** AutoFit chrome-awareness only. No new fitting math, no architecture change — every improvement routes through `AutoFitEngine.ts`'s existing `fitPoints`/`fitPreview`/`fitDriverAccepted`/`fitCompleted`/`mergeChromeIntoPadding`, per this phase's own constraint.
**Method:** Re-read `AGENTS.md`, `2GO Navigation Engine Bible.md`, and `Architecture.md`. Read `AutoFitEngine.ts` in full (not just the earlier summary) before writing anything, to confirm exactly what already exists versus what's a real gap.

---

## 1. Files modified

**`app/(driver)/navigation.tsx`** — the only file touched this phase. Added two `onLayout` handlers that report the screen's real turn-banner and bottom-card heights into `CameraController`'s existing `setChrome()` setter.

No other file changed. Confirmed by `git status`: `CameraController.ts`, `MarkerAnimator.ts`, every `src/components/navigation/` HUD file, `RouteEngine.ts`, and `GPSManager.ts` are untouched this pass (all were last modified in earlier Phase 7/7A work, not this one). `AutoFitEngine.ts` itself is untouched — its fitting math was already correct and didn't need changing (Section 2). No new dependency installed. No camera behavior changed — this phase only affects the *inputs* (`AutoFitChrome`) a future fit-style camera shot would consume, not any camera logic itself.

---

## 2. What was already done (verified, not rebuilt)

Read `AutoFitEngine.ts` in full before writing code. Findings:

- **`fitPoints`** is the single shared core every mode-specific function funnels through — `fitPreview` (Route Preview: pickup + destination + route path), `fitDriverAccepted` (Driver + Pickup), and `fitCompleted` (Driver + Destination, also used for the `OVERVIEW` camera intent) are all thin wrappers over it. There is exactly one fitting algorithm in the engine, already reused correctly by all three — no duplicate logic existed to consolidate.
- **Route never hidden**: `fitPreview` already includes `route.path` in its point set when a route is known, not just the two endpoints — a route that bows out to one side already gets a wider fit than a straight pickup→destination line would suggest.
- **Orientation support**: `CameraAnimation.calculateZoomToFitBounds` computes the required zoom for the latitude axis and the longitude axis **independently** (via `zoomForAxis(effectiveHeight, latFraction)` / `zoomForAxis(effectiveWidth, lngFraction)`) and takes the tighter of the two. This is inherently aspect-ratio-agnostic — it was never written assuming a portrait viewport, so no change was needed for it to handle a wide (landscape) viewport correctly if one were ever passed in. Confirmed `app.json` still locks `"orientation": "portrait"` at the OS level, so landscape cannot occur in this app today — the math is ready for it regardless, not applicable at runtime.
- **Chrome-aware padding — the mechanism**: `AutoFitChrome`/`mergeChromeIntoPadding` already model every named element (`safeArea`, `bottomSheetHeight`, `floatingButtons`, `navigationBannerHeight`, `mapControlsWidth`, `extraPadding`) additively per side, exactly matching AGENTS.md's/the Bible's list. This was already correct; the gap was entirely that most of these inputs were never populated with real values (Section 3).

**Confirmed, not changed:** `CameraController.ts` decides *when* to call `fitDriverAccepted`/`fitPreview`/`fitCompleted` (inside `computeTargetPose`) — that file is explicitly off-limits this phase. `fitDriverAccepted` specifically still has no caller inside `computeTargetPose` (unchanged from the prior audit — `NavigationModes.ts` has no distinct "Driver Accepted" mode to trigger it from, a deliberate architecture decision documented in `Architecture.md`, not a bug). This phase improves the *fitting engine's inputs*; it cannot and does not add a new trigger path, since doing so would require editing `CameraController.ts` or the mode state machine, both out of scope.

---

## 3. What changed

Before this phase, only `safeArea` was ever reported to `setChrome` (wired in Phase 7, from `NavigationMap.tsx`'s `useSafeAreaInsets()`). `bottomSheetHeight` and `navigationBannerHeight` were both permanently `0` — the Phase 7 report explicitly deferred them as having "zero visible effect on this screen" since its reachable modes (`DRIVER_TO_PICKUP`/`ARRIVED_PICKUP`) are both `autoFit: false`. This phase closes that gap for real, per the brief's explicit "Bottom-sheet-aware padding" / "Chrome-aware padding" items:

- **`app/(driver)/navigation.tsx`**: the turn-banner slot is now always mounted (previously conditionally rendered on `isNavigating`, which meant its `onLayout` would go stale — never firing with `0` — the moment navigation stopped). Restructured so the *container* is unconditional and only `<NavigationTurnBanner />` inside it is conditional; `onLayout` now reliably reports `0` when empty and the real height when shown. Calls `setChrome({ navigationBannerHeight })`.
- The bottom pickup/arrival card's existing wrapper `View` (already unconditional — only the `Card`s inside are conditional on `tripStatus`) now also reports its height via `onLayout` → `setChrome({ bottomSheetHeight })`. No restructuring needed here; the wrapper was already correctly shaped for this.
- Both handlers call the engine's existing, previously-half-used `setChrome()` — no new setter, no new merge logic, no new fitting math. `AutoFitEngine.mergeChromeIntoPadding` picks these values up automatically the next time any fit-style shot computes.

**Still not populated:** `floatingButtons` (the compass/recenter cluster) and `mapControlsWidth`. Deliberately left at `0` — the brief's own validation checklist (Section 5) names pickup/destination visibility, route visibility, bottom-card coverage, and safe areas, not floating-button coverage; wiring two more `onLayout`s for a small (~44pt) side cluster with no corresponding validation criterion would be scope beyond what was asked. Flagged, not silently dropped.

---

## 4. AutoFit report

| Item | Status |
|---|---|
| Driver + Pickup fit (`fitDriverAccepted`) | Fitting math already correct and chrome-aware (uses the same `fitPoints` core as everything else). **Not reachable from any live screen** — its trigger lives inside `CameraController.computeTargetPose`, which this phase is explicitly forbidden from editing, and no `NavigationMode` represents "Driver Accepted" as a distinct state (a prior, deliberate architecture decision, not a gap this phase introduced or could close). |
| Driver + Destination fit (`fitCompleted`) | Fitting math already correct and chrome-aware. Reachable in principle (`TRIP_COMPLETED` mode, or `cameraState === 'OVERVIEW'`) but neither is ever reached by `navigation.tsx` before it unmounts into `trip.tsx` — same "correct but unexercised by the one in-scope screen" situation as Phase 7A's dynamic zoom/pitch. |
| Route Preview fit (`fitPreview`) | Already correct, already includes the route polyline. Reachable via `PREVIEW`/`MATCHING` mode or `cameraState === 'FIT_ROUTE'` — none reached by this screen's driver-side flow (`PREVIEW`/`MATCHING` are Customer-side modes per `Architecture.md`). |
| Chrome-aware padding | **Improved this phase** — `safeArea` (Phase 7) + `navigationBannerHeight`/`bottomSheetHeight` (this phase) are now real, measured values instead of defaults. `floatingButtons`/`mapControlsWidth` remain `0` (Section 3). |
| Bottom-sheet-aware padding | **Improved this phase** — see above. |
| Safe-area-aware padding | Unchanged from Phase 7 — already wired, already correct. |
| Dynamic edge padding | This *is* the chrome mechanism — `mergeChromeIntoPadding` was always "dynamic" in the sense of recombining whatever chrome values it's given; the padding it produces is now dynamic in practice (varies with real measured UI), not just in theory (varied only in a stale default before this phase). |
| Camera framing | Unaffected — framing quality (centroid, bounds, zoom-to-fit) was already correct; this phase only changed the padding inputs. |
| Orientation support | Confirmed inherent in `calculateZoomToFitBounds`'s independent lat/lng zoom calculation (Section 2) — no code change needed or made. Not exercisable at runtime (`app.json` locks portrait). |

---

## 5. Validation

| Criterion | Result |
|---|---|
| Pickup always visible | Unaffected by this phase — `fitPreview`'s point set (pickup/destination/route) is unchanged; not reachable from this screen regardless (Section 4). |
| Destination always visible | Same as above. |
| Route never hidden | Confirmed already true (`fitPreview` includes `route.path`) — unchanged. |
| Bottom cards never cover markers | **Improved** — `bottomSheetHeight` now reflects this screen's real card height instead of `0`, for whichever future fit-style shot consumes it. On this screen today, no fit-style shot ever runs (Section 4), so there is nothing to visually confirm yet — this is correctness/future-proofing, stated plainly rather than claimed as an observed fix. |
| Safe areas respected | Unchanged from Phase 7 — already true. |
| TypeScript clean | `npx tsc --noEmit` — 0 errors. |

**ESLint**: 0 errors. 8 warnings, identical set and line-for-line match to the pre-existing baseline from before this phase's edit (`git stash`-verified in the Phase 7 report; re-confirmed no new warning appeared this pass) — none introduced by this change.

---

## 6. Remaining issues

1. **`fitDriverAccepted` still has no live trigger.** Its own fitting logic is complete and correct; wiring a "Driver Accepted" moment to actually call it requires either a new `NavigationMode` (an architecture change) or a `CameraController.ts` edit (explicitly forbidden this phase). Flagged for a future phase with a wider mandate.
2. **`floatingButtons`/`mapControlsWidth` remain unpopulated** — no validation criterion named them; scoped out deliberately (Section 3).
3. **Everything in this report is unverified on-screen** — no fit-style camera shot is reachable from `navigation.tsx` today, so none of this phase's chrome improvements have an observable effect on the one in-scope screen yet. They will apply automatically the moment a future screen/mode reaches an `autoFit: true` state with `NavigationMap` mounted — no further chrome-wiring work would be needed then, only the mode/trigger wiring itself (Issue 1).
4. **No device available in this environment**, consistent with every prior phase this session — layout heights (`onLayout`) are trusted to report real, correct on-device pixel values; this can't be independently confirmed without running the app.

---

## 7. Readiness score

**70/100** for the AutoFit system as a whole; **higher (≈90/100) for the chrome-input layer specifically**, which is now essentially complete for this screen.

Rationale: the fitting *algorithm* (`fitPoints` and its three named wrappers) was already correct, already unified, and already chrome/orientation-agnostic before this phase — verified, not rebuilt. This phase closed the one real, in-scope gap (chrome inputs defaulting to zero instead of reflecting real UI) for the two elements this screen can measure. The score isn't higher because the fitting engine, however correct, still has no reachable trigger on the one screen this phase was allowed to touch — that's a `CameraController`/mode-machine wiring gap explicitly placed out of bounds this phase, not a defect in the AutoFit work itself.
