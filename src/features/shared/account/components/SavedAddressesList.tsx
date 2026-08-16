import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SavedAddress } from '@/types';

interface SavedAddressesListProps {
  addresses: SavedAddress[];
  onAddAddress?: () => void;
  onEditAddress?: (id: string) => void;
  onDeleteAddress?: (id: string) => void;
}

const addressIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  work: 'briefcase',
  star: 'star',
};

/**
 * Saved addresses list component
 * Collapsible menu item matching Payment Methods / Promotions design style
 */
export function SavedAddressesList({
  addresses,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
}: SavedAddressesListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <View className="bg-white rounded-3xl overflow-hidden">
      {/* Main collapsed item - matches Payment Methods style */}
      <Pressable 
        onPress={() => setIsExpanded(!isExpanded)}
        className="flex-row items-center px-4 py-3 active:bg-gray-50"
      >
        <Ionicons name="location-outline" size={20} color="#26344F" />
        <View className="ml-3 flex-1">
          <Text className="text-primary font-medium">
            Saved Places
          </Text>
          {addresses.length > 0 && (
            <Text className="text-secondary text-xs mt-0.5">
              {addresses.length} {addresses.length === 1 ? 'place' : 'places'} saved
            </Text>
          )}
        </View>
        <Ionicons 
          name={isExpanded ? 'chevron-up' : 'chevron-forward'} 
          size={18} 
          color="#7B8387" 
        />
      </Pressable>
      
      {/* Expanded content */}
      {isExpanded && (
        <View className="border-t border-gray-100">
          {addresses.length === 0 ? (
            <View className="py-6 items-center">
              <Ionicons name="location-outline" size={32} color="#CBD5E1" />
              <Text className="text-secondary text-sm mt-2">
                No saved places yet
              </Text>
            </View>
          ) : (
            addresses.map((address) => (
              <Pressable
                key={address.id}
                onPress={() => onEditAddress?.(address.id)}
                className="flex-row items-center px-4 py-3 border-b border-gray-100 active:bg-gray-50"
              >
                <Ionicons 
                  name={addressIcons[address.icon]} 
                  size={18} 
                  color="#26344F" 
                />
                <View className="ml-3 flex-1">
                  <Text className="text-primary text-sm font-medium">
                    {address.label}
                  </Text>
                  <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
                    {address.address}
                  </Text>
                </View>
                <Ionicons name="pencil-outline" size={16} color="#7B8387" />
              </Pressable>
            ))
          )}
          
          {/* Add Address Button */}
          {onAddAddress && (
            <Pressable 
              onPress={onAddAddress}
              className="flex-row items-center px-4 py-3 active:bg-gray-50"
            >
              <Ionicons name="add-circle-outline" size={18} color="#FE5035" />
              <Text className="text-accent text-sm font-medium ml-3">
                Add New Place
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

