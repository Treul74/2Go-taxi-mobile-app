import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';

interface MenuItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
}

interface MenuListProps {
  title?: string;
  items: MenuItem[];
}

/**
 * Menu list component for account settings
 */
export function MenuList({ title, items }: MenuListProps) {
  return (
    <Card variant="default" padding="none" radius="xl">
      {title && (
        <Text className="text-secondary text-xs uppercase tracking-wide px-4 pt-4 pb-2">
          {title}
        </Text>
      )}
      
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          onPress={item.onPress}
          className="flex-row items-center px-4 py-4 active:bg-gray-50"
        >
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <Ionicons name={item.icon} size={20} color="#26344F" />
          </View>
          
          <View className="ml-3 flex-1">
            <Text className="text-primary font-medium">
              {item.label}
            </Text>
            {item.subtitle && (
              <Text className="text-secondary text-sm">
                {item.subtitle}
              </Text>
            )}
          </View>
          
          {item.badge && (
            <View className="bg-accent px-2 py-0.5 rounded-full mr-2">
              <Text className="text-white text-xs font-bold">
                {item.badge}
              </Text>
            </View>
          )}
          
          <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
        </Pressable>
      ))}
    </Card>
  );
}

