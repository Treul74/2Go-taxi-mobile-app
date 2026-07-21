import { getHex9 } from '@/core/spatialEngine';
import { calculateFare, calculateFareForVehicle } from '@/lib/fareCalculator';
import { getDistanceMatrix } from '@/lib/google/mapsApi';
import {
  cancelOrder,
  createOrder,
  fetchCustomerOrderHistory,
  fetchOrderDriver,
  subscribeToOrderUpdates,
  unsubscribeFromOrder,
  type OrderUpdatePayload,
} from '@/services/orders';
import { submitRating } from '@/services/ratings';
import { useAuthStore } from '@/state/authStore';
import type {
  ActiveTrip,
  CancellationReason,
  Location,
  PaymentMethod,
  RideHistoryItem,
  RideMode,
  RideStatus,
  VehicleOption,
  VehicleType
} from '@/types';
import { router } from 'expo-router';
import { create } from 'zustand';

/** How long after driver acceptance the customer is still allowed to cancel. */
export const CANCELLATION_WINDOW_MS = 60_000;

/** Pulls the driver's latest telemetry fix off an order update, falling back to whatever the trip already had. */
function mergeDriverTelemetry(
  update: OrderUpdatePayload,
  existing?: Pick<ActiveTrip, 'driverLocation' | 'driverHeading'>
): Pick<ActiveTrip, 'driverLocation' | 'driverHeading'> {
  return {
    driverLocation:
      update.driver_current_lat != null && update.driver_current_lng != null
        ? { latitude: update.driver_current_lat, longitude: update.driver_current_lng }
        : existing?.driverLocation ?? null,
    driverHeading: update.driver_heading ?? existing?.driverHeading ?? 0,
  };
}

interface RideState {
  // Ride planning
  mode: RideMode;
  selectedVehicle: VehicleType;
  status: RideStatus;
  paymentMethod: PaymentMethod;

  // Locations
  pickup: Location | null;
  destination: Location | null;
  isPickupManual: boolean;

  // H3 Spatial Indexing
  passengerHex9: string | null; // Current passenger location hex

  // Route
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  routeDistance: string | null;
  routeDuration: string | null;
  routeDistanceKm: number | null;
  routeDurationMinutes: number | null;

  // Backend order for the current booking (orders table row + realtime channel)
  orderId: string | null;
  orderFare: number | null;

  // Ride options
  scheduledFor: Date | null;
  bookingFor: { name: string; phone: string } | null;
  driverInstructions: string;

  // Active trip
  activeTrip: ActiveTrip | null;

  // History
  rideHistory: RideHistoryItem[];
  isLoadingHistory: boolean;

  // Vehicle options with pricing
  vehicleOptions: VehicleOption[];
  isFareCalculating: boolean;

  // Actions
  setMode: (mode: RideMode) => void;
  setVehicle: (vehicle: VehicleType) => void;
  setStatus: (status: RideStatus) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setPickup: (location: Location | null, manual?: boolean) => void;
  setDestination: (location: Location | null) => void;
  setRouteData: (
    coords: Array<{ latitude: number; longitude: number }>,
    distance: string,
    duration: string,
    distanceMeters: number,
    durationSeconds: number
  ) => void;
  clearRoute: () => void;
  setScheduledFor: (date: Date | null) => void;
  setBookingFor: (booking: { name: string; phone: string } | null) => void;
  setDriverInstructions: (instructions: string) => void;
  setActiveTrip: (trip: ActiveTrip | null) => void;

  // Complex actions
  calculateVehicleFares: () => Promise<void>;
  requestRide: () => Promise<void>;
  applyOrderUpdate: (update: OrderUpdatePayload) => void;
  cancelRide: (reason?: CancellationReason, note?: string) => void;
  completeRide: (update?: OrderUpdatePayload) => void;
  rateRide: (rideId: string, rating: number, comment?: string) => Promise<void>;
  fetchRideHistory: () => Promise<void>;
  resetRide: () => void;
}

// Mock vehicle options
const defaultVehicleOptions: VehicleOption[] = [
  {
    id: 'economy',
    name: 'Economy',
    description: 'Affordable everyday rides',
    icon: 'car',
    estimatedFare: 35,
    eta: 5,
    capacity: 4,
  },
  {
    id: 'comfort',
    name: 'Comfort',
    description: 'Premium vehicles',
    icon: 'star',
    estimatedFare: 65,
    eta: 7,
    capacity: 4,
  },
  {
    id: 'bike',
    name: 'Bike',
    description: 'Quick solo trips',
    icon: 'bicycle',
    estimatedFare: 18,
    eta: 3,
    capacity: 1,
  },
  {
    id: 'tricycle',
    name: 'Tricycle',
    description: 'For short trips & small loads',
    icon: 'navigate',
    estimatedFare: 25,
    eta: 6,
    capacity: 3,
  },
  {
    id: 'truck',
    name: 'Truck',
    description: 'For cargo & deliveries',
    icon: 'truck',
    estimatedFare: 120,
    eta: 15,
    capacity: 0, // cargo only
  },
];

export const useRideStore = create<RideState>((set, get) => ({
  // Initial state
  mode: 'taxi',
  selectedVehicle: 'economy',
  status: 'idle',
  paymentMethod: 'cash',
  pickup: null,
  destination: null,
  isPickupManual: false,
  passengerHex9: null,
  routeCoordinates: [],
  routeDistance: null,
  routeDuration: null,
  routeDistanceKm: null,
  routeDurationMinutes: null,
  orderId: null,
  orderFare: null,
  scheduledFor: null,
  bookingFor: null,
  driverInstructions: '',
  activeTrip: null,
  rideHistory: [],
  isLoadingHistory: false,
  vehicleOptions: defaultVehicleOptions,
  isFareCalculating: false,

  // Simple setters
  setMode: (mode) => set({ mode }),
  setVehicle: (vehicle) => set({ selectedVehicle: vehicle }),
  setStatus: (status) => {
    const { status: prev, orderId } = get();
    // The matching overlay is dismissed via setStatus('idle') (PassengerHome),
    // so the pending backend order and its realtime subscription must be torn
    // down here, not just the local status flag.
    if (prev === 'matching' && status === 'idle' && orderId) {
      unsubscribeFromOrder(orderId);
      cancelOrder(orderId).then((errorMessage) => {
        if (errorMessage) console.error('Failed to cancel order:', errorMessage);
      });
      set({ status, orderId: null, orderFare: null });
      return;
    }
    set({ status });
  },
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setPickup: (location, manual = false) => {
    // Calculate hex9 if location is provided
    const passengerHex9 = location ? getHex9(location.latitude, location.longitude) : null;
    set({ pickup: location, isPickupManual: manual, passengerHex9 });
  },
  setDestination: (location) => set({ destination: location }),
  setRouteData: (coords, distance, duration, distanceMeters, durationSeconds) => set({
    routeCoordinates: coords,
    routeDistance: distance,
    routeDuration: duration,
    routeDistanceKm: distanceMeters / 1000,
    routeDurationMinutes: durationSeconds / 60,
  }),
  clearRoute: () => set({
    routeCoordinates: [],
    routeDistance: null,
    routeDuration: null,
    routeDistanceKm: null,
    routeDurationMinutes: null,
  }),
  setScheduledFor: (date) => set({ scheduledFor: date }),
  setBookingFor: (booking) => set({ bookingFor: booking }),
  setDriverInstructions: (instructions) => set({ driverInstructions: instructions }),
  setActiveTrip: (trip) => set({ activeTrip: trip }),

  // Calculates real per-vehicle fares/ETAs for the current pickup/destination
  // pair, replacing the mock estimatedFare/eta on vehicleOptions with values
  // derived from the actual route distance/duration.
  calculateVehicleFares: async () => {
    const { pickup, destination } = get();
    if (!pickup || !destination) return;

    set({ isFareCalculating: true });

    try {
      const matrix = await getDistanceMatrix([pickup], [destination]);
      const result = matrix?.[0];
      if (!result) return;

      const distanceKm = result.distance.value / 1000;
      const durationMinutes = result.duration.value / 60;
      const eta = Math.max(1, Math.round(durationMinutes));

      set((s) => ({
        vehicleOptions: s.vehicleOptions.map((vehicle) => ({
          ...vehicle,
          estimatedFare: calculateFareForVehicle(vehicle.id, distanceKm, durationMinutes).total,
          eta,
        })),
      }));
    } catch (error) {
      console.error('Failed to calculate vehicle fares:', error);
    } finally {
      set({ isFareCalculating: false });
    }
  },

  // Request ride - inserts a pending order and listens for status changes
  requestRide: async () => {
    const state = get();
    if (!state.pickup || !state.destination) return;

    // Defensive guard: the realtime socket authenticates with whatever
    // access token is set on the InsForge client at connect time. authed
    // only flips true once setAccessToken() has already run (see
    // authStore.hydrate / Login / Otp / Signup) — without this, subscribing
    // to `order:${orderId}` would silently fail RLS with 'Not authorized to
    // subscribe' and the customer would never see status updates.
    const { hydrated, authed } = useAuthStore.getState();
    if (!hydrated || !authed) {
      console.error('Failed to request ride: auth session not ready for realtime.');
      return;
    }

    set({ status: 'matching' });

    // Distance Matrix gives the authoritative distance/duration for the fare
    // at booking time; falls back to the Directions-based route estimate
    // (routeDistanceKm/routeDurationMinutes, already on state from the map
    // preview) if the API call fails.
    let distanceKm = state.routeDistanceKm ?? 0;
    let durationMinutes = state.routeDurationMinutes ?? 0;
    try {
      const matrix = await getDistanceMatrix([state.pickup], [state.destination]);
      const result = matrix?.[0];
      if (result) {
        distanceKm = result.distance.value / 1000;
        durationMinutes = result.duration.value / 60;
      }
    } catch (error) {
      console.error('Distance Matrix lookup failed, using route estimate:', error);
    }

    const fare = calculateFare(distanceKm, durationMinutes);

    const { order, errorMessage } = await createOrder({
      pickup: state.pickup,
      dropoff: state.destination,
      vehicleType: state.selectedVehicle,
      paymentMethod: state.paymentMethod,
      baseFare: fare.baseFare,
      fareAmount: fare.total,
    });

    if (!order) {
      console.error('Failed to create order:', errorMessage);
      set({ status: 'idle' });
      return;
    }

    // The user may have dismissed the matching overlay while the insert was
    // in flight — don't leave an orphaned pending order behind.
    if (get().status !== 'matching') {
      cancelOrder(order.id).then((cancelError) => {
        if (cancelError) console.error('Failed to cancel order:', cancelError);
      });
      return;
    }

    set({ orderId: order.id, orderFare: order.fareAmount });

    const subscribeError = await subscribeToOrderUpdates(order.id, (update) => {
      get().applyOrderUpdate(update);
    });

    if (subscribeError) {
      console.error('Failed to subscribe to order updates:', subscribeError);
      cancelOrder(order.id).then((cancelError) => {
        if (cancelError) console.error('Failed to cancel order:', cancelError);
      });
      set({ status: 'idle', orderId: null, orderFare: null });
      return;
    }

    // The user may have cancelled while the subscription was being set up
    // (setStatus already cancelled the order) — drop the fresh subscription.
    if (get().orderId !== order.id) {
      unsubscribeFromOrder(order.id);
    }
  },

  // Realtime order_updated events drive the booking through
  // pending → accepted → in_progress → completed / cancelled
  applyOrderUpdate: (update) => {
    const state = get();
    if (update.id !== state.orderId) return;

    switch (update.status) {
      case 'pending':
        // Still searching — keep the matching overlay up
        return;

      case 'accepted': {
        const existing = state.activeTrip;
        const arrivedStatus = update.driver_arrived_at ? 'waiting' : 'driver_assigned';
        const trip: ActiveTrip = existing
          ? {
              ...existing,
              status: update.driver_arrived_at ? 'waiting' : existing.status,
              estimatedArrival: update.estimated_arrival_minutes ?? existing.estimatedArrival,
              ...mergeDriverTelemetry(update, existing),
            }
          : {
              id: update.id,
              status: arrivedStatus,
              pickup: state.pickup!,
              destination: state.destination!,
              // Placeholder until the driver row is fetched below, so the trip
              // card appears as soon as the order is accepted
              driver: {
                id: update.driver_id ?? '',
                name: 'Your driver',
                phone: '',
                rating: 0,
                tripsCompleted: 0,
              },
              vehicle: { model: '', color: '', plate: '' },
              estimatedArrival: update.estimated_arrival_minutes ?? 0,
              fare: state.orderFare ?? 0,
              // Start of the cancellation window — this branch only runs once,
              // the first time the order is seen as accepted.
              acceptedAt: new Date(),
              ...mergeDriverTelemetry(update),
            };

        set({ status: 'active', activeTrip: trip });

        // First time this order shows up as accepted — take the customer to
        // the live tracking screen. Every telemetry ping re-fires this same
        // 'accepted' case (status doesn't change), so this must only fire once.
        if (!existing) {
          router.push('/(customer)/trip');
        }

        if (!existing && update.driver_id) {
          fetchOrderDriver(update.driver_id).then((assigned) => {
            const current = get();
            if (!assigned || current.orderId !== update.id || !current.activeTrip) return;
            set({
              activeTrip: {
                ...current.activeTrip,
                driver: assigned.driver,
                vehicle: assigned.vehicle,
              },
            });
          });
        }
        return;
      }

      case 'in_progress': {
        const trip = state.activeTrip;
        if (!trip) return;
        set({
          status: 'active',
          activeTrip: {
            ...trip,
            status: 'in_progress',
            startedAt: update.trip_started_at ? new Date(update.trip_started_at) : trip.startedAt,
            estimatedArrival: update.estimated_arrival_minutes ?? trip.estimatedArrival,
            ...mergeDriverTelemetry(update, trip),
          },
        });
        return;
      }

      case 'completed': {
        const trip = state.activeTrip;
        get().completeRide(update);
        // completeRide() already pushed a matching entry into rideHistory
        // under the same id, which the rating screen reads back out.
        if (trip) {
          router.replace({ pathname: '/rating/[id]', params: { id: trip.id } });
        }
        return;
      }

      case 'cancelled':
        // Cancelled server-side (driver/admin) — clean up locally
        unsubscribeFromOrder(update.id);
        set({ status: 'idle', activeTrip: null, orderId: null, orderFare: null });
        return;
    }
  },

  // Cancel ride
  cancelRide: (reason?: CancellationReason, note?: string) => {
    const state = get();

    // Once the 1-minute post-acceptance cancellation window has closed, the
    // customer can no longer cancel — silently no-op instead of cancelling.
    if (state.activeTrip && Date.now() - state.activeTrip.acceptedAt.getTime() >= CANCELLATION_WINDOW_MS) {
      return;
    }

    if (state.orderId) {
      unsubscribeFromOrder(state.orderId);
      cancelOrder(state.orderId).then((errorMessage) => {
        if (errorMessage) console.error('Failed to cancel order:', errorMessage);
      });
    }

    // Add to history if was active
    if (state.activeTrip) {
      const cancelledRide: RideHistoryItem = {
        id: state.activeTrip.id,
        date: new Date(),
        pickup: state.activeTrip.pickup,
        destination: state.activeTrip.destination,
        status: 'cancelled',
        vehicleType: state.selectedVehicle,
        mode: state.mode,
        driver: state.activeTrip.driver,
        cancellationReason: reason,
        cancellationNote: note,
      };

      set((s) => ({
        rideHistory: [cancelledRide, ...s.rideHistory],
      }));
    }

    // Reset
    set({
      status: 'idle',
      activeTrip: null,
      orderId: null,
      orderFare: null,
    });
  },

  // Complete ride. update carries the real fare_amount and start/completed
  // timestamps from the order row when driven by a realtime 'completed'
  // event; called with no argument by the legacy dev-only "End Trip" button
  // (ActiveTripCard), which falls back to the previous estimate/mock duration.
  completeRide: (update) => {
    const state = get();

    if (state.orderId) {
      unsubscribeFromOrder(state.orderId);
    }

    if (state.activeTrip) {
      const fare = update?.fare_amount != null ? Number(update.fare_amount) : state.activeTrip.fare;
      const duration =
        update?.trip_started_at && update?.completed_at
          ? Math.max(
              0,
              Math.round(
                (new Date(update.completed_at).getTime() - new Date(update.trip_started_at).getTime()) / 60000
              )
            )
          : 15 + Math.floor(Math.random() * 20);

      const completedRide: RideHistoryItem = {
        id: state.activeTrip.id,
        date: new Date(),
        pickup: state.activeTrip.pickup,
        destination: state.activeTrip.destination,
        status: 'completed',
        fare,
        driver: state.activeTrip.driver,
        vehicleType: state.selectedVehicle,
        mode: state.mode,
        duration,
      };

      set((s) => ({
        rideHistory: [completedRide, ...s.rideHistory],
        status: 'completed',
        activeTrip: null,
        orderId: null,
        orderFare: null,
      }));

      // Backfills the full real history (this trip plus any earlier ones) from
      // orders directly, replacing the completedRide placeholder above.
      get().fetchRideHistory();
    } else {
      set({ orderId: null, orderFare: null });
    }
  },

  // Records the customer's optional star rating (1-5, skippable) and
  // persists it to InsForge -- a trigger recomputes the driver's rating
  // average. Updates the local history entry optimistically either way.
  rateRide: async (rideId, rating, comment) => {
    const ride = get().rideHistory.find((r) => r.id === rideId);

    set((s) => ({
      rideHistory: s.rideHistory.map((r) => (r.id === rideId ? { ...r, rating } : r)),
    }));

    if (!ride?.driver) return;
    const errorMessage = await submitRating(rideId, ride.driver.id, rating, comment);
    if (errorMessage) {
      console.error('Failed to submit rating:', errorMessage);
    }
  },

  // Replaces rideHistory with the customer's real completed/cancelled orders
  // from InsForge, including an empty result — an empty history is a real
  // state the screen needs to show, not something to mask with stale data.
  fetchRideHistory: async () => {
    set({ isLoadingHistory: true });
    try {
      const history = await fetchCustomerOrderHistory();
      set({ rideHistory: history });
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  // Reset all ride state
  resetRide: () => {
    const { orderId } = get();
    if (orderId) {
      unsubscribeFromOrder(orderId);
    }
    set({
      mode: 'taxi',
      selectedVehicle: 'economy',
      status: 'idle',
      paymentMethod: 'cash',
      pickup: null,
      destination: null,
      isPickupManual: false,
      passengerHex9: null,
      scheduledFor: null,
      bookingFor: null,
      driverInstructions: '',
      activeTrip: null,
      orderId: null,
      orderFare: null,
    });
  },
}));

