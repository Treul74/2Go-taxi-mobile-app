import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, Input, Divider } from '@/components/ui';
import type { PaymentMethod } from '@/types';
import { ScheduleRideModal } from './ScheduleRideModal';

interface RideOptionsProps {
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  scheduledFor: Date | null;
  onScheduleChange: (date: Date | null) => void;
  bookingFor: { name: string; phone: string } | null;
  onBookingForChange: (booking: { name: string; phone: string } | null) => void;
  driverInstructions: string;
  onDriverInstructionsChange: (instructions: string) => void;
}

// Payment method config
const paymentMethods: { id: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
];

/**
 * Ride options panel with payment, scheduling, and booking options
 */
export function RideOptions({
  paymentMethod,
  onPaymentMethodChange,
  scheduledFor,
  onScheduleChange,
  bookingFor,
  onBookingForChange,
  driverInstructions,
  onDriverInstructionsChange,
}: RideOptionsProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [tempBooking, setTempBooking] = useState({ name: '', phone: '' });
  const [tempInstructions, setTempInstructions] = useState('');
  
  const currentPayment = paymentMethods.find((p) => p.id === paymentMethod)!;
  
  return (
    <View className="mt-4">
      {/* Option buttons row */}
      <View className="flex-row flex-wrap gap-2">
        {/* Payment Method */}
        <Pressable 
          onPress={() => setShowPaymentModal(true)}
          className="flex-row items-center bg-gray-100 px-4 py-2.5 rounded-full"
        >
          <Ionicons name={currentPayment.icon} size={18} color="#26344F" />
          <Text className="text-primary font-medium text-sm ml-2">
            {currentPayment.label}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#7B8387" style={{ marginLeft: 4 }} />
        </Pressable>
        
        {/* Schedule for later */}
        <Pressable 
          onPress={() => scheduledFor ? onScheduleChange(null) : setShowScheduleModal(true)}
          className={`flex-row items-center px-4 py-2.5 rounded-full ${
            scheduledFor ? 'bg-primary' : 'bg-gray-100'
          }`}
        >
          <Ionicons 
            name="time-outline" 
            size={18} 
            color={scheduledFor ? '#FFFFFF' : '#26344F'} 
          />
          <Text className={`font-medium text-sm ml-2 ${
            scheduledFor ? 'text-white' : 'text-primary'
          }`}>
            {scheduledFor ? 'Scheduled' : 'Schedule'}
          </Text>
        </Pressable>
        
        {/* Book for someone else */}
        <Pressable 
          onPress={() => {
            if (bookingFor) {
              onBookingForChange(null);
            } else {
              setTempBooking({ name: '', phone: '' });
              setShowBookingModal(true);
            }
          }}
          className={`flex-row items-center px-4 py-2.5 rounded-full ${
            bookingFor ? 'bg-primary' : 'bg-gray-100'
          }`}
        >
          <Ionicons 
            name="person-add-outline" 
            size={18} 
            color={bookingFor ? '#FFFFFF' : '#26344F'} 
          />
          <Text className={`font-medium text-sm ml-2 ${
            bookingFor ? 'text-white' : 'text-primary'
          }`}>
            {bookingFor ? bookingFor.name : 'For someone'}
          </Text>
        </Pressable>
        
        {/* Driver instructions */}
        <Pressable 
          onPress={() => {
            setTempInstructions(driverInstructions);
            setShowInstructionsModal(true);
          }}
          className={`flex-row items-center px-4 py-2.5 rounded-full ${
            driverInstructions ? 'bg-primary' : 'bg-gray-100'
          }`}
        >
          <Ionicons 
            name="chatbubble-outline" 
            size={18} 
            color={driverInstructions ? '#FFFFFF' : '#26344F'} 
          />
          <Text className={`font-medium text-sm ml-2 ${
            driverInstructions ? 'text-white' : 'text-primary'
          }`}>
            Note
          </Text>
        </Pressable>
      </View>
      
      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-5xl p-6">
            <Text className="text-primary font-bold text-xl mb-4">
              Payment Method
            </Text>
            
            {paymentMethods.map((method) => (
              <Pressable
                key={method.id}
                onPress={() => {
                  onPaymentMethodChange(method.id);
                  setShowPaymentModal(false);
                }}
                className={`flex-row items-center p-4 rounded-3xl mb-2 ${
                  paymentMethod === method.id ? 'bg-primary' : 'bg-gray-100'
                }`}
              >
                <Ionicons 
                  name={method.icon} 
                  size={24} 
                  color={paymentMethod === method.id ? '#FFFFFF' : '#26344F'} 
                />
                <Text className={`font-medium text-base ml-4 ${
                  paymentMethod === method.id ? 'text-white' : 'text-primary'
                }`}>
                  {method.label}
                </Text>
                {paymentMethod === method.id && (
                  <Ionicons 
                    name="checkmark-circle" 
                    size={24} 
                    color="#FFFFFF" 
                    style={{ marginLeft: 'auto' }}
                  />
                )}
              </Pressable>
            ))}
            
            <Button 
              variant="ghost" 
              onPress={() => setShowPaymentModal(false)}
              className="mt-2"
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>
      
      {/* Book for Someone Modal */}
      <Modal
        visible={showBookingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookingModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-5xl p-6">
            <Text className="text-primary font-bold text-xl mb-4">
              Book for someone else
            </Text>
            
            <Input
              label="Name"
              placeholder="Enter their name"
              value={tempBooking.name}
              onChangeText={(text) => setTempBooking((prev) => ({ ...prev, name: text }))}
              leftIcon="person-outline"
            />
            
            <View className="h-4" />
            
            <Input
              label="Phone Number"
              placeholder="+260 XX XXX XXXX"
              value={tempBooking.phone}
              onChangeText={(text) => setTempBooking((prev) => ({ ...prev, phone: text }))}
              leftIcon="call-outline"
              keyboardType="phone-pad"
            />
            
            <View className="flex-row gap-3 mt-6">
              <Button 
                variant="outline" 
                onPress={() => setShowBookingModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="accent" 
                onPress={() => {
                  if (tempBooking.name && tempBooking.phone) {
                    onBookingForChange(tempBooking);
                    setShowBookingModal(false);
                  }
                }}
                className="flex-1"
              >
                Confirm
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Driver Instructions Modal */}
      <Modal
        visible={showInstructionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInstructionsModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-5xl p-6">
            <Text className="text-primary font-bold text-xl mb-4">
              Note for driver
            </Text>
            
            <Input
              placeholder="E.g. I'm wearing a blue shirt, at the gate..."
              value={tempInstructions}
              onChangeText={setTempInstructions}
              leftIcon="chatbubble-outline"
              multiline
            />
            
            <View className="flex-row gap-3 mt-6">
              <Button 
                variant="outline" 
                onPress={() => setShowInstructionsModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="accent" 
                onPress={() => {
                  onDriverInstructionsChange(tempInstructions);
                  setShowInstructionsModal(false);
                }}
                className="flex-1"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Schedule Ride Modal */}
      <ScheduleRideModal
        visible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onConfirm={(date) => {
          onScheduleChange(date);
          setShowScheduleModal(false);
        }}
        initialDate={scheduledFor}
      />
    </View>
  );
}

