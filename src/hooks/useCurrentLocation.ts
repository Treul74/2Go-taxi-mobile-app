import { getHex9 } from '@/core/spatialEngine';
import type { Location as LocationType } from '@/types';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * Hook to get and track user's current location
 * Requests permissions and provides current coordinates with H3 spatial indexing
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
    let subscription: Location.LocationSubscription | null = null;

    // Applies a GPS fix: reverse geocodes it, indexes it, and updates state.
    // Called for every update the position watcher emits, not just the first.
    async function applyPosition(position: Location.LocationObject) {
      // 4. Reverse geocode to get address
      let formattedAddress = 'Current Location';
      let provinceName = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
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

      // Calculate H3 hexagon index
      const hex9 = getHex9(
        position.coords.latitude,
        position.coords.longitude
      );

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        address: formattedAddress || 'Current Location',
        hex9,
      });

      setLoading(false);
    }

    async function startWatchingLocation() {
      try {
        // 1. Check if services are enabled
        const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
        if (!enabled) {
          if (isMounted) {
            setError('Location services are disabled');
            setLoading(false);
          }
          return;
        }

        // 2. Request permissions
        const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));

        if (!isMounted) return;
        setPermissionStatus(status as Location.PermissionStatus);

        if (status !== 'granted') {
          setError('Location permission denied');
          setLoading(false);
          return;
        }

        // 3. Watch position instead of a one-time read, so a "live location"
        // pickup keeps tracking the customer: a fresh fix every ~60s or after
        // moving ~50m, whichever comes first.
        try {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 60000,
              distanceInterval: 50,
            },
            applyPosition
          );

          if (!isMounted) {
            subscription.remove();
            subscription = null;
          }
        } catch (e) {
          // Fallback to last known fix if the watcher can't start
          const position = await Location.getLastKnownPositionAsync();
          if (!isMounted) return;
          if (position) {
            applyPosition(position);
          } else {
            setError('Could not determine current location');
            setLoading(false);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;

        setError('Failed to get location');
        setLoading(false);
      }
    }

    startWatchingLocation();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  const refetch = async () => {
    setLoading(true);
    setError(null);

    try {
      let position = null;
      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch (e) {
        position = await Location.getLastKnownPositionAsync();
      }

      if (!position) throw new Error('Location unavailable');

      let formattedAddress = 'Current Location';
      let provinceName = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (address) {
          formattedAddress = `${address.street || ''}, ${address.city || ''}, ${address.region || ''}`.trim();
          provinceName = address.region || address.subregion || null;
        }
      } catch (e) {
        // Geocode failed
      }

      setProvince(provinceName);

      // Calculate H3 hexagon index
      const hex9 = getHex9(
        position.coords.latitude,
        position.coords.longitude
      );

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
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
    hasPermission: permissionStatus === 'granted',
  };
}

