import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StatusBar,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IconButton } from '@/components/ui';
import { MessageBubble } from '@/features/messaging/components';
import { useDriverStore, useMessagingStore, useRideStore, useUserStore } from '@/state';

/**
 * Chat thread screen
 * Bubble-style chat UI. `id` is the order id this thread belongs to.
 */
export default function ChatScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  const [inputText, setInputText] = useState('');

  const {
    conversations,
    getMessages,
    sendMessage,
    markAsRead,
    loadMessages,
    startPolling,
    stopPolling,
  } = useMessagingStore();

  const role = useUserStore((s) => s.role);
  const customerAccount = useUserStore((s) => s.customerAccount);
  const driverAccount = useUserStore((s) => s.driverAccount);
  // Falls back to whichever active trip is in flight for this role -- covers
  // opening chat straight from the trip screen, before the Messages tab's
  // conversation list has ever been fetched for this brand-new order.
  const activeTrip = useRideStore((s) => s.activeTrip);
  const currentTrip = useDriverStore((s) => s.currentTrip);

  const conversation = conversations.find((c) => c.id === orderId);
  const messages = getMessages(orderId || '');
  const mySenderId = role === 'driver' ? driverAccount?.id : customerAccount?.id;

  const participantName =
    conversation?.participantName ??
    (role === 'driver' ? currentTrip?.customerName : activeTrip?.driver.name) ??
    'Chat';
  // Both parties are necessarily active while an order is in flight -- the
  // conversation list's real driver_status only applies once one exists.
  const isOnline = conversation?.isOnline ?? true;

  // Load history, mark the thread read, and poll every 5s while this screen
  // is open -- realtime channels can't authorize under this SDK's server
  // mode (see services/orders.ts), so polling is the permanent solution.
  useEffect(() => {
    if (!orderId) return;
    loadMessages(orderId);
    markAsRead(orderId);
    startPolling(orderId);
    return () => stopPolling();
  }, [orderId, loadMessages, markAsRead, startPolling, stopPolling]);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length]);

  // Handle send message
  const handleSend = () => {
    if (inputText.trim() && orderId) {
      sendMessage(orderId, inputText.trim());
      setInputText('');
    }
  };

  // Handle call
  const handleCall = () => {
    // In a real app, this would get the phone from the conversation/ride
    Linking.openURL('tel:+260955559876');
  };

  if (!orderId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-primary font-semibold">Conversation not found</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 px-6 py-2 bg-primary rounded-full"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: participantName,
          headerTintColor: '#26344F',
          headerStyle: { backgroundColor: '#E7F1F9' },
          headerRight: () => (
            <IconButton
              icon="call"
              variant="accent"
              size="sm"
              onPress={handleCall}
            />
          ),
        }}
      />
      
      <View className="flex-1 bg-background">
        <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
        
        {/* Online status with safe area */}
        <SafeAreaView edges={['top']} className="bg-background border-b border-gray-200">
          <View className="px-5 py-2">
            <View className="flex-row items-center justify-center">
              <View
                className={`w-2 h-2 rounded-full mr-2 ${
                  isOnline ? 'bg-success' : 'bg-gray-400'
                }`}
              />
              <Text className="text-secondary text-sm">
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </SafeAreaView>
        
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 px-4 py-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
          {messages.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-secondary text-sm">
                Start a conversation
              </Text>
            </View>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwnMessage={message.senderId === mySenderId}
              />
            ))
          )}
          </ScrollView>
          
          {/* Input area */}
          <SafeAreaView edges={['bottom']} className="bg-white border-t border-gray-200">
            <View className="flex-row items-end px-4 py-3 gap-3">
              {/* Text input */}
              <View className="flex-1 bg-gray-100 rounded-4xl px-4 py-2 min-h-[44px] max-h-[120px]">
                <TextInput
                  className="text-primary text-base"
                  placeholder="Type a message..."
                  placeholderTextColor="#7B8387"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={500}
                />
              </View>
              
              {/* Send button */}
              <Pressable
                onPress={handleSend}
                disabled={!inputText.trim()}
                className={`w-11 h-11 rounded-full items-center justify-center ${
                  inputText.trim() ? 'bg-accent' : 'bg-gray-300'
                }`}
              >
                <Ionicons 
                  name="send" 
                  size={20} 
                  color={inputText.trim() ? '#FFFFFF' : '#7B8387'} 
                />
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

