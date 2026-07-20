import { updateDriverTelemetry } from '@/services/driverOrders';
import { useEffect, useRef } from 'react';

interface TelemetryCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Pings driver_current_lat/lng/heading on the order row every 5s while an
 * order is active. Reads location/heading through refs so the interval
 * itself is only set up once per orderId -- it doesn't restart on every GPS
 * tick, which would drift the cadence away from 5s.
 */
export function useDriverTelemetryPing(
  orderId: string | undefined,
  location: TelemetryCoordinate | null,
  heading: number
) {
  const locationRef = useRef(location);
  const headingRef = useRef(heading);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);

  useEffect(() => {
    if (!orderId) return;

    const interval = setInterval(() => {
      const current = locationRef.current;
      if (!current) return;
      updateDriverTelemetry(orderId, current.latitude, current.longitude, headingRef.current);
    }, 5000);

    return () => clearInterval(interval);
  }, [orderId]);
}
