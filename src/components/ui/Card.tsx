import React from 'react';
import { View, ViewProps, Pressable } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'md' | 'lg' | 'xl' | '2xl';
  onPress?: () => void;
  children: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Card component with soft shadows and extreme rounded corners
 * Following 2Go design system
 */
export function Card({
  variant = 'default',
  padding = 'md',
  radius = 'xl',
  onPress,
  children,
  className = '',
  style,
  ...props
}: CardProps) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
    }
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };
  
  // Build variant classes
  const variantClasses = {
    default: 'bg-white shadow-card',
    elevated: 'bg-white shadow-card-lg',
    outlined: 'bg-white border border-gray-200',
  };
  
  // Build padding classes
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };
  
  // Build radius classes
  const radiusClasses = {
    md: 'rounded-2xl',
    lg: 'rounded-3xl',
    xl: 'rounded-4xl',
    '2xl': 'rounded-5xl',
  };
  
  const baseClasses = `${variantClasses[variant]} ${paddingClasses[padding]} ${radiusClasses[radius]} ${className}`;
  
  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, style]}
        className={baseClasses}
        {...props}
      >
        {children}
      </AnimatedPressable>
    );
  }
  
  return (
    <View className={baseClasses} style={style} {...props}>
      {children}
    </View>
  );
}

