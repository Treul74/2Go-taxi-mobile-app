import type { TripSummary } from '../types';
import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/fareCalculator';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

export interface TripSummaryCardProps {
    customerName: string;
    distance: number;
    duration: number;
    waitingDuration: number;
    fareAmount: number;
    serviceFeeAmount: number;
    netEarnings: number;
    onDone: () => void;
}

export function TripSummaryCard({
    customerName,
    distance,
    duration,
    waitingDuration,
    fareAmount,
    serviceFeeAmount,
    netEarnings,
    onDone,
}: TripSummaryCardProps) {
    return (
        <Card variant="elevated" padding="lg" radius="2xl" className="w-full">
            <View className="items-center py-4">
                <View className="w-16 h-16 rounded-full bg-success/10 items-center justify-center mb-4">
                    <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                </View>
                <Text className="text-primary font-bold text-xl mb-1">
                    Trip Completed
                </Text>
                <Text className="text-secondary text-sm mb-6">
                    {customerName} &middot; {distance.toFixed(1)} km &middot; {duration} min
                </Text>

                <View className="w-full bg-gray-100 rounded-3xl p-4 mb-6">
                    <Text className="text-secondary text-xs mb-3">TRIP BREAKDOWN</Text>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-secondary text-sm">Distance</Text>
                        <Text className="text-primary font-medium text-sm">{distance.toFixed(1)} km</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-secondary text-sm">Travel time</Text>
                        <Text className="text-primary font-medium text-sm">{duration} min</Text>
                    </View>
                    <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
                        <Text className="text-secondary text-sm">Waiting time</Text>
                        <Text className="text-primary font-medium text-sm">{waitingDuration} min</Text>
                    </View>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-primary text-sm">Final fare</Text>
                        <Text className="text-primary font-medium text-sm">{formatCurrency(fareAmount)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-3 pb-3 border-b border-gray-200">
                        <Text className="text-secondary text-sm">Service fee</Text>
                        <Text className="text-secondary text-sm">-{formatCurrency(serviceFeeAmount)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                        <Text className="text-primary font-bold">You earned</Text>
                        <Text className="text-success font-bold text-lg">{formatCurrency(netEarnings)}</Text>
                    </View>
                </View>
            </View>

            <Button variant="accent" fullWidth onPress={onDone}>
                Done
            </Button>
        </Card>
    );
}
