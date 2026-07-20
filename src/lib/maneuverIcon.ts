import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Maps a Google Directions `maneuver` string (e.g. "turn-slight-left",
 * "roundabout-right", "uturn-left") to an Ionicons glyph for the turn
 * preview header. Falls back to a plain "straight ahead" arrow for
 * unrecognized or missing maneuvers.
 */
export function getManeuverIconName(maneuver?: string): IoniconName {
  const value = maneuver || '';

  if (value.includes('uturn')) return 'arrow-undo';
  if (value.includes('roundabout')) return 'reload-circle-outline';
  if (value.includes('merge') || value.includes('fork')) return 'git-merge-outline';
  if (value.includes('left')) return 'arrow-back';
  if (value.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}
