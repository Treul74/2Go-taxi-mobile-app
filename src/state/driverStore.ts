import { getHex9, getNearbyHexes } from '@/core/spatialEngine';
import { calculateDistanceKm } from '@/lib/distance';
import {
  acceptOrder,
  completeOrderTrip,
  fetchOrderCustomer,
  fetchPendingOrders,
  markDriverArrived,
  startOrderTrip,
  type PendingOrderPayload,
} from '@/services/driverOrders';
import { setDriverStatus } from '@/services/accounts';
import { submitDriverRating } from '@/services/ratings';
import { sendPushNotification } from '@/lib/notifications';
import { isTransientFailureMessage, withRetry } from '@/lib/withRetry';
import { useAuthStore } from '@/state/authStore';
import { useDriverWalletStore } from '@/state/driverWalletStore';
import { useUserStore } from '@/state/userStore';
import type { DriverStats, IncomingRequest, TripCompletionInput, TripSummary, VehicleType } from '@/types';
import { create } from 'zustand';

// Intervals outside of store to avoid type issues with Node vs Browser types
let expiryInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// k-ring radius (in hex cells) around the driver's hex9 that counts as
// "nearby" for pending-order matching. Matches discoveryEngine.findNearbyDrivers'
// default radius for consistency.
const NEARBY_HEX_RING = 6;

// The 'orders:pending' realtime channel can't authorize under the SDK's
// server mode (see src/lib/insforge.ts), so pending orders are discovered by
// polling fetchPendingOrders() on this interval instead.
const PENDING_ORDER_POLL_MS = 8000;

interface DriverState {
  // Online status
  isOnline: boolean;
  vehicleType: VehicleType | null;

  // Driver location (H3 spatial indexing)
  currentLocation: { latitude: number; longitude: number } | null;
  driverHex9: string | null;
  nearbyHexes: string[];

  // Stats
  stats: DriverStats;

  // Incoming requests (real pending orders matching this driver's vehicle type)
  incomingRequests: IncomingRequest[];
  // True only for the initial fetchPendingOrders() call made in goOnline(),
  // not the recurring background poll — lets the UI show a loading skeleton
  // for the first load without flickering on every poll tick.
  isRequestsLoading: boolean;

  // Active trip state
  currentTrip: IncomingRequest | null;
  tripStatus: 'idle' | 'navigating_to_pickup' | 'arrived' | 'waiting' | 'in_progress' | 'completed';
  tripStartTime: Date | null;
  waitingStartTime: Date | null;
  waitingDuration: number; // In seconds
  // Set by completeTrip() on success, read by the trip-summary screen, and
  // cleared by finishTrip() when the driver returns home.
  lastTripSummary: TripSummary | null;
  // Set while beginTrip() is retrying a transient InsForge failure (see
  // withRetry), read by navigation.tsx to show "Retrying... Attempt N of M"
  // instead of the generic failure alert. Always null outside of a retry.
  startTripRetry: { attempt: number; maxAttempts: number } | null;

  // Actions
  goOnline: (driverId: string, vehicleType: VehicleType) => Promise<boolean>;
  goOffline: (driverId: string) => Promise<boolean>;
  updateLocation: (latitude: number, longitude: number) => void;
  updateStats: (stats: Partial<DriverStats>) => void;

  // Request actions
  pollPendingOrders: () => Promise<void>;
  declineRequest: (id: string) => void;
  acceptRequest: (id: string, driverId: string) => Promise<IncomingRequest | null>;

  // Trip actions
  setTripStatus: (status: DriverState['tripStatus']) => void;
  confirmArrival: () => Promise<boolean>;
  startTrip: () => void;
  beginTrip: () => Promise<boolean>;
  completeTrip: (receiptData: TripCompletionInput) => Promise<boolean>;
  finishTrip: () => void;
  cancelTrip: () => void;
  rateCustomer: (
    orderId: string,
    customerId: string,
    rating: number,
    categories: { punctuality?: number; communication?: number; payment?: number }
  ) => Promise<void>;
}

// Mock driver stats — earnings/trip counters, unrelated to ride requests.
const mockStats: DriverStats = {
  earningsToday: 450,
  earningsWeek: 2850,
  tripsToday: 12,
  tripsWeek: 68,
  averageRating: 4.85,
  acceptanceRate: 92,
};

// True when the pickup falls inside the driver's nearby-hex set, or when the
// driver has no location fix yet (nearbyHexes empty) — in that case matching
// isn't filtered by distance rather than hiding every request.
function isPickupNearby(
  pickupLat: number | null,
  pickupLng: number | null,
  nearbyHexes: string[]
): boolean {
  if (nearbyHexes.length === 0) return true;
  if (pickupLat == null || pickupLng == null) return true;
  return nearbyHexes.includes(getHex9(pickupLat, pickupLng));
}

function toIncomingRequest(
  order: PendingOrderPayload,
  currentLocation: { latitude: number; longitude: number } | null
): IncomingRequest {
  const pickupLat = order.pickup_lat ?? 0;
  const pickupLng = order.pickup_lng ?? 0;

  return {
    id: order.id,
    pickup: {
      latitude: pickupLat,
      longitude: pickupLng,
      address: order.pickup_address ?? '',
    },
    destination: {
      latitude: order.dropoff_lat ?? 0,
      longitude: order.dropoff_lng ?? 0,
      address: order.dropoff_address ?? '',
    },
    estimatedFare: Number(order.fare_amount) || 0,
    distance: currentLocation
      ? calculateDistanceKm(currentLocation.latitude, currentLocation.longitude, pickupLat, pickupLng)
      : 0,
    // Customer identity isn't visible pre-acceptance — see IncomingRequest.
    customerName: 'New Customer',
    customerRating: 0,
    expiresAt: new Date(Date.now() + 30000), // 30 seconds to accept
  };
}

export const useDriverStore = create<DriverState>((set, get) => ({
  // Initial state
  isOnline: false,
  vehicleType: null,
  currentLocation: null,
  driverHex9: null,
  nearbyHexes: [],
  stats: mockStats,
  incomingRequests: [],
  isRequestsLoading: false,

  // Trip state
  currentTrip: null,
  tripStatus: 'idle',
  tripStartTime: null,
  waitingStartTime: null,
  waitingDuration: 0,
  lastTripSummary: null,
  startTripRetry: null,

  // Online status actions. Slide right -> go online: persists driver_status
  // to InsForge first and only flips isOnline (the slider's visual state) on
  // a successful response, so a failed write leaves the thumb where it was.
  goOnline: async (driverId, vehicleType) => {
    // Defensive guard: mirrors the check authStore.hydrate / Login / Otp /
    // Signup rely on elsewhere — don't let a driver go online before their
    // session is actually ready.
    const { hydrated, authed } = useAuthStore.getState();
    if (!hydrated || !authed) {
      console.error('Failed to go online: auth session not ready.');
      return false;
    }

    const errorMessage = await setDriverStatus(driverId, 'online');
    if (errorMessage) {
      console.error('Failed to go online:', errorMessage);
      return false;
    }

    set({ isOnline: true, vehicleType, isRequestsLoading: true });

    const orders = await fetchPendingOrders(vehicleType);
    const { currentLocation, nearbyHexes } = get();
    const nearbyOrders = orders.filter((o) => isPickupNearby(o.pickup_lat, o.pickup_lng, nearbyHexes));
    set({
      incomingRequests: nearbyOrders.map((o) => toIncomingRequest(o, currentLocation)).slice(-5),
      isRequestsLoading: false,
    });

    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
      get().pollPendingOrders();
    }, PENDING_ORDER_POLL_MS);

    if (expiryInterval) clearInterval(expiryInterval);
    expiryInterval = setInterval(() => {
      const now = new Date();
      set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.expiresAt > now),
      }));
    }, 1000);

    return true;
  },

  // Slide left -> go offline: persists driver_status first, same
  // confirm-before-UI-change contract as goOnline, then tears down the
  // pending-orders poll and expiry timer.
  goOffline: async (driverId) => {
    try {
      const errorMessage = await setDriverStatus(driverId, 'offline');
      if (errorMessage) {
        console.error('Failed to go offline:', errorMessage);
        return false;
      }

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (expiryInterval) {
        clearInterval(expiryInterval);
        expiryInterval = null;
      }
      set({ isOnline: false, vehicleType: null, incomingRequests: [], isRequestsLoading: false });

      return true;
    } catch (error) {
      console.error('Failed to go offline:', error)
      // do not rethrow — caller should not crash
      return false;
    }
  },

  // Update driver location and calculate hex9. Also keeps incoming requests'
  // pickup distance current as the driver moves.
  updateLocation: (latitude: number, longitude: number) => {
    const driverHex9 = getHex9(latitude, longitude);
    const nearbyHexes = getNearbyHexes(driverHex9, NEARBY_HEX_RING);

    set((state) => ({
      currentLocation: { latitude, longitude },
      driverHex9,
      nearbyHexes,
      incomingRequests: state.incomingRequests.map((r) => ({
        ...r,
        distance: calculateDistanceKm(latitude, longitude, r.pickup.latitude, r.pickup.longitude),
      })),
    }));
  },

  // Stats actions
  updateStats: (stats) => set((state) => ({
    stats: { ...state.stats, ...stats },
  })),

  // Polled every PENDING_ORDER_POLL_MS while online (see goOnline). Fetches
  // this driver's pending orders fresh, keeps existing incoming requests that
  // are still pending/nearby (so their expiry countdown isn't reset), drops
  // ones no longer available (taken or expired), and adds new ones.
  pollPendingOrders: async () => {
    const { isOnline, vehicleType, currentLocation, nearbyHexes } = get();
    if (!isOnline || !vehicleType) return;

    const orders = await fetchPendingOrders(vehicleType);
    const nearbyOrders = orders.filter((o) => isPickupNearby(o.pickup_lat, o.pickup_lng, nearbyHexes));

    set((state) => {
      const freshIds = new Set(nearbyOrders.map((o) => o.id));
      const kept = state.incomingRequests.filter((r) => freshIds.has(r.id));
      const keptIds = new Set(kept.map((r) => r.id));
      const added = nearbyOrders
        .filter((o) => !keptIds.has(o.id))
        .map((o) => toIncomingRequest(o, currentLocation));

      return { incomingRequests: [...kept, ...added].slice(-5) };
    });
  },

  // Decline removes the request from this driver's list only — the order
  // stays 'pending' in InsForge and remains visible to other drivers.
  declineRequest: (id) => {
    set((state) => ({
      incomingRequests: state.incomingRequests.filter((r) => r.id !== id),
      stats: {
        ...state.stats,
        acceptanceRate: Math.max(0, state.stats.acceptanceRate - 1),
      },
    }));
  },

  acceptRequest: async (id, driverId) => {
    const request = get().incomingRequests.find((r) => r.id === id);
    if (!request) return null;

    const { errorMessage, customerPushToken } = await acceptOrder(id, driverId);
    if (errorMessage) {
      // Someone else already accepted it — drop it from this driver's list too.
      set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.id !== id),
      }));
      return null;
    }

    sendPushNotification(customerPushToken, 'Ride accepted', 'Your driver is on the way');

    set((state) => ({
      incomingRequests: state.incomingRequests.filter((r) => r.id !== id),
      currentTrip: request,
      tripStatus: 'navigating_to_pickup',
    }));

    fetchOrderCustomer(id).then((customer) => {
      if (!customer) return;
      const current = get();
      if (current.currentTrip?.id !== id) return;
      set({
        currentTrip: {
          ...current.currentTrip,
          customerName: customer.name,
          customerRating: customer.rating,
          customerId: customer.id,
        },
      });
    });

    return request;
  },

  // Trip management actions
  setTripStatus: (status) => set((state) => ({
    tripStatus: status,
    waitingStartTime: status === 'arrived' ? new Date() : state.waitingStartTime,
  })),

  // Slide to Arrived: persists driver_arrived_at (order stays 'accepted' --
  // see the migration note on drivers_update_active_orders for why) and
  // starts the local waiting-time counter. Returns false on failure so the
  // screen can surface an error and let the driver retry.
  confirmArrival: async () => {
    const { currentTrip } = get();
    if (!currentTrip) return false;

    const { errorMessage, customerPushToken } = await markDriverArrived(currentTrip.id);
    if (errorMessage) {
      console.error('Failed to record arrival:', errorMessage);
      return false;
    }

    sendPushNotification(customerPushToken, 'Driver arrived', 'Your driver has arrived');
    set({ tripStatus: 'arrived', waitingStartTime: new Date() });
    return true;
  },

  startTrip: () => {
    const { waitingStartTime } = get();
    let duration = 0;
    if (waitingStartTime) {
      duration = Math.floor((new Date().getTime() - waitingStartTime.getTime()) / 1000);
    }

    set({
      tripStatus: 'in_progress',
      tripStartTime: new Date(),
      waitingStartTime: null,
      waitingDuration: duration,
    });
  },

  // Slide to Start Trip: persists status='in_progress' + trip_started_at.
  // Returns false on failure so the screen can surface an error and let the
  // driver retry instead of navigating into the trip screen on a stale order.
  //
  // The InsForge request itself is wrapped in withRetry (Phase 6.6A) --
  // audit_export/audit_04-08-26_07-37_insforge-start-trip-timeout.md found
  // the SDK's own 30s client timeout is never retried, so a single transient
  // network blip was a hard failure with no recovery. Only the request is
  // wrapped; the accepted->in_progress business logic below is unchanged and
  // NavigationStore still only transitions on a confirmed successful result.
  beginTrip: async () => {
    const { currentTrip, waitingStartTime } = get();
    if (!currentTrip) return false;

    set({ startTripRetry: null });
    const { errorMessage, customerPushToken } = await withRetry(
      () => startOrderTrip(currentTrip.id),
      {
        label: 'Trip Start',
        isRetryable: (result) => isTransientFailureMessage(result.errorMessage),
        onRetry: ({ attempt, maxAttempts }) => set({ startTripRetry: { attempt, maxAttempts } }),
      }
    );
    set({ startTripRetry: null });

    if (errorMessage) {
      console.error('Failed to start trip:', errorMessage);
      return false;
    }

    sendPushNotification(customerPushToken, 'Trip started', 'Your trip has started');

    let duration = 0;
    if (waitingStartTime) {
      duration = Math.floor((new Date().getTime() - waitingStartTime.getTime()) / 1000);
    }

    set({
      tripStatus: 'in_progress',
      tripStartTime: new Date(),
      waitingStartTime: null,
      waitingDuration: duration,
    });
    return true;
  },

  // Slide to Complete Trip: persists status='completed' + the actual trip
  // facts (distance driven, waiting time, completion timestamp). The final
  // fare_amount, service_fee_amount, and driver_earnings are entirely
  // server-computed (see the trip-completion migration) -- this app never
  // calculates or sends a fare. currentTrip is deliberately left set on
  // success so the trip screen can navigate to the summary screen without
  // racing its own "no active trip" redirect -- finishTrip() clears it once
  // the driver leaves the summary.
  completeTrip: async (receiptData) => {
    const { currentTrip } = get();
    if (!currentTrip) return false;

    const { totals, errorMessage, customerPushToken } = await completeOrderTrip(
      currentTrip.id,
      receiptData.distance,
      receiptData.waitingDuration,
      receiptData.completedAt
    );
    if (errorMessage || !totals) {
      console.error('Failed to complete trip:', errorMessage);
      return false;
    }

    sendPushNotification(customerPushToken, 'Trip completed', 'Trip completed');

    await useDriverWalletStore.getState().fetchWallet();

    set({
      tripStatus: 'completed',
      lastTripSummary: {
        tripId: currentTrip.id,
        customerName: receiptData.customerName,
        customerId: currentTrip.customerId ?? '',
        distance: receiptData.distance,
        duration: receiptData.duration,
        waitingDuration: receiptData.waitingDuration ?? 0,
        fareAmount: totals.fareAmount,
        serviceFeeAmount: totals.serviceFeeAmount,
        netEarnings: totals.netEarnings,
      },
    });
    return true;
  },

  finishTrip: () => {
    set({
      currentTrip: null,
      tripStatus: 'idle',
      tripStartTime: null,
      waitingStartTime: null,
      waitingDuration: 0,
      lastTripSummary: null,
    });
  },

  // Records the driver's optional star rating of the customer (1-5,
  // skippable) and persists it to InsForge (rated_by='driver') -- a trigger
  // recomputes the customer's rating average. driverId is the driver's own
  // account id (not the trip/order id in orderId), matching the ratings
  // table's driver_id FK.
  rateCustomer: async (orderId, customerId, rating, categories) => {
    const driverId = useUserStore.getState().driverAccount?.id;
    if (!driverId) {
      console.error('Failed to submit driver rating: no driver account id.');
      return;
    }

    try {
      const errorMessage = await submitDriverRating(
        orderId,
        customerId,
        driverId,
        rating,
        categories
      );
      if (errorMessage) {
        console.error('Failed to submit driver rating:', errorMessage);
      }
    } catch (error) {
      console.error('Failed to submit driver rating:', error);
    }
  },

  cancelTrip: () => {
    const state = get();
    if (state.currentTrip) {
      // Revert stats if trip is cancelled
      set((s) => ({
        currentTrip: null,
        tripStatus: 'idle',
        tripStartTime: null,
        waitingStartTime: null,
        waitingDuration: 0,
        stats: {
          ...s.stats,
          tripsToday: Math.max(0, s.stats.tripsToday - 1),
          earningsToday: Math.max(0, s.stats.earningsToday - (state.currentTrip?.estimatedFare || 0)),
        },
      }));
    }
  },
}));
