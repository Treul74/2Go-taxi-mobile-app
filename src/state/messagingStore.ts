import { create } from 'zustand';
import type { Conversation, Message } from '@/types';

interface MessagingState {
  // Conversations
  conversations: Conversation[];
  
  // Messages by conversation ID
  messages: Record<string, Message[]>;
  
  // Current user ID (for determining message direction)
  currentUserId: string;
  
  // Actions
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  
  // Message actions
  sendMessage: (conversationId: string, text: string) => void;
  markAsRead: (conversationId: string) => void;
  getMessages: (conversationId: string) => Message[];
  
  // Simulation
  simulateIncomingMessage: (conversationId: string) => void;
}

// Mock conversations
const mockConversations: Conversation[] = [
  {
    id: 'conv_001',
    participantName: 'Emmanuel Phiri',
    participantAvatar: undefined,
    lastMessage: 'I\'m arriving in 2 minutes',
    lastMessageTime: new Date(Date.now() - 5 * 60000),
    unreadCount: 1,
    isOnline: true,
    rideId: 'ride_active',
  },
  {
    id: 'conv_002',
    participantName: 'Peter Mwanza',
    participantAvatar: undefined,
    lastMessage: 'Thank you for the trip!',
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60000),
    unreadCount: 0,
    isOnline: false,
    rideId: 'ride_001',
  },
  {
    id: 'conv_003',
    participantName: 'Grace Tembo',
    participantAvatar: undefined,
    lastMessage: 'Have a great day!',
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60000),
    unreadCount: 0,
    isOnline: true,
    rideId: 'ride_002',
  },
  {
    id: 'conv_004',
    participantName: '2Go Support',
    participantAvatar: undefined,
    lastMessage: 'How can we help you today?',
    lastMessageTime: new Date(Date.now() - 48 * 60 * 60000),
    unreadCount: 2,
    isOnline: true,
  },
];

// Mock messages
const mockMessages: Record<string, Message[]> = {
  conv_001: [
    {
      id: 'msg_001',
      conversationId: 'conv_001',
      senderId: 'driver_003',
      text: 'Hello! I\'m on my way to pick you up.',
      timestamp: new Date(Date.now() - 10 * 60000),
      isRead: true,
    },
    {
      id: 'msg_002',
      conversationId: 'conv_001',
      senderId: 'user_001',
      text: 'Great, I\'ll be waiting outside.',
      timestamp: new Date(Date.now() - 8 * 60000),
      isRead: true,
    },
    {
      id: 'msg_003',
      conversationId: 'conv_001',
      senderId: 'driver_003',
      text: 'I\'m arriving in 2 minutes',
      timestamp: new Date(Date.now() - 5 * 60000),
      isRead: false,
    },
  ],
  conv_002: [
    {
      id: 'msg_004',
      conversationId: 'conv_002',
      senderId: 'user_001',
      text: 'Thanks for the smooth ride!',
      timestamp: new Date(Date.now() - 2.5 * 60 * 60000),
      isRead: true,
    },
    {
      id: 'msg_005',
      conversationId: 'conv_002',
      senderId: 'driver_001',
      text: 'Thank you for the trip!',
      timestamp: new Date(Date.now() - 2 * 60 * 60000),
      isRead: true,
    },
  ],
  conv_003: [
    {
      id: 'msg_006',
      conversationId: 'conv_003',
      senderId: 'driver_002',
      text: 'Have a great day!',
      timestamp: new Date(Date.now() - 24 * 60 * 60000),
      isRead: true,
    },
  ],
  conv_004: [
    {
      id: 'msg_007',
      conversationId: 'conv_004',
      senderId: 'support',
      text: 'Welcome to 2Go! We\'re here to help.',
      timestamp: new Date(Date.now() - 72 * 60 * 60000),
      isRead: true,
    },
    {
      id: 'msg_008',
      conversationId: 'conv_004',
      senderId: 'support',
      text: 'How can we help you today?',
      timestamp: new Date(Date.now() - 48 * 60 * 60000),
      isRead: false,
    },
  ],
};

// Auto-reply messages for simulation
const autoReplies = [
  'Got it, thanks!',
  'On my way now.',
  'I\'ll be there shortly.',
  'No problem!',
  'See you soon!',
  'Perfect, thank you.',
];

export const useMessagingStore = create<MessagingState>((set, get) => ({
  // Initial state
  conversations: mockConversations,
  messages: mockMessages,
  currentUserId: 'user_001',
  
  // Conversation actions
  addConversation: (conversation) => set((state) => ({
    conversations: [conversation, ...state.conversations],
  })),
  
  updateConversation: (id, updates) => set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.id === id ? { ...conv, ...updates } : conv
    ),
  })),
  
  // Message actions
  sendMessage: (conversationId, text) => {
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      conversationId,
      senderId: get().currentUserId,
      text,
      timestamp: new Date(),
      isRead: true,
    };
    
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), newMessage],
      },
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? { ...conv, lastMessage: text, lastMessageTime: new Date() }
          : conv
      ),
    }));
    
    // Simulate auto-reply after delay
    setTimeout(() => {
      get().simulateIncomingMessage(conversationId);
    }, 1500 + Math.random() * 2000);
  },
  
  markAsRead: (conversationId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((msg) => ({
          ...msg,
          isRead: true,
        })),
      },
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      ),
    }));
  },
  
  getMessages: (conversationId) => {
    return get().messages[conversationId] || [];
  },
  
  // Simulation
  simulateIncomingMessage: (conversationId) => {
    const conversation = get().conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    
    const replyText = autoReplies[Math.floor(Math.random() * autoReplies.length)];
    
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      conversationId,
      senderId: conversation.participantName.toLowerCase().replace(' ', '_'),
      text: replyText,
      timestamp: new Date(),
      isRead: false,
    };
    
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), newMessage],
      },
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              lastMessage: replyText,
              lastMessageTime: new Date(),
              unreadCount: conv.unreadCount + 1,
            }
          : conv
      ),
    }));
  },
}));

