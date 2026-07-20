import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

interface IconButtonProps extends Omit<PressableProps, 'children'> {
  icon: IconName;
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  badge?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Icon button component with haptic-like press animation
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  badge,
  disabled,
  className = '',
  ...props
}: IconButtonProps) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
    }
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };
  
  // Variant styles
  const variantClasses = {
    primary: 'bg-primary',
    accent: 'bg-accent',
    secondary: 'bg-secondary',
    outline: 'bg-transparent border-2 border-primary',
    ghost: 'bg-transparent',
  };
  
  const iconColors = {
    primary: '#FFFFFF',
    accent: '#FFFFFF',
    secondary: '#FFFFFF',
    outline: '#26344F',
    ghost: '#26344F',
  };
  
  // Size styles
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };
  
  const iconSizes = {
    sm: 18,
    md: 22,
    lg: 26,
  };
  
  const baseClasses = `
    items-center justify-center rounded-full
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${disabled ? 'opacity-50' : ''}
    ${className}
  `;
  
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={animatedStyle}
      className={baseClasses}
      {...props}
    >
      <Ionicons
        name={icon}
        size={iconSizes[size]}
        color={iconColors[variant]}
      />
      {badge !== undefined && badge > 0 && (
        <Animated.View 
          className="absolute -top-1 -right-1 bg-accent min-w-5 h-5 rounded-full items-center justify-center px-1"
        >
          <Animated.Text className="text-white text-xs font-bold">
            {badge > 99 ? '99+' : badge}
          </Animated.Text>
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

