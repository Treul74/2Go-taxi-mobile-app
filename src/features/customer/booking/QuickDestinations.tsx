import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SavedAddress } from '@/types';

interface QuickDestinationsProps {
  savedAddresses: SavedAddress[];
  onSelectAddress: (address: SavedAddress) => void;
}

const addressIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  work: 'briefcase',
  star: 'star',
};

/**
 * Quick access buttons for saved home/work addresses
 */
export function QuickDestinations({
  savedAddresses,
  onSelectAddress,
}: QuickDestinationsProps) {
  const homeAddress = savedAddresses.find((a) => a.icon === 'home');
  const workAddress = savedAddresses.find((a) => a.icon === 'work');
  
  return (
    <View className="flex-row gap-3 mt-4">
      {/* Home Button */}
      <Pressable
        onPress={() => homeAddress && onSelectAddress(homeAddress)}
        className="flex-1 flex-row items-center bg-white p-4 rounded-4xl shadow-card"
        disabled={!homeAddress}
        style={{ opacity: homeAddress ? 1 : 0.5 }}
      >
        <View className="w-10 h-10 rounded-full bg-success/10 items-center justify-center">
          <Ionicons name="home" size={20} color="#00D26A" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-primary font-semibold text-sm">Home</Text>
          <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
            {homeAddress?.address || 'Not set'}
          </Text>
        </View>
      </Pressable>
      
      {/* Work Button */}
      <Pressable
        onPress={() => workAddress && onSelectAddress(workAddress)}
        className="flex-1 flex-row items-center bg-white p-4 rounded-4xl shadow-card"
        disabled={!workAddress}
        style={{ opacity: workAddress ? 1 : 0.5 }}
      >
        <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center">
          <Ionicons name="briefcase" size={20} color="#FE5035" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-primary font-semibold text-sm">Work</Text>
          <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
            {workAddress?.address || 'Not set'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

