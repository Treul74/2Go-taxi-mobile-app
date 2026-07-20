import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

interface PillProps {
  label: string;
  icon?: IconName;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'outline';
  size?: 'sm' | 'md';
  onPress?: () => void;
  selected?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pill component for tags, status indicators, and quick-action chips
 */
export function Pill({
  label,
  icon,
  variant = 'default',
  size = 'md',
  onPress,
  selected = false,
}: PillProps) {
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
  
  // Variant styles
  const variantClasses = {
    default: selected ? 'bg-primary' : 'bg-gray-100',
    accent: 'bg-accent/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
    error: 'bg-error/10',
    outline: selected ? 'bg-primary' : 'bg-transparent border border-gray-300',
  };
  
  const textColorClasses = {
    default: selected ? 'text-white' : 'text-primary',
    accent: 'text-accent',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    outline: selected ? 'text-white' : 'text-primary',
  };
  
  const iconColors = {
    default: selected ? '#FFFFFF' : '#26344F',
    accent: '#FE5035',
    success: '#00D26A',
    warning: '#FFB800',
    error: '#EF4444',
    outline: selected ? '#FFFFFF' : '#26344F',
  };
  
  // Size styles
  const sizeClasses = {
    sm: 'px-2.5 py-1',
    md: 'px-3.5 py-1.5',
  };
  
  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
  };
  
  const iconSizes = {
    sm: 12,
    md: 14,
  };
  
  const baseClasses = `
    flex-row items-center rounded-full
    ${variantClasses[variant]}
    ${sizeClasses[size]}
  `;
  
  const content = (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={iconSizes[size]}
          color={iconColors[variant]}
          style={{ marginRight: 4 }}
        />
      )}
      <Text className={`font-medium ${textColorClasses[variant]} ${textSizeClasses[size]}`}>
        {label}
      </Text>
    </>
  );
  
  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={animatedStyle}
        className={baseClasses}
      >
        {content}
      </AnimatedPressable>
    );
  }
  
  return (
    <View className={baseClasses}>
      {content}
    </View>
  );
}

