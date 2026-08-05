import { colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable } from 'react-native';

/**
 * Voice-guidance toggle (Bible: "Voice guidance toggle"). UI-only, per this
 * phase's own brief ("UI only if voice isn't implemented yet") — there is no
 * voice/TTS engine anywhere in this codebase yet, so this only flips a local
 * on/off affordance for a future `NavigationVoice` component to read.
 * Deliberately local `useState`, not a `NavigationState` field: nothing
 * downstream consumes this value yet, and adding store surface with zero
 * readers would be scope creep beyond "UI only."
 */
export function NavigationVoiceToggle() {
  const [enabled, setEnabled] = useState(true);

  return (
    <Pressable
      onPress={() => setEnabled((value) => !value)}
      className="w-11 h-11 rounded-full bg-white items-center justify-center shadow-md"
    >
      <Ionicons
        name={enabled ? 'volume-high' : 'volume-mute'}
        size={20}
        color={enabled ? colors.accent : colors.secondary}
      />
    </Pressable>
  );
}
