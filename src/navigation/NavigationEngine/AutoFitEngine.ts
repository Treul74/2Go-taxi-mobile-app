/**
 * AutoFitEngine — the only place in the engine that decides "what should be
 * visible, and at what zoom" for a fit-style camera shot (Pickup +
 * Drop-off + Driver + entire route). Per AGENTS.md's "Auto Fit Rules" ("No
 * screen should call fitToCoordinates directly") and the Bible's "Automatic
 * Route Fit" section, this is the single owner of that calculation —
 * `CameraController.ts` calls into this file for every fit-style mode
 * (Preview, Driver Accepted, Completed) rather than computing bounds/zoom
 * itself.
 *
 * Pure computation module (no map ref, no store subscription, no lifecycle)
 * — unlike `CameraController.ts`/`GPSManager.ts`, this file doesn't own
 * anything stateful. `CameraController` is the one that knows the map's
 * real viewport size and current UI chrome sizes (bottom sheet, floating
 * buttons, etc.) and passes them in on every call; this file just turns
 * (points, viewport, chrome) into a camera pose, every time, the same way.
 *
 * Built on the other two math files rather than re-deriving anything:
 *  - `NavigationMath.ts` — `computeBounds` (points -> geographic bounds).
 *  - `CameraAnimation.ts` — `calculateZoomToFitBounds` (bounds + viewport +
 *    padding -> zoom), and the `CameraAnimationState` type this file
 *    returns (bearing/pitch always 0 here — every Bible fit shot is
 *    north-up and flat; see Architecture.md's camera-profile table).
 *
 * "Edge padding" here is not one flat number: AGENTS.md and the Bible both
 * list distinct UI elements a fit shot must clear (safe area, bottom sheet,
 * floating buttons, navigation banner, map controls) that can all reserve
 * space on the same edge at once (e.g. a safe-area top inset AND a
 * navigation banner both eat into the top). `AutoFitChrome` models each one
 * as its own input; `mergeChromeIntoPadding` is the one place that combines
 * them into the single `EdgePadding` the zoom calculation actually needs.
 */

import { calculateZoomToFitBounds, type CameraAnimationState } from './CameraAnimation';
import { computeBounds } from './NavigationMath';
import type { EdgePadding, LatLng, LatLngBounds, RouteData } from './types';

// ---------------------------------------------------------------------------
// Chrome model
// ---------------------------------------------------------------------------

/**
 * Every named UI element a fit shot must clear, per AGENTS.md's "Auto Fit
 * Rules" and the Bible's "Automatic Route Fit" ("Safe Area, Top cards,
 * Bottom sheet, Floating buttons, Map controls, Status bar, Navigation
 * banner"). Each is supplied independently so a caller only updates the one
 * that actually changed (e.g. the bottom sheet expanding) instead of
 * recomputing one opaque padding value by hand.
 */
export interface AutoFitChrome {
  /** Device safe-area insets (notch, home indicator, status bar). */
  safeArea: EdgePadding;
  /** Current height, in points, reserved by the trip bottom sheet — varies with its collapsed/expanded state. */
  bottomSheetHeight: number;
  /** Extra margin reserved per side for floating buttons (recenter, zoom controls, etc.) — a side can be 0 if nothing floats there. */
  floatingButtons: EdgePadding;
  /** Height, in points, reserved at the top for the turn-by-turn instruction banner. 0 when not shown (e.g. Preview mode). */
  navigationBannerHeight: number;
  /** Width, in points, reserved on the right for map controls (compass, zoom). 0 when not shown. */
  mapControlsWidth: number;
  /** Any additional manual padding not covered by the named elements above. */
  extraPadding: EdgePadding;
}

const ZERO_PADDING: EdgePadding = { top: 0, right: 0, bottom: 0, left: 0 };

/** All-zero chrome — safe default until a caller reports real UI element sizes. */
export const DEFAULT_CHROME: AutoFitChrome = {
  safeArea: ZERO_PADDING,
  bottomSheetHeight: 0,
  floatingButtons: ZERO_PADDING,
  navigationBannerHeight: 0,
  mapControlsWidth: 0,
  extraPadding: ZERO_PADDING,
};

/**
 * Combines every named chrome element into the one `EdgePadding` a fit
 * calculation needs. Additive per side: multiple elements can reserve space
 * on the same edge at once (e.g. safe-area top inset + navigation banner
 * both eat into the top; safe-area right + map controls both eat into the
 * right).
 */
export function mergeChromeIntoPadding(chrome: AutoFitChrome): EdgePadding {
  return {
    top: chrome.safeArea.top + chrome.navigationBannerHeight + chrome.floatingButtons.top + chrome.extraPadding.top,
    bottom: chrome.safeArea.bottom + chrome.bottomSheetHeight + chrome.floatingButtons.bottom + chrome.extraPadding.bottom,
    left: chrome.safeArea.left + chrome.floatingButtons.left + chrome.extraPadding.left,
    right: chrome.safeArea.right + chrome.mapControlsWidth + chrome.floatingButtons.right + chrome.extraPadding.right,
  };
}

// ---------------------------------------------------------------------------
// Core fit calculation
// ---------------------------------------------------------------------------

function centroid(bounds: LatLngBounds): LatLng {
  return {
    latitude: (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
    longitude: (bounds.northEast.longitude + bounds.southWest.longitude) / 2,
  };
}

function isLatLng(value: LatLng | null | undefined): value is LatLng {
  return value != null;
}

/**
 * The one shared fit calculation every mode-specific function below funnels
 * through. Every Bible fit shot is north-up and flat (bearing 0, pitch 0) —
 * see Architecture.md's camera-profile table's PREVIEW/TRIP_COMPLETED rows.
 *
 * @param points Candidate points to fit — nulls/undefined are dropped, so
 * callers can pass e.g. `[pickup, destination]` without pre-filtering.
 * @param viewport The map's current rendered size, in points.
 * @param chrome UI chrome to reserve space for — see `AutoFitChrome`.
 * @returns A north-up, flat `CameraAnimationState` framing every valid
 * point, or `null` if fewer than 2 points are available (nothing meaningful
 * to fit yet — e.g. Preview before a destination is chosen).
 */
export function fitPoints(
  points: (LatLng | null | undefined)[],
  viewport: { width: number; height: number },
  chrome: AutoFitChrome = DEFAULT_CHROME
): CameraAnimationState | null {
  const validPoints = points.filter(isLatLng);
  if (validPoints.length < 2) return null;

  const bounds = computeBounds(validPoints);
  const padding = mergeChromeIntoPadding(chrome);
  const zoom = calculateZoomToFitBounds(bounds, viewport.width, viewport.height, padding);

  return {
    center: centroid(bounds),
    bearing: 0,
    pitch: 0,
    zoom,
    padding,
    timestampMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Mode-specific entry points
// ---------------------------------------------------------------------------

/**
 * Preview mode (Bible: "Automatically fit Pickup -> Destination -> Entire
 * route inside the map"). Includes the route polyline when one is already
 * known so the fit accounts for the road path, not just the two endpoints
 * (a route that bows out to one side needs a wider fit than a straight line
 * between pickup and destination would suggest).
 */
export function fitPreview(
  pickup: LatLng | null,
  destination: LatLng | null,
  route: RouteData | null,
  viewport: { width: number; height: number },
  chrome: AutoFitChrome = DEFAULT_CHROME
): CameraAnimationState | null {
  return fitPoints([pickup, destination, ...(route?.path ?? [])], viewport, chrome);
}

/**
 * Driver Accepted (Bible: "Camera slowly transitions towards driver, pickup
 * instead of instantly jumping"). Fits the Transporter's starting position
 * and the pickup point together so both stay visible during that
 * transition. Not tied to a dedicated `NavigationMode` — AGENTS.md's
 * canonical mode list collapses "Driver Accepted" into the
 * `MATCHING -> DRIVER_TO_PICKUP` edge (see Architecture.md's mode
 * reconciliation note) — callers invoke this explicitly for that brief
 * window rather than it being switched on by a mode value.
 */
export function fitDriverAccepted(
  driverLocation: LatLng | null,
  pickup: LatLng | null,
  viewport: { width: number; height: number },
  chrome: AutoFitChrome = DEFAULT_CHROME
): CameraAnimationState | null {
  return fitPoints([driverLocation, pickup], viewport, chrome);
}

/**
 * Completed mode (Bible: "Zoom out. Show both vehicle, destination.").
 * Also the right function for a mid-trip explicit "Overview" camera
 * request (`cameraState === 'OVERVIEW'`), which asks for the same
 * vehicle+destination framing outside of `TRIP_COMPLETED` itself.
 */
export function fitCompleted(
  vehicleLocation: LatLng | null,
  destination: LatLng | null,
  viewport: { width: number; height: number },
  chrome: AutoFitChrome = DEFAULT_CHROME
): CameraAnimationState | null {
  return fitPoints([vehicleLocation, destination], viewport, chrome);
}

// TODO(CameraController): replace its inline computeBounds/
// calculateZoomToFitBounds calls with fitPreview/fitDriverAccepted/
// fitCompleted from this file, and forward real chrome sizes (from a future
// NavigationHUD/TripBottomCard/MapControls reporting their own measured
// height/width) via a `setChrome`-style setter, the same way it already
// tracks `viewportSize` via `setViewportSize`.
