import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, Alert } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface OnlineToggleProps {
  isOnline: boolean;
  onToggle: () => void;
}

/**
 * Compact toggle switch for driver status
 * Tapping toggles between Online and Offline
 */
export function OnlineToggle({ isOnline, onToggle }: OnlineToggleProps) {
  const progress = useSharedValue(isOnline ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isOnline ? 1 : 0, { damping: 20, stiffness: 200 });
  }, [isOnline]);

  const handlePress = () => {
    if (isOnline) {
      Alert.alert(
        'Go Offline',
        'Are you sure you want to go offline? You will stop receiving ride requests.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Offline',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onToggle();
            },
          },
        ]
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToggle();
    }
  };

  const trackAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        ['#9CA3AF', '#00D26A'] // neutral gray (gray-400) to success green
      ),
    };
  });

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: progress.value * 20 }], // 20px travel
    };
  });

  return (
    <Pressable 
      onPress={handlePress} 
      className="py-2" 
      accessibilityRole="switch" 
      accessibilityState={{ checked: isOnline }}
    >
      <Animated.View
        className="w-12 h-7 rounded-full flex-row items-center px-1"
        style={[trackAnimatedStyle]}
      >
        <Animated.View
          style={[
            thumbAnimatedStyle,
            { width: 20, height: 20, borderRadius: 10 }
          ]}
          className="bg-white shadow-sm"
        />
      </Animated.View>
    </Pressable>
  );
}


