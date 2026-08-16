import { insforge } from '@/lib/insforge';

/**
 * Checks whether a point falls inside any active service area.
 *
 * This calls the server-side is_within_service_area() RPC
 * (migrations/20260728194010_enforce-service-area-on-order-creation.sql) --
 * the same function the order_area_validation_trigger uses to reject
 * out-of-coverage bookings at INSERT time. This is a UX convenience check
 * only; never reimplement the polygon/radius math client-side.
 */
export async function isWithinServiceArea(
  lat: number,
  lng: number
): Promise<{ available: boolean; errorMessage: string | null }> {
  const { data, error } = await insforge.database.rpc('is_within_service_area', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    return { available: false, errorMessage: error.message ?? 'Failed to check service area availability' };
  }

  return { available: Boolean(data), errorMessage: null };
}
