import React, { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, Dimensions, StyleSheet, Keyboard } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export type BottomSheetState = 'hidden' | 'collapsed' | 'expanded';

interface BottomSheetProps {
  children: React.ReactNode;
  collapsedHeight?: number;
  expandedHeight?: number;
  initialState?: BottomSheetState;
  onStateChange?: (state: BottomSheetState) => void;
  enablePanDownToClose?: boolean;
}

export interface BottomSheetRef {
  expand: () => void;
  collapse: () => void;
  hide: () => void;
  getState: () => BottomSheetState;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

/**
 * Custom draggable bottom sheet with three states
 * Collapsed, Expanded, Hidden
 */
export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  (
    {
      children,
      collapsedHeight = 280,
      expandedHeight = SCREEN_HEIGHT * 0.85,
      initialState = 'collapsed',
      onStateChange,
      enablePanDownToClose = true,
    },
    ref
  ) => {
    const translateY = useSharedValue(0);
    const context = useSharedValue({ y: 0 });
    const currentState = useSharedValue<BottomSheetState>(initialState);
    
    // Position values
    const hiddenY = SCREEN_HEIGHT;
    const collapsedY = SCREEN_HEIGHT - collapsedHeight;
    const expandedY = SCREEN_HEIGHT - expandedHeight;
    
    // Set initial position
    useEffect(() => {
      const initialY =
        initialState === 'hidden'
          ? hiddenY
          : initialState === 'collapsed'
          ? collapsedY
          : expandedY;
      translateY.value = initialY;
    }, []);
    
    const updateState = useCallback((state: BottomSheetState) => {
      currentState.value = state;
      onStateChange?.(state);
    }, [onStateChange]);
    
    const snapToPosition = useCallback((position: number, state: BottomSheetState) => {
      'worklet';
      translateY.value = withSpring(position, SPRING_CONFIG);
      runOnJS(updateState)(state);
    }, [updateState]);
    
    // Imperative methods
    useImperativeHandle(ref, () => ({
      expand: () => {
        // Don't dismiss keyboard when expanding - user might be typing
        translateY.value = withSpring(expandedY, SPRING_CONFIG);
        updateState('expanded');
      },
      collapse: () => {
        Keyboard.dismiss();
        translateY.value = withSpring(collapsedY, SPRING_CONFIG);
        updateState('collapsed');
      },
      hide: () => {
        Keyboard.dismiss();
        translateY.value = withSpring(hiddenY, SPRING_CONFIG);
        updateState('hidden');
      },
      getState: () => currentState.value,
    }));
    
    // Gesture handler with simultaneous gesture support
    const gesture = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-10, 10])
      .onStart(() => {
        // Dismiss keyboard when user starts dragging the sheet
        runOnJS(Keyboard.dismiss)();
        context.value = { y: translateY.value };
      })
      .onUpdate((event) => {
        const newY = context.value.y + event.translationY;
        // Clamp between expanded and hidden (or collapsed if close disabled)
        const minY = expandedY - 50; // Allow slight overscroll
        const maxY = enablePanDownToClose ? hiddenY : collapsedY + 50;
        translateY.value = Math.min(Math.max(newY, minY), maxY);
      })
      .onEnd((event) => {
        const velocity = event.velocityY;
        const currentY = translateY.value;
        
        // Determine snap point based on position and velocity
        if (velocity > 500) {
          // Fast downward swipe
          if (enablePanDownToClose && currentY > collapsedY) {
            snapToPosition(hiddenY, 'hidden');
          } else {
            snapToPosition(collapsedY, 'collapsed');
          }
        } else if (velocity < -500) {
          // Fast upward swipe
          snapToPosition(expandedY, 'expanded');
        } else {
          // Snap to nearest position
          const distToExpanded = Math.abs(currentY - expandedY);
          const distToCollapsed = Math.abs(currentY - collapsedY);
          const distToHidden = Math.abs(currentY - hiddenY);
          
          if (enablePanDownToClose) {
            if (distToExpanded < distToCollapsed && distToExpanded < distToHidden) {
              snapToPosition(expandedY, 'expanded');
            } else if (distToCollapsed < distToHidden) {
              snapToPosition(collapsedY, 'collapsed');
            } else {
              snapToPosition(hiddenY, 'hidden');
            }
          } else {
            if (distToExpanded < distToCollapsed) {
              snapToPosition(expandedY, 'expanded');
            } else {
              snapToPosition(collapsedY, 'collapsed');
            }
          }
        }
      })
      .withTestId('bottom-sheet-gesture');
    
    const animatedStyle = useAnimatedStyle(() => {
      const borderRadius = interpolate(
        translateY.value,
        [expandedY, collapsedY],
        [24, 40],
        Extrapolation.CLAMP
      );
      
      return {
        transform: [{ translateY: translateY.value }],
        borderTopLeftRadius: borderRadius,
        borderTopRightRadius: borderRadius,
      };
    });
    
    const handleIndicatorStyle = useAnimatedStyle(() => {
      const width = interpolate(
        translateY.value,
        [expandedY, collapsedY],
        [48, 40],
        Extrapolation.CLAMP
      );
      
      return {
        width,
      };
    });
    
    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <Animated.View style={[styles.handle, handleIndicatorStyle]} />
          </View>
          
          {/* Content */}
          <View style={styles.content}>
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: '#FFFFFF',
    shadowColor: '#26344F',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 50,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
});

BottomSheet.displayName = 'BottomSheet';

