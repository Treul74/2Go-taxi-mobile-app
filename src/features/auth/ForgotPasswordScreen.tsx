import { BackButton } from '@/components/ui';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top + 8, 24), paddingBottom: Math.max(insets.bottom, 32) },
      ]}
    >
      <BackButton onPress={() => router.back()} style={styles.backBtn} />
      <View style={styles.body}>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.note}>[ Placeholder — forgot password screen goes here ]</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.link}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7F1F9',
    paddingHorizontal: 24,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#26344F',
  },
  note: {
    fontSize: 14,
    color: '#7B8387',
  },
  link: {
    fontSize: 15,
    color: '#FE5035',
    fontWeight: '500',
  },
});
