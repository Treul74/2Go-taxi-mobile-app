/**
 * Centralized mock data for development and testing
 * Contains driver profiles, customer profiles, and other mock data
 */

import type { DriverInfo, UserProfile } from '@/types';

/**
 * Mock driver profiles with avatars
 */
export const mockDrivers: DriverInfo[] = [
  {
    id: 'driver_001',
    name: 'Peter Mwanza',
    phone: '+260 96 555 1234',
    avatar: 'https://i.pravatar.cc/150?img=12',
    rating: 4.9,
    tripsCompleted: 1250,
  },
  {
    id: 'driver_002',
    name: 'Grace Tembo',
    phone: '+260 97 555 5678',
    avatar: 'https://i.pravatar.cc/150?img=47',
    rating: 4.7,
    tripsCompleted: 890,
  },
  {
    id: 'driver_003',
    name: 'Emmanuel Phiri',
    phone: '+260 95 555 9876',
    avatar: 'https://i.pravatar.cc/150?img=33',
    rating: 4.85,
    tripsCompleted: 2340,
  },
  {
    id: 'driver_004',
    name: 'Sarah Banda',
    phone: '+260 97 555 1122',
    avatar: 'https://i.pravatar.cc/150?img=44',
    rating: 4.95,
    tripsCompleted: 1580,
  },
  {
    id: 'driver_005',
    name: 'Moses Chanda',
    phone: '+260 96 555 3344',
    avatar: 'https://i.pravatar.cc/150?img=15',
    rating: 4.8,
    tripsCompleted: 950,
  },
];

/**
 * Mock customer profiles with avatars
 */
export const mockCustomers: UserProfile[] = [
  {
    id: 'user_001',
    firstName: 'John',
    lastName: 'Zimba',
    phone: '+260 97 111 2222',
    email: 'john.zimba@example.com',
    avatar: 'https://i.pravatar.cc/150?img=68',
    rating: 4.8,
  },
  {
    id: 'user_002',
    firstName: 'Mary',
    lastName: 'Mulenga',
    phone: '+260 96 333 4444',
    email: 'mary.m@example.com',
    avatar: 'https://i.pravatar.cc/150?img=25',
    rating: 4.9,
  },
  {
    id: 'user_003',
    firstName: 'David',
    lastName: 'Siame',
    phone: '+260 95 555 6666',
    avatar: 'https://i.pravatar.cc/150?img=60',
    rating: 4.7,
  },
];

/**
 * Get a random driver from the mock data
 */
export function getRandomDriver(): DriverInfo {
  return mockDrivers[Math.floor(Math.random() * mockDrivers.length)];
}

/**
 * Get driver by ID
 */
export function getDriverById(id: string): DriverInfo | undefined {
  return mockDrivers.find((d) => d.id === id);
}

/**
 * Get customer by ID
 */
export function getCustomerById(id: string): UserProfile | undefined {
  return mockCustomers.find((p) => p.id === id);
}

/**
 * Default fallback avatar URL
 */
export const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=1';

