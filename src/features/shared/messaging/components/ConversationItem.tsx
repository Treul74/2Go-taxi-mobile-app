import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '@/types';

interface ConversationItemProps {
  conversation: Conversation;
  onPress: (id: string) => void;
}

/**
 * Conversation list item with unread badge and online indicator
 */
export function ConversationItem({ conversation, onPress }: ConversationItemProps) {
  // Format time
  const formatTime = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  
  return (
    <Pressable
      onPress={() => onPress(conversation.id)}
      className="flex-row items-center py-4 px-5 bg-white active:bg-gray-50"
    >
      {/* Avatar with online indicator */}
      <View className="relative">
        <View className="w-14 h-14 rounded-full bg-gray-200 items-center justify-center">
          {conversation.participantAvatar ? (
            <View className="w-14 h-14 rounded-full overflow-hidden">
              {/* Image placeholder */}
              <Ionicons name="person" size={28} color="#7B8387" />
            </View>
          ) : (
            <Ionicons name="person" size={28} color="#7B8387" />
          )}
        </View>
        
        {/* Online indicator */}
        {conversation.isOnline && (
          <View className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-success border-2 border-white" />
        )}
      </View>
      
      {/* Content */}
      <View className="flex-1 ml-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-primary font-semibold text-base">
            {conversation.participantName}
          </Text>
          <Text className="text-secondary text-xs">
            {formatTime(conversation.lastMessageTime)}
          </Text>
        </View>
        
        <View className="flex-row items-center justify-between mt-1">
          <Text 
            className={`text-sm flex-1 mr-3 ${
              conversation.unreadCount > 0 ? 'text-primary font-medium' : 'text-secondary'
            }`}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
          
          {conversation.unreadCount > 0 && (
            <View className="bg-accent min-w-5 h-5 rounded-full items-center justify-center px-1.5">
              <Text className="text-white text-xs font-bold">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

