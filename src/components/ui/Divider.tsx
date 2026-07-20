import React from 'react';
import { View, Text } from 'react-native';

interface DividerProps {
  label?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

/**
 * Divider component for visual separation
 */
export function Divider({ label, spacing = 'md' }: DividerProps) {
  const spacingClasses = {
    sm: 'my-2',
    md: 'my-4',
    lg: 'my-6',
  };
  
  if (label) {
    return (
      <View className={`flex-row items-center ${spacingClasses[spacing]}`}>
        <View className="flex-1 h-px bg-gray-200" />
        <Text className="mx-4 text-secondary text-sm">{label}</Text>
        <View className="flex-1 h-px bg-gray-200" />
      </View>
    );
  }
  
  return (
    <View className={`h-px bg-gray-200 ${spacingClasses[spacing]}`} />
  );
}

