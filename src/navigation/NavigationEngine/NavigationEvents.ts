/**
 * Event contracts + bus for the Navigation Engine's state machine.
 *
 * Scope note: an earlier architecture-only pass on this file also declared
 * route/GPS event types (ROUTE_CALCULATED, REROUTE_TRIGGERED, STEP_ADVANCED,
 * OFF_ROUTE_DETECTED, GPS_SIGNAL_LOST/RECOVERED) as forward-looking
 * placeholders. Those belong to the Route/GPS implementation phases, not
 * the state machine, so they've been removed here to keep this file honest
 * about what's actually implemented — reintroduce them alongside whichever
 * phase implements routing/GPS.
 *
 * Only two events exist right now, both purely about mode transitions:
 * MODE_CHANGED (a transition succeeded) and TRANSITION_REJECTED (a
 * transition was attempted and rejected by NavigationStore before it threw
 * `NavigationTransitionError`). Emitting a rejection event as well as
 * throwing lets a consumer log/observe illegal-transition attempts without
 * needing a try/catch around every call site.
 */

import type { NavigationMode } from './NavigationModes';

export interface NavigationEventPayloadMap {
  MODE_CHANGED: { previous: NavigationMode; next: NavigationMode };
  TRANSITION_REJECTED: { from: NavigationMode; attempted: NavigationMode; reason: string };
}

export type NavigationEventType = keyof NavigationEventPayloadMap;

export type NavigationEvent<T extends NavigationEventType = NavigationEventType> = {
  type: T;
  payload: NavigationEventPayloadMap[T];
  timestamp: number;
};

export interface NavigationEventBus {
  emit: <T extends NavigationEventType>(type: T, payload: NavigationEventPayloadMap[T]) => void;
  /** Returns an unsubscribe function. */
  on: <T extends NavigationEventType>(type: T, handler: (event: NavigationEvent<T>) => void) => () => void;
}

type AnyHandler = (event: NavigationEvent<NavigationEventType>) => void;

/** Minimal, dependency-free typed pub/sub. Fully implemented — this is plain synchronous fan-out, no async queueing or persistence. */
export function createNavigationEventBus(): NavigationEventBus {
  const handlersByType = new Map<NavigationEventType, Set<AnyHandler>>();

  return {
    emit(type, payload) {
      const event: NavigationEvent<typeof type> = { type, payload, timestamp: Date.now() };
      const handlers = handlersByType.get(type);
      if (!handlers) return;
      // Snapshot before iterating so a handler unsubscribing mid-emit doesn't skip siblings.
      for (const handler of [...handlers]) {
        handler(event as NavigationEvent<NavigationEventType>);
      }
    },
    on(type, handler) {
      let handlers = handlersByType.get(type);
      if (!handlers) {
        handlers = new Set();
        handlersByType.set(type, handlers);
      }
      const anyHandler = handler as unknown as AnyHandler;
      handlers.add(anyHandler);
      return () => {
        handlersByType.get(type)?.delete(anyHandler);
      };
    },
  };
}

/**
 * The engine-wide singleton. NavigationStore emits on this directly; any
 * future consumer (tests, a debug overlay, eventually NavigationProvider's
 * VoiceGuidance/analytics wiring) subscribes via `navigationEventBus.on(...)`
 * without needing React context.
 */
export const navigationEventBus: NavigationEventBus = createNavigationEventBus();
