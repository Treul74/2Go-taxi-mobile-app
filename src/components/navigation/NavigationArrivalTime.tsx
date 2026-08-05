import { colors } from '@/constants/theme';
import { useEtaSeconds } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

/** Formats a Date as a short local clock time, e.g. "3:45 PM". `Intl`-based (via `toLocaleTimeString`) — no new dependency. */
function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Wall-clock arrival time (Bible's Route Progress section: "Arrival time" —
 * distinct from `NavigationHUD`'s ETA chip, which shows *remaining
 * duration* ("12 min"), not the clock time arrival will actually happen at
 * ("3:45 PM"). Both read the same `NavigationStore.etaSeconds` (itself a
 * duration, per its own doc comment: "Estimated time of arrival, seconds,
 * for the remainder of route") — this component is the one place that
 * converts that duration into a wall-clock instant, recomputed fresh on
 * every render from `Date.now()` so it stays correct as ETA updates live.
 *
 * Renders nothing while no ETA is known yet, so it's always safe to mount
 * unconditionally.
 */
export function NavigationArrivalTime() {
  const etaSeconds = useEtaSeconds();
  if (etaSeconds === null) return null;

  const arrival = new Date(Date.now() + etaSeconds * 1000);

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-3 py-2 shadow-md">
      <Ionicons name="flag-outline" size={16} color={colors.primary} />
      <Text className="text-primary text-sm font-bold ml-2">{formatClockTime(arrival)}</Text>
    </View>
  );
}
