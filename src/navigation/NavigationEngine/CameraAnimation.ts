/**
 * CameraAnimation — pure math/animation primitives for camera motion.
 *
 * This is NOT the CameraController. It owns zero map state, zero ownership
 * logic, and never touches a MapView. Every export here is a pure function
 * of its arguments (no store reads, no timers, no side effects) so camera
 * math can be unit tested without mounting a map, per Architecture.md's rule
 * that geometric/animation math lives in one dependency-light place.
 *
 * Framework independence: no React, React Native, Google/Mapbox Maps, Expo,
 * Zustand, NavigationStore, GPSManager, or NavigationProvider imports. The
 * only two engine imports are `./types` (plain interfaces, no logic) and
 * `@/lib/mapAnimation` (also plain arithmetic, already reused by
 * `GPSManager.ts` for the same reason — see that file's header — so
 * shortest-arc heading math isn't redefined a third time in this codebase).
 *
 * Relationship to NavigationMath.ts: NavigationMath.ts owns the *domain*
 * camera/route lookups the Bible specifies verbatim — `dynamicZoomForSpeed`
 * and `dynamicPitchForMode` are its stubs for the Bible's exact "walking
 * 18.5 / city 17.5 / highway 16 / very fast 15" and "preview 0° / driving
 * 45-55° / arrival 35° / completed 0°" tables. This file deliberately does
 * NOT hardcode those tables a second time. `calculateCameraZoom` and
 * `calculateCameraPitch` below are generic curve evaluators that take a
 * `SpeedCurvePoint[]` as an argument — NavigationMath.ts's two stubs are the
 * intended future caller, passing the Bible's concrete breakpoints in, so
 * there is exactly one place (NavigationMath.ts) that encodes "what the
 * Bible's table says" and exactly one place (here) that encodes "how to
 * interpolate a speed curve at all."
 *
 * TODO(CameraController): will call `interpolateCameraState` /
 * `computeCameraInterpolation` every frame to drive its one `animateCamera`
 * call, and `shouldAnimate`/`shouldRotate`/`shouldCancelAnimation` to decide
 * whether a new fix warrants restarting the current transition.
 * TODO(AutoFitEngine): will call `calculateZoomToFitBounds` for PREVIEW,
 * MATCHING, and TRIP_COMPLETED's auto-fit zoom, alongside NavigationMath's
 * (future) `computeBounds`/`applyEdgePadding`.
 * TODO(MarkerAnimator): will call `smoothHeading`, `shortestBearing`, and
 * `smoothCameraFollow` for the driver/vehicle marker's own interpolation,
 * sharing the same shortest-arc convention the camera uses so the marker and
 * camera never visually disagree about which way is "forward."
 * TODO(RouteEngine): will call `calculateLookAheadDistance` /
 * `calculateLookAheadPoint` to decide how far along the route polyline to
 * bias the camera's target ahead of the actor's raw GPS fix.
 */

import { normalizeHeading, shortestRotation } from '@/lib/mapAnimation';
import type { CameraPose, EdgePadding, LatLng, LatLngBounds } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default camera zoom when no mode/speed-specific value applies. Matches the Bible's "city driving" dynamic-zoom tier. */
export const DEFAULT_ZOOM = 17.5;
/** Furthest-out zoom this engine will ever request (whole-city/overview scale). */
export const MIN_ZOOM = 2;
/** Closest-in zoom this engine will ever request (street/building scale). */
export const MAX_ZOOM = 20;
/** Default camera pitch/tilt in degrees when no mode/speed-specific value applies. Midpoint of the Bible's 45-55° driving range. */
export const DEFAULT_PITCH = 45;
/** Flat, north-up-style pitch (Preview/Idle/Completed modes per the Bible). */
export const MIN_PITCH = 0;
/** Maximum tilt this engine will ever request. */
export const MAX_PITCH = 60;
/** Default duration (ms) for a routine camera-follow update between GPS fixes. */
export const FOLLOW_DURATION = 1000;
/** Duration (ms) for a user-initiated "Recenter" transition — snappier than a passive follow update. */
export const RECENTER_DURATION = 600;
/** Duration (ms) for a bearing-only rotation update. */
export const ROTATION_DURATION = 500;
/** Duration (ms) for the arrival zoom-out transition (Bible: "Camera zooms closer... Prepare arrival screen transition"). */
export const ARRIVAL_DURATION = 1200;
/** Multiplier applied to speed-derived look-ahead distance (see `calculateLookAheadDistance`). */
export const LOOKAHEAD_FACTOR = 0.5;
/** Minimum position change (meters) that justifies re-animating the camera at all. Below this, a fix is treated as GPS jitter. */
export const MIN_MOVEMENT_THRESHOLD = 3;
/** Minimum heading change (degrees) that justifies re-animating camera bearing. Below this, a fix is treated as heading jitter. */
export const ROTATION_THRESHOLD = 3;
/** Speed (m/s) at/above which speed-based curves clamp to their fastest tier. ~120 km/h — matches the impossible-speed ceiling `trip.tsx`'s fare-distance filter already uses, kept consistent rather than picking an unrelated number. */
export const MAX_CAMERA_SPEED = 33.33;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A pure function mapping animation progress `t` (0-1) to an eased progress value. Not necessarily bounded to [0,1] itself (overshoot easings are valid). */
export type EasingFunction = (t: number) => number;

/** One breakpoint in a speed-to-value curve (see `calculateCameraZoom`/`calculateCameraPitch`). Points must be provided sorted ascending by `speedMetersPerSecond`. */
export interface SpeedCurvePoint {
  speedMetersPerSecond: number;
  value: number;
}

/** A concrete camera pose plus the moment it describes — the animatable unit this file operates on. */
export interface CameraAnimationState extends CameraPose {
  /** Unix ms timestamp this pose was captured or computed for. */
  timestampMs: number;
}

/** A single in-flight camera animation: where it started, where it's going, and how. */
export interface CameraTransition {
  from: CameraAnimationState;
  to: CameraAnimationState;
  durationMs: number;
  easing: EasingFunction;
  /** Unix ms timestamp the transition began — `computeCameraInterpolation` measures progress against this. */
  startTimestampMs: number;
}

/** The result of sampling a `CameraTransition` at a point in time. */
export interface CameraInterpolation {
  pose: CameraAnimationState;
  /** 0-1 progress through the transition, clamped (never extrapolates past the end). */
  progress: number;
  /** True once `progress` has reached 1 — the transition has finished. */
  isComplete: boolean;
}

/** Jitter-rejection thresholds for deciding whether a new fix warrants any camera reaction at all. */
export interface CameraThresholds {
  movementThresholdMeters: number;
  rotationThresholdDegrees: number;
}

/** The output of deciding whether/how to start a new camera animation in response to a fresh fix. */
export interface CameraAnimationResult {
  shouldAnimate: boolean;
  targetPose: CameraAnimationState;
  durationMs: number;
}

/** A predicted point ahead of the actor's current position, and how it was derived. */
export interface CameraLookAhead {
  point: LatLng;
  distanceMeters: number;
  bearingDegrees: number;
}


/** The result of compensating a stale fix for processing/network lag. */
export interface CameraLagResult {
  compensatedPosition: LatLng;
  /** How many milliseconds of lag this compensation accounted for. */
  compensatedForMs: number;
}

// ---------------------------------------------------------------------------
// Generic numeric primitives
// ---------------------------------------------------------------------------

/**
 * Purpose: Linearly interpolate between two numbers.
 * Parameters: `start`/`end` — the range; `t` — progress, typically 0-1 (values
 * outside that range extrapolate rather than clamp — callers that need
 * clamping should clamp `t` first).
 * Return value: the interpolated number.
 * Example: `lerp(10, 20, 0.5)` -> `15`.
 * Performance: O(1), allocation-free — safe to call every frame.
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Purpose: The inverse of `lerp` — given a value within [start, end], return
 * the `t` that would reproduce it. Deliberately unclamped (can return outside
 * [0,1] for a `value` outside the range) so it composes safely inside other
 * interpolation math without silently discarding overshoot; use `normalize`
 * instead when a clamped [0,1] result is what's wanted.
 * Parameters: `start`/`end` — the range; `value` — the sample to invert.
 * Return value: `t`, unclamped.
 * Example: `inverseLerp(10, 20, 15)` -> `0.5`.
 * Performance: O(1). Returns `0` when `start === end` rather than dividing by zero.
 */
export function inverseLerp(start: number, end: number, value: number): number {
  if (start === end) return 0;
  return (value - start) / (end - start);
}

/**
 * Purpose: Map `value` from [min, max] into a clamped [0, 1] fraction.
 * Parameters: `value` — the sample; `min`/`max` — the source range.
 * Return value: a number in [0, 1].
 * Example: `normalize(15, 10, 20)` -> `0.5`; `normalize(25, 10, 20)` -> `1`.
 * Performance: O(1).
 */
export function normalize(value: number, min: number, max: number): number {
  return clamp(inverseLerp(min, max, value), 0, 1);
}

/**
 * Purpose: Restrict `value` to the inclusive range [min, max].
 * Parameters: `value`, `min`, `max`.
 * Return value: `value` if already in range, otherwise the nearest bound.
 * Example: `clamp(25, 0, 20)` -> `20`.
 * Performance: O(1).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Easing curves
// ---------------------------------------------------------------------------

/**
 * Purpose: Quadratic ease-in — starts slow, accelerates. Use for camera
 * moves that should build up speed gradually (e.g. leaving a stopped state).
 * Parameters: `t` — progress, expected 0-1.
 * Return value: eased progress, 0-1 for a 0-1 input.
 * Example: `easeIn(0.5)` -> `0.25`.
 * Performance: O(1).
 */
export function easeIn(t: number): number {
  return t * t;
}

/**
 * Purpose: Quadratic ease-out — starts fast, decelerates into the target.
 * The standard feel for a camera settling onto a new follow point (no
 * overshoot, no abrupt stop).
 * Parameters: `t` — progress, expected 0-1.
 * Return value: eased progress, 0-1 for a 0-1 input.
 * Example: `easeOut(0.5)` -> `0.75`.
 * Performance: O(1).
 */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Purpose: Smooth accelerate-then-decelerate curve — the default for most
 * camera transitions (follow updates, recenter, zoom changes) since it has
 * no abrupt velocity change at either end, matching the Bible's "no abrupt
 * camera jumps" requirement.
 * Parameters: `t` — progress, expected 0-1.
 * Return value: eased progress, 0-1 for a 0-1 input.
 * Example: `easeInOut(0.5)` -> `0.5`; `easeInOut(0.25)` -> `0.125`.
 * Performance: O(1).
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Purpose: Classic GLSL-style smoothstep — an S-curve that is exactly 0
 * below `edge0`, exactly 1 above `edge1`, and eases between. Useful for
 * fading a behaviour in/out over a range (e.g. blending dead-zone strength
 * across a speed band) rather than switching it on/off abruptly.
 * Parameters: `edge0`/`edge1` — the transition range; `x` — the input sample.
 * Return value: 0-1.
 * Example: `smoothStep(0, 10, 5)` -> `0.5`; `smoothStep(0, 10, -5)` -> `0`.
 * Performance: O(1).
 */
export function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = normalize(x, edge0, edge1);
  return t * t * (3 - 2 * t);
}

/**
 * Purpose: Interpolate between two numbers along a power curve instead of
 * linearly — e.g. for a zoom transition that should ease in more sharply
 * than a plain quadratic. Distinct from `easeIn`/`easeOut` (which shape
 * progress itself) — this shapes the interpolation between two concrete
 * values in one call.
 * Parameters: `start`/`end` — the range; `t` — progress, 0-1; `exponent` —
 * curve steepness (2 = quadratic, higher = sharper acceleration). Defaults
 * to 2.
 * Return value: the interpolated number.
 * Example: `exponentialInterpolate(0, 100, 0.5, 2)` -> `25`.
 * Performance: O(1).
 */
export function exponentialInterpolate(start: number, end: number, t: number, exponent: number = 2): number {
  return lerp(start, end, Math.pow(clamp(t, 0, 1), exponent));
}

// ---------------------------------------------------------------------------
// Bearing / heading
// ---------------------------------------------------------------------------

/**
 * Purpose: Resolve the shortest-arc target bearing when animating from one
 * heading to another, so e.g. 350° -> 10° tweens through 360° (+20°) instead
 * of sweeping backward through 180° (-340°). Thin wrapper over
 * `shortestRotation` (`@/lib/mapAnimation`) so this codebase keeps exactly
 * one shortest-arc implementation (already reused by `GPSManager.ts`).
 * Parameters: `from`/`to` — bearings in degrees (0-360, or an unwrapped
 * animation value for `from`).
 * Return value: a bearing on the same continuous scale as `from` — feed it
 * directly to `lerp`/an animation driver without a visual snap.
 * Example: `shortestBearing(350, 10)` -> `370`.
 * Performance: O(1).
 */
export function shortestBearing(from: number, to: number): number {
  return shortestRotation(from, to);
}

/**
 * Purpose: Interpolate camera/marker bearing along the shortest arc between
 * two headings, wrapped back into [0, 360) for direct use as a map bearing.
 * Parameters: `from`/`to` — bearings in degrees; `t` — progress, 0-1.
 * Return value: bearing in degrees, normalized to [0, 360).
 * Example: `interpolateBearing(350, 10, 0.5)` -> `0` (halfway through the 20° arc).
 * Performance: O(1).
 */
export function interpolateBearing(from: number, to: number, t: number): number {
  return normalizeHeading(lerp(from, shortestBearing(from, to), t));
}

/**
 * Purpose: Low-pass filter a raw heading reading against the previously
 * smoothed heading, so noisy compass/GPS heading jitter doesn't make the
 * camera or marker visibly wobble. Distinct from `interpolateBearing` (which
 * tweens a known start/end over animation time) — this is a one-step
 * exponential filter meant to be called once per incoming fix.
 * Parameters: `previous` — last smoothed heading, degrees; `next` — latest
 * raw heading, degrees; `smoothingFactor` — 0-1, how much weight the new
 * reading gets (0 = ignore it entirely, 1 = snap straight to it).
 * Return value: the new smoothed heading, degrees, normalized to [0, 360).
 * Example: `smoothHeading(0, 90, 0.2)` -> `18`.
 * Performance: O(1).
 */
export function smoothHeading(previous: number, next: number, smoothingFactor: number): number {
  return interpolateBearing(previous, next, clamp(smoothingFactor, 0, 1));
}

// ---------------------------------------------------------------------------
// Zoom / pitch
// ---------------------------------------------------------------------------

/**
 * Purpose: Interpolate camera zoom between two levels over an animation.
 * Parameters: `from`/`to` — zoom levels; `t` — progress, 0-1; `easing` —
 * easing function applied to `t` before interpolating (defaults to
 * `easeInOut`, matching the Bible's "smooth camera interpolation" rule).
 * Return value: the interpolated zoom, clamped to [MIN_ZOOM, MAX_ZOOM].
 * Example: `interpolateZoom(15, 17.5, 0.5)` -> `16.25` (with the default
 * symmetric easing at the midpoint).
 * Performance: O(1).
 */
export function interpolateZoom(from: number, to: number, t: number, easing: EasingFunction = easeInOut): number {
  return clamp(lerp(from, to, easing(clamp(t, 0, 1))), MIN_ZOOM, MAX_ZOOM);
}

/**
 * Purpose: Interpolate camera pitch/tilt between two levels over an
 * animation.
 * Parameters: `from`/`to` — pitch in degrees; `t` — progress, 0-1; `easing` —
 * easing function applied to `t` before interpolating (defaults to
 * `easeInOut`).
 * Return value: the interpolated pitch, clamped to [MIN_PITCH, MAX_PITCH].
 * Example: `interpolatePitch(0, 50, 0.5)` -> `25`.
 * Performance: O(1).
 */
export function interpolatePitch(from: number, to: number, t: number, easing: EasingFunction = easeInOut): number {
  return clamp(lerp(from, to, easing(clamp(t, 0, 1))), MIN_PITCH, MAX_PITCH);
}

/**
 * Purpose: Evaluate a speed-to-value curve (piecewise-linear across sorted
 * breakpoints) — the shared engine behind `calculateCameraZoom` and
 * `calculateCameraPitch` so the two never drift into separately-maintained
 * interpolation logic. Not exported: callers use the two named wrappers
 * below, which is what the Bible-table-owning code (NavigationMath.ts) is
 * expected to call with its own concrete breakpoints.
 * Parameters: `speedMetersPerSecond` — current speed; `curve` — breakpoints
 * sorted ascending by speed.
 * Return value: the interpolated value; clamps to the first/last point's
 * value outside the curve's speed range.
 * Performance: O(n) over `curve.length`, trivially small (curves are a
 * handful of points) — safe every frame.
 */
function evaluateSpeedCurve(speedMetersPerSecond: number, curve: SpeedCurvePoint[]): number {
  if (curve.length === 0) return 0;
  const speed = clamp(speedMetersPerSecond, 0, MAX_CAMERA_SPEED);
  if (speed <= curve[0].speedMetersPerSecond) return curve[0].value;
  const last = curve[curve.length - 1];
  if (speed >= last.speedMetersPerSecond) return last.value;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (speed >= a.speedMetersPerSecond && speed <= b.speedMetersPerSecond) {
      const t = normalize(speed, a.speedMetersPerSecond, b.speedMetersPerSecond);
      return lerp(a.value, b.value, t);
    }
  }
  return last.value;
}

/**
 * Purpose: Derive a camera zoom level from current speed, given a caller-
 * supplied speed/zoom curve. Deliberately generic — this file does not
 * hardcode the Bible's "walking 18.5 / city 17.5 / highway 16 / very fast
 * 15" table; `NavigationMath.ts`'s `dynamicZoomForSpeed` owns those concrete
 * breakpoints and is expected to call this with them (see this file's
 * header for the reasoning).
 * Parameters: `speedMetersPerSecond` — current speed; `curve` — breakpoints
 * sorted ascending by speed.
 * Return value: interpolated zoom, clamped to [MIN_ZOOM, MAX_ZOOM].
 * Example:
 * ```ts
 * const BIBLE_ZOOM_CURVE: SpeedCurvePoint[] = [
 *   { speedMetersPerSecond: 0, value: 18.5 },   // walking
 *   { speedMetersPerSecond: 8, value: 17.5 },   // city driving
 *   { speedMetersPerSecond: 20, value: 16 },    // highway
 *   { speedMetersPerSecond: 30, value: 15 },    // very fast
 * ];
 * calculateCameraZoom(12, BIBLE_ZOOM_CURVE); // somewhere between 17.5 and 16
 * ```
 * Performance: O(n) over `curve.length`.
 */
export function calculateCameraZoom(speedMetersPerSecond: number, curve: SpeedCurvePoint[]): number {
  return clamp(evaluateSpeedCurve(speedMetersPerSecond, curve), MIN_ZOOM, MAX_ZOOM);
}

/**
 * Purpose: Derive a camera pitch from current speed, given a caller-supplied
 * speed/pitch curve. Same generic-curve rationale as `calculateCameraZoom` —
 * see this file's header.
 * Parameters: `speedMetersPerSecond` — current speed; `curve` — breakpoints
 * sorted ascending by speed.
 * Return value: interpolated pitch, clamped to [MIN_PITCH, MAX_PITCH].
 * Example:
 * ```ts
 * const BIBLE_PITCH_CURVE: SpeedCurvePoint[] = [
 *   { speedMetersPerSecond: 0, value: 45 },
 *   { speedMetersPerSecond: 20, value: 55 },
 * ];
 * calculateCameraPitch(10, BIBLE_PITCH_CURVE); // ~50
 * ```
 * Performance: O(n) over `curve.length`.
 */
export function calculateCameraPitch(speedMetersPerSecond: number, curve: SpeedCurvePoint[]): number {
  return clamp(evaluateSpeedCurve(speedMetersPerSecond, curve), MIN_PITCH, MAX_PITCH);
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Purpose: Decide how long a camera animation should take, covering both a
 * flat baseline duration AND a speed/distance-aware adjustment (the Bible
 * has no fixed rule here, but "no abrupt camera jumps" implies a large
 * position jump — e.g. after a GPS gap — shouldn't animate at the same
 * duration as a routine 1-meter follow update, or the camera would visibly
 * lag behind).
 * Parameters: `distanceMeters` — how far the camera target moved;
 * `currentSpeedMetersPerSecond` — optional, the actor's current speed, used
 * to shorten duration at high speed so the camera doesn't lag behind a fast
 * mover; `baseDurationMs` — the baseline for a routine update, defaults to
 * `FOLLOW_DURATION`.
 * Return value: duration in ms, never less than 150ms (a floor so an
 * animation is never so short it reads as a snap) nor more than 3x the
 * baseline (so a single bad fix can't produce a multi-second crawl).
 * Example: `calculateAnimationDuration(2)` -> close to `FOLLOW_DURATION`;
 * `calculateAnimationDuration(200)` -> up to `FOLLOW_DURATION * 3`.
 * Performance: O(1).
 */
export function calculateAnimationDuration(
  distanceMeters: number,
  currentSpeedMetersPerSecond?: number,
  baseDurationMs: number = FOLLOW_DURATION
): number {
  const distanceScale = 1 + normalize(distanceMeters, MIN_MOVEMENT_THRESHOLD, 100) * 2;
  const speedScale =
    currentSpeedMetersPerSecond === undefined
      ? 1
      : lerp(1, 0.6, normalize(currentSpeedMetersPerSecond, 0, MAX_CAMERA_SPEED));
  return clamp(baseDurationMs * distanceScale * speedScale, 150, baseDurationMs * 3);
}

// ---------------------------------------------------------------------------
// Thresholds / gating
// ---------------------------------------------------------------------------

/**
 * Purpose: Compute how many meters of movement should be required before
 * the camera reacts at all, scaled by zoom — at a zoomed-in level a small
 * real-world movement is visually large on screen (should react sooner), at
 * a zoomed-out level the same movement is visually tiny (should be ignored
 * longer) so the camera doesn't animate imperceptibly on every fix.
 * Parameters: `zoomLevel` — current camera zoom.
 * Return value: meters; floors at `MIN_MOVEMENT_THRESHOLD`.
 * Example: `calculateMovementThreshold(19)` -> near the floor;
 * `calculateMovementThreshold(10)` -> several times larger.
 * Performance: O(1).
 */
export function calculateMovementThreshold(zoomLevel: number): number {
  const zoomFactor = Math.pow(2, MAX_ZOOM - clamp(zoomLevel, MIN_ZOOM, MAX_ZOOM));
  return Math.max(MIN_MOVEMENT_THRESHOLD, MIN_MOVEMENT_THRESHOLD * zoomFactor * 0.25);
}

/**
 * Purpose: Compute how many degrees of heading change should be required
 * before the camera rotates, scaled by speed — at low speed, heading
 * readings are noisier relative to actual direction of travel (e.g. nearly
 * stationary), so require a bigger change; at higher speed, heading is more
 * trustworthy and turns matter sooner, so react to smaller changes.
 * Parameters: `speedMetersPerSecond` — current speed.
 * Return value: degrees; floors at `ROTATION_THRESHOLD`.
 * Example: `calculateRotationThreshold(0.2)` -> much larger than
 * `ROTATION_THRESHOLD`; `calculateRotationThreshold(15)` -> near the floor.
 * Performance: O(1).
 */
export function calculateRotationThreshold(speedMetersPerSecond: number): number {
  const stillness = 1 - normalize(speedMetersPerSecond, 0, 5);
  return ROTATION_THRESHOLD + stillness * ROTATION_THRESHOLD * 9;
}

/**
 * Purpose: Gate whether a position change is significant enough to animate
 * the camera at all, vs. being GPS jitter that should be ignored.
 * Parameters: `distanceMovedMeters` — distance since the camera's current
 * target; `threshold` — meters, defaults to `MIN_MOVEMENT_THRESHOLD`.
 * Return value: `true` if the camera should animate to the new position.
 * Example: `shouldAnimate(1, 3)` -> `false`; `shouldAnimate(5, 3)` -> `true`.
 * Performance: O(1).
 */
export function shouldAnimate(distanceMovedMeters: number, threshold: number = MIN_MOVEMENT_THRESHOLD): boolean {
  return distanceMovedMeters >= threshold;
}

/**
 * Purpose: Gate whether a heading change is significant enough to rotate the
 * camera bearing at all, vs. being heading jitter that should be ignored.
 * Parameters: `headingDeltaDegrees` — absolute difference between the
 * camera's current bearing and the new heading (shortest-arc, not raw);
 * `threshold` — degrees, defaults to `ROTATION_THRESHOLD`.
 * Return value: `true` if the camera should rotate to the new bearing.
 * Example: `shouldRotate(1, 3)` -> `false`; `shouldRotate(10, 3)` -> `true`.
 * Performance: O(1).
 */
export function shouldRotate(headingDeltaDegrees: number, threshold: number = ROTATION_THRESHOLD): boolean {
  return Math.abs(headingDeltaDegrees) >= threshold;
}

/**
 * Purpose: Decide whether an already in-flight camera animation should be
 * interrupted and restarted toward a newer target, vs. left to finish, when
 * a fresh fix arrives mid-transition. Prevents both extremes: restarting on
 * every single fix (visible stutter, "shaking" the Bible explicitly warns
 * against) and never restarting (camera drifts stale during a fast turn).
 * Parameters: `current` — the pose the transition is animating from/through
 * right now; `newTarget` — the newly-computed target pose; `thresholds` —
 * the movement/rotation gates to apply.
 * Return value: `true` if the transition should be cancelled and restarted
 * toward `newTarget`.
 * Example: a `newTarget` 1m and 1° away from `current` -> `false`; one 50m
 * or 20° away -> `true`.
 * Performance: O(1) (one distance + one bearing-delta calculation via the
 * caller-supplied thresholds — no map/geometry dependency, so distance here
 * is a simple planar approximation suitable for the short spans this gates;
 * callers needing exact geodesic distance should pass it in precomputed).
 */
export function shouldCancelAnimation(
  current: CameraAnimationState,
  newTarget: CameraAnimationState,
  thresholds: CameraThresholds
): boolean {
  const dLat = newTarget.center.latitude - current.center.latitude;
  const dLng = newTarget.center.longitude - current.center.longitude;
  const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_320;
  const headingDelta = Math.abs(shortestBearing(current.bearing, newTarget.bearing) - current.bearing);
  return (
    shouldAnimate(approxMeters, thresholds.movementThresholdMeters) ||
    shouldRotate(headingDelta, thresholds.rotationThresholdDegrees)
  );
}

// ---------------------------------------------------------------------------
// Damping / lag compensation
// ---------------------------------------------------------------------------

/**
 * Purpose: Apply one step of exponential (critically-damped-style) smoothing
 * to move `current` toward `target` — the general-purpose damping primitive
 * `smoothCameraFollow`/`smoothHeading` build on conceptually (kept generic
 * and numeric here so it's reusable for zoom/pitch damping too, not just
 * position).
 * Parameters: `current` — the value right now; `target` — where it's
 * heading; `dampingFactor` — 0-1, higher = snappier/less smoothing;
 * `deltaSeconds` — time elapsed since the last step, so damping behaves the
 * same regardless of frame rate.
 * Return value: the new, damped value.
 * Example: `applyCameraDamping(0, 100, 5, 0.016)` -> a small step toward 100,
 * not a jump to it.
 * Performance: O(1). Uses `1 - e^(-k*dt)` so results stay stable across
 * varying frame times instead of a naive fixed-fraction-per-frame approach.
 */
export function applyCameraDamping(current: number, target: number, dampingFactor: number, deltaSeconds: number): number {
  const t = 1 - Math.exp(-dampingFactor * Math.max(deltaSeconds, 0));
  return lerp(current, target, clamp(t, 0, 1));
}

/**
 * Purpose: Project a stale fix forward along its heading/speed to
 * compensate for lag between when the fix was captured and when the camera
 * actually renders it (network delay, processing time, animation start
 * latency) — a small-scale relative of `predictPosition`
 * (NavigationMath.ts), specialized for camera lag rather than general
 * look-ahead framing.
 * Parameters: `lastKnownPosition` — the fix's coordinate; `headingDegrees` —
 * direction of travel; `speedMetersPerSecond` — current speed; `lagMs` —
 * milliseconds of lag to compensate for.
 * Return value: a `CameraLagResult` with the compensated coordinate and the
 * lag it accounted for.
 * Example: a fix 20 m/s heading due north (0°) with 200ms of lag ->
 * compensated position ~4m further north.
 * Performance: O(1). Uses an equirectangular approximation (adequate at the
 * meter-scale distances lag compensation deals with) rather than full
 * spherical projection.
 */
export function calculateCameraLag(
  lastKnownPosition: LatLng,
  headingDegrees: number,
  speedMetersPerSecond: number,
  lagMs: number
): CameraLagResult {
  const distanceMeters = speedMetersPerSecond * (lagMs / 1000);
  return {
    compensatedPosition: destinationPoint(lastKnownPosition, headingDegrees, distanceMeters),
    compensatedForMs: lagMs,
  };
}

// ---------------------------------------------------------------------------
// Look-ahead / predictive offset
// ---------------------------------------------------------------------------

/**
 * Purpose: Compute how far ahead of the actor's current position the camera
 * should look, scaled by speed (Bible: "Camera follows NOT the current GPS.
 * Instead predict future movement... This removes shaking").
 * Parameters: `speedMetersPerSecond` — current speed; `lookAheadFactor` —
 * seconds-equivalent multiplier, defaults to `LOOKAHEAD_FACTOR`.
 * Return value: distance in meters to look ahead.
 * Example: `calculateLookAheadDistance(10)` -> `5` at the default factor.
 * Performance: O(1).
 */
export function calculateLookAheadDistance(speedMetersPerSecond: number, lookAheadFactor: number = LOOKAHEAD_FACTOR): number {
  return Math.max(0, speedMetersPerSecond) * lookAheadFactor;
}

/**
 * Purpose: Compute the geographic point the camera should look toward,
 * projected ahead of the actor along their current bearing.
 * Parameters: `position` — the actor's current coordinate; `bearingDegrees`
 * — direction of travel; `lookAheadDistanceMeters` — how far ahead, e.g.
 * from `calculateLookAheadDistance`.
 * Return value: a `CameraLookAhead` with the projected point and the
 * distance/bearing used to derive it.
 * Example: a position at the equator heading due east (90°) with a 50m
 * look-ahead -> a point ~50m east.
 * Performance: O(1). Uses the same equirectangular approximation as
 * `calculateCameraLag` — accurate at the tens-to-low-hundreds-of-meters
 * scale this is used for.
 */
export function calculateLookAheadPoint(position: LatLng, bearingDegrees: number, lookAheadDistanceMeters: number): CameraLookAhead {
  return {
    point: destinationPoint(position, bearingDegrees, lookAheadDistanceMeters),
    distanceMeters: lookAheadDistanceMeters,
    bearingDegrees: normalizeHeading(bearingDegrees),
  };
}

// ---------------------------------------------------------------------------
// Dead zone / follow smoothing
// ---------------------------------------------------------------------------

/**
 * Purpose: Compute a radius, in meters, within which the camera should treat
 * the actor as "not meaningfully moved" — combining zoom (visual scale) and
 * the current fix's GPS accuracy (a low-accuracy fix shouldn't be trusted
 * enough to justify even a small camera nudge).
 * Parameters: `zoomLevel` — current camera zoom; `gpsAccuracyMeters` — the
 * active fix's reported horizontal accuracy.
 * Return value: dead-zone radius in meters.
 * Example: `calculateDeadZone(17.5, 5)` -> a small radius; `calculateDeadZone(17.5, 40)`
 * -> a noticeably larger one, since a 40m-accuracy fix can't be trusted to
 * justify small camera moves.
 * Performance: O(1).
 */
export function calculateDeadZone(zoomLevel: number, gpsAccuracyMeters: number): number {
  return Math.max(calculateMovementThreshold(zoomLevel), gpsAccuracyMeters * 0.5);
}

/**
 * Purpose: Smooth the camera's followed position toward a new target rather
 * than snapping straight to each raw fix — the position-space counterpart
 * to `smoothHeading`.
 * Parameters: `current` — the camera's current followed coordinate;
 * `target` — the latest raw coordinate; `smoothingFactor` — 0-1, how much
 * weight the new reading gets (0 = ignore it, 1 = snap straight to it).
 * Return value: the new, smoothed coordinate.
 * Example: `smoothCameraFollow({latitude:0,longitude:0}, {latitude:0,longitude:0.001}, 0.2)`
 * moves 20% of the way toward the target, not all the way.
 * Performance: O(1). Plain per-axis lerp — adequate at the short distances a
 * single follow step covers; not a substitute for `calculateLookAheadPoint`
 * when actual bearing-based projection is needed.
 */
export function smoothCameraFollow(current: LatLng, target: LatLng, smoothingFactor: number): LatLng {
  const t = clamp(smoothingFactor, 0, 1);
  return {
    latitude: lerp(current.latitude, target.latitude, t),
    longitude: lerp(current.longitude, target.longitude, t),
  };
}

// ---------------------------------------------------------------------------
// Mode-specific zoom transitions
// ---------------------------------------------------------------------------

/**
 * Purpose: Drive the arrival zoom-out/in transition (Bible: "Camera zooms
 * closer... Rotation slows... Prepare arrival screen transition") with an
 * ease-out feel so the camera settles rather than snapping to the arrival
 * framing.
 * Parameters: `fromZoom`/`toZoom` — the zoom levels either side of arrival;
 * `progress` — 0-1 through `ARRIVAL_DURATION`.
 * Return value: the interpolated zoom for this point in the transition.
 * Example: `calculateArrivalZoomTransition(17.5, 19, 0.5)` -> most of the way
 * to `toZoom`, thanks to the ease-out curve's fast start.
 * Performance: O(1). Thin, named composition of `interpolateZoom` +
 * `easeOut` rather than new math — kept as its own function since "arrival
 * zoom transition" is a named Bible behaviour callers should be able to
 * reach for directly instead of re-deriving the easing choice each time.
 */
export function calculateArrivalZoomTransition(fromZoom: number, toZoom: number, progress: number): number {
  return interpolateZoom(fromZoom, toZoom, progress, easeOut);
}

/**
 * Purpose: Compute the zoom level that fits a geographic bounding box inside
 * a viewport of a given size, after edge padding is applied — the shared
 * engine behind both the Bible's Preview mode ("fit pickup + destination +
 * route") and Overview/Completed mode ("fit vehicle + destination"); the two
 * differ only in which bounds are passed in (computed elsewhere, e.g. the
 * future `NavigationMath.computeBounds`), not in this calculation.
 * Parameters: `bounds` — geographic north-east/south-west corners to fit;
 * `viewportWidthPoints`/`viewportHeightPoints` — the map view's size;
 * `padding` — UI chrome to reserve (bottom sheet, floating buttons, safe
 * area, status bar — Bible's "Automatic Route Fit").
 * Return value: a zoom level, clamped to [MIN_ZOOM, MAX_ZOOM], that fits
 * `bounds` within the padded viewport.
 * Example: tight bounds in a large viewport -> a high zoom; wide bounds in a
 * small viewport -> a low zoom.
 * Performance: O(1). Standard Mercator-projection "fit bounds" algorithm
 * (the same approach mapping SDKs use internally) — a few trig/log calls,
 * safe to call on every auto-fit recompute, not per animation frame.
 */
export function calculateZoomToFitBounds(
  bounds: LatLngBounds,
  viewportWidthPoints: number,
  viewportHeightPoints: number,
  padding: EdgePadding
): number {
  const WORLD_DIM = 256;

  const mercatorLatRad = (latitudeDegrees: number): number => {
    const sin = Math.sin((latitudeDegrees * Math.PI) / 180);
    const radians = Math.log((1 + sin) / (1 - sin)) / 2;
    return clamp(radians, -Math.PI, Math.PI) / 2;
  };

  const zoomForAxis = (viewportPx: number, fraction: number): number => {
    if (fraction <= 0 || viewportPx <= 0) return MAX_ZOOM;
    return Math.log2(viewportPx / WORLD_DIM / fraction);
  };

  const effectiveWidth = Math.max(1, viewportWidthPoints - padding.left - padding.right);
  const effectiveHeight = Math.max(1, viewportHeightPoints - padding.top - padding.bottom);

  const latFraction =
    (mercatorLatRad(bounds.northEast.latitude) - mercatorLatRad(bounds.southWest.latitude)) / Math.PI;

  let lngDiff = bounds.northEast.longitude - bounds.southWest.longitude;
  if (lngDiff < 0) lngDiff += 360;
  const lngFraction = lngDiff / 360;

  const latZoom = zoomForAxis(effectiveHeight, Math.abs(latFraction));
  const lngZoom = zoomForAxis(effectiveWidth, lngFraction);

  return clamp(Math.min(latZoom, lngZoom), MIN_ZOOM, MAX_ZOOM);
}

// ---------------------------------------------------------------------------
// Full camera-state interpolation / blending
// ---------------------------------------------------------------------------

/**
 * Purpose: Interpolate every component of a camera pose (position, bearing,
 * zoom, pitch) together at once, so callers don't have to hand-assemble the
 * per-field calls above every frame.
 * Parameters: `from`/`to` — the two poses; `t` — progress, 0-1; `easing` —
 * applied uniformly to position/zoom/pitch (bearing always takes the
 * shortest arc regardless of `t`'s easing, since angular and linear
 * quantities shouldn't share a curve shape that could make them visually
 * disagree mid-transition).
 * Return value: a complete `CameraAnimationState`, timestamped `to.timestampMs`
 * when `t >= 1`, otherwise left as `from.timestampMs` (the state describes an
 * in-progress pose, not a captured fix).
 * Example: `interpolateCameraState(poseA, poseB, 0.5)` -> a pose halfway
 * between the two on every axis.
 * Performance: O(1). Padding is not interpolated — it switches instantly
 * with the target pose, since edge padding follows UI layout changes
 * (bottom sheet expand/collapse) rather than camera motion.
 */
export function interpolateCameraState(
  from: CameraAnimationState,
  to: CameraAnimationState,
  t: number,
  easing: EasingFunction = easeInOut
): CameraAnimationState {
  const clampedT = clamp(t, 0, 1);
  const easedT = easing(clampedT);
  return {
    center: {
      latitude: lerp(from.center.latitude, to.center.latitude, easedT),
      longitude: lerp(from.center.longitude, to.center.longitude, easedT),
    },
    bearing: interpolateBearing(from.bearing, to.bearing, clampedT),
    zoom: interpolateZoom(from.zoom, to.zoom, clampedT, (x) => x),
    pitch: interpolatePitch(from.pitch, to.pitch, clampedT, (x) => x),
    padding: clampedT >= 1 ? to.padding : from.padding,
    timestampMs: clampedT >= 1 ? to.timestampMs : from.timestampMs,
  };
}

/**
 * Purpose: Sample a `CameraTransition` at the current time, producing the
 * pose to render right now and whether the transition has finished — the
 * function a `CameraController` render/animation loop calls every frame.
 * Parameters: `transition` — the active transition; `nowMs` — the current
 * Unix ms timestamp (passed in rather than read internally so this stays a
 * pure function of its arguments — no hidden clock access, fully testable).
 * Return value: a `CameraInterpolation` with the current pose, clamped
 * progress, and completion flag.
 * Example: a transition started at `t0` with `durationMs: 1000`, sampled at
 * `t0 + 500` -> `progress: 0.5, isComplete: false`.
 * Performance: O(1).
 */
export function computeCameraInterpolation(transition: CameraTransition, nowMs: number): CameraInterpolation {
  const elapsed = nowMs - transition.startTimestampMs;
  const progress = transition.durationMs <= 0 ? 1 : clamp(elapsed / transition.durationMs, 0, 1);
  return {
    pose: interpolateCameraState(transition.from, transition.to, progress, transition.easing),
    progress,
    isComplete: progress >= 1,
  };
}

/**
 * Purpose: Cross-blend two camera states by a weight — for the rare case
 * where a new transition starts before the previous one finished and the
 * camera should ease from "wherever it currently visually is" (a blend of
 * two in-flight poses) rather than snapping to either endpoint. Distinct
 * from `interpolateCameraState` (which tweens a single transition's two
 * fixed endpoints over time) — this blends two independent, possibly
 * still-moving poses by a static weight.
 * Parameters: `a`/`b` — the two poses to blend; `blendFactor` — 0 (all `a`)
 * to 1 (all `b`).
 * Return value: a blended `CameraAnimationState`.
 * Example: `blendCameraStates(poseA, poseB, 0.3)` -> a pose weighted 70%
 * toward `a`.
 * Performance: O(1).
 */
export function blendCameraStates(a: CameraAnimationState, b: CameraAnimationState, blendFactor: number): CameraAnimationState {
  return interpolateCameraState(a, b, blendFactor, (x) => x);
}

// ---------------------------------------------------------------------------
// Internal geometry helper
// ---------------------------------------------------------------------------

/**
 * Not exported — internal helper for `calculateCameraLag`/`calculateLookAheadPoint`.
 * Projects a point forward from `origin` along `bearingDegrees` for
 * `distanceMeters`, using an equirectangular approximation (adequate at the
 * tens-to-hundreds-of-meters scale camera lag/look-ahead deal with; not
 * intended for long-range navigation-grade projection). Deliberately
 * separate from `src/lib/distance.ts` (which solves the inverse problem —
 * distance between two known points, via Haversine) rather than shoehorned
 * into that file.
 */
function destinationPoint(origin: LatLng, bearingDegrees: number, distanceMeters: number): LatLng {
  const EARTH_RADIUS_METERS = 6_371_000;
  const bearingRad = (normalizeHeading(bearingDegrees) * Math.PI) / 180;
  const latRad = (origin.latitude * Math.PI) / 180;
  const metersPerDegreeLat = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(latRad);

  const deltaLat = ((distanceMeters * Math.cos(bearingRad)) / metersPerDegreeLat);
  const deltaLng = metersPerDegreeLng === 0 ? 0 : (distanceMeters * Math.sin(bearingRad)) / metersPerDegreeLng;

  return {
    latitude: origin.latitude + deltaLat,
    longitude: origin.longitude + deltaLng,
  };
}
