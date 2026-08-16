import { formatManeuverDistance } from '@/lib/distance';
import { useDistanceRemainingMeters, useEtaSeconds } from '@/navigation/NavigationEngine/NavigationHooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { NavigationArrivalTime } from './NavigationArrivalTime';
import { NavigationCompass } from './NavigationCompass';
import { NavigationControls, type NavigationControlsProps } from './NavigationControls';
import { NavigationLaneGuidance } from './NavigationLaneGuidance';
import { NavigationRoadName } from './NavigationRoadName';
import { NavigationTurnBanner } from './NavigationTurnBanner';
import { NavigationVoiceToggle } from './NavigationVoiceToggle';

export interface NavigationHUDProps extends NavigationControlsProps {}

/** Top-right ETA/remaining-distance chip (Bible: "Top Right: Clock, ETA, Location, Remaining distance") — no separate named Bible component for it, so it lives directly in the HUD layout rather than as its own file. */
function EtaChip() {
  const etaSeconds = useEtaSeconds();
  const distanceRemainingMeters = useDistanceRemainingMeters();
  if (etaSeconds === null && distanceRemainingMeters === null) return null;

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 shadow-md">
      <Ionicons name="time-outline" size={18} color={colors.primary} />
      <View className="ml-2">
        {etaSeconds !== null && (
          <Text className="text-primary text-base font-bold leading-none">
            {Math.max(0, Math.round(etaSeconds / 60))} min
          </Text>
        )}
        {distanceRemainingMeters !== null && (
          <Text className="text-secondary text-xs">{formatManeuverDistance(distanceRemainingMeters)} left</Text>
        )}
      </View>
    </View>
  );
}

/**
 * The default full navigation HUD overlay (Bible: "Navigation HUD — Top
 * Left: Turn icon, Distance, Instruction. Top Right: Clock, ETA, Location,
 * Remaining distance. Bottom Left: Current speed, Speed limit. Right Side:
 * Layers, Compass, Center, Zoom."). Composes the individually-reusable
 * pieces (`NavigationTurnBanner`, `NavigationRoadName`,
 * `NavigationLaneGuidance`, `NavigationArrivalTime`,
 * `NavigationCompass`, `NavigationControls`, `NavigationVoiceToggle`) into
 * the Bible's layout — a screen that wants a custom arrangement can render
 * those pieces directly instead of this composite.
 *
 * Deliberately excludes the bottom sheet (`NavigationBottomCard`) and
 * arrival card (`NavigationArrivalCard`): the Bible documents "Bottom Sheet
 * Behaviour" and arrival as their own sections, separate from "Navigation
 * HUD" — a screen composes those alongside this overlay, not inside it.
 *
 * Pure layout + composition: every value shown comes from the individual
 * components above reading `NavigationStore` themselves; this component
 * makes no decisions and holds no state of its own. `pointerEvents="box-none"`
 * on every wrapping layer so map gestures (pan/pinch/tap) still reach the
 * map beneath wherever the HUD itself has nothing drawn.
 */
export function NavigationHUD({ onZoomIn, onZoomOut, onToggleLayers }: NavigationHUDProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SafeAreaView className="flex-1" edges={['top', 'bottom']} pointerEvents="box-none">
        <View className="flex-row justify-between items-start px-4 pt-2 gap-3">
          <View className="flex-1 gap-2" pointerEvents="box-none">
            <NavigationTurnBanner />
            <View className="flex-row gap-2">
              <NavigationLaneGuidance />
              <NavigationRoadName />
            </View>
          </View>
          <View className="gap-2 items-end" pointerEvents="box-none">
            <EtaChip />
            <NavigationArrivalTime />
          </View>
        </View>

        <View className="flex-1" pointerEvents="box-none" />

        <View className="flex-row justify-end items-end px-4 pb-2 gap-3">
          <View className="items-center gap-3">
            <NavigationVoiceToggle />
            <NavigationCompass />
            <NavigationControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} onToggleLayers={onToggleLayers} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
