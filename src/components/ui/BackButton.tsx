import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type BackButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<BackButtonSize, { box: number; icon: number }> = {
  sm: { box: 36, icon: 18 },
  md: { box: 44, icon: 20 },
  lg: { box: 56, icon: 26 },
};

interface BackButtonProps {
  /** Called on press. Defaults to router.back(). */
  onPress?: () => void;
  /** Icon color. Defaults to the app's primary text color. */
  color?: string;
  /** Circle diameter / icon size. Defaults to 'md'. */
  size?: BackButtonSize;
  /** Extra styles — e.g. absolute positioning when floating over a map or image. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's single back-arrow button — a white circle with a soft shadow.
 * Used consistently in every screen header and wherever a back action floats
 * over map/image content, so it always looks and behaves the same way.
 */
export function BackButton({ onPress, color = '#26344F', size = 'md', style }: BackButtonProps) {
  const { box, icon } = SIZES[size];

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        { width: box, height: box, borderRadius: box / 2 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name="arrow-back" size={icon} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});
