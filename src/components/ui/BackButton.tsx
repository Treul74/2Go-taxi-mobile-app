import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';

interface BackButtonProps {
  /** Called on press. Defaults to router.back(). */
  onPress?: () => void;
  /** Extra styles — e.g. absolute positioning when floating over a map or image. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's single back-arrow button — a white circle with a soft shadow.
 * Used consistently in every screen and wherever a back action floats over
 * map/image content, so it always looks and behaves the same way.
 */
export function BackButton({ onPress, style }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      className="bg-white w-12 h-12 rounded-full items-center justify-center"
      style={[
        {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 3,
          elevation: 5,
        },
        style,
      ]}
    >
      <Ionicons name="arrow-back" size={24} color="#26344F" />
    </Pressable>
  );
}
