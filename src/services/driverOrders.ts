import { getHex9, getNearbyHexes } from '@/core/spatialEngine';
import { insforge } from '@/lib/insforge';
import type { Location, VehicleType } from '@/types';

// Matches driverStore's NEARBY_HEX_RING — the same "nearby" radius used to
// filter incoming requests down to this driver is used in reverse here, to
// find drivers near a freshly-created order.
const NEARBY_HEX_RING = 6;

/**
 * Driver-side order discovery and acceptance against InsForge.
 *
 * Pending orders are discovered by polling fetchPendingOrders() on an
 * interval (see driverStore.pollPendingOrders) rather than a realtime
 * subscription — the 'orders:pending' realtime channel can't authorize in
 * the SDK's server mode, so polling is the permanent solution.
 */

export interface PendingOrderPayload {
  id: string;
  status: string;
  driver_id: string | null;
  vehicle_type: VehicleType | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  fare_amount: number | string;
  created_at: string | null;
}

/** Unclaimed pending orders matching the driver's vehicle type, newest first. */
export async function fetchPendingOrders(
  vehicleType: VehicleType
): Promise<PendingOrderPayload[]> {
  const { data, error } = await insforge.database
    .from('orders')
    .select(
      'id, status, driver_id, vehicle_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, fare_amount, created_at'
    )
    .eq('status', 'pending')
    .eq('vehicle_type', vehicleType)
    .is('driver_id', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .returns<PendingOrderPayload[]>();

  if (error || !data) return [];
  return data;
}

interface NearbyDriverRow {
  push_token: string | null;
  current_lat: number | null;
  current_lng: number | null;
}

/**
 * Push tokens of online, approved drivers of the matching vehicle type within
 * range of a freshly-created order's pickup point. Called from
 * rideStore.requestRide() to notify nearby drivers of a new ride request.
 */
export async function fetchNearbyDriverPushTokens(
  vehicleType: VehicleType,
  pickup: Location
): Promise<string[]> {
  const { data, error } = await insforge.database
    .from('drivers')
    .select('push_token, current_lat, current_lng')
    .eq('vehicle_type', vehicleType)
    .eq('driver_status', 'online')
    .eq('is_approved', true)
    .not('push_token', 'is', null)
    .returns<NearbyDriverRow[]>();

  if (error || !data) return [];

  const pickupHex9 = getHex9(pickup.latitude, pickup.longitude);
  const nearbyHexes = new Set(getNearbyHexes(pickupHex9, NEARBY_HEX_RING));

  return data
    .filter((d) => d.current_lat != null && d.current_lng != null)
    .filter((d) => nearbyHexes.has(getHex9(d.current_lat as number, d.current_lng as number)))
    .map((d) => d.push_token)
    .filter((token): token is string => !!token);
}

interface OrderCustomerPushRow {
  id: string;
  customers: { push_token: string | null } | null;
}

/**
 * Accepts a pending order for the given driver. Fails (with a friendly
 * message) if another driver already claimed it first. Also returns the
 * customer's push token so the caller can notify them the ride was accepted.
 */
export async function acceptOrder(
  orderId: string,
  driverId: string
): Promise<{ errorMessage: string | null; customerPushToken: string | null }> {
  const { data, error } = await insforge.database
    .from('orders')
    .update({
      status: 'accepted',
      driver_id: driverId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .is('driver_id', null)
    .select('id, customers(push_token)')
    .single<OrderCustomerPushRow>();

  if (error || !data) {
    return { errorMessage: 'This ride was just taken by another driver.', customerPushToken: null };
  }
  return { errorMessage: null, customerPushToken: data.customers?.push_token ?? null };
}

/** Persists the driver's live position/heading to the order row (called on a 5s interval while an order is active). */
export async function updateDriverTelemetry(
  orderId: string,
  latitude: number,
  longitude: number,
  heading: number
): Promise<string | null> {
  const { error } = await insforge.database
    .from('orders')
    .update({
      driver_current_lat: latitude,
      driver_current_lng: longitude,
      driver_heading: heading,
    })
    .eq('id', orderId);

  return error ? error.message : null;
}

/**
 * Marks the driver arrived at pickup. Status stays 'accepted' -- the
 * customer app reads driver_arrived_at itself to show "driver waiting";
 * startOrderTrip() is what advances status to 'in_progress'. Also returns the
 * customer's push token so the caller can notify them the driver has arrived.
 */
export async function markDriverArrived(
  orderId: string
): Promise<{ errorMessage: string | null; customerPushToken: string | null }> {
  const { data, error } = await insforge.database
    .from('orders')
    .update({ driver_arrived_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'accepted')
    .select('id, customers(push_token)')
    .single<OrderCustomerPushRow>();

  if (error || !data) {
    return { errorMessage: error?.message ?? 'Could not record arrival.', customerPushToken: null };
  }
  return { errorMessage: null, customerPushToken: data.customers?.push_token ?? null };
}

/**
 * Advances an accepted order to 'in_progress' when the driver starts the
 * trip. Also returns the customer's push token so the caller can notify them
 * the trip has started.
 */
export async function startOrderTrip(
  orderId: string
): Promise<{ errorMessage: string | null; customerPushToken: string | null }> {
  const { data, error } = await insforge.database
    .from('orders')
    .update({ status: 'in_progress', trip_started_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'accepted')
    .select('id, customers(push_token)')
    .single<OrderCustomerPushRow>();

  if (error || !data) {
    return { errorMessage: error?.message ?? 'Could not start the trip.', customerPushToken: null };
  }
  return { errorMessage: null, customerPushToken: data.customers?.push_token ?? null };
}

export interface CompletedOrderTotals {
  fareAmount: number;
  serviceFeeAmount: number;
  netEarnings: number;
}

/**
 * Completes an in-progress order by reporting trip facts only -- the app no
 * longer calculates or sends a fare. The server (handle_order_completion(),
 * see migrations/20260726060000_server-side-fare-at-trip-completion.sql)
 * derives duration from its own trip_started_at/completed_at, computes the
 * final fare via calculate_fare_breakdown(), and stamps fare_amount,
 * service_fee_amount, and driver_earnings before this call's .select() reads
 * them back. completedAt is sent for completeness but the trigger always
 * overwrites completed_at with its own now() -- it has no effect on the
 * computed fare. Also returns the customer's push token so the caller can
 * notify them the trip is complete.
 */
export async function completeOrderTrip(
  orderId: string,
  actualDistanceKm: number,
  actualWaitingMinutes: number,
  completedAt: string
): Promise<{
  totals: CompletedOrderTotals | null;
  errorMessage: string | null;
  customerPushToken: string | null;
}> {
  const { data, error } = await insforge.database
    .from('orders')
    .update({
      status: 'completed',
      actual_distance_km: actualDistanceKm,
      actual_waiting_minutes: actualWaitingMinutes,
      completed_at: completedAt,
    })
    .eq('id', orderId)
    .eq('status', 'in_progress')
    .select('fare_amount, service_fee_amount, driver_earnings, customers(push_token)')
    .single<{
      fare_amount: number | string;
      service_fee_amount: number | string | null;
      driver_earnings: number | string | null;
      customers: { push_token: string | null } | null;
    }>();

  if (error || !data) {
    return {
      totals: null,
      errorMessage: error?.message ?? 'Could not complete the trip. Please try again.',
      customerPushToken: null,
    };
  }

  const fare = Number(data.fare_amount) || 0;
  const serviceFee = Number(data.service_fee_amount) || 0;
  const netEarnings = Number(data.driver_earnings) || 0;
  return {
    totals: { fareAmount: fare, serviceFeeAmount: serviceFee, netEarnings },
    errorMessage: null,
    customerPushToken: data.customers?.push_token ?? null,
  };
}

interface OrderCustomerRow {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  rating: number | string | null;
}

/** Name/rating/id of the customer on an order the driver has just accepted. */
export async function fetchOrderCustomer(
  orderId: string
): Promise<{ id: string; name: string; rating: number } | null> {
  const { data, error } = await insforge.database
    .from('orders')
    .select('customer_id, customers(first_name, last_name, rating)')
    .eq('id', orderId)
    .single<{ customer_id: string; customers: OrderCustomerRow | null }>();

  if (error || !data?.customers) return null;

  const { first_name, last_name, rating } = data.customers;
  return {
    id: data.customer_id,
    name: `${first_name ?? ''} ${last_name ?? ''}`.trim() || 'Customer',
    rating: Number(rating) || 0,
  };
}
