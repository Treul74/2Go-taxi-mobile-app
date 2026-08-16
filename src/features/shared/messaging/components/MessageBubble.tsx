import React from 'react';
import { View, Text } from 'react-native';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  showTimestamp?: boolean;
}

/**
 * Chat message bubble component
 */
export function MessageBubble({ 
  message, 
  isOwnMessage, 
  showTimestamp = true 
}: MessageBubbleProps) {
  // Format time
  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <View 
      className={`flex-row mb-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
    >
      <View 
        className={`
          max-w-[75%] px-4 py-3
          ${isOwnMessage 
            ? 'bg-accent rounded-t-3xl rounded-bl-3xl rounded-br-lg' 
            : 'bg-white rounded-t-3xl rounded-br-3xl rounded-bl-lg shadow-sm'
          }
        `}
      >
        <Text 
          className={`text-base ${isOwnMessage ? 'text-white' : 'text-primary'}`}
        >
          {message.text}
        </Text>
        
        {showTimestamp && (
          <View className={`flex-row items-center mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
            <Text 
              className={`text-xs ${isOwnMessage ? 'text-white/70' : 'text-secondary'}`}
            >
              {formatTime(message.timestamp)}
            </Text>
            
            {isOwnMessage && (
              <View className="ml-1">
                {message.isRead ? (
                  <Text className="text-white/70 text-xs">✓✓</Text>
                ) : (
                  <Text className="text-white/50 text-xs">✓</Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

