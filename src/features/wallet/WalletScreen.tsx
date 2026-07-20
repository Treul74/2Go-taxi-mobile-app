import { Card } from '@/components/ui';
import { useDriverStore, useDriverWalletStore } from '@/state';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function WalletScreen() {
    const [activeTab, setActiveTab] = useState<'wallet' | 'dashboard'>('wallet');
    const { stats } = useDriverStore();
    const { availableBalance, todayEarnings, weekEarnings, totalTripsToday, transactions } = useDriverWalletStore();

    const balanceLimit = 5.00;

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    const todayStats = useMemo(() => ({
        earnings: todayEarnings,
        trips: totalTripsToday,
    }), [todayEarnings, totalTripsToday]);

    const weeklyStats = useMemo(() => {
        const now = new Date(todayStr);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const trips = transactions.filter(t => new Date(t.timestamp) >= startOfWeek).length;
        return { earnings: weekEarnings, trips };
    }, [weekEarnings, transactions, todayStr]);

    const calendarDays = useMemo(() => {
        const days = [];
        const maxDays = 7;
        let maxDailyEarn = 0;
        const today = new Date(todayStr);

        for (let i = 0; i < maxDays; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - (maxDays - 1 - i));
            const dateStr = date.toISOString().split('T')[0];
            const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();

            const dailyEarn = transactions
                .filter(t => t.timestamp.startsWith(dateStr))
                .reduce((acc, t) => acc + t.totalFare, 0);

            if (dailyEarn > maxDailyEarn) maxDailyEarn = dailyEarn;

            days.push({ dateStr, dayLabel, dayNum, earnings: dailyEarn, isToday: dateStr === todayStr });
        }

        return days.map(d => ({
            ...d,
            barHeight: maxDailyEarn > 0 ? (d.earnings / maxDailyEarn) * 20 : 2
        }));
    }, [transactions, todayStr]);

    const formatCurrency = (val: number) => `ZMW ${val.toFixed(2)}`;

    return (
        <View className="flex-1 bg-background">
            <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />

            <SafeAreaView className="flex-1" edges={['top']}>
                {/* Fixed Header: Tab Switcher + Fixed Calendar */}
                <View className="bg-white border-b border-gray-100">
                    <View className="items-center px-5 pb-1 pt-4">
                        <View className="flex-row justify-center w-64">
                            <Pressable
                                onPress={() => setActiveTab('wallet')}
                                className={`flex-1 items-center pb-2 border-b-2 ${activeTab === 'wallet' ? 'border-accent' : 'border-transparent'}`}
                            >
                                <Text className={`font-bold ${activeTab === 'wallet' ? 'text-accent' : 'text-secondary/60'}`}>Wallet</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => setActiveTab('dashboard')}
                                className={`flex-1 items-center pb-2 border-b-2 ${activeTab === 'dashboard' ? 'border-accent' : 'border-transparent'}`}
                            >
                                <Text className={`font-bold ${activeTab === 'dashboard' ? 'text-accent' : 'text-secondary/60'}`}>Dashboard</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Fixed Calendar Strip (Only for Wallet tab) */}
                    {activeTab === 'wallet' && (
                        <View className="bg-white py-4 border-b border-gray-100">
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                className="px-5"
                                contentContainerStyle={{ paddingRight: 40 }}
                            >
                                <View className="flex-row items-end h-20 gap-4">
                                    {calendarDays.map((day, idx) => (
                                        <View key={idx} className="items-center w-12">
                                            <Text className={`text-[10px] font-bold mb-1 ${day.earnings > 0 ? 'text-primary' : 'text-secondary/40'}`}>
                                                {day.earnings > 0 ? day.earnings.toFixed(0) : ''}
                                            </Text>
                                            <View
                                                style={{ height: Math.max(day.barHeight, 4), width: 8 }}
                                                className={`rounded-full ${day.isToday ? 'bg-accent' : 'bg-gray-200'}`}
                                            />
                                            <Text className={`text-[11px] font-medium mt-1 ${day.isToday ? 'text-accent' : 'text-secondary'}`}>
                                                {day.dayNum}
                                            </Text>
                                            <Text className={`text-[10px] uppercase font-bold ${day.isToday ? 'text-accent' : 'text-secondary/60'}`}>
                                                {day.dayLabel}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                    )}
                </View>

                {activeTab === 'wallet' ? (
                    <ScrollView
                        className="flex-1"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 100 }}
                    >
                        {/* Today Summary */}
                        <View className="px-5 mt-4">
                            <Card variant="default" padding="md" className="bg-white shadow-sm border-0">
                                <Text className="text-secondary font-bold uppercase tracking-wider text-[11px] mb-3">Today's Earnings</Text>
                                <View className="flex-row justify-between items-center">
                                    <View>
                                        <Text className="text-secondary text-[11px]">Daily Net</Text>
                                        <Text className="text-primary font-bold text-xl">{formatCurrency(todayStats.earnings)}</Text>
                                    </View>
                                    <Ionicons name="cash-outline" size={24} color="#00D26A" />
                                </View>
                            </Card>
                        </View>

                        {/* Balance Section */}
                        <View className="px-5 mt-4 flex-row gap-3">
                            <Card variant="default" padding="md" className="flex-1 bg-white shadow-sm border-0">
                                <View className="flex-row justify-between items-start mb-2">
                                    <Text className="text-secondary text-[11px] font-medium">Balance limit</Text>
                                    <Ionicons name="shield-checkmark" size={14} color="#00D26A" />
                                </View>
                                <Text className="text-primary font-bold text-lg mb-1">{formatCurrency(balanceLimit)}</Text>
                                <Text className="text-success text-[10px] font-bold">Safe</Text>
                            </Card>

                            <Card variant="default" padding="md" className="flex-1 bg-white shadow-sm border-0">
                                <View className="flex-row justify-between items-start mb-2">
                                    <Text className="text-secondary text-[11px] font-medium">Available</Text>
                                    <Ionicons name="wallet-outline" size={14} color="#26344F" />
                                </View>
                                <Text className="text-primary font-bold text-lg mb-1">{formatCurrency(availableBalance)}</Text>
                            </Card>
                        </View>

                        {/* Recent Transactions */}
                        <View className="px-5 mt-6">
                            <Text className="text-primary font-bold text-lg mb-4">Recent transactions</Text>
                            {transactions.map((t) => (
                                <View key={t.id} className="flex-row items-center py-4 border-b border-gray-50">
                                    <View className="w-10 h-10 rounded-full items-center justify-center bg-success/10">
                                        <Ionicons name="car-outline" size={18} color="#00D26A" />
                                    </View>
                                    <View className="flex-1 ml-3">
                                        <Text className="text-primary font-bold text-sm tracking-tight">Completed trip</Text>
                                        <Text className="text-secondary text-[11px] mt-0.5">{t.destinationAddress}</Text>
                                    </View>
                                    <Text className="font-bold text-sm text-success">+{formatCurrency(t.totalFare)}</Text>
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                ) : (
                    <ScrollView
                        className="flex-1"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 100 }}
                    >
                        {/* Performance Header Summary */}
                        <View className="px-5 mt-6">
                            <Card variant="default" padding="lg" className="bg-white shadow-sm border-0">
                                <Text className="text-secondary font-bold uppercase tracking-wider text-[11px] mb-4">Today's Performance</Text>
                                <View className="flex-row justify-between mb-2">
                                    <View>
                                        <Text className="text-primary font-bold text-3xl">{todayStats.trips}</Text>
                                        <Text className="text-secondary text-xs">Trips completed</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-accent font-bold text-3xl">{formatCurrency(todayStats.earnings)}</Text>
                                        <Text className="text-secondary text-xs">Today's Revenue</Text>
                                    </View>
                                </View>
                            </Card>
                        </View>

                        {/* Metrics Cards */}
                        <View className="px-5 mt-4 flex-row gap-3">
                            <Card variant="default" padding="md" className="flex-1 bg-white shadow-sm border-0">
                                <View className="flex-row items-center mb-1">
                                    <Ionicons name="star" size={16} color="#FFB800" />
                                    <Text className="text-primary font-bold text-xl ml-1">{stats.averageRating.toFixed(2)}</Text>
                                </View>
                                <Text className="text-secondary text-[11px]">Average Rating</Text>
                                <Text className="text-secondary/40 text-[9px] mt-1">Last 7 days</Text>
                            </Card>

                            <Card variant="default" padding="md" className="flex-1 bg-white shadow-sm border-0">
                                <View className="flex-row items-center mb-1">
                                    <Ionicons name="checkmark-circle" size={16} color="#FE5035" />
                                    <Text className="text-primary font-bold text-xl ml-1">{stats.acceptanceRate}%</Text>
                                </View>
                                <Text className="text-secondary text-[11px]">Acceptance Rate</Text>
                                <Text className="text-secondary/40 text-[9px] mt-1">Steady</Text>
                            </Card>
                        </View>

                        {/* Weekly Summary */}
                        <View className="px-5 mt-4">
                            <Card variant="default" padding="lg" className="bg-white shadow-sm border-0">
                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-secondary font-bold uppercase tracking-wider text-[11px]">This Week Summary</Text>
                                    <Ionicons name="calendar-outline" size={18} color="#26344F" />
                                </View>

                                <View className="flex-row border-t border-gray-50 pt-4">
                                    <View className="flex-1">
                                        <Text className="text-secondary text-xs mb-1">Weekly Trips</Text>
                                        <Text className="text-primary font-bold text-2xl">{weeklyStats.trips}</Text>
                                    </View>
                                    <View className="flex-1 items-end">
                                        <Text className="text-secondary text-xs mb-1">Weekly Earnings</Text>
                                        <Text className="text-primary font-bold text-2xl">{formatCurrency(weeklyStats.earnings)}</Text>
                                    </View>
                                </View>

                                <View className="mt-4 pt-4 border-t border-gray-50">
                                    <View className="flex-row justify-between items-center">
                                        <Text className="text-secondary text-xs">Progress toward weekly goal</Text>
                                        <Text className="text-success font-bold text-xs">+12% vs last week</Text>
                                    </View>
                                    <View className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                                        <View className="h-full bg-accent" style={{ width: '65%' }} />
                                    </View>
                                </View>
                            </Card>
                        </View>
                    </ScrollView>
                )}
            </SafeAreaView>
        </View>
    );
}
