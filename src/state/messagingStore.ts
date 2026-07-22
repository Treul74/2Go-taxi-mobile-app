import {
  fetchMessages,
  fetchOrderConversations,
  fetchUnreadCount,
  sendMessage as sendMessageToOrder,
  type SenderType,
} from '@/services/messages';
import { useUserStore } from '@/state/userStore';
import type { Conversation, Message } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Chat conversations/messages, backed by the `messages` table (one thread
 * per order). Both the conversation list and each thread's history are
 * fetched fresh from InsForge -- there is no local mock data left.
 */

const LAST_VIEWED_PREFIX = '@2go/chat_last_viewed:';
// Never-viewed sentinel: every message on a thread counts as unread until
// the chat screen has been opened at least once.
const EPOCH_ISO = new Date(0).toISOString();

async function getLastViewed(orderId: string): Promise<string> {
  const stored = await AsyncStorage.getItem(`${LAST_VIEWED_PREFIX}${orderId}`);
  return stored ?? EPOCH_ISO;
}

async function setLastViewed(orderId: string, iso: string): Promise<void> {
  await AsyncStorage.setItem(`${LAST_VIEWED_PREFIX}${orderId}`, iso);
}

/** The logged-in user's own sender identity for their currently active role. */
function getSender(): { senderType: SenderType; senderId: string } | null {
  const { role, customerAccount, driverAccount } = useUserStore.getState();
  if (role === 'driver') {
    return driverAccount ? { senderType: 'driver', senderId: driverAccount.id } : null;
  }
  return customerAccount ? { senderType: 'customer', senderId: customerAccount.id } : null;
}

// Chat screen polls the active thread on this interval instead of a realtime
// channel -- realtime channel auth doesn't work under this SDK's server mode
// (see services/orders.ts / services/driverOrders.ts for the same constraint).
const CHAT_POLL_MS = 5000;
let pollInterval: ReturnType<typeof setInterval> | null = null;

interface MessagingState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  isLoadingConversations: boolean;

  loadConversations: () => Promise<void>;
  loadMessages: (orderId: string) => Promise<void>;
  sendMessage: (orderId: string, text: string) => Promise<void>;
  markAsRead: (orderId: string) => Promise<void>;
  getMessages: (orderId: string) => Message[];
  startPolling: (orderId: string) => void;
  stopPolling: () => void;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  conversations: [],
  messages: {},
  isLoadingConversations: false,

  // One conversation per order the current account is matched on (driver
  // assigned), newest first, with a real unread count per thread.
  loadConversations: async () => {
    const { role, customerAccount, driverAccount } = useUserStore.getState();
    const account = role === 'driver' ? driverAccount : customerAccount;
    if (!account) {
      set({ conversations: [] });
      return;
    }

    set({ isLoadingConversations: true });
    try {
      const orderConversations = await fetchOrderConversations(
        role === 'driver' ? 'driver' : 'passenger',
        account.id
      );

      const sender = getSender();
      const conversations = await Promise.all(
        orderConversations.map(async (c): Promise<Conversation> => {
          const unreadCount = sender
            ? await fetchUnreadCount(c.orderId, sender.senderType, await getLastViewed(c.orderId))
            : 0;

          return {
            id: c.orderId,
            participantName: c.participantName,
            participantAvatar: c.participantAvatar,
            lastMessage: c.lastMessage,
            lastMessageTime: c.lastMessageTime,
            unreadCount,
            isOnline: c.isOnline,
            rideId: c.orderId,
          };
        })
      );

      set({ conversations });
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  // Full history for one order's thread -- used both for the initial load
  // when the chat screen opens and for each poll tick while it's open.
  loadMessages: async (orderId) => {
    const history = await fetchMessages(orderId);
    set((state) => ({ messages: { ...state.messages, [orderId]: history } }));
  },

  sendMessage: async (orderId, text) => {
    const sender = getSender();
    if (!sender) {
      console.error('Failed to send message: no active account for the current role.');
      return;
    }

    const { message, errorMessage } = await sendMessageToOrder(
      orderId,
      sender.senderType,
      sender.senderId,
      text
    );

    if (errorMessage || !message) {
      console.error('Failed to send message:', errorMessage);
      return;
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [orderId]: [...(state.messages[orderId] || []), message],
      },
      conversations: state.conversations.map((conv) =>
        conv.id === orderId
          ? { ...conv, lastMessage: message.text, lastMessageTime: message.timestamp }
          : conv
      ),
    }));
  },

  // Persists "seen up to now" for this thread (survives app restart) and
  // clears its badge locally.
  markAsRead: async (orderId) => {
    await setLastViewed(orderId, new Date().toISOString());
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === orderId ? { ...conv, unreadCount: 0 } : conv
      ),
    }));
  },

  getMessages: (orderId) => get().messages[orderId] || [],

  startPolling: (orderId) => {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
      get().loadMessages(orderId);
    }, CHAT_POLL_MS);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));
