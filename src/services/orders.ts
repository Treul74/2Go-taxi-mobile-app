import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import type { DriverInfo, Location, PaymentMethod, RideHistoryItem, RideHistoryStatus, VehicleType } from '@/types';
import { fetchCustomerAccount } from './accounts';

/**
 * Customer-side order lifecycle against InsForge.
 *
 * An order row is inserted as 'pending'; every subsequent UPDATE on the row is
 * published by the order_realtime_trigger to the `order:<order-id>` realtime
 * channel as an 'order_updated' event, which drives the customer's status UI
 * (pending → accepted → in_progress → completed / cancelled).
 */

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** Minutes a 'pending' order stays open before the expiry sweep marks it 'expired'. */
const ORDER_EXPIRY_MINUTES = 3;

/** Payload published by public.notify_order_update() on every orders UPDATE. */
export interface OrderUpdatePayload {
  id: string;
  status: OrderStatus;
  driver_id: string | null;
  driver_heading: number | null;
  driver_current_lat: number | null;
  driver_current_lng: number | null;
  estimated_arrival_minutes: number | null;
  distance_to_pickup_km: number | null;
  trip_started_at: string | null;
  driver_arrived_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  fare_amount: number | string | null;
  updated_at: string | null;
}

export interface CreateOrderInput {
  pickup: Location;
  dropoff: Location;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  baseFare: number;
  fareAmount: number;
}

export interface CreatedOrder {
  id: string;
  status: OrderStatus;
  fareAmount: number;
}

interface InsertedOrderRow {
  id: string;
  status: OrderStatus;
  fare_amount: number | string;
}

/**
 * Inserts a pending order for the logged-in customer. customer_id is resolved
 * from the current session (customers row via auth_id).
 */
export async function createOrder(
  input: CreateOrderInput
): Promise<{ order: CreatedOrder | null; errorMessage: string | null }> {
  const customer = await fetchCustomerAccount();
  if (!customer) {
    return { order: null, errorMessage: 'You need to be signed in to book a ride.' };
  }

  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await insforge.database
    .from('orders')
    .insert([
      {
        customer_id: customer.id,
        status: 'pending',
        pickup_address: input.pickup.address,
        pickup_lat: input.pickup.latitude,
        pickup_lng: input.pickup.longitude,
        dropoff_address: input.dropoff.address,
        dropoff_lat: input.dropoff.latitude,
        dropoff_lng: input.dropoff.longitude,
        vehicle_type: input.vehicleType,
        payment_method: input.paymentMethod,
        base_fare: input.baseFare,
        fare_amount: input.fareAmount,
        expires_at: expiresAt,
      },
    ])
    .select('id, status, fare_amount')
    .single<InsertedOrderRow>();

  if (error || !data) {
    return {
      order: null,
      errorMessage: error?.message ?? 'Could not create your booking. Please try again.',
    };
  }

  return {
    order: {
      id: data.id,
      status: data.status,
      fareAmount: Number(data.fare_amount) || 0,
    },
    errorMessage: null,
  };
}

/**
 * Marks the order cancelled. Also returns the assigned driver's push token
 * (null if the order hadn't been accepted yet) so the caller can notify them.
 */
export async function cancelOrder(
  orderId: string
): Promise<{ errorMessage: string | null; driverPushToken: string | null }> {
  const { data, error } = await insforge.database
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'customer',
    })
    .eq('id', orderId)
    .select('id, drivers(push_token)')
    .single<{ id: string; drivers: { push_token: string | null } | null }>();

  if (error || !data) {
    return { errorMessage: error?.message ?? 'Could not cancel the ride.', driverPushToken: null };
  }
  return { errorMessage: null, driverPushToken: data.drivers?.push_token ?? null };
}

/** Push token of the currently logged-in customer, for self-notifications. */
export async function fetchOwnCustomerPushToken(): Promise<string | null> {
  const authId = useAuthStore.getState().authUserId;
  if (!authId) return null;

  const { data, error } = await insforge.database
    .from('customers')
    .select('push_token')
    .eq('auth_id', authId)
    .maybeSingle<{ push_token: string | null }>();

  if (error || !data) return null;
  return data.push_token;
}

/** Updates an active order's pickup location after the customer edits it during matching. */
export async function updateOrderPickup(orderId: string, pickup: Location): Promise<string | null> {
  const { error } = await insforge.database
    .from('orders')
    .update({
      pickup_address: pickup.address,
      pickup_lat: pickup.latitude,
      pickup_lng: pickup.longitude,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  return error ? error.message : null;
}

// One realtime listener per subscribed order, so unsubscribing one order does
// not detach another order's handler.
const orderListeners = new Map<string, (payload: OrderUpdatePayload) => void>();

/**
 * Subscribes to the order's realtime channel and invokes onUpdate for every
 * 'order_updated' event. Returns an error message, or null on success.
 */
export async function subscribeToOrderUpdates(
  orderId: string,
  onUpdate: (update: OrderUpdatePayload) => void
): Promise<string | null> {
  await insforge.realtime.connect();

  const response = await insforge.realtime.subscribe(`order:${orderId}`);
  if (!response.ok) {
    return response.error?.message ?? 'Could not subscribe to order updates.';
  }

  const listener = (payload: OrderUpdatePayload) => {
    if (payload?.id === orderId) onUpdate(payload);
  };
  orderListeners.set(orderId, listener);
  insforge.realtime.on('order_updated', listener);
  return null;
}

/** Detaches the order's listener and leaves its realtime channel. */
export function unsubscribeFromOrder(orderId: string): void {
  const listener = orderListeners.get(orderId);
  if (listener) {
    insforge.realtime.off('order_updated', listener);
    orderListeners.delete(orderId);
  }
  insforge.realtime.unsubscribe(`order:${orderId}`);
}

interface OrderHistoryDriverRow {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  profile_photo_url: string | null;
  rating: number | string | null;
  total_completed_rides: number | null;
}

interface OrderHistoryRatingRow {
  rating: number;
}

interface OrderHistoryRow {
  id: string;
  status: OrderStatus;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  fare_amount: number | string | null;
  base_fare: number | string | null;
  vehicle_type: VehicleType | null;
  trip_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  drivers: OrderHistoryDriverRow | null;
  ratings: OrderHistoryRatingRow[] | OrderHistoryRatingRow | null;
}

/** The logged-in customer's completed and cancelled orders, newest first. */
export async function fetchCustomerOrderHistory(): Promise<RideHistoryItem[]> {
  const customer = await fetchCustomerAccount();
  if (!customer) return [];

  const { data, error } = await insforge.database
    .from('orders')
    .select(
      'id, status, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, fare_amount, base_fare, vehicle_type, trip_started_at, completed_at, cancelled_at, created_at, drivers(id, first_name, last_name, phone_number, profile_photo_url, rating, total_completed_rides), ratings(rating)'
    )
    .eq('customer_id', customer.id)
    .in('status', ['completed', 'cancelled'])
    .order('created_at', { ascending: false })
    .returns<OrderHistoryRow[]>();

  if (error || !data) return [];

  return data.map((row): RideHistoryItem => {
    const ratingRow = Array.isArray(row.ratings) ? row.ratings[0] : row.ratings;
    const durationMinutes =
      row.trip_started_at && row.completed_at
        ? Math.max(
            0,
            Math.round(
              (new Date(row.completed_at).getTime() - new Date(row.trip_started_at).getTime()) / 60000
            )
          )
        : undefined;

    return {
      id: row.id,
      date: new Date(row.completed_at ?? row.cancelled_at ?? row.created_at),
      pickup: {
        latitude: row.pickup_lat ?? 0,
        longitude: row.pickup_lng ?? 0,
        address: row.pickup_address ?? '',
      },
      destination: {
        latitude: row.dropoff_lat ?? 0,
        longitude: row.dropoff_lng ?? 0,
        address: row.dropoff_address ?? '',
      },
      status: row.status as RideHistoryStatus,
      fare: row.fare_amount != null ? Number(row.fare_amount) : undefined,
      baseFare: row.base_fare != null ? Number(row.base_fare) : undefined,
      driver: row.drivers
        ? {
            id: row.drivers.id,
            name: `${row.drivers.first_name} ${row.drivers.last_name}`.trim(),
            phone: row.drivers.phone_number,
            avatar: row.drivers.profile_photo_url ?? undefined,
            rating: Number(row.drivers.rating) || 0,
            tripsCompleted: row.drivers.total_completed_rides ?? 0,
          }
        : undefined,
      vehicleType: row.vehicle_type ?? 'economy',
      mode: 'taxi',
      rating: ratingRow?.rating,
      duration: durationMinutes,
    };
  });
}

interface AssignedDriverRow {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  profile_photo_url: string | null;
  rating: number | string | null;
  total_completed_rides: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  license_plate: string | null;
}

export interface AssignedDriver {
  driver: DriverInfo;
  vehicle: { model: string; color: string; plate: string };
}

/** Display details of the driver assigned to one of the customer's orders. */
export async function fetchOrderDriver(driverId: string): Promise<AssignedDriver | null> {
  const { data, error } = await insforge.database
    .from('drivers')
    .select(
      'id, first_name, last_name, phone_number, profile_photo_url, rating, total_completed_rides, vehicle_make, vehicle_model, license_plate'
    )
    .eq('id', driverId)
    .maybeSingle<AssignedDriverRow>();

  if (error || !data) return null;

  return {
    driver: {
      id: data.id,
      name: `${data.first_name} ${data.last_name}`.trim(),
      phone: data.phone_number,
      avatar: data.profile_photo_url ?? undefined,
      rating: Number(data.rating) || 0,
      tripsCompleted: data.total_completed_rides ?? 0,
    },
    vehicle: {
      model: [data.vehicle_make, data.vehicle_model].filter(Boolean).join(' '),
      color: '',
      plate: data.license_plate ?? '',
    },
  };
}
