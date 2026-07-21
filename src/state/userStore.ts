import { fetchCustomerAccount, fetchDriverAccount } from '@/services/accounts';
import type {
  CustomerAccount,
  DriverAccount,
  DriverOnboardingData,
  OnboardingStep,
  SavedAddress,
  UserProfile,
  UserRole,
} from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// Last role the user explicitly chose via RoleSwitcher, persisted so a
// driver's cold start can restore driver mode instead of always defaulting
// to passenger (see loadAccounts below).
const ACTIVE_ROLE_KEY = '@2go/active_role';

export class AccountsLoadError extends Error {
  public cause: unknown;
  constructor(cause: unknown) {
    super('Accounts load failed');
    this.name = 'AccountsLoadError';
    this.cause = cause;
  }
}

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
  setRole: (role) => {
    AsyncStorage.setItem(ACTIVE_ROLE_KEY, role).catch(() => {});
    set({ role });
  },

  toggleRole: () => set((state) => ({
    role: state.role === 'passenger' ? 'driver' : 'passenger',
  })),

  // Profile actions
  updateProfile: (profile) => set((state) => ({
    profile: { ...state.profile, ...profile },
  })),

  // Loads the logged-in user's customer + driver rows and syncs the visible
  // profile with the customer record (replacing the mock defaults).
  // Uses Promise.allSettled so a single failing fetch/AsyncStorage read
  // doesn't prevent applying any successful results. Any rejection is
  // propagated as `AccountsLoadError` after state updates. `accountsLoading`
  // is always reset in `finally` so the UI cannot remain stuck loading.
  loadAccounts: async () => {
    set({ accountsLoading: true });

    type Settled<T> = PromiseSettledResult<T>;

    try {
      const [custRes, driverRes, roleRes] = await Promise.allSettled([
        fetchCustomerAccount(),
        fetchDriverAccount(),
        AsyncStorage.getItem(ACTIVE_ROLE_KEY),
      ]) as [Settled<CustomerAccount | null>, Settled<DriverAccount | null>, Settled<string | null>];

      let customerAccount: CustomerAccount | null = null;
      let driverAccount: DriverAccount | null = null;
      let storedRole: string | null = null;
      let firstError: unknown = null;

      if (custRes.status === 'fulfilled') customerAccount = custRes.value;
      else firstError = firstError ?? custRes.reason;

      if (driverRes.status === 'fulfilled') driverAccount = driverRes.value;
      else firstError = firstError ?? driverRes.reason;

      if (roleRes.status === 'fulfilled') storedRole = roleRes.value;
      else firstError = firstError ?? roleRes.reason;

      // Apply any successful fetches to state so the app can use partial data.
      set((state) => ({
        customerAccount,
        driverAccount,
        // role calculation preserves the previous behaviour when rows exist
        // and falls back to passenger otherwise.
        role:
          state.role === 'driver'
            ? driverAccount && driverAccount.accountStatus !== 'approved'
              ? 'passenger'
              : 'driver'
            : storedRole === 'driver' && driverAccount?.accountStatus === 'approved'
            ? 'driver'
            : 'passenger',
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

      // If any of the underlying operations failed, surface a typed error so
      // callers can handle the condition and avoid leaving the app in a
      // perpetual 'checking' state.
      if (firstError) {
        throw new AccountsLoadError(firstError);
      }
    } finally {
      set({ accountsLoading: false });
    }
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
