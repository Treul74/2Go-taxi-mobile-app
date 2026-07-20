import { AccountScreen } from '@/features/account';
import { router } from 'expo-router';

export default function AccountPage() {
  return <AccountScreen onBack={() => router.back()} />;
}
