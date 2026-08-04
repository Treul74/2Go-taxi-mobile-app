import { colors } from '@/constants/theme';
import { formatManeuverDistance } from '@/lib/distance';
import { useCurrentInstruction, useCurrentStep } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

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
 * Distance shown is the step's own total distance (`RouteStep.distanceMeters`),
 * not a live countdown to the maneuver: `RouteEngine`'s `RouteProgress`
 * doesn't yet compute distance-remaining-within-the-current-step (only
 * whole-route remaining distance), so a real live countdown isn't available
 * data to show without this component deriving it itself — flagged as a
 * future RouteEngine enhancement rather than computed here.
 *
 * Renders nothing while there is no active step (e.g. outside turn-by-turn
 * modes), so it's always safe to mount unconditionally.
 */
export function NavigationTurnBanner() {
  const currentStep = useCurrentStep();
  const currentInstruction = useCurrentInstruction();

  if (!currentStep || !currentInstruction) return null;

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 shadow-md max-w-[75%]">
      <View className="w-11 h-11 rounded-full bg-primary items-center justify-center mr-3">
        <Ionicons name={iconForManeuver(currentStep.maneuver)} size={24} color={colors.white} />
      </View>
      <View className="shrink">
        <Text className="text-secondary text-xs font-medium">
          {formatManeuverDistance(currentStep.distanceMeters)}
        </Text>
        <Text className="text-primary text-base font-bold" numberOfLines={2}>
          {currentInstruction}
        </Text>
      </View>
    </View>
  );
}
