import { fetchDriverWallet } from '@/features/driver/services/wallet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface TripReceipt {
    id: string;
    tripId: string;
    customerName: string;
    pickupAddress: string;
    destinationAddress: string;
    distance: number;
    duration: number;
    waitingDuration?: number;
    totalFare: number;
    timestamp: string; // ISO string
    breakdown: {
        baseFare: number;
        distanceFare: number;
        timeFare: number;
        waitingFare: number;
    };
}

interface WalletState {
    // Financials
    availableBalance: number;
    todayEarnings: number;
    weekEarnings: number;

    // Stats
    totalTripsToday: number;

    // History
    transactions: TripReceipt[];

    // Actions
    addTransaction: (receipt: TripReceipt) => void;
    resetDailyStats: () => void; // Call this on new day
    reset: () => void; // Clear all data
    withdraw: (amount: number) => boolean;
    // Syncs balance/earnings/transactions from the InsForge wallet ledger
    // (drivers.wallet_balance + wallet_transactions), the source of truth
    // once a trip actually completes against the backend.
    fetchWallet: () => Promise<void>;
}

export const useDriverWalletStore = create<WalletState>()(
    persist(
        (set, get) => ({
            availableBalance: 0,
            todayEarnings: 0,
            weekEarnings: 0,
            totalTripsToday: 0,
            transactions: [],

            addTransaction: (receipt) => {
                set((state) => ({
                    availableBalance: state.availableBalance + receipt.totalFare,
                    todayEarnings: state.todayEarnings + receipt.totalFare,
                    weekEarnings: state.weekEarnings + receipt.totalFare,
                    totalTripsToday: state.totalTripsToday + 1,
                    transactions: [receipt, ...state.transactions].slice(0, 50), // Keep last 50
                }));
            },

            resetDailyStats: () => {
                // Logic to verify if it's actually a new day could be added here or externally
                set({
                    todayEarnings: 0,
                    totalTripsToday: 0,
                });
            },

            reset: () => {
                set({
                    availableBalance: 0,
                    todayEarnings: 0,
                    weekEarnings: 0,
                    totalTripsToday: 0,
                    transactions: [],
                });
            },

            withdraw: (amount) => {
                const { availableBalance } = get();
                if (availableBalance >= amount) {
                    set((state) => ({
                        availableBalance: state.availableBalance - amount,
                    }));
                    return true;
                }
                return false;
            },

            fetchWallet: async () => {
                const wallet = await fetchDriverWallet();
                if (!wallet) return;

                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

                let todayEarnings = 0;
                let weekEarnings = 0;
                let totalTripsToday = 0;
                const transactions: TripReceipt[] = [];

                for (const tx of wallet.transactions) {
                    const amount = Number(tx.amount) || 0;
                    const createdAt = new Date(tx.created_at);
                    if (createdAt >= startOfToday) todayEarnings += amount;
                    if (createdAt >= startOfWeek) weekEarnings += amount;

                    if (tx.type === 'trip_earning') {
                        if (createdAt >= startOfToday) totalTripsToday += 1;
                        // wallet_transactions has no trip detail (customer, addresses,
                        // fare breakdown) -- only amount/timestamp, which is all
                        // WalletScreen's earnings calendar actually reads.
                        transactions.push({
                            id: tx.id,
                            tripId: tx.order_id ?? tx.id,
                            customerName: '',
                            pickupAddress: '',
                            destinationAddress: '',
                            distance: 0,
                            duration: 0,
                            totalFare: amount,
                            timestamp: tx.created_at,
                            breakdown: { baseFare: 0, distanceFare: 0, timeFare: 0, waitingFare: 0 },
                        });
                    }
                }

                set({
                    availableBalance: wallet.balance,
                    todayEarnings,
                    weekEarnings,
                    totalTripsToday,
                    transactions,
                });
            },
        }),
        {
            name: 'driver-wallet-storage',
            storage: createJSONStorage(() => AsyncStorage),
            version: 1,
            migrate: (persistedState: any, version: number) => {
                if (version === 0) {
                    if (persistedState.transactions && Array.isArray(persistedState.transactions)) {
                        persistedState.transactions = persistedState.transactions.map((tx: any) => {
                            if ('passengerName' in tx) {
                                const { passengerName, ...rest } = tx;
                                return { ...rest, customerName: passengerName };
                            }
                            return tx;
                        });
                    }
                }
                return persistedState as WalletState;
            },
        }
    )
);
