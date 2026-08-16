import React, { useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import type { CancellationReason } from '@/features/customer/types';

interface CancellationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: CancellationReason, note?: string) => void;
  driverName?: string;
}

interface CancellationOption {
  id: CancellationReason;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const cancellationOptions: CancellationOption[] = [
  { id: 'changed_plans', label: 'Changed my plans', icon: 'calendar-outline' },
  { id: 'driver_too_far', label: 'Driver is too far away', icon: 'location-outline' },
  { id: 'long_wait', label: 'Wait time is too long', icon: 'time-outline' },
  { id: 'wrong_location', label: 'Wrong pickup location', icon: 'navigate-outline' },
  { id: 'found_alternative', label: 'Found another ride', icon: 'car-outline' },
  { id: 'price_too_high', label: 'Price is too high', icon: 'cash-outline' },
  { id: 'other', label: 'Other reason', icon: 'ellipsis-horizontal-outline' },
];

/**
 * Modal for cancelling an active ride with reason selection
 */
export function CancellationModal({ 
  visible, 
  onClose, 
  onConfirm,
  driverName 
}: CancellationModalProps) {
  const [selectedReason, setSelectedReason] = useState<CancellationReason | null>(null);
  const [note, setNote] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selectedReason) return;
    
    setIsConfirming(true);
    // Add slight delay for better UX
    setTimeout(() => {
      onConfirm(selectedReason, note.trim() || undefined);
      setIsConfirming(false);
      handleClose();
    }, 300);
  };

  const handleClose = () => {
    setSelectedReason(null);
    setNote('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-5xl" style={{ maxHeight: '90%' }}>
          {/* Header */}
          <View className="px-6 pt-6 pb-4 border-b border-gray-100">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-primary font-bold text-xl">
                Cancel Ride?
              </Text>
              <Pressable 
                onPress={handleClose}
                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
              >
                <Ionicons name="close" size={20} color="#26344F" />
              </Pressable>
            </View>
            {driverName && (
              <Text className="text-secondary text-sm">
                {driverName} is on the way to pick you up
              </Text>
            )}
          </View>

          <ScrollView 
            className="flex-1"
            showsVerticalScrollIndicator={false}
          >
            {/* Warning message */}
            <View className="px-6 py-4 mx-6 mt-4 bg-warning/10 rounded-3xl flex-row">
              <Ionicons name="warning-outline" size={20} color="#FFB800" />
              <Text className="text-warning text-sm ml-3 flex-1">
                Cancelling rides frequently may affect your account rating
              </Text>
            </View>

            {/* Cancellation reasons */}
            <View className="px-6 py-4">
              <Text className="text-primary font-semibold text-base mb-3">
                Why are you cancelling?
              </Text>
              
              {cancellationOptions.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => setSelectedReason(option.id)}
                  className={`flex-row items-center p-4 rounded-3xl mb-2 ${
                    selectedReason === option.id ? 'bg-primary' : 'bg-gray-100'
                  }`}
                >
                  <View 
                    className={`w-10 h-10 rounded-full items-center justify-center ${
                      selectedReason === option.id ? 'bg-white/20' : 'bg-white'
                    }`}
                  >
                    <Ionicons 
                      name={option.icon}
                      size={20} 
                      color={selectedReason === option.id ? '#FFFFFF' : '#26344F'} 
                    />
                  </View>
                  <Text 
                    className={`font-medium text-base ml-4 flex-1 ${
                      selectedReason === option.id ? 'text-white' : 'text-primary'
                    }`}
                  >
                    {option.label}
                  </Text>
                  {selectedReason === option.id && (
                    <Ionicons 
                      name="checkmark-circle" 
                      size={24} 
                      color="#FFFFFF" 
                    />
                  )}
                </Pressable>
              ))}
            </View>

            {/* Optional note (shown when reason is selected) */}
            {selectedReason && (
              <View className="px-6 pb-4">
                <Text className="text-primary font-medium mb-2">
                  Additional details (optional)
                </Text>
                <View className="bg-gray-100 rounded-3xl p-4">
                  <TextInput
                    className="text-primary text-base min-h-[80px]"
                    placeholder="Tell us more..."
                    placeholderTextColor="#7B8387"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={200}
                    textAlignVertical="top"
                  />
                  <Text className="text-secondary text-xs text-right mt-1">
                    {note.length}/200
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action buttons */}
          <View className="px-6 py-4 border-t border-gray-100">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleConfirm}
              disabled={!selectedReason || isConfirming}
              loading={isConfirming}
            >
              Confirm Cancellation
            </Button>
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              onPress={handleClose}
              className="mt-2"
            >
              Keep Ride
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

