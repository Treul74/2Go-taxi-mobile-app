import { colors } from '@/constants/theme';
import { useCurrentStep } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

/**
 * Best-effort current road name, derived from the active step's own
 * instruction text. Google Directions doesn't expose a separate "current
 * road" field anywhere this engine parses `RouteStep` (`RouteEngine.ts`,
 * off-limits this phase, is the only place that could add one) — most
 * Directions instructions read "Turn right onto `<Road>`" / "Continue onto
 * `<Road>`", so this extracts the segment after "on"/"onto" when present,
 * and falls back to the instruction text itself otherwise, rather than
 * inventing a name from nothing. Presentational heuristic only, not
 * authoritative route data — documented as such rather than presented as a
 * precise field.
 */
function extractRoadName(instruction: string): string {
  const match = instruction.match(/\bon(?:to)?\s+(.+)$/i);
  return (match ? match[1] : instruction).trim();
}

/**
 * Current-road-name pill (this phase's brief: "Road name"). Renders nothing
 * while there is no active step, so it's always safe to mount
 * unconditionally.
 */
export function NavigationRoadName() {
  const currentStep = useCurrentStep();
  const roadName = useMemo(() => (currentStep ? extractRoadName(currentStep.instruction) : null), [currentStep]);

  if (!roadName) return null;

  return (
    <View className="flex-row items-center bg-primary/90 rounded-full px-3 py-1.5 self-start">
      <Ionicons name="trail-sign-outline" size={14} color={colors.white} />
      <Text className="text-white text-xs font-semibold ml-1.5" numberOfLines={1}>
        {roadName}
      </Text>
    </View>
  );
}
