import { insforge } from '@/lib/insforge';
import type { VehicleType } from '@/types';

/**
 * Row shape of vehicle_classes_public. Numeric columns can come back as
 * strings over PostgREST, same as every other money-shaped column read
 * elsewhere in the app (see driverOrders.ts/orders.ts) -- callers should
 * Number(...) them.
 *
 * status isn't a projected column on the view at all -- the view's own
 * definition already filters to `status = 'active'` rows, so there's
 * nothing to further filter by status on the client side.
 */
export interface VehicleClassRow {
  id: string;
  name: string;
  description: string | null;
  icon_svg_url: string | null;
  icon_svg_key: string | null;
  max_capacity: number | null;
  display_order: number | null;
  vehicle_type: VehicleType | null;
  base_fare: number | string;
  min_fare: number | string;
  per_km: number | string;
  per_minute: number | string;
  per_minute_waiting: number | string;
  cancellation_fee: number | string;
  night_rate_multiplier: number | string;
  peak_multiplier: number | string;
  vehicle_multiplier: number | string;
}

/**
 * Active vehicle classes and their live admin-configured rates, via the
 * public projection of vehicle_classes.
 */
export async function fetchActiveVehicleClasses(): Promise<{
  rows: VehicleClassRow[];
  errorMessage: string | null;
}> {
  const { data, error } = await insforge.database
    .from('vehicle_classes_public')
    .select()
    .order('display_order');

  if (error) {
    return { rows: [], errorMessage: error.message ?? 'Failed to fetch vehicle classes' };
  }

  return { rows: (data ?? []) as VehicleClassRow[], errorMessage: null };
}
