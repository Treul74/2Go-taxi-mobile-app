import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type RatingStarsSize = 'sm' | 'md' | 'lg';

interface RatingStarsProps {
  value: number;
  onChange?: (v: number) => void;
  size?: RatingStarsSize;
  readonly?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZE_MAP: Record<RatingStarsSize, { icon: number; marginClass: string }> = {
  sm: { icon: 18, marginClass: 'mx-2' },
  md: { icon: 26, marginClass: 'mx-3' },
  lg: { icon: 32, marginClass: 'mx-4' },
};

interface StarProps {
  filled: boolean;
  iconSize: number;
  marginClass: string;
  readonly: boolean;
  onPress: () => void;
}

function Star({ filled, iconSize, marginClass, readonly, onPress }: StarProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = 0.8;
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={readonly}
      style={animatedStyle}
      className={marginClass}
    >
      <Ionicons
        name={filled ? 'star' : 'star-outline'}
        size={iconSize}
        color={filled ? '#FFB800' : '#D1D5DB'}
      />
    </AnimatedPressable>
  );
}

/**
 * Reusable 5-star rating input/display.
 */
export function RatingStars({
  value,
  onChange,
  size = 'md',
  readonly = false,
}: RatingStarsProps) {
  const { icon, marginClass } = SIZE_MAP[size];

  return (
    <View className="flex-row items-center">
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <Star
          key={starIndex}
          filled={starIndex <= value}
          iconSize={icon}
          marginClass={marginClass}
          readonly={readonly}
          onPress={() => onChange?.(starIndex)}
        />
      ))}
    </View>
  );
}
