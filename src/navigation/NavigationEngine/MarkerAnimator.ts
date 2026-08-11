/**
 * MarkerAnimator — pure math for driver/customer/navigation-arrow marker
 * animation (Bible's "Marker System": "Every marker uses useAnimatedMarker().
 * ... All use identical interpolation.").
 *
 * Relationship to the existing marker animation system (important — read
 * before changing anything here or there):
 *
 * `src/hooks/useAnimatedMarker.ts` + `src/lib/mapAnimation.ts` already
 * implement every responsibility this file is asked for, and are already
 * wired into three live components (`AnimatedVehicleMarker` — driver,
 * `AnimatedUserLocation` — customer, `NavigationArrowMarker` — navigation
 * arrow), all rendering on real screens today via Reanimated worklets
 * (true UI-thread, 60fps). This file does NOT replace, wrap, or refactor
 * that system — no UI changes, per this task's own instruction, and
 * `useAnimatedMarker` is a React hook bound to Reanimated shared values,
 * which cannot be reimplemented as plain, dependency-light functions
 * without becoming a different thing entirely.
 *
 * What this file *is*: the same kind of pure, framework-independent
 * computation core `CameraAnimation.ts` is for the camera — a reusable
 * "given a from/to marker state and a point in time, what should the
 * marker's position/heading be right now" calculation, decoupled from any
 * particular renderer. `CameraAnimation.ts`'s own header already named this
 * file as a future consumer of its generic primitives ("TODO(MarkerAnimator):
 * will call smoothHeading, shortestBearing... sharing the same shortest-arc
 * convention the camera uses so the marker and camera never visually
 * disagree about which way is forward") — this file is that consumer,
 * calling into `CameraAnimation.ts` rather than re-deriving shortest-arc/
 * lerp math a third time, and into `@/lib/mapAnimation` for the exact same
 * `normalizeHeading`/timing constants the existing Reanimated hook already
 * uses, so the numbers agree even though the mechanism differs.
 *
 * Why build this if nothing consumes it yet: it's what a *second* renderer
 * — e.g. `Map.web.tsx`'s `@react-google-maps/api` markers, which have no
 * Reanimated worklet equivalent — would drive with `requestAnimationFrame`
 * instead of `withTiming`, satisfying "Reusable across every map" literally
 * (AGENTS.md's Map.native/Map.web/Map.tsx split is exactly the seam this
 * exists for). It's also available for `useAnimatedMarker.ts` itself to
 * delegate to in a future pass, the same "engine ships first, migration is
 * separate" pattern already used for `GPSManager.ts`/`CameraController.ts`/
 * `AutoFitEngine.ts`/`RouteEngine.ts`.
 *
 * Pure, stateless, framework-independent: no React, no Reanimated, no
 * react-native-maps/Mapbox/Expo. Every export is a pure function of its
 * arguments (or a plain data constant) — safe to call every frame, easy to
 * unit test.
 */

import { MARKER_ANIMATION, normalizeHeading } from '@/lib/mapAnimation';
import { clamp, interpolateBearing, lerp, shortestBearing, smoothHeading } from './CameraAnimation';
import type { LatLng } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A marker's position/heading at a moment in time — the animatable unit this file operates on. */
export interface MarkerAnimationState {
  position: LatLng;
  /** Degrees 0-360, or `null` for markers that never rotate (e.g. the customer dot) — mirrors `useAnimatedMarker`'s optional `heading` prop. */
  heading: number | null;
  timestampMs: number;
}

/**
 * Per-marker-kind animation tuning. Position and heading run on
 * independent timelines — matching `useAnimatedMarker`'s two separate
 * `withTiming` calls — so a marker can keep gliding smoothly to a new
 * coordinate while its rotation settles on its own schedule, or vice versa.
 */
export interface MarkerProfile {
  /** Whether this marker kind rotates to a heading at all. `false` for the customer dot, which only ever moves. */
  tracksHeading: boolean;
  /** Duration (ms) of the position tween. */
  positionDurationMs: number;
  /** Duration (ms) of the heading tween. Ignored when `tracksHeading` is false. */
  headingDurationMs: number;
}

/** A single in-flight marker animation: where it started, where it's going, on which two timelines. */
export interface MarkerTransition {
  from: MarkerAnimationState;
  to: MarkerAnimationState;
  positionDurationMs: number;
  headingDurationMs: number;
  /** Unix ms timestamp the transition began — both timelines are measured from this one moment. */
  startTimestampMs: number;
}

/** The result of sampling a `MarkerTransition` at a point in time — what a renderer should actually draw right now. */
export interface MarkerFrame {
  position: LatLng;
  /** `null` only when neither endpoint of the transition tracks heading. */
  heading: number | null;
  /** 0-1 progress through the position timeline, clamped. */
  positionProgress: number;
  /** 0-1 progress through the heading timeline, clamped. Equal to `positionProgress` whenever both durations match (the common case today — see the three profiles below). */
  headingProgress: number;
  /** True once both timelines have reached 1. */
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Marker profiles — the three named responsibilities (driver, customer,
// navigation arrow), expressed as data rather than three near-identical
// functions. Timings are `@/lib/mapAnimation`'s existing, already-tuned
// `MARKER_ANIMATION` constants — the same numbers `useAnimatedMarker`
// defaults to today — not new values invented for this file.
// ---------------------------------------------------------------------------

/** Top-down vehicle marker (Bible/AGENTS.md: driver position). Tracks heading — matches `AnimatedVehicleMarker`'s current defaults exactly. */
export const DRIVER_MARKER_PROFILE: MarkerProfile = {
  tracksHeading: true,
  positionDurationMs: MARKER_ANIMATION.positionDurationMs,
  headingDurationMs: MARKER_ANIMATION.rotationDurationMs,
};

/** Customer location dot. Position only — matches `AnimatedUserLocation`, which never passes a `heading`. */
export const CUSTOMER_MARKER_PROFILE: MarkerProfile = {
  tracksHeading: false,
  positionDurationMs: MARKER_ANIMATION.positionDurationMs,
  headingDurationMs: 0,
};

/** Turn-by-turn navigation arrow. Tracks heading — matches `NavigationArrowMarker`'s current defaults exactly (today numerically identical to `DRIVER_MARKER_PROFILE`; kept as its own named constant since the two are conceptually distinct Bible responsibilities and may tune independently later). */
export const NAVIGATION_ARROW_PROFILE: MarkerProfile = {
  tracksHeading: true,
  positionDurationMs: MARKER_ANIMATION.positionDurationMs,
  headingDurationMs: MARKER_ANIMATION.rotationDurationMs,
};

// ---------------------------------------------------------------------------
// Position interpolation
// ---------------------------------------------------------------------------

/**
 * Linearly interpolates between two coordinates — the position half of
 * "remove marker jumping": every intermediate frame is a real point on the
 * straight line between `from` and `to`, never a snap.
 *
 * @param from Starting coordinate.
 * @param to Target coordinate.
 * @param t Progress, 0-1 (not clamped here — callers pass an already-clamped
 * progress from `computeMarkerFrame`; exposed standalone so it's directly
 * testable/reusable on its own).
 * @example `interpolateMarkerPosition(a, b, 0.5)` — the midpoint.
 * Performance: O(1), allocation-light — safe every frame.
 */
export function interpolateMarkerPosition(from: LatLng, to: LatLng, t: number): LatLng {
  return {
    latitude: lerp(from.latitude, to.latitude, t),
    longitude: lerp(from.longitude, to.longitude, t),
  };
}

// ---------------------------------------------------------------------------
// Bearing smoothing
// ---------------------------------------------------------------------------

/**
 * Low-pass-filters a raw heading reading (e.g. straight off a GPS fix)
 * against the previously smoothed value, before it ever becomes an
 * animation target — distinct from heading *interpolation* below, which
 * tweens between two already-known headings over time. Thin, explicit
 * re-export of `CameraAnimation.smoothHeading`: bearing smoothing is the
 * same operation for a marker as it is for the camera (shortest-arc,
 * one-step exponential filter), so this file doesn't re-derive it — it just
 * gives it a marker-appropriate name at this file's public surface, since
 * "Bearing smoothing" is one of this file's own named responsibilities.
 *
 * @param previous Last smoothed heading, degrees.
 * @param next Latest raw heading, degrees.
 * @param smoothingFactor 0-1 — 0 ignores the new reading, 1 snaps to it.
 * @example `smoothMarkerHeading(previousHeading, rawFix.heading, 0.2)`.
 */
export function smoothMarkerHeading(previous: number, next: number, smoothingFactor: number): number {
  return smoothHeading(previous, next, smoothingFactor);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Begins a new marker transition from `from` to `to`, using `profile`'s
 * timings. If `profile.tracksHeading` is false, the target heading is
 * forced to `null` regardless of what `to.heading` was given — a
 * non-rotating marker kind should never animate a heading it will never
 * render.
 *
 * @example
 * ```ts
 * const transition = startMarkerTransition(previousState, latestFix, DRIVER_MARKER_PROFILE, Date.now());
 * ```
 */
export function startMarkerTransition(
  from: MarkerAnimationState,
  to: MarkerAnimationState,
  profile: MarkerProfile,
  nowMs: number
): MarkerTransition {
  return {
    from,
    to: profile.tracksHeading ? to : { ...to, heading: null },
    positionDurationMs: profile.positionDurationMs,
    headingDurationMs: profile.headingDurationMs,
    startTimestampMs: nowMs,
  };
}

/**
 * Samples a `MarkerTransition` at the current time — heading interpolation
 * and position interpolation combined into the one frame a renderer should
 * draw right now. Heading always takes the shortest arc (via
 * `CameraAnimation.interpolateBearing`) so e.g. 350° -> 10° sweeps the
 * short way, matching `useAnimatedMarker`'s `shortestRotation` behaviour.
 *
 * @param transition The active transition.
 * @param nowMs Current Unix ms timestamp, passed in rather than read
 * internally so this stays a pure function of its arguments — no hidden
 * clock, fully testable.
 * @example A transition started at `t0` with a 1800ms position duration,
 * sampled at `t0 + 900` -> `positionProgress: 0.5`.
 * Performance: O(1) — safe to call every frame (60fps budget is ~16.7ms;
 * this does a handful of arithmetic ops, nowhere close to that budget).
 */
export function computeMarkerFrame(transition: MarkerTransition, nowMs: number): MarkerFrame {
  const elapsed = nowMs - transition.startTimestampMs;
  const positionProgress = transition.positionDurationMs <= 0 ? 1 : clamp(elapsed / transition.positionDurationMs, 0, 1);
  const headingProgress = transition.headingDurationMs <= 0 ? 1 : clamp(elapsed / transition.headingDurationMs, 0, 1);

  const position = interpolateMarkerPosition(transition.from.position, transition.to.position, positionProgress);

  let heading: number | null = null;
  if (transition.to.heading !== null) {
    heading =
      transition.from.heading !== null
        ? interpolateBearing(transition.from.heading, transition.to.heading, headingProgress)
        : normalizeHeading(transition.to.heading);
  }

  return {
    position,
    heading,
    positionProgress,
    headingProgress,
    isComplete: positionProgress >= 1 && headingProgress >= 1,
  };
}

/**
 * Retargets an in-flight transition toward a new state without jumping —
 * the core of "remove marker jumping" for the case a fresh GPS fix arrives
 * before the previous animation finished. Samples the CURRENT frame first
 * and starts the new transition from there (wherever the marker visually
 * is right now), exactly matching `useAnimatedMarker`'s documented
 * behaviour: "If a newer fix arrives before the previous animation
 * completes, withTiming retargets from the in-flight value and continues
 * toward the newest position."
 *
 * @param transition The transition currently in flight.
 * @param newTarget The newly-arrived state to animate toward.
 * @param profile Timings for the new leg (usually the same profile the
 * original transition used).
 * @param nowMs Current Unix ms timestamp.
 * @example
 * ```ts
 * // A new GPS fix arrives mid-animation:
 * activeTransition = retargetMarkerTransition(activeTransition, newFixState, DRIVER_MARKER_PROFILE, Date.now());
 * ```
 */
export function retargetMarkerTransition(
  transition: MarkerTransition,
  newTarget: MarkerAnimationState,
  profile: MarkerProfile,
  nowMs: number
): MarkerTransition {
  const currentFrame = computeMarkerFrame(transition, nowMs);
  const from: MarkerAnimationState = {
    position: currentFrame.position,
    heading: currentFrame.heading,
    timestampMs: nowMs,
  };
  return startMarkerTransition(from, newTarget, profile, nowMs);
}

// Re-exported for convenience so a consumer of this file doesn't also need
// a direct `CameraAnimation` import just to compute a shortest-arc target
// heading (e.g. for a custom renderer that wants the raw angle rather than
// a full `MarkerFrame`).
export { shortestBearing };
