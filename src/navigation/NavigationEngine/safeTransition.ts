/**
 * Wraps a `NavigationActions` mode-transition dispatch so a mismatch between
 * the real driver-lifecycle state and `NavigationStore.mode` (first app
 * open, a remount, an out-of-order event) can never crash the calling
 * screen. `NavigationStore`'s actions throw `NavigationTransitionError`
 * synchronously when the requested edge isn't legal from the current mode
 * (see `NavigationModes.assertValidTransition`) — every new integration
 * call site added in Phase 5 (Runtime Integration) goes through this instead
 * of calling a `useNavigation()` action directly, so illegal-transition
 * edge cases degrade to a console warning instead of an uncaught exception.
 */

import { NavigationTransitionError } from './NavigationModes';

export function safeTransition(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof NavigationTransitionError) {
      console.warn('[NavigationStore] ignored illegal transition:', error.message);
      return;
    }
    throw error;
  }
}
