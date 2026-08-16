import { Button, Card } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export interface PickupNavigationCardProps {
    customerName: string;
    customerRating: number;
    pickupAddress: string;
    estimatedFare: number | string;
    distance: string;
    routeDistanceText: string | null;
    routeError: boolean;
    isCalculating: boolean;
    onStartPickup: () => void;
    onCallCustomer: () => void;
}

export function PickupNavigationCard({
    customerName,
    customerRating,
    pickupAddress,
    estimatedFare,
    distance,
    routeDistanceText,
    routeError,
    isCalculating,
    onStartPickup,
    onCallCustomer,
}: PickupNavigationCardProps) {
    return (
        <Card variant="default" className="mb-4 shadow-xl">
            {/* Customer Info */}
            <View className="flex-row items-center mb-4">
                <View className="w-12 h-12 rounded-full bg-accent/10 items-center justify-center">
                    <Ionicons name="person" size={24} color="#FE5035" />
                </View>
                <View className="ml-3 flex-1">
                    <Text className="text-primary font-bold text-lg">
                        {customerName}
                    </Text>
                    <View className="flex-row items-center">
                        {customerRating > 0 ? (
                            <>
                                <Ionicons name="star" size={14} color="#FFB800" />
                                <Text className="text-secondary text-sm ml-1">
                                    {customerRating.toFixed(1)}
                                </Text>
                            </>
                        ) : (
                            <Text className="text-secondary text-sm">New</Text>
                        )}
                    </View>
                </View>
                {/* Call Button moved here */}
                <Pressable
                    onPress={onCallCustomer}
                    className="w-10 h-10 rounded-full bg-success/10 items-center justify-center ml-2 border border-success/20"
                >
                    <Ionicons name="call" size={20} color="#10B981" />
                </Pressable>
            </View>

            {/* Pickup Location */}
            <View className="flex-row items-start mb-4 pb-4 border-b border-gray-100">
                <View className="w-6 items-center pt-1">
                    <View className="w-3 h-3 rounded-full bg-success border-2 border-white shadow-sm" />
                </View>
                <View className="ml-3 flex-1">
                    <Text className="text-secondary text-xs mb-1">PICKUP LOCATION</Text>
                    <Text className="text-primary font-medium">
                        {pickupAddress}
                    </Text>
                </View>
            </View>

            {/* Distance & Price (formerly ETA) */}
            <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                    <Ionicons name="navigate" size={20} color="#7B8387" />
                    <Text className="text-secondary ml-2">
                        {routeDistanceText || `${distance} km away`}
                    </Text>
                </View>
                {/* Price moved to here */}
                <View className="flex-row items-center">
                    <Text className="text-accent font-bold text-lg mr-1">
                        K{estimatedFare}
                    </Text>
                </View>
            </View>

            {/* Action Buttons */}
            <View className="gap-3">
                <Button
                    variant="primary"
                    leftIcon={routeError ? "refresh" : "navigate"}
                    onPress={onStartPickup}
                    loading={isCalculating}
                    fullWidth
                >
                    {routeError ? 'Retry Route' : 'Start Pickup'}
                </Button>
            </View>
        </Card>
    );
}
