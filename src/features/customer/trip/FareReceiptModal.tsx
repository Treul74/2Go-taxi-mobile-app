import { Button } from '@/components/ui';
import { useRideStore } from '@/state';
import type { PaymentMethod } from '@/types';
import React from 'react';
import { Modal, Text, View } from 'react-native';

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  card: 'Card',
};

/**
 * Final-fare popup shown right after a trip completes, before the rating
 * screen. Driven by rideStore.fareReceipt (set in applyOrderUpdate's
 * 'completed' case) -- dismissFareReceipt() clears it and navigates to
 * rating, so this component only needs to render and dismiss.
 */
export function FareReceiptModal() {
  const fareReceipt = useRideStore((state) => state.fareReceipt);
  const dismissFareReceipt = useRideStore((state) => state.dismissFareReceipt);

  return (
    <Modal visible={!!fareReceipt} transparent animationType="fade" onRequestClose={dismissFareReceipt}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full bg-white rounded-4xl p-6 items-center">
          <Text className="text-primary text-lg">You&apos;ll Pay</Text>
          <Text className="text-accent font-bold text-4xl mt-2">
            K{(fareReceipt?.fare ?? 0).toFixed(2)}
          </Text>
          <Text className="text-secondary text-sm mt-2">
            {fareReceipt ? paymentMethodLabels[fareReceipt.paymentMethod] : ''}
          </Text>

          <View className="w-full mt-6">
            <Button variant="accent" size="lg" fullWidth onPress={dismissFareReceipt}>
              OK
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
