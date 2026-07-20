import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

type IconName = keyof typeof Ionicons.glyphMap;

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: IconName;
  rightIcon?: IconName;
  onRightIconPress?: () => void;
  onPress?: () => void;
  variant?: 'default' | 'filled' | 'search';
}

const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * Input component with floating labels and icons
 * Following 2Go design system with extreme rounded corners
 */
export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  onPress,
  variant = 'default',
  className = '',
  onFocus,
  onBlur,
  value,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const focusProgress = useSharedValue(0);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    focusProgress.value = withTiming(1, { duration: 200 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    focusProgress.value = withTiming(0, { duration: 200 });
    onBlur?.(e);
  };

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [error ? '#EF4444' : '#CBD5E1', error ? '#EF4444' : '#FE5035']
    ),
  }));

  // Variant styles
  const variantClasses = {
    default: 'bg-white border-2',
    filled: 'bg-gray-100 border-0',
    search: 'bg-white border-0 shadow-card',
  };

  const baseClasses = `
    flex-row items-center px-4 rounded-4xl
    ${variantClasses[variant]}
    ${variant === 'search' ? 'py-2' : 'py-2'}
    ${className}
  `;

  const InputContent = (
    <AnimatedView
      className={baseClasses}
      style={variant === 'default' ? animatedBorderStyle : undefined}
    >
      {leftIcon && (
        <Ionicons
          name={leftIcon}
          size={20}
          color={isFocused ? '#FE5035' : '#7B8387'}
          style={{ marginRight: 12 }}
        />
      )}

      <View className="flex-1" pointerEvents={onPress ? 'none' : 'auto'}>
        <TextInput
          className="text-primary text-base py-2"
          placeholderTextColor="#7B8387"
          onFocus={handleFocus}
          onBlur={handleBlur}
          value={value}
          {...props}
        />
      </View>

      {rightIcon && (
        <Pressable onPress={onRightIconPress} disabled={!onRightIconPress} hitSlop={10}>
          <Ionicons
            name={rightIcon}
            size={20}
            color={isFocused ? '#FE5035' : '#7B8387'}
            style={{ marginLeft: 12 }}
          />
        </Pressable>
      )}
    </AnimatedView>
  );

  return (
    <View className="w-full">
      {label && (
        <Text className="text-primary font-medium mb-2 ml-1">
          {label}
        </Text>
      )}

      {onPress ? (
        <Pressable onPress={onPress}>
          {InputContent}
        </Pressable>
      ) : (
        InputContent
      )}

      {error && (
        <Text className="text-error text-sm mt-1 ml-1">
          {error}
        </Text>
      )}
    </View>
  );
}

