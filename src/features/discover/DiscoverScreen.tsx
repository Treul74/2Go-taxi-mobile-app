import { SkeletonBox } from '@/components/ui';
import { LocationSearchModal, MapPickerModal } from '@/features/customer/components';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDisplayAddress, formatShortAddress } from '@/lib';
import { useRideStore } from '@/state';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const deliveryImage = require('@/assets/images/asset 2go delivery.png');
const foodImage = require('@/assets/images/asset 2go food service.png');
const promoImage = require('@/assets/images/food/asset 50% off.png');

const RESTAURANTS = [
  { id: 'r1', name: 'Urban Greens', tags: 'Salads • Healthy • $$', rating: 4.8, eta: '15-20 min', icon: 'nutrition' as const, bg: '#DCFCE7', iconColor: '#16A34A' },
  { id: 'r2', name: 'Pizza Artigiano', tags: 'Italian • Pizza', rating: 4.6, eta: '25-35 min', icon: 'pizza' as const, bg: '#FFE4E0', iconColor: '#FE5035' },
  { id: 'r3', name: 'Nyama Grill House', tags: 'Grill • Local', rating: 4.7, eta: '20-30 min', icon: 'flame' as const, bg: '#FEF3C7', iconColor: '#D97706' },
];

/**
 * Discover / landing screen shown right after login, before the map-based
 * home screen. Picking a destination in "Where to?" is what carries the
 * customer into (tabs) — everything else here is browse-only.
 */
export function DiscoverScreen() {
  const { location: currentLocation, loading: locationLoading } = useCurrentLocation();
  const [showSearch, setShowSearch] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const rideHistory = useRideStore((state) => state.rideHistory);
  const fetchRideHistory = useRideStore((state) => state.fetchRideHistory);
  const isLoadingHistory = useRideStore((state) => state.isLoadingHistory);
  const setDestination = useRideStore((state) => state.setDestination);
  const setMode = useRideStore((state) => state.setMode);

  useEffect(() => {
    fetchRideHistory();
  }, []);

  // Top 3 dropoff addresses by visit count, most-visited first.
  const topDestinations = useMemo(() => {
    const counts = new Map<string, { count: number; location: Location; id: string }>();

    for (const ride of rideHistory) {
      if (ride.status !== 'completed') continue;

      const addr = ride.destination.address;
      if (!addr) continue;
      const existing = counts.get(addr);
      if (existing) {
        existing.count++;
      } else {
        counts.set(addr, { count: 1, location: ride.destination, id: ride.id });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [rideHistory]);

  const locationLabel = currentLocation
    ? formatShortAddress(currentLocation.address) || 'Current Location'
    : locationLoading
      ? 'Locating…'
      : 'Set your location';

  const goToHomeWithDestination = (destination: Location) => {
    setDestination(destination);
    router.push('/(tabs)');
  };

  const handleDelivery = () => {
    setMode('delivery');
    router.push('/(tabs)');
  };

  const handleComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} isn't available yet — check back soon.`);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-2">
          <View className="flex-row items-center flex-shrink" pointerEvents="none">
            <Text className="text-primary text-lg font-bold" numberOfLines={1}>
              {locationLabel}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#26344F" style={{ marginLeft: 4 }} />
          </View>
          <Pressable onPress={() => router.push('/account')} hitSlop={8}>
            <Ionicons name="menu" size={26} color="#26344F" />
          </Pressable>
        </View>

        {/* Delivery / Food */}
        <View className="flex-row gap-3 mx-5 mt-4" style={{ height: 260 }}>
          <Pressable onPress={handleDelivery} className="flex-1 rounded-4xl overflow-hidden">
            <ImageBackground source={deliveryImage} style={{ flex: 1 }} imageStyle={{ borderRadius: 32 }}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={{ flex: 1, justifyContent: 'flex-end', padding: 18 }}
              >
                <Ionicons name="cube" size={26} color="#FFFFFF" />
                <Text className="text-white font-bold text-lg mt-1.5">Delivery</Text>
              </LinearGradient>
            </ImageBackground>
          </Pressable>

          <Pressable onPress={() => handleComingSoon('Food ordering')} className="flex-1 rounded-4xl overflow-hidden">
            <ImageBackground source={foodImage} style={{ flex: 1 }} imageStyle={{ borderRadius: 32 }}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={{ flex: 1, justifyContent: 'flex-end', padding: 18 }}
              >
                <Ionicons name="restaurant" size={26} color="#FFFFFF" />
                <Text className="text-white font-bold text-lg mt-1.5">Food</Text>
              </LinearGradient>
            </ImageBackground>
          </Pressable>
        </View>

        {/* Where to search bar */}
        <Pressable
          onPress={() => setShowSearch(true)}
          className="mx-5 mt-4 flex-row items-center bg-white rounded-4xl px-4 py-4 shadow-card"
        >
          <Ionicons name="search" size={20} color="#FE5035" />
          <Text className="flex-1 ml-3 text-secondary text-base">Where to?</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>

        {/* Recent places */}
        <View className="flex-row items-center justify-between mx-5 mt-6">
          <Text className="text-primary font-bold text-lg">Recent places</Text>
          <Pressable onPress={() => router.push('/(tabs)/activity')} hitSlop={8}>
            <Text className="text-accent font-semibold text-sm">See all</Text>
          </Pressable>
        </View>

        {isLoadingHistory && topDestinations.length === 0 ? (
          <View className="mx-5 mt-3 bg-white rounded-4xl shadow-card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className={`flex-row items-center px-4 py-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <SkeletonBox width={40} height={40} borderRadius={20} />
                <View className="flex-1 ml-3">
                  <SkeletonBox width="70%" height={14} />
                  <SkeletonBox width="90%" height={11} style={{ marginTop: 6 }} />
                </View>
              </View>
            ))}
          </View>
        ) : topDestinations.length > 0 ? (
          <View className="mx-5 mt-3 bg-white rounded-4xl shadow-card overflow-hidden">
            {topDestinations.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => goToHomeWithDestination(item.location)}
                className={`flex-row items-center px-4 py-4 ${index > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <Ionicons name="location-outline" size={18} color="#7B8387" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-primary font-semibold text-base" numberOfLines={1}>
                    {formatShortAddress(item.location.address)}
                  </Text>
                  <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
                    {formatDisplayAddress(item.location.address)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </Pressable>
            ))}
          </View>
        ) : (
          <View className="mx-5 mt-3 bg-white rounded-4xl shadow-card p-6 items-center">
            <Text className="text-secondary text-sm">No recent trips yet</Text>
          </View>
        )}

        {/* Promo banner */}
        <Pressable onPress={() => handleComingSoon('Promotions')} className="mx-5 mt-4 rounded-4xl overflow-hidden">
          <ImageBackground source={promoImage} style={{ width: '100%' }} imageStyle={{ borderRadius: 32 }}>
            <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.8)']} style={{ padding: 20 }}>
              <Text className="text-white font-bold text-xl">50% Off First Meal</Text>
              <Text className="text-white/80 text-xs font-semibold mt-1" style={{ letterSpacing: 0.5 }}>
                ORDER FROM TOP RESTAURANTS NOW
              </Text>
              <View className="self-start bg-white rounded-full px-4 py-2 mt-3">
                <Text className="text-accent font-bold text-sm">Claim Offer</Text>
              </View>
            </LinearGradient>
          </ImageBackground>
        </Pressable>

        {/* Restaurants near you */}
        <View className="flex-row items-center justify-between mx-5 mt-6">
          <Text className="text-primary font-bold text-lg">Restaurants near you</Text>
          <Ionicons name="arrow-forward" size={18} color="#26344F" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 12 }}
        >
          {RESTAURANTS.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              onPress={() => handleComingSoon('Restaurant ordering')}
              className="bg-white rounded-3xl shadow-card overflow-hidden"
              style={{ width: 160 }}
            >
              <View style={{ height: 100, backgroundColor: restaurant.bg }} className="items-center justify-center">
                <Ionicons name={restaurant.icon} size={36} color={restaurant.iconColor} />
                <View className="absolute top-2 right-2 bg-white/90 rounded-full px-2 py-0.5 flex-row items-center">
                  <Ionicons name="star" size={11} color="#FFB800" />
                  <Text className="text-primary text-xs font-bold ml-0.5">{restaurant.rating}</Text>
                </View>
              </View>
              <View className="p-3">
                <Text className="text-primary font-semibold text-sm" numberOfLines={1}>
                  {restaurant.name}
                </Text>
                <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
                  {restaurant.tags}
                </Text>
                <View className="flex-row items-center mt-1.5">
                  <Ionicons name="time-outline" size={12} color="#7B8387" />
                  <Text className="text-secondary text-xs ml-1">{restaurant.eta}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>

      <LocationSearchModal
        visible={showSearch}
        title="Where to?"
        userLocation={currentLocation || undefined}
        onSelectLocation={goToHomeWithDestination}
        onOpenMapPicker={() => {
          setShowSearch(false);
          setShowMapPicker(true);
        }}
        onClose={() => setShowSearch(false)}
      />

      <MapPickerModal
        visible={showMapPicker}
        initialLocation={currentLocation || undefined}
        title="Select Destination"
        onConfirm={(destination) => {
          setShowMapPicker(false);
          goToHomeWithDestination(destination);
        }}
        onClose={() => {
          setShowMapPicker(false);
          setShowSearch(true);
        }}
      />
    </SafeAreaView>
  );
}
