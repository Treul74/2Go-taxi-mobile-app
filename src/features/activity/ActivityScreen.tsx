import { Chip, SegmentedControl, SkeletonBox } from '@/components/ui';
import { useRideStore } from '@/state';
import type { RideHistoryStatus } from '@/types';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideListItem } from './components';

type TabKey = 'upcoming' | 'past';

/**
 * Activity screen showing ride history
 * Tabs: Upcoming / Past with status filters
 */
export function ActivityScreen() {
  const rideHistory = useRideStore((state) => state.rideHistory);
  const isLoadingHistory = useRideStore((state) => state.isLoadingHistory);
  const fetchRideHistory = useRideStore((state) => state.fetchRideHistory);

  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [selectedFilter, setSelectedFilter] = useState<RideHistoryStatus | 'all'>('all');

  // Fetch the customer's real ride history from InsForge on mount and every
  // time this tab regains focus, so it never shows stale/mock data.
  useFocusEffect(
    useCallback(() => {
      fetchRideHistory();
    }, [fetchRideHistory])
  );

  // Tab segments
  const tabs = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ];
  
  // Filter options  
  const filters: { key: RideHistoryStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Done' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'scheduled', label: 'Scheduled' },
  ];
  
  // Filter rides based on tab and filter
  const filteredRides = useMemo(() => {
    let rides = rideHistory;
    
    // Filter by tab
    if (activeTab === 'upcoming') {
      rides = rides.filter((r) => r.status === 'scheduled');
    } else {
      rides = rides.filter((r) => r.status !== 'scheduled');
    }
    
    // Filter by status (only for past tab)
    if (activeTab === 'past' && selectedFilter !== 'all') {
      rides = rides.filter((r) => r.status === selectedFilter);
    }
    
    return rides;
  }, [rideHistory, activeTab, selectedFilter]);
  
  // Handle ride press
  const handleRidePress = (id: string) => {
    router.push(`/ride/${id}`);
  };
  
  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-primary font-bold text-2xl">
            Activity
          </Text>
          <Text className="text-secondary text-sm mt-1">
            Your ride history and upcoming trips
          </Text>
        </View>
        
        {/* Tabs */}
        <View className="px-5 py-4">
          <SegmentedControl
            segments={tabs}
            selectedKey={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
          />
        </View>
        
        {/* Filters (only for past tab) */}
        {activeTab === 'past' && (
          <View className="px-5 mb-3">
            <View className="flex-row justify-between gap-2">
              {filters.map((filter) => (
                <View key={filter.key} className="flex-1">
                  <Chip
                    label={filter.label}
                    selected={selectedFilter === filter.key}
                    onPress={() => setSelectedFilter(filter.key)}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Ride list */}
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {isLoadingHistory ? (
            <>
              {[0, 1, 2].map((i) => (
                <View key={i} className="mb-3">
                  <SkeletonBox height={104} borderRadius={20} />
                </View>
              ))}
            </>
          ) : filteredRides.length === 0 ? (
            <View className="items-center py-16">
              <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                <Text className="text-4xl">
                  {rideHistory.length === 0 ? '🚗' : activeTab === 'upcoming' ? '📅' : '🚗'}
                </Text>
              </View>
              <Text className="text-primary font-semibold text-lg">
                {rideHistory.length === 0
                  ? 'No rides yet'
                  : activeTab === 'upcoming'
                    ? 'No scheduled rides'
                    : 'No ride history'
                }
              </Text>
              <Text className="text-secondary text-sm text-center mt-2 px-8">
                {rideHistory.length === 0
                  ? 'Your ride history will appear here once you take your first trip'
                  : activeTab === 'upcoming'
                    ? 'Schedule a ride for later and it will appear here'
                    : 'Your completed and cancelled rides will appear here'
                }
              </Text>
            </View>
          ) : (
            filteredRides.map((ride) => (
              <RideListItem
                key={ride.id}
                ride={ride}
                onPress={handleRidePress}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

