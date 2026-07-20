import { getHex9 } from '@/core/spatialEngine';
import { nearestRoad } from '@/lib/google';
import type { Location } from '@/types';
import { useEffect, useState } from 'react';
import { useCurrentLocation } from './useCurrentLocation';

/**
 * Hook that provides a road-snapped version of the user's current location
 * Optimized for display on maps to ensure marker sits on actual roads
 */
export function useSnappedLocation(enabled: boolean = true) {
    const { location: rawLocation, loading, error, ...rest } = useCurrentLocation();
    const [snappedLocation, setSnappedLocation] = useState<Location | null>(null);
    const [isSnapping, setIsSnapping] = useState(false);

    useEffect(() => {
        if (!rawLocation) {
            setSnappedLocation(null);
            return;
        }

        if (!enabled) {
            setSnappedLocation(rawLocation);
            return;
        }

        async function performSnapping() {
            if (!rawLocation) return;
            setIsSnapping(true);
            try {
                const snapped = await nearestRoad({
                    latitude: rawLocation.latitude,
                    longitude: rawLocation.longitude
                });
                if (snapped) {
                    // Recalculate hex9 for the snapped coordinates
                    const hex9 = getHex9(snapped.latitude, snapped.longitude);

                    setSnappedLocation({
                        latitude: snapped.latitude,
                        longitude: snapped.longitude,
                        address: rawLocation.address,
                        hex9,
                    });
                } else {
                    setSnappedLocation(rawLocation);
                }
            } catch (err) {
                console.error('Failed to snap location to road:', err);
                setSnappedLocation(rawLocation);
            } finally {
                setIsSnapping(false);
            }
        }

        performSnapping();
    }, [rawLocation, enabled]);

    return {
        location: snappedLocation,
        rawLocation,
        loading: loading || isSnapping,
        error,
        ...rest,
    };
}
