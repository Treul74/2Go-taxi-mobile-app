/**
 * No OS push infrastructure exists yet (no expo-notifications dependency, no
 * device push tokens). This is the seam real push wiring plugs into later --
 * the customer already receives a live update over the order's realtime
 * channel when driver_arrived_at changes (see order_realtime_trigger).
 */
export function sendArrivalNotification(orderId: string): void {
  console.log(`[notifications] "Your driver has arrived" — order ${orderId}`);
}
