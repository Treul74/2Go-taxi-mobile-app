/**
 * The Navigation Engine's state machine: states + legal transitions.
 *
 * State set is AGENTS.md's "Navigation Modes" list, verbatim (IDLE, PREVIEW,
 * MATCHING, DRIVER_TO_PICKUP, ARRIVED_PICKUP, TRIP_IN_PROGRESS,
 * ARRIVED_DROPOFF, TRIP_COMPLETED, OFFLINE) — explicitly specified by name in
 * the prompt that requested this implementation.
 *
 * Note for future readers: an earlier architecture-only pass on this file
 * used the Navigation Bible's finer-grained split instead (SEARCHING_DRIVER +
 * DRIVER_ACCEPTED in place of MATCHING, NAVIGATE_TO_PICKUP/WAITING_AT_PICKUP/
 * NEAR_DESTINATION/COMPLETED in place of DRIVER_TO_PICKUP/ARRIVED_PICKUP/
 * ARRIVED_DROPOFF/TRIP_COMPLETED), per AGENTS.md's "Bible takes precedence on
 * conflict" rule. This implementation was commissioned with the AGENTS.md
 * list given explicitly, so that list is what's implemented here. If a
 * future pass wants the Bible's extra granularity (e.g. a distinct
 * "driver accepted, camera easing toward them" moment before
 * DRIVER_TO_PICKUP), it should extend this table rather than fork it.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export enum NavigationMode {
  /** User selecting locations. No trip requested yet, and a Transporter in this mode is available but unassigned. */
  IDLE = 'IDLE',
  /** Displaying Pickup and Drop-off. Both points are known and previewed before the request is submitted. */
  PREVIEW = 'PREVIEW',
  /** Waiting for a driver. The request has been submitted; the app is searching for / awaiting acceptance from a Transporter. */
  MATCHING = 'MATCHING',
  /** Driver navigating to Pickup. A Transporter has been assigned and is en route to the Customer. */
  DRIVER_TO_PICKUP = 'DRIVER_TO_PICKUP',
  /** Driver waiting for Customer. The Transporter has reached the pickup point and is waiting to start the trip. */
  ARRIVED_PICKUP = 'ARRIVED_PICKUP',
  /** Customer onboard. The Transporter is en route to the destination with the Customer/delivery aboard. */
  TRIP_IN_PROGRESS = 'TRIP_IN_PROGRESS',
  /** Driver reached destination. The Transporter has arrived at the drop-off point; the trip is not yet finalized. */
  ARRIVED_DROPOFF = 'ARRIVED_DROPOFF',
  /** Trip finished. The trip has been finalized; a summary is shown before returning to IDLE. */
  TRIP_COMPLETED = 'TRIP_COMPLETED',
  /** Driver unavailable. The Transporter is not online and cannot receive or navigate any request. */
  OFFLINE = 'OFFLINE',
}

/** Runtime-readable description per mode — the same text as the doc comments above, exposed as data for tooling/tests/debug overlays. */
export const NAVIGATION_MODE_DESCRIPTIONS: Readonly<Record<NavigationMode, string>> = {
  [NavigationMode.IDLE]:
    'User selecting locations. No trip requested yet, and a Transporter in this mode is available but unassigned.',
  [NavigationMode.PREVIEW]:
    'Displaying Pickup and Drop-off. Both points are known and previewed before the request is submitted.',
  [NavigationMode.MATCHING]:
    'Waiting for a driver. The request has been submitted; the app is searching for / awaiting acceptance from a Transporter.',
  [NavigationMode.DRIVER_TO_PICKUP]:
    'Driver navigating to Pickup. A Transporter has been assigned and is en route to the Customer.',
  [NavigationMode.ARRIVED_PICKUP]:
    'Driver waiting for Customer. The Transporter has reached the pickup point and is waiting to start the trip.',
  [NavigationMode.TRIP_IN_PROGRESS]:
    'Customer onboard. The Transporter is en route to the destination with the Customer/delivery aboard.',
  [NavigationMode.ARRIVED_DROPOFF]:
    'Driver reached destination. The Transporter has arrived at the drop-off point; the trip is not yet finalized.',
  [NavigationMode.TRIP_COMPLETED]:
    'Trip finished. The trip has been finalized; a summary is shown before returning to IDLE.',
  [NavigationMode.OFFLINE]:
    'Driver unavailable. The Transporter is not online and cannot receive or navigate any request.',
};

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * The complete, exhaustive legal-transition table. This is the single
 * source of truth for what the state machine allows — NavigationStore.ts
 * enforces every mutation against this table via `assertValidTransition`.
 * Nothing outside this file decides what's legal.
 */
export const NAVIGATION_MODE_TRANSITIONS: Readonly<Record<NavigationMode, readonly NavigationMode[]>> = {
  // A Customer selects pickup + destination -> preview the route before
  // booking. A Transporter who is idle (unassigned, no active request) can
  // also go OFFLINE directly since there is nothing in progress to interrupt.
  [NavigationMode.IDLE]: [NavigationMode.PREVIEW, NavigationMode.OFFLINE],

  // Booking confirmed -> broadcast to Transporters and wait for a match.
  // Or the Customer backs out before booking -> back to IDLE.
  [NavigationMode.PREVIEW]: [NavigationMode.MATCHING, NavigationMode.IDLE],

  // A Transporter accepts -> they start navigating to the pickup point.
  // Or no Transporter accepts (timeout) / the Customer cancels while
  // waiting -> back to IDLE.
  [NavigationMode.MATCHING]: [NavigationMode.DRIVER_TO_PICKUP, NavigationMode.IDLE],

  // The Transporter reaches the pickup point -> now waiting for the
  // Customer. Or the trip is cancelled en route (by either party) -> IDLE.
  [NavigationMode.DRIVER_TO_PICKUP]: [NavigationMode.ARRIVED_PICKUP, NavigationMode.IDLE],

  // The Customer boards -> the trip begins. Or the trip is cancelled at the
  // curb (e.g. a no-show) -> back to IDLE.
  [NavigationMode.ARRIVED_PICKUP]: [NavigationMode.TRIP_IN_PROGRESS, NavigationMode.IDLE],

  // Once the Customer is onboard, the only legal forward path is reaching
  // the destination. Deliberately NOT cancellable from here — a trip
  // already in progress must be completed; disputes/emergency cancellation
  // are handled by a separate support flow outside this state machine.
  [NavigationMode.TRIP_IN_PROGRESS]: [NavigationMode.ARRIVED_DROPOFF],

  // Reaching the destination only leads to finalizing the trip.
  [NavigationMode.ARRIVED_DROPOFF]: [NavigationMode.TRIP_COMPLETED],

  // After the trip summary is shown, the only legal path is back to IDLE,
  // ready for the next request.
  [NavigationMode.TRIP_COMPLETED]: [NavigationMode.IDLE],

  // A Transporter coming back online returns to IDLE (available, unassigned).
  [NavigationMode.OFFLINE]: [NavigationMode.IDLE],
};

/** Modes where a Transporter is actively driving toward a destination (used to gate driving-only behaviour in later phases, e.g. GPS/camera). */
export const ACTIVE_DRIVING_MODES: readonly NavigationMode[] = [
  NavigationMode.DRIVER_TO_PICKUP,
  NavigationMode.TRIP_IN_PROGRESS,
];

/**
 * Modes from which a customer-initiated `cancel()` is legal. Distinct from
 * `TRIP_COMPLETED -> IDLE` (natural end of a finished trip) and
 * `OFFLINE -> IDLE` (a Transporter coming back online) — both also route
 * through IDLE but aren't "cancellations" in the product sense, even though
 * all three are the same edge in the transition table.
 */
export const CANCELLABLE_MODES: readonly NavigationMode[] = [
  NavigationMode.PREVIEW,
  NavigationMode.MATCHING,
  NavigationMode.DRIVER_TO_PICKUP,
  NavigationMode.ARRIVED_PICKUP,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Thrown by `assertValidTransition` (and therefore by every NavigationStore action) when a transition isn't in `NAVIGATION_MODE_TRANSITIONS`. */
export class NavigationTransitionError extends Error {
  readonly from: NavigationMode;
  readonly to: NavigationMode;
  readonly legalNextModes: readonly NavigationMode[];

  constructor(from: NavigationMode, to: NavigationMode) {
    const legalNextModes = NAVIGATION_MODE_TRANSITIONS[from];
    const legalList =
      legalNextModes.length > 0 ? legalNextModes.join(', ') : '(none — no outgoing transitions defined)';
    super(`Illegal navigation transition: "${from}" -> "${to}". Legal next mode(s) from "${from}": ${legalList}.`);
    this.name = 'NavigationTransitionError';
    this.from = from;
    this.to = to;
    this.legalNextModes = legalNextModes;
  }
}

/** Pure check — does not throw. Prefer `assertValidTransition` at call sites that must fail loudly. */
export function isValidTransition(from: NavigationMode, to: NavigationMode): boolean {
  return NAVIGATION_MODE_TRANSITIONS[from].includes(to);
}

/** Throws `NavigationTransitionError` if `to` is not a legal next mode from `from`. */
export function assertValidTransition(from: NavigationMode, to: NavigationMode): void {
  if (!isValidTransition(from, to)) {
    throw new NavigationTransitionError(from, to);
  }
}

/** All legal next modes from `from`, per `NAVIGATION_MODE_TRANSITIONS`. */
export function getLegalNextModes(from: NavigationMode): readonly NavigationMode[] {
  return NAVIGATION_MODE_TRANSITIONS[from];
}
