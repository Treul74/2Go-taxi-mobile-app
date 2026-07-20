import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

interface RideActionSliderProps {
    label: string;
    onComplete: () => void;
    disabled?: boolean;
    isLoading?: boolean;
}

const CONTAINER_HEIGHT = 56;
const PADDING = 4;
const THUMB_SIZE = CONTAINER_HEIGHT - PADDING * 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDER_WIDTH = SCREEN_WIDTH - 40; // Assuming 20px padding on each side
const MAX_TRANSLATE = SLIDER_WIDTH - THUMB_SIZE - PADDING * 2;

export const RideActionSlider: React.FC<RideActionSliderProps> = ({
    label,
    onComplete,
    disabled = false,
    isLoading = false,
}) => {
    const [completed, setCompleted] = useState(false);
    const translateX = useSharedValue(0);

    // Reset slider if disabled or not completed
    useEffect(() => {
        if (!disabled && !completed) {
            translateX.value = withSpring(0);
        }
    }, [disabled, completed]);

    const handleComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompleted(true);
        onComplete();
    };

    const panGesture = Gesture.Pan()
        .enabled(!disabled && !completed && !isLoading)
        .onUpdate((event) => {
            const translation = event.translationX;
            // Clamp value between 0 and MAX_TRANSLATE
            translateX.value = Math.max(0, Math.min(translation, MAX_TRANSLATE));
        })
        .onEnd(() => {
            if (translateX.value > MAX_TRANSLATE * 0.9) {
                // Snap to end and trigger complete
                translateX.value = withTiming(MAX_TRANSLATE, { duration: 150 }, (finished) => {
                    if (finished) {
                        runOnJS(handleComplete)();
                    }
                });
            } else {
                // Snap back to start
                translateX.value = withSpring(0);
            }
        });

    const animatedThumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const animatedLabelStyle = useAnimatedStyle(() => ({
        opacity: 1 - translateX.value / (MAX_TRANSLATE * 0.8),
    }));

    return (
        <View className="relative w-full h-14 bg-primary rounded-full justify-center overflow-hidden shadow-sm" style={{ opacity: disabled ? 0.6 : 1 }}>
            {/* Label */}
            <Animated.View style={[animatedLabelStyle, { position: 'absolute', width: '100%', alignItems: 'center' }]}>
                <Text className="text-white font-bold text-lg">{label}</Text>
            </Animated.View>

            {/* Progress Track (optional visual fill) */}
            <Animated.View
                className="absolute left-0 top-0 bottom-0 bg-accent/20"
                style={useAnimatedStyle(() => ({
                    width: translateX.value + THUMB_SIZE + PADDING,
                }))}
            />

            {/* Thumb */}
            <GestureDetector gesture={panGesture}>
                <Animated.View
                    className="absolute left-1 w-12 h-12 bg-white rounded-full items-center justify-center shadow-md z-10"
                    style={animatedThumbStyle}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FE5035" />
                    ) : completed ? (
                        <Ionicons name="checkmark" size={24} color="#10B981" />
                    ) : (
                        <Ionicons name="arrow-forward" size={24} color="#FE5035" />
                    )}
                </Animated.View>
            </GestureDetector>
        </View>
    );
};
