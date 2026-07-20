import type {
  CustomerAccount,
  DriverAccount,
  DriverOnboardingData,
  OnboardingStep,
  SavedAddress,
  UserProfile,
  UserRole,
} from '@/types';
import { fetchCustomerAccount, fetchDriverAccount } from '@/services/accounts';
import { create } from 'zustand';

interface UserState {
  // User data
  role: UserRole;
  profile: UserProfile;
  savedAddresses: SavedAddress[];

  // Backend accounts (one person can hold both — separate tables by design)
  customerAccount: CustomerAccount | null;
  driverAccount: DriverAccount | null;
  accountsLoading: boolean;

  // Driver onboarding
  driverOnboarding: DriverOnboardingData;

  // Actions
  setRole: (role: UserRole) => void;
  toggleRole: () => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  loadAccounts: () => Promise<void>;
  setDriverAccount: (account: DriverAccount) => void;
  applySharedProfilePhoto: (url: string, key: string | null) => void;
  addSavedAddress: (address: SavedAddress) => void;
  removeSavedAddress: (id: string) => void;

  // Driver onboarding actions
  setOnboardingStep: (step: OnboardingStep) => void;
  updatePersonalInfo: (data: DriverOnboardingData['personalInfo']) => void;
  updateVehicleInfo: (data: DriverOnboardingData['vehicleInfo']) => void;
  updateDocuments: (data: Partial<DriverOnboardingData['documents']>) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

// Mock user data for development
const mockProfile: UserProfile = {
  id: 'user_001',
  firstName: 'John',
  lastName: 'Banda',
  phone: '+260 97 123 4567',
  email: 'john.banda@example.com',
  avatar: 'https://i.pravatar.cc/150?img=68',
  rating: 4.8,
};

const mockSavedAddresses: SavedAddress[] = [
  {
    id: 'addr_001',
    label: 'Home',
    address: '123 Independence Avenue, Lusaka',
    latitude: -15.4167,
    longitude: 28.2833,
    icon: 'home',
  },
  {
    id: 'addr_002',
    label: 'Work',
    address: 'Cairo Road Business District, Lusaka',
    latitude: -15.4254,
    longitude: 28.2871,
    icon: 'work',
  },
];

const initialOnboarding: DriverOnboardingData = {
  currentStep: 'personal',
  personalInfo: null,
  vehicleInfo: null,
  documents: {
    driverLicense: null,
    vehicleRegistration: null,
    insurance: null,
    profilePhoto: null,
  },
  isComplete: false,
};

export const useUserStore = create<UserState>((set) => ({
  // Initial state
  role: 'passenger',
  profile: mockProfile,
  savedAddresses: mockSavedAddresses,
  customerAccount: null,
  driverAccount: null,
  accountsLoading: false,
  driverOnboarding: initialOnboarding,

  // Role actions
  setRole: (role) => set({ role }),

  toggleRole: () => set((state) => ({
    role: state.role === 'passenger' ? 'driver' : 'passenger',
  })),

  // Profile actions
  updateProfile: (profile) => set((state) => ({
    profile: { ...state.profile, ...profile },
  })),

  // Loads the logged-in user's customer + driver rows and syncs the visible
  // profile with the customer record (replacing the mock defaults).
  loadAccounts: async () => {
    set({ accountsLoading: true });
    const [customerAccount, driverAccount] = await Promise.all([
      fetchCustomerAccount(),
      fetchDriverAccount(),
    ]);
    set((state) => ({
      customerAccount,
      driverAccount,
      accountsLoading: false,
      // Kick the app out of driver mode when the fetched row is no longer
      // approved (e.g. admin rejected/suspended since the last switch). Only
      // when a row exists — a null result can also mean a failed fetch, and
      // that must not demote a legitimately approved driver mid-session.
      role:
        state.role === 'driver' && driverAccount && driverAccount.accountStatus !== 'approved'
          ? 'passenger'
          : state.role,
      profile: customerAccount
        ? {
            ...state.profile,
            id: customerAccount.id,
            firstName: customerAccount.firstName,
            lastName: customerAccount.lastName,
            email: customerAccount.email,
            phone: customerAccount.phoneNumber,
            avatar: customerAccount.profilePhotoUrl ?? undefined,
          }
        : state.profile,
    }));
  },

  setDriverAccount: (account) => set({ driverAccount: account }),

  // Mirrors a successful updateSharedProfilePhoto (services/profilePhoto.ts)
  // into local state: the visible profile, the customer account, and — when
  // the driver profile is linked to the shared avatar (profilePhotoKey
  // null) — the driver account too, matching what the service did in the DB.
  applySharedProfilePhoto: (url, key) => set((state) => ({
    profile: { ...state.profile, avatar: url },
    customerAccount: state.customerAccount
      ? { ...state.customerAccount, profilePhotoUrl: url, profilePhotoKey: key }
      : state.customerAccount,
    driverAccount:
      state.driverAccount && state.driverAccount.profilePhotoKey === null
        ? { ...state.driverAccount, profilePhotoUrl: url }
        : state.driverAccount,
  })),

  // Address actions
  addSavedAddress: (address) => set((state) => ({
    savedAddresses: [...state.savedAddresses, address],
  })),

  removeSavedAddress: (id) => set((state) => ({
    savedAddresses: state.savedAddresses.filter((addr) => addr.id !== id),
  })),

  // Driver onboarding actions
  setOnboardingStep: (step) => set((state) => ({
    driverOnboarding: { ...state.driverOnboarding, currentStep: step },
  })),

  updatePersonalInfo: (data) => set((state) => ({
    driverOnboarding: { ...state.driverOnboarding, personalInfo: data },
  })),

  updateVehicleInfo: (data) => set((state) => ({
    driverOnboarding: { ...state.driverOnboarding, vehicleInfo: data },
  })),

  updateDocuments: (data) => set((state) => ({
    driverOnboarding: {
      ...state.driverOnboarding,
      documents: { ...state.driverOnboarding.documents, ...data },
    },
  })),

  completeOnboarding: () => set((state) => ({
    driverOnboarding: {
      ...state.driverOnboarding,
      currentStep: 'complete',
      isComplete: true,
    },
  })),

  resetOnboarding: () => set({ driverOnboarding: initialOnboarding }),
}));

