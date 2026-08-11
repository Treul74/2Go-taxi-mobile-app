import { getHex9 } from '@/core/spatialEngine';
import * as GPSManager from '@/navigation/NavigationEngine/GPSManager';
import type { GPSFix } from '@/navigation/NavigationEngine/types';
import type { Location as LocationType } from '@/types';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * Hook to get and track user's current location
 * Requests permissions and provides current coordinates with H3 spatial indexing
 *
 * GPS acquisition itself goes entirely through GPSManager (the only file
 * allowed to create a location subscription — see
 * src/navigation/NavigationEngine/GPSManager.ts). This hook is a consumer,
 * not an owner: it calls `acquire`/`release` rather than
 * `Location.watchPositionAsync` directly, so it can be (and is) used by more
 * than one component at once — e.g. directly here and indirectly via
 * `useSnappedLocation` in the same screen — without starting a second
 * watcher. Only the `Location.PermissionStatus` enum is imported from
 * `expo-location` directly, for typing this hook's existing public
 * `permissionStatus` field; no location API is called on it.
 *
 * Returns:
 * - location: { latitude, longitude, address, hex9 }
 * - hex9: H3 hexagon index at resolution 9 (≈170m precision)
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<LocationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [province, setProvince] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Applies a GPS fix: reverse geocodes it, indexes it, and updates state.
    // Called for every update GPSManager delivers, not just the first.
    async function applyFix(fix: GPSFix) {
      let formattedAddress = 'Current Location';
      let provinceName = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: fix.coordinate.latitude,
          longitude: fix.coordinate.longitude,
        });

        if (address) {
          formattedAddress = `${address.street || ''}, ${address.city || ''}, ${address.region || ''}`.trim();
          provinceName = address.region || address.subregion || null;
        }
      } catch (e) {
        // Silent failure for geocoding
      }

      if (!isMounted) return;

      setProvince(provinceName);

      const hex9 = getHex9(fix.coordinate.latitude, fix.coordinate.longitude);

      setLocation({
        latitude: fix.coordinate.latitude,
        longitude: fix.coordinate.longitude,
        address: formattedAddress || 'Current Location',
        hex9,
      });

      setLoading(false);
    }

    let unsubscribeFix: (() => void) | null = null;

    async function startWatchingLocation() {
      try {
        unsubscribeFix = GPSManager.onFix(applyFix);

        // A sibling consumer may already have GPSManager tracking active —
        // seed immediately from its last fix instead of waiting for the
        // next tick, matching the old hook's "apply the initial read right
        // away" feel.
        const existingFix = GPSManager.getLastFix();
        if (existingFix) {
          applyFix(existingFix);
        }

        await GPSManager.acquire('foreground', 'customerBalanced');
        if (!isMounted) return;
        setPermissionStatus(Location.PermissionStatus.GRANTED);
      } catch (err) {
        if (!isMounted) return;
        unsubscribeFix?.();
        unsubscribeFix = null;

        const code = err instanceof GPSManager.GPSManagerError ? err.code : null;
        if (code === 'SERVICES_DISABLED') {
          setError('Location services are disabled');
        } else if (code === 'PERMISSION_DENIED') {
          setPermissionStatus(Location.PermissionStatus.DENIED);
          setError('Location permission denied');
        } else {
          setError('Failed to get location');
        }
        setLoading(false);
      }
    }

    startWatchingLocation();

    return () => {
      isMounted = false;
      unsubscribeFix?.();
      GPSManager.release();
    };
  }, []);

  const refetch = async () => {
    setLoading(true);
    setError(null);

    try {
      const fix = await GPSManager.getCurrentFix('customerBalanced');
      if (!fix) throw new Error('Location unavailable');

      let formattedAddress = 'Current Location';
      let provinceName = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: fix.coordinate.latitude,
          longitude: fix.coordinate.longitude,
        });

        if (address) {
          formattedAddress = `${address.street || ''}, ${address.city || ''}, ${address.region || ''}`.trim();
          provinceName = address.region || address.subregion || null;
        }
      } catch (e) {
        // Geocode failed
      }

      setProvince(provinceName);

      const hex9 = getHex9(fix.coordinate.latitude, fix.coordinate.longitude);

      setLocation({
        latitude: fix.coordinate.latitude,
        longitude: fix.coordinate.longitude,
        address: formattedAddress || 'Current Location',
        hex9,
      });
    } catch (err: any) {
      setError('Failed to refresh location');
    } finally {
      setLoading(false);
    }
  };

  return {
    location,
    loading,
    error,
    permissionStatus,
    province,
    refetch,
    hasPermission: permissionStatus === Location.PermissionStatus.GRANTED,
  };
}
