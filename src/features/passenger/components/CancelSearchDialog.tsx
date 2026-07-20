import { Button } from '@/components/ui';
import React from 'react';
import { Modal, Text, View } from 'react-native';

interface CancelSearchDialogProps {
  visible: boolean;
  onKeepSearching: () => void;
  onConfirmCancel: () => void;
}

/**
 * Confirmation dialog shown when the customer taps "Cancel ride" while the
 * matching overlay is searching for a driver.
 */
export function CancelSearchDialog({ visible, onKeepSearching, onConfirmCancel }: CancelSearchDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepSearching}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full bg-white rounded-4xl p-6">
          <Text className="text-primary font-bold text-xl text-center">Cancel Ride?</Text>
          <Text className="text-secondary text-sm text-center mt-2">
            Are you sure you want to cancel this request?
          </Text>

          <View className="mt-6">
            <Button variant="accent" size="lg" fullWidth onPress={onConfirmCancel}>
              Yes, cancel
            </Button>
            <Button variant="ghost" size="lg" fullWidth onPress={onKeepSearching} className="mt-2">
              No, keep searching
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
