import { Platform } from 'react-native';

/**
 * Environment configuration
 * Centralizes access to environment variables and provides platform-specific API keys
 */

/**
 * Get the appropriate Google Maps API key for the current platform
 * Returns platform-specific key if available, otherwise falls back to generic key
 */
export function getGoogleMapsApiKey(): string | undefined {
  // Try platform-specific keys first
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  }
  
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  }
  
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  }
  
  // Fallback to generic key
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
}

/**
 * Check if Google Maps API key is configured
 */
export function hasGoogleMapsApiKey(): boolean {
  const key = getGoogleMapsApiKey();
  return !!key && key.length > 0;
}

/**
 * Get all environment variables for debugging (redacted)
 */
export function getEnvInfo() {
  return {
    hasWebKey: !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB,
    hasAndroidKey: !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID,
    hasIosKey: !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS,
    hasGenericKey: !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    platform: Platform.OS,
  };
}

