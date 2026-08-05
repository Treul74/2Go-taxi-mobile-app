import { colors } from '@/constants/theme';
import { useCurrentStep } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

/**
 * Lane guidance placeholder (this phase's brief: "Lane guidance
 * placeholder"). No lane-level data exists anywhere in this engine — Google
 * Directions steps aren't parsed for lane info (`RouteStep` has no lane
 * field, and `RouteEngine.ts`, off-limits this phase, is the only place
 * that could add one) — so, matching the same "UI only" treatment already
 * used for `NavigationVoiceToggle` (voice guidance isn't implemented
 * either), this renders a fixed, generic straight-ahead lane hint whenever
 * a turn is active rather than real per-lane data. A future `RouteEngine`
 * enhancement that parses Google's lane data would replace this
 * component's internals without changing where it's mounted.
 *
 * Renders nothing while there is no active step, so it's always safe to
 * mount unconditionally.
 */
export function NavigationLaneGuidance() {
  const currentStep = useCurrentStep();
  if (!currentStep) return null;

  return (
    <View className="flex-row gap-1.5 bg-white/95 rounded-xl px-2 py-1.5 shadow-md self-start">
      <View className="w-7 h-7 rounded-md bg-primary/10 items-center justify-center">
        <Ionicons name="arrow-up" size={16} color={colors.primary} />
      </View>
    </View>
  );
}
