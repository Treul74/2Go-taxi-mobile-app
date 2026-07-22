import React, { useCallback } from 'react';
import { View, Text, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ConversationItem } from './components';
import { useMessagingStore } from '@/state';

/**
 * Messages screen showing the real conversation list -- one entry per order
 * with a driver assigned, sourced from InsForge (see services/messages.ts).
 */
export function MessagesScreen() {
  const conversations = useMessagingStore((state) => state.conversations);
  const isLoadingConversations = useMessagingStore((state) => state.isLoadingConversations);
  const loadConversations = useMessagingStore((state) => state.loadConversations);

  // Refetch every time the Messages tab gains focus, so the list and unread
  // badges reflect messages sent while the user was elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  // Sort conversations by last message time
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  );

  // Handle conversation press
  const handleConversationPress = (id: string) => {
    router.push(`/chat/${id}`);
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="px-5 pt-4 pb-4 bg-background">
          <Text className="text-primary font-bold text-2xl">
            Messages
          </Text>
          <Text className="text-secondary text-sm mt-1">
            Chat with your drivers
          </Text>
        </View>
        
        {/* Conversation list */}
        <ScrollView
          className="flex-1 bg-white"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {sortedConversations.length === 0 && isLoadingConversations ? null : sortedConversations.length === 0 ? (
            <View className="items-center py-16 px-8">
              <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                <Ionicons name="chatbubbles-outline" size={40} color="#7B8387" />
              </View>
              <Text className="text-primary font-semibold text-lg">
                No messages yet
              </Text>
              <Text className="text-secondary text-sm text-center mt-2">
                Your conversations with drivers will appear here
              </Text>
            </View>
          ) : (
            sortedConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={handleConversationPress}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

