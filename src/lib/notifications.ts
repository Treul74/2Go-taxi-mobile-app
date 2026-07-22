// Must precede the expo-notifications import below: that import warns at
// load time on Android/Expo Go, and route files elsewhere in the app can
// pull this module in before app/_layout.tsx's own copy of this import runs
// (expo-router's directory scan doesn't guarantee _layout.tsx loads first).
import '@/lib/suppressExpoGoWarnings';

import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import Constants from 'expo-constants';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push notification setup and token registration.
 *
 * Only this file talks to expo-notifications for permissions/tokens, and the
 * push_token writes to customers/drivers live here (src/lib is the only layer
 * allowed to call InsForge). Notification *triggers* (actually sending pushes
 * on ride events) are not implemented yet — this is setup only.
 */

// Expo Go (SDK 53+) dropped remote push support entirely, and merely
// importing expo-notifications there logs a warning as a load-time side
// effect. Loading it lazily, only outside Expo Go, means the module never
// gets required at all in Expo Go, so the warning never fires.
const isExpoGo = Constants.appOwnership === 'expo';

const getNotifications = async (): Promise<typeof NotificationsType | null> => {
  if (isExpoGo) return null;
  return await import('expo-notifications');
};

// Show notifications as banners even while the app is foregrounded, so
// in-app events surfaced via sendLocalNotification are visible.
(async () => {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
})();

/**
 * Asks for notification permission (no-op prompt if already granted or
 * permanently denied). Returns whether notifications are allowed.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const Notifications = await getNotifications();
  if (!Notifications) return false;

  // Android 8+ requires a channel before any notification can display.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Fetches the Expo push token for this device and saves it to the logged-in
 * user's customers row and (if they have one) drivers row. Safe to call on
 * every login — it just overwrites with the current device's token. Never
 * throws: a missing token (Expo Go, simulators) must not break login.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  const authId = useAuthStore.getState().authUserId;
  if (!authId) return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  let token: string;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Expected on simulators (no remote push support) — the app keeps
    // working without a token.
    return;
  }

  // Updating a drivers row that doesn't exist is a no-op, so no existence
  // check is needed — this covers customer-only and customer+driver accounts.
  await Promise.all([
    insforge.database.from('customers').update({ push_token: token }).eq('auth_id', authId),
    insforge.database.from('drivers').update({ push_token: token }).eq('auth_id', authId),
  ]);
}

/** Fires an immediate device notification for an in-app event. */
export async function sendLocalNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a remote push notification to a device via the Expo Push API. Used
 * for every ride-lifecycle event (see rideStore.ts / driverStore.ts /
 * driverOrders.ts) to notify a *different* device than the one currently
 * running this code — e.g. the customer's device from the driver's app, or
 * vice versa. Never throws: a failed push must not break the caller's status
 * update, which has already succeeded server-side by the time this runs.
 */
export async function sendPushNotification(
  pushToken: string | null | undefined,
  title: string,
  body: string
): Promise<void> {
  if (!pushToken) return;

  try {
    await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
    });
  } catch {
    // Never throws: caller's status update has already succeeded server-side.
  }
}
