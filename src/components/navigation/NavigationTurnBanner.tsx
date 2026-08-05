import { useTurnPreview } from '@/hooks/useTurnPreview';
import { calculateDistanceMeters, formatManeuverDistance } from '@/lib/distance';
import { useCurrentInstruction, useCurrentStep, useDriverLocation } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Animated, Text, View } from 'react-native';

type IconName = keyof typeof Ionicons.glyphMap;

/** Maps a `RouteStep.maneuver` string (Google Directions vocabulary) to a turn icon. Presentational lookup only — the maneuver itself is decided entirely by RouteEngine/Google, never by this component. */
const MANEUVER_ICONS: Record<string, IconName> = {
  'turn-left': 'arrow-back',
  'turn-right': 'arrow-forward',
  'turn-slight-left': 'arrow-back',
  'turn-slight-right': 'arrow-forward',
  'turn-sharp-left': 'arrow-back',
  'turn-sharp-right': 'arrow-forward',
  'uturn-left': 'return-up-back',
  'uturn-right': 'return-up-forward',
  merge: 'git-merge',
  'fork-left': 'arrow-back',
  'fork-right': 'arrow-forward',
  roundabout: 'sync',
  straight: 'arrow-up',
};

function iconForManeuver(maneuver: string): IconName {
  return MANEUVER_ICONS[maneuver] ?? 'arrow-up';
}

/**
 * Top-left turn-by-turn instruction card (Bible: "Turn-by-Turn Navigation —
 * Top left: Small turn icon. Below: 250 m, Turn Right... Never make this
 * card larger than necessary.").
 *
 * Reads `NavigationStore`'s current step directly — renders nothing else.
 * Distance shown is a live straight-line countdown to the step's own end
 * location (`RouteStep.endLocation`) computed from the live `driverLocation`
 * selector, the same math + `useTurnPreview` pulse/color escalation every
 * driver-facing screen in this codebase already hand-rolled independently
 * (Phase 7 consolidates it here instead of a 4th copy) — not
 * `RouteProgress`'s whole-route remaining distance, which wouldn't reset
 * per step.
 *
 * Renders nothing while there is no active step (e.g. outside turn-by-turn
 * modes) or no live position yet, so it's always safe to mount
 * unconditionally.
 */
export function NavigationTurnBanner() {
  const currentStep = useCurrentStep();
  const currentInstruction = useCurrentInstruction();
  const driverLocation = useDriverLocation();

  const distanceToManeuverMeters = useMemo(() => {
    if (!driverLocation || !currentStep) return null;
    return calculateDistanceMeters(
      driverLocation.latitude,
      driverLocation.longitude,
      currentStep.endLocation.latitude,
      currentStep.endLocation.longitude
    );
  }, [driverLocation?.latitude, driverLocation?.longitude, currentStep]);

  const { pulseScale, color } = useTurnPreview(distanceToManeuverMeters);

  if (!currentStep || !currentInstruction) return null;

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 shadow-md max-w-[75%]">
      <Animated.View
        className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center mr-3"
        style={{ transform: [{ scale: pulseScale }] }}
      >
        <Ionicons name={iconForManeuver(currentStep.maneuver)} size={24} color="#26344F" />
      </Animated.View>
      <View className="shrink">
        <Text className="text-secondary text-xs font-medium" style={{ color }}>
          {distanceToManeuverMeters != null
            ? formatManeuverDistance(distanceToManeuverMeters)
            : formatManeuverDistance(currentStep.distanceMeters)}
        </Text>
        <Text className="text-primary text-base font-bold" numberOfLines={2}>
          {currentInstruction}
        </Text>
      </View>
    </View>
  );
}
