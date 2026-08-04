import { colors } from '@/constants/theme';
import { useSpeed } from '@/navigation/NavigationEngine/NavigationHooks';
import React from 'react';
import { Text, View } from 'react-native';

export interface NavigationSpeedWidgetProps {
  /**
   * Posted speed limit, km/h, for the current road. Not tracked anywhere in
   * `NavigationState` (no data source for it yet), so this is screen-supplied
   * when available rather than invented here — omitted entirely when absent.
   */
  speedLimitKph?: number;
}

/** m/s -> whole km/h for display. Unit formatting only, not a decision. */
function metersPerSecondToKph(speedMetersPerSecond: number): number {
  return Math.round(speedMetersPerSecond * 3.6);
}

/**
 * Bottom-left current-speed readout (Bible: "Bottom Left: Current speed,
 * Speed limit"). Renders nothing while `NavigationStore.speed` is null
 * (e.g. GPS not yet reporting a speed), so it's always safe to mount
 * unconditionally.
 */
export function NavigationSpeedWidget({ speedLimitKph }: NavigationSpeedWidgetProps) {
  const speed = useSpeed();
  if (speed === null) return null;

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-2.5 shadow-md">
      <View className="items-center">
        <Text className="text-primary text-2xl font-bold leading-none">{metersPerSecondToKph(speed)}</Text>
        <Text className="text-secondary text-[10px] font-medium">km/h</Text>
      </View>
      {speedLimitKph !== undefined && (
        <View className="ml-3 w-9 h-9 rounded-full border-2 items-center justify-center" style={{ borderColor: colors.error }}>
          <Text className="text-primary text-sm font-bold">{speedLimitKph}</Text>
        </View>
      )}
    </View>
  );
}
