import { LogBox } from 'react-native';

/**
 * expo-notifications fires this the instant it's imported on Android in Expo
 * Go (SDK 53+ dropped remote push support there) -- before any of our own
 * code runs, so it can't be guarded with a try/catch. Harmless: push just
 * doesn't work in Expo Go, and registerPushToken() already handles that.
 * Must be imported before anything that imports expo-notifications (see
 * app/_layout.tsx import order) so the ignore rule is registered first.
 */
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);
