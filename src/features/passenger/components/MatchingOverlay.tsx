import { BackButton } from '@/components/ui';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDisplayAddress } from '@/lib';
import { updateOrderPickup } from '@/services/orders';
import { useRideStore } from '@/state';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CancelSearchDialog } from './CancelSearchDialog';
import { LocationSearchModal } from './LocationSearchModal';
import { MapPickerModal } from './MapPickerModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLLAPSED_SHEET_HEIGHT = 220;
const EXPANDED_SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;

/** Time spent on "Starting search" before auto-advancing to the widen-search screen. */
const AUTO_EXPAND_SECONDS = 30;
/** Countdown shown once the widen-search screen appears. */
const EXPANDED_COUNTDOWN_SECONDS = 45;

type MatchingPhase = 'searching' | 'expanded';

interface MatchingOverlayProps {
  onCancel: () => void;
  /** Notifies the parent (map layer) which phase is active, so it can size the pulsing pickup marker accordingly. */
  onPhaseChange?: (phase: MatchingPhase) => void;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Matching flow shown while finding a driver, laid over the live map (map
 * stays visible underneath — this only renders the floating controls and
 * bottom sheet). Two phases:
 *  - "searching": pickup pill, back button, pulsing pin, "Starting search" sheet
 *  - "expanded": widen-search sheet with a countdown and alternate vehicle classes
 * Auto-advances from searching -> expanded after AUTO_EXPAND_SECONDS.
 */
export function MatchingOverlay({ onCancel, onPhaseChange }: MatchingOverlayProps) {
  const { pickup, setPickup, orderId } = useRideStore();
  const { location: currentLocation } = useCurrentLocation();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<MatchingPhase>('searching');
  const [countdown, setCountdown] = useState(EXPANDED_COUNTDOWN_SECONDS);
  const [showPickupSearch, setShowPickupSearch] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickupQuery, setPickupQuery] = useState(pickup ? formatDisplayAddress(pickup.address) : '');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const sheetProgress = useSharedValue(0);
  const dragStartProgress = useSharedValue(0);

  // Sets the phase directly — used by both the "Details" toggle and the drag
  // gesture. Cancels the pending auto-expand timer once the sheet has been
  // expanded, same as the original expand() behaviour.
  const setSheetPhase = useCallback((next: MatchingPhase) => {
    if (next === 'expanded' && autoExpandTimer.current) {
      clearTimeout(autoExpandTimer.current);
      autoExpandTimer.current = null;
    }
    setPhase(next);
  }, []);

  const expand = useCallback(() => setSheetPhase('expanded'), [setSheetPhase]);

  const toggleDetails = useCallback(() => {
    setSheetPhase(phase === 'expanded' ? 'searching' : 'expanded');
  }, [phase, setSheetPhase]);

  // Auto-advance to the widen-search screen after AUTO_EXPAND_SECONDS.
  useEffect(() => {
    autoExpandTimer.current = setTimeout(expand, AUTO_EXPAND_SECONDS * 1000);
    return () => {
      if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
    };
  }, [expand]);

  // Countdown ticks only once the widen-search screen is showing.
  useEffect(() => {
    if (phase !== 'expanded') return;
    setCountdown(EXPANDED_COUNTDOWN_SECONDS);
    countdownInterval.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [phase]);

  useEffect(() => {
    onPhaseChange?.(phase);
    sheetProgress.value = withTiming(phase === 'expanded' ? 1 : 0, { duration: 300 });
  }, [phase, onPhaseChange, sheetProgress]);

  const sheetStyle = useAnimatedStyle(() => ({
    height:
      COLLAPSED_SHEET_HEIGHT +
      (EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT) * sheetProgress.value,
  }));

  // Drag the handle to minimize/expand the sheet. Progress is driven
  // directly during the drag, then snapped to the nearest phase on release.
  const dragHandleGesture = Gesture.Pan()
    .onStart(() => {
      dragStartProgress.value = sheetProgress.value;
    })
    .onUpdate((event) => {
      const range = EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT;
      const delta = -event.translationY / range;
      sheetProgress.value = Math.min(1, Math.max(0, dragStartProgress.value + delta));
    })
    .onEnd((event) => {
      let nextPhase: MatchingPhase;
      if (event.velocityY < -500) {
        nextPhase = 'expanded';
      } else if (event.velocityY > 500) {
        nextPhase = 'searching';
      } else {
        nextPhase = sheetProgress.value > 0.5 ? 'expanded' : 'searching';
      }
      sheetProgress.value = withTiming(nextPhase === 'expanded' ? 1 : 0, { duration: 200 });
      runOnJS(setSheetPhase)(nextPhase);
    });

  const handleSelectPickup = useCallback(
    async (location: Location) => {
      const previousPickup = pickup;
      setPickup(location, true);
      setPickupQuery(formatDisplayAddress(location.address) || '');
      setShowPickupSearch(false);

      if (!orderId) return;

      const errorMessage = await updateOrderPickup(orderId, location);
      if (errorMessage) {
        setPickup(previousPickup, true);
        setPickupQuery(
          previousPickup ? formatDisplayAddress(previousPickup.address) || '' : ''
        );
        console.error('Failed to sync pickup change with active order:', errorMessage);
      }
    },
    [orderId, pickup, setPickup]
  );

  const handleOpenMapPicker = useCallback(() => {
    setShowPickupSearch(false);
    setShowMapPicker(true);
  }, []);

  const handleMapPickerConfirm = useCallback(
    (location: Location) => {
      setShowMapPicker(false);
      void handleSelectPickup(location);
    },
    [handleSelectPickup]
  );

  return (
    <>
      {phase === 'searching' && (
        <>
          {/* "Change | Pickup location >" pill */}
          <View className="absolute inset-x-0 items-center z-20" style={{ top: insets.top + 16 }} pointerEvents="box-none">
            <Pressable
              className="flex-row items-center rounded-full bg-white px-5 py-3 shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
              onPress={() => setShowPickupSearch(true)}
            >
              <Text className="text-[15px] text-[#7B8387]">Change</Text>
              <View className="mx-3 h-4 w-px bg-[#E2E8F0]" />
              <Text className="mr-1.5 max-w-[160px] text-[15px] font-bold text-[#26344F]" numberOfLines={1}>
                Pickup location
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#26344F" />
            </Pressable>
          </View>

          {/* Back arrow, bottom-left of the map area */}
          <View className="absolute left-4 z-20" style={{ bottom: COLLAPSED_SHEET_HEIGHT + insets.bottom + 16 }}>
            <BackButton onPress={onCancel} />
          </View>
        </>
      )}

      <Animated.View className="absolute inset-x-0 bottom-0 z-10 rounded-t-[40px] bg-white shadow-[0_-4px_16px_rgba(38,52,79,0.15)]" style={[sheetStyle, { paddingBottom: insets.bottom }]}> 
        <GestureDetector gesture={dragHandleGesture}>
          <View className="items-center pb-1 pt-3">
            <View className="h-[5px] w-10 rounded-[3px] bg-[#E2E8F0]" />
          </View>
        </GestureDetector>

        {phase === 'searching' ? (
          <View className="px-6 pt-3">
            <Text className="text-[22px] font-bold text-[#26344F]">Starting search</Text>
            <Text className="mt-2 text-[15px] text-[#7B8387]">Assessing how long it&apos;ll take to find a car</Text>

            <View className="mt-5 flex-row gap-3">
              <Pressable className="flex-1 items-center rounded-full border-[1.5px] border-[#E2E8F0] px-0 py-3.5" onPress={() => setShowCancelConfirm(true)}>
                <Text className="text-[15px] font-semibold text-[#26344F]">Cancel ride</Text>
              </Pressable>
              <Pressable className="flex-1 items-center rounded-full bg-[#26344F] px-0 py-3.5" onPress={toggleDetails}>
                <Text className="text-[15px] font-semibold text-white">Details</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-1 px-6 pt-3">
            <View className="flex-row items-start justify-between">
              <Text className="text-[22px] font-bold text-[#26344F]">Want to find a driver faster?</Text>
              <Text className="text-[20px] font-bold text-[#FE5035]">{formatCountdown(countdown)}</Text>
            </View>
            <View className="mt-2.5 h-[3px] overflow-hidden rounded-[2px] bg-[#F1F5F9]">
              <View className="h-full bg-[#FE5035]" style={{ width: `${(countdown / EXPANDED_COUNTDOWN_SECONDS) * 100}%` }} />
            </View>

            <View className="mt-5 flex-row gap-3">
              <Pressable className="flex-1 items-center rounded-full border-[1.5px] border-[#E2E8F0] px-0 py-3.5" onPress={() => setShowCancelConfirm(true)}>
                <Text className="text-[15px] font-semibold text-[#26344F]">Cancel ride</Text>
              </Pressable>
              <Pressable className="flex-1 items-center rounded-full bg-[#26344F] px-0 py-3.5" onPress={toggleDetails}>
                <Text className="text-[15px] font-semibold text-white">Details</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>

      <LocationSearchModal
        visible={showPickupSearch}
        title="Pickup Location"
        initialQuery={pickupQuery}
        userLocation={currentLocation || undefined}
        onSelectLocation={handleSelectPickup}
        onOpenMapPicker={handleOpenMapPicker}
        onClose={() => setShowPickupSearch(false)}
      />

      <MapPickerModal
        visible={showMapPicker}
        initialLocation={pickup ?? currentLocation ?? undefined}
        title="Select pickup location"
        onConfirm={handleMapPickerConfirm}
        onClose={() => setShowMapPicker(false)}
      />

      <CancelSearchDialog
        visible={showCancelConfirm}
        onKeepSearching={() => setShowCancelConfirm(false)}
        onConfirmCancel={() => {
          setShowCancelConfirm(false);
          onCancel();
        }}
      />
    </>
  );
}

