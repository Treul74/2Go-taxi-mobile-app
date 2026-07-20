import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

type IconName = keyof typeof Ionicons.glyphMap;

interface ChipProps {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Chip component for selectable filters and tags with optional remove action
 */
export function Chip({
  label,
  icon,
  selected = false,
  onPress,
  onRemove,
}: ChipProps) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    }
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };
  
  const bgClass = selected ? 'bg-primary' : 'bg-white border border-gray-200';
  const textClass = selected ? 'text-white' : 'text-primary';
  const iconColor = selected ? '#FFFFFF' : '#26344F';
  
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      className={`flex-row items-center justify-center px-3 py-1 rounded-full ${bgClass}`}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color={iconColor}
          style={{ marginRight: 4 }}
        />
      )}
      <Text className={`font-medium text-xs ${textClass}`}>
        {label}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} className="ml-1.5">
          <Ionicons
            name="close-circle"
            size={16}
            color={iconColor}
          />
        </Pressable>
      )}
    </AnimatedPressable>
  );
}

