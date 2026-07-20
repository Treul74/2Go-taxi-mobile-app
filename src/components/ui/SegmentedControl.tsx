import React, { useState } from 'react';
import { View, Text, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selectedKey: string;
  onChange: (key: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

interface LabelLayout {
  x: number;
  width: number;
}

/**
 * Segmented control with smooth animated underline indicator
 * Used for mode toggle (Taxi | Delivery) and tab filters
 */
export function SegmentedControl({
  segments,
  selectedKey,
  onChange,
  size = 'md',
}: SegmentedControlProps) {
  const [labelLayouts, setLabelLayouts] = useState<Record<string, LabelLayout>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  
  // Initialize indicator on first layout measurement
  React.useEffect(() => {
    if (!isInitialized && Object.keys(labelLayouts).length === segments.length) {
      const layout = labelLayouts[selectedKey];
      if (layout) {
        indicatorX.value = layout.x;
        indicatorWidth.value = layout.width;
        setIsInitialized(true);
      }
    }
  }, [labelLayouts, segments.length, selectedKey, isInitialized]);
  
  // Update indicator position when selected key changes (after initialization)
  React.useEffect(() => {
    if (isInitialized) {
      const layout = labelLayouts[selectedKey];
      if (layout) {
        indicatorX.value = withSpring(layout.x, {
          damping: 20,
          stiffness: 300,
        });
        indicatorWidth.value = withSpring(layout.width, {
          damping: 20,
          stiffness: 300,
        });
      }
    }
  }, [selectedKey, labelLayouts, isInitialized]);
  
  const handleLabelLayout = (key: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLabelLayouts((prev) => ({
      ...prev,
      [key]: { x, width },
    }));
  };
  
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));
  
  // Size styles
  const sizeClasses = {
    sm: 'py-1.5 px-3',
    md: 'py-2 px-4',
    lg: 'py-3 px-6',
  };
  
  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  return (
    <View className="bg-gray-100 rounded-4xl p-1 flex-row relative">
      {/* Animated underline indicator */}
      <Animated.View
        className="absolute bottom-1 h-0.5 bg-accent rounded-full"
        style={indicatorStyle}
      />
      
      {/* Segments */}
      {segments.map((segment) => {
        const isSelected = segment.key === selectedKey;
        
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            className={`flex-1 items-center justify-center ${sizeClasses[size]}`}
          >
            <View onLayout={(e) => handleLabelLayout(segment.key, e)}>
              <Text
                className={`
                  font-semibold ${textSizeClasses[size]}
                  ${isSelected ? 'text-accent' : 'text-secondary'}
                `}
              >
                {segment.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

