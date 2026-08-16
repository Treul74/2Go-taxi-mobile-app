import { Card } from '@/components/ui';
import { RideActionSlider } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

export interface WaitingForCustomerCardProps {
    customerName: string;
    pickupAddress: string;
    elapsedWaitingTime: number;
    isStartingTrip: boolean;
    startTripAttempt: number;
    startTripRetry: { attempt: number; maxAttempts: number } | null;
    onStartTrip: () => void;
}

export function WaitingForCustomerCard({
    customerName,
    pickupAddress,
    elapsedWaitingTime,
    isStartingTrip,
    startTripAttempt,
    startTripRetry,
    onStartTrip,
}: WaitingForCustomerCardProps) {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Card variant="default" className="mb-4">
            <View className="items-center py-4">
                <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
                    <Ionicons name="hourglass-outline" size={40} color="#26344F" />
                </View>
                <Text className="text-primary font-bold text-xl mb-2">
                    Waiting for Customer
                </Text>
                <Text className="text-secondary text-center mb-2">
                    {customerName}
                </Text>
                <Text className="text-secondary text-sm text-center mb-4">
                    {pickupAddress}
                </Text>
                <View className="bg-success/10 px-4 py-1 rounded-full mb-6">
                    <Text className="text-success font-bold text-lg">
                        {formatTime(elapsedWaitingTime)}
                    </Text>
                </View>
                {isStartingTrip && startTripRetry && (
                    <View className="bg-warning/10 px-4 py-2 rounded-xl mb-3 flex-row items-center justify-center">
                        <Ionicons name="cloud-offline-outline" size={16} color="#FFB800" />
                        <Text className="text-warning font-medium text-sm ml-2 text-center">
                            Network connection interrupted.{'\n'}
                            Retrying... Attempt {startTripRetry.attempt} of {startTripRetry.maxAttempts}
                        </Text>
                    </View>
                )}
                <RideActionSlider
                    key={`start-trip-${startTripAttempt}`}
                    label="Slide to Start Trip"
                    onComplete={onStartTrip}
                    isLoading={isStartingTrip}
                />
            </View>
        </Card>
    );
}
