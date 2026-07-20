import React from 'react';
import { Text, Pressable, ActivityIndicator, PressableProps } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: IconName;
  rightIcon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Button component following 2Go design system
 * Primary: #26344F, Accent: #FE5035
 */
export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
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
  
  const variantTextClasses = {
    primary: 'text-white',
    accent: 'text-white',
    secondary: 'text-white',
    outline: 'text-primary',
    ghost: 'text-primary',
  };
  
  // Size styles
  const sizeClasses = {
    sm: 'px-4 py-2',
    md: 'px-6 py-3',
    lg: 'px-8 py-4',
  };
  
  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };
  
  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };
  
  const iconColors = {
    primary: '#FFFFFF',
    accent: '#FFFFFF',
    secondary: '#FFFFFF',
    outline: '#26344F',
    ghost: '#26344F',
  };
  
  const isDisabled = disabled || loading;
  
  const baseClasses = `
    flex-row items-center justify-center rounded-4xl
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${fullWidth ? 'w-full' : ''}
    ${isDisabled ? 'opacity-50' : ''}
    ${className}
  `;
  
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={animatedStyle}
      className={baseClasses}
      {...props}
    >
      {loading ? (
        <ActivityIndicator 
          color={iconColors[variant]} 
          size={iconSizes[size]} 
        />
      ) : (
        <>
          {leftIcon && (
            <Ionicons
              name={leftIcon}
              size={iconSizes[size]}
              color={iconColors[variant]}
              style={{ marginRight: 8 }}
            />
          )}
          <Text 
            className={`font-semibold ${variantTextClasses[variant]} ${textSizeClasses[size]}`}
          >
            {children}
          </Text>
          {rightIcon && (
            <Ionicons
              name={rightIcon}
              size={iconSizes[size]}
              color={iconColors[variant]}
              style={{ marginLeft: 8 }}
            />
          )}
        </>
      )}
    </AnimatedPressable>
  );
}

