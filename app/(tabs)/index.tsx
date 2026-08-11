import { DriverDashboard } from '@/features/driver';
import { CustomerHome } from '@/features/customer';
import { useUserStore } from '@/state';
import React from 'react';

/**
 * Home tab - Role-aware screen
 * Displays CustomerHome or DriverDashboard based on current user role
 */
export default function HomeScreen() {
  const role = useUserStore((state) => state.role);

  if (role === 'driver') {
    return <DriverDashboard />;
  }

  return <CustomerHome />;
}
