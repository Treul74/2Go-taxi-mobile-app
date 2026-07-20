import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface OnlineToggleProps {
  isOnline: boolean;
  onToggle: () => void;
}

/**
 * Slide-to-confirm toggle for driver status
 * Sliding right -> Go Online
 * Sliding left -> Go Offline
 */
export function OnlineToggle({ isOnline, onToggle }: OnlineToggleProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const THUMB_SIZE = 56;
  const PADDING = 4;

  // The normalized progress of the slider (0 = far left, 1 = far right)
  const progress = useSharedValue(isOnline ? 1 : 0);
  // Temporary offset during drag
  const translateX = useSharedValue(0);

  // Keep shared value in sync with prop change (via toggle)
  React.useEffect(() => {
    progress.value = withSpring(isOnline ? 1 : 0, { damping: 20, stiffness: 200 });
  }, [isOnline]);

  const onLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const maxTranslate = containerWidth - THUMB_SIZE - PADDING * 2;

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // If offline, we can only slide right from 0
      if (!isOnline) {
        translateX.value = Math.max(0, Math.min(event.translationX, maxTranslate));
      } else {
        // If online, we can only slide left from maxTranslate
        translateX.value = Math.min(0, Math.max(event.translationX, -maxTranslate));
      }
    })
    .onEnd(() => {
      const threshold = maxTranslate * 0.7;

      if (!isOnline) {
        if (translateX.value > threshold) {
          runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
          runOnJS(onToggle)();
        }
      } else {
        if (translateX.value < -threshold) {
          runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
          runOnJS(onToggle)();
        }
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    const basePos = isOnline ? maxTranslate : 0;
    return {
      transform: [{ translateX: basePos + translateX.value }],
    };
  });

  const trackAnimatedStyle = useAnimatedStyle(() => {
    // Current visual progress including drag
    const currentTranslate = (isOnline ? maxTranslate : 0) + translateX.value;
    const visualProgress = maxTranslate > 0 ? currentTranslate / maxTranslate : (isOnline ? 1 : 0);

    return {
      backgroundColor: interpolateColor(
        visualProgress,
        [0, 1],
        ['#26344F', '#00D26A']
      ),
    };
  });

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const currentTranslate = (isOnline ? maxTranslate : 0) + translateX.value;
    const visualProgress = maxTranslate > 0 ? currentTranslate / maxTranslate : (isOnline ? 1 : 0);

    return {
      opacity: interpolate(
        visualProgress,
        isOnline ? [0.5, 1] : [0, 0.5],
        [1, 0],
        'clamp'
      ),
      transform: [
        {
          translateX: interpolate(
            visualProgress,
            [0, 1],
            [10, -10]
          )
        }
      ]
    };
  });

  const iconName = useDerivedValue(() => {
    return isOnline ? 'radio' : 'radio-outline';
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        onLayout={onLayout}
        className="h-20 rounded-full flex-row items-center px-1 shadow-card-lg overflow-hidden"
        style={[trackAnimatedStyle]}
      >
        {/* Instruction Label */}
        <View className="absolute inset-0 flex-row items-center justify-center pointer-events-none">
          <Text className="text-white/40 font-bold uppercase tracking-widest text-xs mr-2">
            {isOnline ? 'Slide left to go offline' : 'Slide right to go online'}
          </Text>
          <Ionicons
            name={isOnline ? 'chevron-back' : 'chevron-forward'}
            size={16}
            color="rgba(255,255,255,0.3)"
          />
        </View>

        {/* Thumb */}
        <Animated.View
          style={[
            thumbAnimatedStyle,
            { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2 }
          ]}
          className="bg-white items-center justify-center shadow-sm"
        >
          <Ionicons
            name={isOnline ? 'radio' : 'radio-outline'}
            size={24}
            color={isOnline ? '#00D26A' : '#26344F'}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector >
  );
}


