import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SkeletonBox } from '@/components/ui';
import type { UserProfile } from '@/types';

interface ProfileCardProps {
  profile: UserProfile;
  onEditPress?: () => void;
  loading?: boolean;
}

/**
 * User profile card with avatar, name, and rating
 */
export function ProfileCard({ profile, onEditPress, loading = false }: ProfileCardProps) {
  return (
    <Card variant="elevated" padding="lg" radius="2xl" onPress={onEditPress}>
      <View className="flex-row items-center">
        {/* Avatar */}
        <View className="relative">
          {loading ? (
            <SkeletonBox width={80} height={80} borderRadius={40} />
          ) : (
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center">
              {profile.avatar ? (
                <View className="w-20 h-20 rounded-full overflow-hidden">
                  {/* Image would go here */}
                  <Ionicons name="person" size={40} color="#FFFFFF" />
                </View>
              ) : (
                <Text className="text-white text-3xl font-bold">
                  {profile.firstName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          )}

          {/* Edit button */}
          {onEditPress && (
            <Pressable
              onPress={onEditPress}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent items-center justify-center border-2 border-white"
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </Pressable>
          )}
        </View>

        {/* Info */}
        <View className="ml-4 flex-1">
          {loading ? (
            <SkeletonBox width="60%" height={20} borderRadius={4} />
          ) : (
            <Text className="text-primary font-bold text-xl">
              {profile.firstName} {profile.lastName}
            </Text>
          )}

          <Text className="text-secondary text-sm mt-1">
            {profile.phone}
          </Text>

          {profile.email && (
            <Text className="text-secondary text-sm">
              {profile.email}
            </Text>
          )}

          {/* Rating */}
          <View className="flex-row items-center mt-2">
            {loading ? (
              <SkeletonBox width={60} height={14} borderRadius={4} />
            ) : (
              <>
                <Ionicons name="star" size={16} color="#FFB800" />
                <Text className="text-primary font-semibold ml-1">
                  {profile.rating.toFixed(1)}
                </Text>
                <Text className="text-secondary text-sm ml-1">
                  rating
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

