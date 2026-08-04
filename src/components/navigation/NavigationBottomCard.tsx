import { BottomSheet, type BottomSheetRef, type BottomSheetState } from '@/components/ui/BottomSheet';
import { formatManeuverDistance } from '@/lib/distance';
import { useDistanceRemainingMeters, useEtaSeconds, usePickupDestination } from '@/navigation/NavigationEngine/NavigationHooks';
import React, { forwardRef } from 'react';
import { Text, View } from 'react-native';

export interface NavigationBottomCardProps {
  /** Screen-supplied — `NavigationState` only tracks `pickup`/`destination` as coordinates, not formatted addresses (that data lives in `rideStore`/`driverStore`). */
  pickupAddress?: string;
  destinationAddress?: string;
  initialState?: BottomSheetState;
  onStateChange?: (state: BottomSheetState) => void;
  /**
   * Expanded-only extra content (Bible: "Expanded: Customer, Payment,
   * Support, Trip details") — none of that is `NavigationState`'s data, so
   * it's a slot a screen fills with whatever it already has, rather than
   * this component reaching into another store for it.
   */
  children?: React.ReactNode;
}

/** Whole seconds -> "12 min" / "45 sec" text. Formatting only. */
function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * Bottom trip card (Bible: "Bottom Sheet Behaviour — Collapsed: Distance,
 * Arrival, Duration. Expanded: Customer, Pickup, Destination, Payment,
 * Support, Trip details."). Wraps the existing `BottomSheet` primitive
 * (`src/components/ui/`) rather than a second drag/snap implementation —
 * per AGENTS.md's "reuse existing components" rule.
 *
 * The collapsed row (distance remaining / ETA / duration remaining) is
 * always `NavigationStore`'s own data — the only business logic here is
 * unit/text formatting (`formatManeuverDistance`, `formatDurationShort`),
 * not a decision. Everything the store doesn't own (addresses, payment,
 * support, customer details) comes in as props/children instead of being
 * invented or fetched from another store here.
 */
export const NavigationBottomCard = forwardRef<BottomSheetRef, NavigationBottomCardProps>(
  ({ pickupAddress, destinationAddress, initialState, onStateChange, children }, ref) => {
    const distanceRemainingMeters = useDistanceRemainingMeters();
    const etaSeconds = useEtaSeconds();
    const { pickup, destination } = usePickupDestination();

    return (
      <BottomSheet ref={ref} initialState={initialState} onStateChange={onStateChange}>
        <View className="px-5">
          <View className="flex-row justify-between items-center pb-4 border-b border-gray-100">
            <View className="items-center">
              <Text className="text-primary text-lg font-bold">
                {distanceRemainingMeters !== null ? formatManeuverDistance(distanceRemainingMeters) : '--'}
              </Text>
              <Text className="text-secondary text-xs">Distance</Text>
            </View>
            <View className="items-center">
              <Text className="text-primary text-lg font-bold">
                {etaSeconds !== null ? formatDurationShort(etaSeconds) : '--'}
              </Text>
              <Text className="text-secondary text-xs">Arrival</Text>
            </View>
            <View className="items-center">
              <Text className="text-primary text-lg font-bold">
                {etaSeconds !== null ? formatDurationShort(etaSeconds) : '--'}
              </Text>
              <Text className="text-secondary text-xs">Duration</Text>
            </View>
          </View>

          {(pickup || destination) && (
            <View className="py-4 gap-3">
              {pickup && (
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full bg-success" />
                  <Text className="text-primary flex-1" numberOfLines={1}>
                    {pickupAddress ?? `${pickup.latitude.toFixed(5)}, ${pickup.longitude.toFixed(5)}`}
                  </Text>
                </View>
              )}
              {destination && (
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full bg-accent" />
                  <Text className="text-primary flex-1" numberOfLines={1}>
                    {destinationAddress ?? `${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {children}
        </View>
      </BottomSheet>
    );
  }
);

NavigationBottomCard.displayName = 'NavigationBottomCard';
