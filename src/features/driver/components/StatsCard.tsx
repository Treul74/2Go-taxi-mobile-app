import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

/**
 * Stats card for driver dashboard
 * Shows earnings, rating, trips etc.
 */
export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = '#FE5035',
  trend,
  trendValue,
}: StatsCardProps) {
  const trendColors = {
    up: '#00D26A',
    down: '#EF4444',
    neutral: '#7B8387',
  };
  
  const trendIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
    up: 'trending-up',
    down: 'trending-down',
    neutral: 'remove',
  };
  
  return (
    <Card variant="default" padding="md" radius="xl" className="flex-1">
      <View className="flex-row items-start justify-between mb-2">
        <View 
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: `${iconColor}15` }}
        >
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        
        {trend && trendValue && (
          <View className="flex-row items-center">
            <Ionicons 
              name={trendIcons[trend]} 
              size={14} 
              color={trendColors[trend]} 
            />
            <Text 
              className="text-xs font-medium ml-1"
              style={{ color: trendColors[trend] }}
            >
              {trendValue}
            </Text>
          </View>
        )}
      </View>
      
      <Text className="text-secondary text-xs uppercase tracking-wide">
        {title}
      </Text>
      
      <Text className="text-primary font-bold text-2xl mt-1">
        {value}
      </Text>
      
      {subtitle && (
        <Text className="text-secondary text-xs mt-0.5">
          {subtitle}
        </Text>
      )}
    </Card>
  );
}

