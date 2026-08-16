import React from 'react';
import { View, Text, ScrollView, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BackButton } from '@/components/ui';
import { ProfileCard, RoleSwitcher, SavedAddressesList, MenuList } from './components';
import { useAuthStore, useUserStore } from '@/state';
import { insforge } from '@/lib/insforge';

interface AccountScreenProps {
  /** Shows a back arrow in the header when this screen was pushed on top of
   * another one (e.g. from the Discover screen's menu). Omitted when this
   * renders as the "Account" tab, which has no "back" to go to. */
  onBack?: () => void;
}

/**
 * Account screen with profile, role switcher, and settings
 */
export function AccountScreen({ onBack }: AccountScreenProps) {
  const {
    profile,
    role,
    setRole,
    savedAddresses,
    removeSavedAddress,
    driverAccount,
    loadAccounts,
    accountsLoading,
  } = useUserStore();
  const setAuthed = useAuthStore((state) => state.setAuthed);
  const resetOnboarding = useAuthStore((state) => state.resetOnboarding);

  // Refresh customer + driver rows from the backend so the profile card and
  // the role switcher reflect reality (e.g. a driver application submitted on
  // another device, or an admin approval since last visit).
  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Driver mode is only reachable with an approved drivers row — enforced
  // here as well as in the RoleSwitcher UI so no tap path can bypass it.
  const handleRoleChange = (targetRole: typeof role) => {
    const canAccessDriverMode = targetRole === 'driver' && driverAccount?.accountStatus === 'approved';
    setRole(targetRole);
    router.replace(canAccessDriverMode ? '/(driver)/(tabs)' : '/(customer)/discover');
  };

  // Handle delete address
  const handleDeleteAddress = (id: string) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this saved place?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => removeSavedAddress(id),
        },
      ]
    );
  };
  
  // Handle start driver onboarding
  const handleStartOnboarding = () => {
    router.push('/(driver)/onboarding');
  };

  // Handle sign out — the only place the session is cleared. Revokes the
  // InsForge session first, then clears AUTH_KEY (never ONBOARDING_COMPLETE).
  const handleSignOut = async () => {
    await insforge.auth.signOut();
    insforge.setAccessToken(null);
    await setAuthed(false);
    setRole('passenger');
    router.replace('/auth');
  };

  // Dev-only: clears onboarding + auth flags so the first-launch flow can be
  // retested on-device without reinstalling the app (Expo Go persists
  // AsyncStorage across reloads).
  const handleResetOnboarding = async () => {
    await resetOnboarding();
    router.replace('/welcome');
  };
  
  // Account menu items
  const accountItems = [
    {
      id: 'payment',
      icon: 'card-outline' as const,
      label: 'Payment Methods',
      subtitle: 'Manage your payment options',
      onPress: () => Alert.alert('Coming Soon', 'Payment methods will be available soon'),
    },
    {
      id: 'promo',
      icon: 'pricetag-outline' as const,
      label: 'Promotions',
      subtitle: 'Enter a promo code',
      badge: '2',
      onPress: () => Alert.alert('Coming Soon', 'Promotions will be available soon'),
    },
    {
      id: 'rewards',
      icon: 'gift-outline' as const,
      label: '2Go Rewards',
      subtitle: 'Earn points on every ride',
      onPress: () => Alert.alert('Coming Soon', 'Rewards program will be available soon'),
    },
  ];
  
  // Help & Support items
  const helpSupportItems = [
    {
      id: 'ride-issues',
      icon: 'car-outline' as const,
      label: 'Ride Issues',
      subtitle: 'Report problems with your ride',
      onPress: () => Alert.alert('Ride Issues', 'How can we help with your ride?'),
    },
    {
      id: 'payment-issues',
      icon: 'card-outline' as const,
      label: 'Payment Issues',
      subtitle: 'Questions about charges or refunds',
      onPress: () => Alert.alert('Payment Help', 'We\'re here to help with payments'),
    },
    {
      id: 'account-support',
      icon: 'person-outline' as const,
      label: 'Account Support',
      subtitle: 'Profile and account settings help',
      onPress: () => Alert.alert('Account Support', 'Need help with your account?'),
    },
    {
      id: 'contact-support',
      icon: 'chatbubble-outline' as const,
      label: 'Contact Support',
      subtitle: 'Chat with our support team',
      onPress: () => Alert.alert('Contact Support', 'Support: +260 XXX XXX XXX\nEmail: support@2go.zm'),
    },
    {
      id: 'safety',
      icon: 'shield-checkmark-outline' as const,
      label: 'Safety Center',
      subtitle: 'Emergency contacts and safety tips',
      onPress: () => Alert.alert('Safety', 'Your safety is our priority'),
    },
    {
      id: 'about',
      icon: 'information-circle-outline' as const,
      label: 'About 2Go',
      subtitle: 'Version 1.0.0',
      onPress: () => Alert.alert('About', '2Go - Premium ride-hailing for Lusaka\n\nVersion 1.0.0'),
    },
  ];
  
  // Notifications & Privacy items
  const notificationsPrivacyItems = [
    {
      id: 'ride-notifications',
      icon: 'car-outline' as const,
      label: 'Ride Notifications',
      subtitle: 'Get updates on your ride status',
      onPress: () => Alert.alert('Ride Notifications', 'Toggle ride status notifications'),
    },
    {
      id: 'driver-updates',
      icon: 'person-outline' as const,
      label: 'Driver Updates',
      subtitle: 'Driver arrival and location updates',
      onPress: () => Alert.alert('Driver Updates', 'Toggle driver notifications'),
    },
    {
      id: 'payment-notifications',
      icon: 'card-outline' as const,
      label: 'Payment Notifications',
      subtitle: 'Receipts and payment confirmations',
      onPress: () => Alert.alert('Payment Notifications', 'Toggle payment notifications'),
    },
    {
      id: 'privacy',
      icon: 'lock-closed-outline' as const,
      label: 'Privacy & Data',
      subtitle: 'Control your personal information',
      onPress: () => Alert.alert('Privacy', 'Your data is safe with us'),
    },
  ];
  
  // Settings menu items
  const settingsItems = [
    {
      id: 'signout',
      icon: 'log-out-outline' as const,
      label: 'Sign Out',
      onPress: () => Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
        ]
      ),
    },
    // Dev-only shortcut — never shown in production builds. Mirrors the
    // RoleSwitcher dev-testing pattern already used on this screen.
    ...(__DEV__
      ? [
          {
            id: 'reset-onboarding',
            icon: 'refresh-outline' as const,
            label: 'Reset Onboarding (Dev)',
            subtitle: 'Clears onboarding + login for testing',
            onPress: () => Alert.alert(
              'Reset Onboarding',
              'This signs you out and shows the onboarding slides again. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: handleResetOnboarding },
              ]
            ),
          },
        ]
      : []),
  ];
  
  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center px-5 pt-4 pb-2">
          {onBack && <BackButton onPress={onBack} style={{ marginRight: 12 }} />}
          <Text className="text-primary font-bold text-2xl">
            Account
          </Text>
        </View>
        
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Profile card */}
          <ProfileCard
            profile={profile}
            onEditPress={() => router.push(role === 'driver' ? '/(driver)/profile' : '/(customer)/profile')}
            loading={accountsLoading}
          />
          
          {/* Role switcher */}
          <View className="mt-4">
            <RoleSwitcher
              currentRole={role}
              onRoleChange={handleRoleChange}
              driverAccountStatus={driverAccount?.accountStatus ?? null}
              onStartOnboarding={handleStartOnboarding}
            />
          </View>
          
          {/* Saved addresses */}
          <View className="mt-4">
            <SavedAddressesList
              addresses={savedAddresses}
              onAddAddress={() => Alert.alert('Add Place', 'Adding places coming soon')}
              onDeleteAddress={handleDeleteAddress}
            />
          </View>
          
          {/* Account menu */}
          <View className="mt-4">
            <MenuList title="Account" items={accountItems} />
          </View>
          
          {/* Notifications & Privacy */}
          <View className="mt-4">
            <MenuList title="Notifications & Privacy" items={notificationsPrivacyItems} />
          </View>
          
          {/* Help & Support menu */}
          <View className="mt-4">
            <MenuList title="Help & Support" items={helpSupportItems} />
          </View>
          
          {/* Settings menu */}
          <View className="mt-4">
            <MenuList title="Settings" items={settingsItems} />
          </View>
          
          {/* Version */}
          <Text className="text-secondary text-xs text-center mt-6">
            2Go Lusaka • v1.0.0
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

