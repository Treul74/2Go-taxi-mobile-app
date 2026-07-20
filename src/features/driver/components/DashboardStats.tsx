import { useDriverWalletStore } from '@/state';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

const StatCard = ({ label, value, subValue, highlight = false }: { label: string, value: string, subValue?: string, highlight?: boolean }) => (
    <View className={`p-4 rounded-xl min-w-[120px] mr-3 border ${highlight ? 'bg-primary border-primary' : 'bg-white border-gray-100 shadow-sm'}`}>
        <Text className={`text-xs mb-1 ${highlight ? 'text-white/70' : 'text-secondary'}`}>{label}</Text>
        <Text className={`text-xl font-bold mb-1 ${highlight ? 'text-white' : 'text-primary'}`}>{value}</Text>
        {subValue && (
            <Text className={`text-[10px] ${highlight ? 'text-white/60' : 'text-success'}`}>{subValue}</Text>
        )}
    </View>
);

export const DashboardStats = () => {
    const { todayEarnings, totalTripsToday, availableBalance } = useDriverWalletStore();

    // No manual refresh needed, zustand handles it automatically

    return (
        <View className="mb-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {/* Balance Card (Highlighted) */}
                <StatCard
                    label="WALLET BALANCE"
                    value={`K${availableBalance.toFixed(2)}`}
                    subValue="Available to withdraw"
                    highlight
                />

                {/* Today's Earnings */}
                <StatCard
                    label="EARNINGS TODAY"
                    value={`K${todayEarnings.toFixed(2)}`}
                    subValue="Includes tips"
                />

                {/* Trips Today */}
                <StatCard
                    label="TRIPS TODAY"
                    value={totalTripsToday.toString()}
                    subValue="Completed"
                />
            </ScrollView>
        </View>
    );
};
