// Must precede the expo-notifications import below — see notifications.ts.
import '@/lib/suppressExpoGoWarnings';

import { useDriverStore } from '@/state/driverStore';
import { useRideStore } from '@/state/rideStore';
import { useUserStore } from '@/state/userStore';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const useLastNotificationResponseCompat = Platform.OS === 'web'
  ? () => null
  : Notifications.useLastNotificationResponse;

// Where a notification tap should land: the active trip screen when a trip
// is ongoing, home otherwise.
function resolveNotificationRoute(): Href {
  const role = useUserStore.getState().role;

  if (role === 'driver') {
    const { currentTrip, tripStatus } = useDriverStore.getState();
    if (currentTrip) {
      return tripStatus === 'in_progress' || tripStatus === 'completed'
        ? '/(driver)/trip'
        : '/(driver)/navigation';
    }
    return '/(tabs)';
  }

  // PassengerHome on the tabs' home screen shows the ActiveTripCard.
  if (useRideStore.getState().activeTrip) return '/(tabs)';
  return '/discover';
}

/**
 * Navigates when the user opens the app by tapping a notification.
 * useLastNotificationResponse covers both the tap that cold-launched the app
 * and taps while the app is backgrounded. Pass enabled=false until the
 * protected stack is mounted (appReady && authed) so navigation can't fire
 * into a stack that doesn't exist yet.
 */
export function useNotificationTapNavigation(enabled: boolean) {
  const lastResponse = useLastNotificationResponseCompat();
  const handledResponse = useRef<typeof lastResponse>(null);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    if (!lastResponse || lastResponse === handledResponse.current) return;
    handledResponse.current = lastResponse;
    router.navigate(resolveNotificationRoute());
  }, [enabled, lastResponse]);
}
