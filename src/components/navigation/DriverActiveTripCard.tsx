import { NavigationSpeedWidget } from '@/components/navigation/NavigationSpeedWidget';
import { RideActionSlider } from '@/components/ui/RideActionSlider';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface DriverActiveTripCardProps {
    distance: string;
    arrivalTime: string;
    duration: string;
    customerName: string;
    customerRating?: number | string;
    pickupAddress?: string;
    destinationAddress: string;
    fare: number | string;
    sliderLabel: string;
    onSliderComplete: () => Promise<void> | void;
    onCallCustomer: () => void;
    onChatCustomer: () => void;
    isLoadingAction?: boolean;
    onLayout?: (event: LayoutChangeEvent) => void;
}

const CARD_COLLAPSED_HEIGHT = 180;
const CARD_EXPANDED_HEIGHT = 420;

export function DriverActiveTripCard({
    distance,
    arrivalTime,
    duration,
    customerName,
    customerRating,
    pickupAddress,
    destinationAddress,
    fare,
    sliderLabel,
    onSliderComplete,
    onCallCustomer,
    onChatCustomer,
    isLoadingAction = false,
    onLayout,
}: DriverActiveTripCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const insets = useSafeAreaInsets();
    const overlayAnim = useRef(new Animated.Value(CARD_COLLAPSED_HEIGHT + 16)).current;

    useEffect(() => {
        Animated.spring(overlayAnim, {
            toValue: isExpanded ? CARD_EXPANDED_HEIGHT + 16 : CARD_COLLAPSED_HEIGHT + 16,
            useNativeDriver: false,
            friction: 8,
            tension: 40,
        }).start();
    }, [isExpanded]);

    return (
        <>
            {/* Speed display — bottom-left, above the trip card */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 16,
                    bottom: Animated.add(overlayAnim, 20),
                    zIndex: 10,
                }}
            >
                <NavigationSpeedWidget speedLimitKph={60} />
            </Animated.View>

            {/* Bottom trip card */}
            <View 
                style={[styles.card, { paddingBottom: insets.bottom || 16 }]}
                onLayout={onLayout}
            >
                {/* Drag handle pill */}
                <View style={styles.dragHandleWrap}>
                    <View style={styles.dragHandle} />
                </View>

                {/* Stats row — always visible */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Ionicons name="repeat-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{distance}</Text>
                        <Text style={styles.statLabel}>Distance</Text>
                    </View>

                    <View style={styles.statItem}>
                        <Ionicons name="time-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{arrivalTime}</Text>
                        <Text style={styles.statLabel}>Arrival</Text>
                    </View>

                    <View style={styles.statItem}>
                        <Ionicons name="stopwatch-outline" size={20} color="#7B8387" />
                        <Text style={styles.statValue}>{duration}</Text>
                        <Text style={styles.statLabel}>Duration</Text>
                    </View>

                    <Pressable onPress={() => setIsExpanded((prev) => !prev)} style={styles.expandToggle}>
                        <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-up'} size={20} color="#26344F" />
                    </Pressable>
                </View>

                {/* Expanded content */}
                {isExpanded && (
                    <View style={styles.expandedContent}>
                        {/* Customer row */}
                        <View style={styles.customerRow}>
                            <View style={styles.avatar}>
                                <Ionicons name="person" size={28} color="#7B8387" />
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <View style={styles.ratingRow}>
                                    {Number(customerRating) > 0 ? (
                                        <>
                                            <Ionicons name="star" size={12} color="#FFB800" />
                                            <Text style={styles.ratingText}>{Number(customerRating).toFixed(1)}</Text>
                                        </>
                                    ) : (
                                        <Text style={styles.ratingText}>New</Text>
                                    )}
                                </View>
                            </View>

                            <View style={styles.actionButtons}>
                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={onCallCustomer} style={styles.actionButton}>
                                        <Ionicons name="call" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>Call</Text>
                                </View>

                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={onChatCustomer} style={styles.actionButton}>
                                        <Ionicons name="chatbubble" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>Chat</Text>
                                </View>

                                <View style={styles.actionButtonWrap}>
                                    <Pressable onPress={() => { }} style={styles.actionButton}>
                                        <Ionicons name="ellipsis-vertical" size={20} color="#26344F" />
                                    </Pressable>
                                    <Text style={styles.actionButtonLabel}>More</Text>
                                </View>
                            </View>
                        </View>

                        {/* Pickup row */}
                        <View style={styles.locationRow}>
                            <View style={styles.locationDotColumn}>
                                <View style={styles.pickupDot} />
                                <View style={styles.locationConnector} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.locationAddress}>
                                    {pickupAddress ?? 'Current location'}
                                </Text>
                                <Text style={styles.locationLabel}>Pickup</Text>
                            </View>
                        </View>

                        {/* Dropoff row */}
                        <View style={[styles.locationRow, { marginBottom: 16 }]}>
                            <View style={{ marginRight: 12, marginTop: 4 }}>
                                <View style={styles.dropoffDot} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.locationAddress}>{destinationAddress}</Text>
                                <Text style={styles.locationLabel}>Drop-off</Text>
                            </View>

                            {/* Fare pill */}
                            <View style={styles.farePill}>
                                <View style={styles.fareMethodRow}>
                                    <Ionicons name="cash-outline" size={14} color="#7B8387" />
                                    <Text style={styles.fareMethodText}>Cash</Text>
                                </View>
                                <Text style={styles.fareAmount}>K{fare}</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Slide to complete — always visible */}
                <View style={styles.sliderWrap}>
                    <RideActionSlider
                        label={sliderLabel}
                        onComplete={onSliderComplete}
                        isLoading={isLoadingAction}
                    />
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 20,
    },
    dragHandleWrap: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 4,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E5E7EB',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 18,
        marginTop: 4,
    },
    statLabel: {
        color: '#7B8387',
        fontSize: 12,
        marginTop: 2,
    },
    expandToggle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedContent: {
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    customerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginRight: 12,
    },
    customerName: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 16,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    ratingText: {
        color: '#7B8387',
        fontSize: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButtonWrap: {
        alignItems: 'center',
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonLabel: {
        color: '#7B8387',
        fontSize: 10,
        marginTop: 2,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    locationDotColumn: {
        alignItems: 'center',
        marginRight: 12,
        marginTop: 4,
    },
    pickupDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#00D26A',
    },
    locationConnector: {
        width: 1,
        height: 24,
        backgroundColor: '#E5E7EB',
        marginTop: 2,
    },
    dropoffDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FE5035',
    },
    locationAddress: {
        color: '#26344F',
        fontWeight: '600',
        fontSize: 14,
    },
    locationLabel: {
        color: '#7B8387',
        fontSize: 12,
        marginTop: 2,
    },
    farePill: {
        backgroundColor: '#FFF5F3',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginLeft: 8,
        alignItems: 'flex-end',
    },
    fareMethodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    fareMethodText: {
        color: '#7B8387',
        fontSize: 11,
    },
    fareAmount: {
        color: '#26344F',
        fontWeight: 'bold',
        fontSize: 15,
        marginTop: 2,
    },
    sliderWrap: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
});
