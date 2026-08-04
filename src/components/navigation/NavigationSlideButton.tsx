import { RideActionSlider } from '@/components/ui/RideActionSlider';
import React from 'react';

export interface NavigationSlideButtonProps {
  /** Label shown on the track, e.g. "SLIDE TO ARRIVE" / "SLIDE TO COMPLETE TRIP" (Bible: "Waiting At Pickup... Slide Arrive appears"; "Trip In Progress... Slide Complete Trip"). */
  label: string;
  /** Called once the user completes the slide gesture. */
  onComplete: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * The engine's slide-to-confirm control (Bible: "Slide Arrive appears" /
 * "Slide Complete Trip"). A thin re-export of the existing
 * `RideActionSlider` (`src/components/ui/`) rather than a second
 * implementation — per AGENTS.md ("Reuse existing components from
 * src/components/ui/ before creating new ones"), that component already
 * implements this exact gesture (drag-to-confirm, snap-back, haptic
 * success feedback). This file exists so navigation screens/components
 * import a Bible-named component from `src/components/navigation/` rather
 * than reaching into `ui/` directly, and so the navigation-specific prop
 * naming (`label`/`onComplete`) has one stable home if the underlying
 * primitive ever changes.
 *
 * No business logic: purely forwards props.
 */
export function NavigationSlideButton({ label, onComplete, disabled, isLoading }: NavigationSlideButtonProps) {
  return <RideActionSlider label={label} onComplete={onComplete} disabled={disabled} isLoading={isLoading} />;
}
