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
import { useMessagingStore } from '@/state';

/**
 * Chat thread screen
 * Bubble-style chat UI with send functionality
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [inputText, setInputText] = useState('');
  
  const { 
    conversations, 
    getMessages, 
    sendMessage, 
    markAsRead, 
    currentUserId 
  } = useMessagingStore();
  
  const conversation = conversations.find((c) => c.id === id);
  const messages = getMessages(id || '');
  
  // Mark as read on mount
  useEffect(() => {
    if (id) {
      markAsRead(id);
    }
  }, [id, markAsRead]);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length]);
  
  // Handle send message
  const handleSend = () => {
    if (inputText.trim() && id) {
      sendMessage(id, inputText.trim());
      setInputText('');
    }
  };
  
  // Handle call
  const handleCall = () => {
    // In a real app, this would get the phone from the conversation/ride
    Linking.openURL('tel:+260955559876');
  };
  
  if (!conversation) {
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
          headerTitle: conversation.participantName,
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
                  conversation.isOnline ? 'bg-success' : 'bg-gray-400'
                }`} 
              />
              <Text className="text-secondary text-sm">
                {conversation.isOnline ? 'Online' : 'Offline'}
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
                isOwnMessage={message.senderId === currentUserId}
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

