import { colors } from '@/constants/theme';
import '@/lib/polyfills';
import { useMessagingStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const UNREAD_BADGE_POLL_MS = 15000;

export default function CustomerTabLayout() {
    const conversations = useMessagingStore((state) => state.conversations);
    const loadConversations = useMessagingStore((state) => state.loadConversations);
    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    useEffect(() => {
        loadConversations();
        const interval = setInterval(loadConversations, UNREAD_BADGE_POLL_MS);
        return () => clearInterval(interval);
    }, [loadConversations]);

    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.secondary,
                tabBarStyle: {
                    backgroundColor: colors.white,
                    borderTopWidth: 0,
                    elevation: 16,
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 12,
                    height: 60 + insets.bottom,
                    paddingTop: 8,
                    paddingBottom: Math.max(insets.bottom, 8),
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                    marginTop: 4,
                },
                tabBarItemStyle: {
                    paddingTop: 4,
                },
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color, focused }) => (
                        <View className={`items-center justify-center ${focused ? 'w-12 h-8 rounded-2xl bg-accent/10' : 'w-12 h-8'}`}>
                            <Ionicons
                                name={focused ? 'home' : 'home-outline'}
                                size={24}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="activity"
                options={{
                    title: 'Activity',
                    tabBarIcon: ({ color, focused }) => (
                        <View className={`items-center justify-center ${focused ? 'w-12 h-8 rounded-2xl bg-accent/10' : 'w-12 h-8'}`}>
                            <Ionicons
                                name={focused ? 'notifications' : 'notifications-outline'}
                                size={24}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="messages"
                options={{
                    title: 'Messages',
                    tabBarIcon: ({ color, focused }) => (
                        <View className={`items-center justify-center ${focused ? 'w-12 h-8 rounded-2xl bg-accent/10' : 'w-12 h-8'}`}>
                            <Ionicons
                                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                                size={24}
                                color={color}
                            />
                            {totalUnread > 0 && (
                                <View className="absolute -top-0.5 -right-0.5 bg-accent min-w-5 h-5 rounded-full items-center justify-center px-1">
                                    <Text className="text-white text-xs font-bold">
                                        {totalUnread > 99 ? '99+' : totalUnread}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ),
                    tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
                    tabBarBadgeStyle: {
                        backgroundColor: colors.accent,
                        color: colors.white,
                        fontSize: 10,
                        fontWeight: '700',
                        minWidth: 18,
                        height: 18,
                    },
                }}
            />
            <Tabs.Screen
                name="account"
                options={{
                    title: 'Account',
                    tabBarIcon: ({ color, focused }) => (
                        <View className={`items-center justify-center ${focused ? 'w-12 h-8 rounded-2xl bg-accent/10' : 'w-12 h-8'}`}>
                            <Ionicons
                                name={focused ? 'person-circle' : 'person-circle-outline'}
                                size={24}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
        </Tabs>
    );
}
