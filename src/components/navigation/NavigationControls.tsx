import { IconButton } from '@/components/ui/IconButton';
import { useNavigation } from '@/navigation/NavigationEngine/hooks/useNavigation';
import { useRecenterState } from '@/navigation/NavigationEngine/NavigationHooks';
import React from 'react';
import { View } from 'react-native';

export interface NavigationControlsProps {
  /** Wired to a screen-provided handler — zoom isn't on `NavigationActions` (CameraController owns zoom internally per mode/speed; there's no manual override action today), so this button only renders when a screen supplies one. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** Map type isn't NavigationStore's concern (it's a rendering choice, not navigation state), so — same as zoom — this only renders when a screen supplies a handler. */
  onToggleLayers?: () => void;
}

/**
 * Right-side floating control stack (Bible: "Right Side: Layers, Compass,
 * Center, Zoom" — Compass is `NavigationCompass`, kept separate since it's
 * also a bearing indicator, not just a button).
 *
 * The Recenter ("Center") button is the one true engine action here — it
 * only appears when `NavigationStore.recenterState === 'available'` (Bible:
 * "the camera automatically enters FREE_EXPLORE... a floating Recenter
 * button appears"), and calls `navigation.recenter()` directly. Zoom/layers
 * have no engine action to dispatch to, so they're screen-supplied
 * callbacks — this component never decides what they do.
 */
export function NavigationControls({ onZoomIn, onZoomOut, onToggleLayers }: NavigationControlsProps) {
  const recenterState = useRecenterState();
  const navigation = useNavigation();

  return (
    <View className="gap-3">
      {recenterState === 'available' && (
        <IconButton icon="locate" variant="accent" onPress={() => navigation.recenter()} />
      )}
      {onToggleLayers && <IconButton icon="layers-outline" variant="ghost" onPress={onToggleLayers} />}
      {onZoomIn && <IconButton icon="add" variant="ghost" onPress={onZoomIn} />}
      {onZoomOut && <IconButton icon="remove" variant="ghost" onPress={onZoomOut} />}
    </View>
  );
}
