import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import type { DriverAccountStatus, UserRole } from '@/types';

interface RoleSwitcherProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  /** Real drivers.account_status from InsForge; null = no drivers row. */
  driverAccountStatus: DriverAccountStatus | null;
  onStartOnboarding?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Role switcher component for switching between Customer and Driver modes.
 *
 * Driver mode is gated on the real drivers.account_status:
 * - null (no drivers row): no Driver tile — only the "Become a Driver" entry
 * - 'pending':   tile disabled, "Under Review"
 * - 'rejected':  tile disabled, "Application Rejected" in error colour
 * - 'suspended': tile disabled, "Account Suspended" in error colour
 * - 'approved':  tile active, tap switches to driver mode
 */
export function RoleSwitcher({
  currentRole,
  onRoleChange,
  driverAccountStatus,
  onStartOnboarding,
}: RoleSwitcherProps) {
  const customerScale = useSharedValue(currentRole === 'passenger' ? 1 : 0.95);
  const driverScale = useSharedValue(currentRole === 'driver' ? 1 : 0.95);
  
  React.useEffect(() => {
    customerScale.value = withSpring(currentRole === 'passenger' ? 1 : 0.95);
    driverScale.value = withSpring(currentRole === 'driver' ? 1 : 0.95);
  }, [currentRole]);
  
  const customerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: customerScale.value }],
  }));
  
  const driverStyle = useAnimatedStyle(() => ({
    transform: [{ scale: driverScale.value }],
  }));
  
  const driverEnabled = driverAccountStatus === 'approved';
  const driverStatusIsError =
    driverAccountStatus === 'rejected' || driverAccountStatus === 'suspended';
  const driverSubtitle =
    driverAccountStatus === 'pending'
      ? 'Under Review'
      : driverAccountStatus === 'rejected'
      ? 'Application Rejected'
      : driverAccountStatus === 'suspended'
      ? 'Account Suspended'
      : 'Earn money';

  const handleDriverPress = () => {
    // Only an approved driver can switch — tapping a pending/rejected/
    // suspended tile does nothing.
    if (driverEnabled) {
      onRoleChange('driver');
    }
  };

  // No drivers row in the database: never show a Driver tile at all —
  // only the entry point into the application flow.
  if (!driverAccountStatus) {
    return (
      <Pressable 
        onPress={onStartOnboarding}
        className="flex-row items-center bg-white px-4 py-3 rounded-3xl active:bg-gray-50"
      >
        <Ionicons name="car-outline" size={20} color="#26344F" />
        <View className="ml-3 flex-1">
          <Text className="text-primary font-medium">
            Become a Driver
          </Text>
          <Text className="text-secondary text-xs mt-0.5">
            Start earning as a driver
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#7B8387" />
      </Pressable>
    );
  }
  
  // Show toggle if user has both accounts
  return (
    <Card variant="default" padding="md" radius="xl">
      <Text className="text-secondary text-xs uppercase tracking-wide mb-3">
        Switch Mode
      </Text>
      
      <View className="flex-row gap-3">
        {/* Customer option */}
        <AnimatedPressable
          onPress={() => onRoleChange('passenger')}
          style={customerStyle}
          className={`flex-1 p-4 rounded-3xl items-center ${
            currentRole === 'passenger' 
              ? 'bg-primary' 
              : 'bg-gray-100'
          }`}
        >
          <View 
            className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${
              currentRole === 'passenger' ? 'bg-white/20' : 'bg-white'
            }`}
          >
            <Ionicons 
              name="person" 
              size={24} 
              color={currentRole === 'passenger' ? '#FFFFFF' : '#26344F'} 
            />
          </View>
          <Text 
            className={`font-semibold ${
              currentRole === 'passenger' ? 'text-white' : 'text-primary'
            }`}
          >
            Customer
          </Text>
          <Text 
            className={`text-xs mt-0.5 ${
              currentRole === 'passenger' ? 'text-white/70' : 'text-secondary'
            }`}
          >
            Book rides
          </Text>
        </AnimatedPressable>
        
        {/* Driver option */}
        <AnimatedPressable
          onPress={handleDriverPress}
          disabled={!driverEnabled}
          style={driverStyle}
          className={`flex-1 p-4 rounded-3xl items-center ${
            currentRole === 'driver'
              ? 'bg-success'
              : driverEnabled
              ? 'bg-gray-100'
              : 'bg-gray-100 opacity-60'
          }`}
        >
          <View
            className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${
              currentRole === 'driver' ? 'bg-white/20' : 'bg-white'
            }`}
          >
            <Ionicons
              name="car"
              size={24}
              color={currentRole === 'driver' ? '#FFFFFF' : '#26344F'}
            />
          </View>
          <Text
            className={`font-semibold ${
              currentRole === 'driver' ? 'text-white' : 'text-primary'
            }`}
          >
            Driver
          </Text>
          <Text
            className={`text-xs mt-0.5 ${
              currentRole === 'driver'
                ? 'text-white/70'
                : driverStatusIsError
                ? 'text-error font-medium'
                : 'text-secondary'
            }`}
          >
            {driverSubtitle}
          </Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
}

