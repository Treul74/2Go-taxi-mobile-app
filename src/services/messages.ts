import { insforge } from '@/lib/insforge';
import type { Message } from '@/types';

/**
 * Order-thread chat against InsForge.
 *
 * One thread per order (messages.order_id). Read/send is polled by the chat
 * screen on a 5s interval rather than a realtime channel -- realtime channel
 * auth can't authorize under this SDK's server mode (see services/orders.ts
 * and services/driverOrders.ts for the same constraint on order updates and
 * pending-order discovery).
 */

export type SenderType = 'customer' | 'driver';

interface MessageRow {
  id: string;
  order_id: string;
  sender_type: SenderType;
  sender_id: string;
  message_text: string;
  created_at: string;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.order_id,
    senderId: row.sender_id,
    text: row.message_text,
    timestamp: new Date(row.created_at),
    // Per-message read receipts aren't tracked -- the Messages tab unread
    // badge is derived from a last-viewed timestamp instead (see
    // fetchUnreadCount below), not this flag.
    isRead: true,
  };
}

/** Full message history for an order's chat thread, oldest first. */
export async function fetchMessages(orderId: string): Promise<Message[]> {
  const { data, error } = await insforge.database
    .from('messages')
    .select('id, order_id, sender_type, sender_id, message_text, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();

  if (error || !data) return [];
  return data.map(toMessage);
}

/** Sends a chat message on the given order's thread. */
export async function sendMessage(
  orderId: string,
  senderType: SenderType,
  senderId: string,
  text: string
): Promise<{ message: Message | null; errorMessage: string | null }> {
  const { data, error } = await insforge.database
    .from('messages')
    .insert([
      {
        order_id: orderId,
        sender_type: senderType,
        sender_id: senderId,
        message_text: text,
      },
    ])
    .select('id, order_id, sender_type, sender_id, message_text, created_at')
    .single<MessageRow>();

  if (error || !data) {
    return { message: null, errorMessage: error?.message ?? 'Could not send message.' };
  }
  return { message: toMessage(data), errorMessage: null };
}

/** Count of messages from the other party on this order, newer than `sinceIso`. */
export async function fetchUnreadCount(
  orderId: string,
  myRole: SenderType,
  sinceIso: string
): Promise<number> {
  const otherRole: SenderType = myRole === 'customer' ? 'driver' : 'customer';

  const { count, error } = await insforge.database
    .from('messages')
    .select('id', { count: 'exact' })
    .eq('order_id', orderId)
    .eq('sender_type', otherRole)
    .gt('created_at', sinceIso);

  if (error) return 0;
  return count ?? 0;
}

interface ConversationOrderRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  drivers?: {
    id: string;
    first_name: string;
    last_name: string;
    profile_photo_url: string | null;
    driver_status: string | null;
  } | null;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
    profile_photo_url: string | null;
  } | null;
}

export interface OrderConversation {
  orderId: string;
  participantName: string;
  participantAvatar?: string;
  isOnline: boolean;
  lastMessage: string;
  lastMessageTime: Date;
}

interface LastMessageRow {
  order_id: string;
  sender_type: SenderType;
  message_text: string;
  created_at: string;
}

/**
 * One conversation per matched order (driver assigned), for the Messages
 * tab list. Newest order first. Two queries: the matched orders themselves,
 * then every message on those orders in one shot (grouped client-side) to
 * avoid an N+1 "latest message per order" round trip.
 */
export async function fetchOrderConversations(
  role: 'passenger' | 'driver',
  accountId: string
): Promise<OrderConversation[]> {
  const query =
    role === 'passenger'
      ? insforge.database
          .from('orders')
          .select(
            'id, created_at, updated_at, drivers(id, first_name, last_name, profile_photo_url, driver_status)'
          )
          .eq('customer_id', accountId)
          .not('driver_id', 'is', null)
      : insforge.database
          .from('orders')
          .select('id, created_at, updated_at, customers(id, first_name, last_name, profile_photo_url)')
          .eq('driver_id', accountId);

  const { data: orders, error } = await query
    .order('updated_at', { ascending: false })
    .limit(30)
    .returns<ConversationOrderRow[]>();

  if (error || !orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: messageRows } = await insforge.database
    .from('messages')
    .select('order_id, sender_type, message_text, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })
    .returns<LastMessageRow[]>();

  const lastMessageByOrder = new Map<string, LastMessageRow>();
  for (const row of messageRows ?? []) {
    if (!lastMessageByOrder.has(row.order_id)) {
      lastMessageByOrder.set(row.order_id, row);
    }
  }

  return orders
    .map((order): OrderConversation | null => {
      const other = role === 'passenger' ? order.drivers : order.customers;
      if (!other) return null;

      const last = lastMessageByOrder.get(order.id);

      return {
        orderId: order.id,
        participantName: `${other.first_name} ${other.last_name}`.trim(),
        participantAvatar: other.profile_photo_url ?? undefined,
        isOnline: role === 'passenger' ? order.drivers?.driver_status === 'online' : false,
        lastMessage: last?.message_text ?? 'Start the conversation',
        lastMessageTime: new Date(last?.created_at ?? order.updated_at ?? order.created_at),
      };
    })
    .filter((c): c is OrderConversation => c !== null);
}
