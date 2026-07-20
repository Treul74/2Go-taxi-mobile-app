import { refreshSessionAndSyncAccessToken } from '@/lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// Set when the user taps Skip or Get Started on onboarding.
export const ONBOARDING_KEY = '@2go_onboarding_complete';
// Set only after a successful OTP verification — never anywhere else.
export const AUTH_KEY = '@2go_auth_token';
// InsForge mobile-flow refresh token, redeemed on launch to restore the
// session. Set alongside AUTH_KEY, cleared only on explicit Sign Out.
const REFRESH_TOKEN_KEY = '@2go_refresh_token';

interface AuthState {
    hydrated: boolean;
    // Bookkeeping only — set on Skip/Get Started, not used to gate startup routing.
    onboardingComplete: boolean;
    // Snapshot of "AUTH_KEY existed at launch", taken once at hydrate. Decides
    // whether onboarding is skipped at startup (Rule 1 / Rule 2).
    hasLoggedInBefore: boolean;
    // Live, current-session login state. Restored at hydrate by redeeming the
    // stored refresh token against InsForge, so a returning user with a valid
    // session lands straight in the main app instead of Login.
    authed: boolean;
    // auth.users id of the current session, captured directly from the
    // signInWithPassword/verifyEmail/signUp/refreshSession response bodies.
    // Do NOT source this from insforge.auth.getCurrentUser() — in
    // isServerMode (mobile) the SDK never populates its internal
    // tokenManager on sign-in/refresh, so getCurrentUser() silently returns
    // a null user even for a valid session.
    authUserId: string | null;
    hydrate: () => Promise<void>;
    completeOnboarding: () => Promise<void>;
    setAuthed: (authed: boolean, refreshToken?: string, userId?: string) => Promise<void>;
    resetOnboarding: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    hydrated: false,
    onboardingComplete: false,
    hasLoggedInBefore: false,
    authed: false,
    authUserId: null,

    hydrate: async () => {
        const [onboarding, auth, storedRefreshToken] = await Promise.all([
            AsyncStorage.getItem(ONBOARDING_KEY),
            AsyncStorage.getItem(AUTH_KEY),
            AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        ]);

        let authed = false;
        let authUserId: string | null = null;
        if (storedRefreshToken) {
            const { data, error } = await refreshSessionAndSyncAccessToken(storedRefreshToken);
            if (!error && data?.user?.id) {
                authed = true;
                authUserId = data.user.id;
                // Mobile mode may rotate the refresh token — persist the latest one.
                if (data.refreshToken) {
                    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
                }
            } else {
                // Stored token is expired/revoked or did not return a usable user id —
                // clear it so we don't restore a half-authenticated session.
                await AsyncStorage.multiRemove([AUTH_KEY, REFRESH_TOKEN_KEY]);
            }
        }

        set({
            onboardingComplete: !!onboarding,
            hasLoggedInBefore: !!auth,
            authed,
            authUserId,
            hydrated: true,
        });
    },

    completeOnboarding: async () => {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
        set({ onboardingComplete: true });
    },

    setAuthed: async (authed, refreshToken, userId) => {
        if (authed) {
            const writes = [AsyncStorage.setItem(AUTH_KEY, 'true')];
            if (refreshToken) {
                writes.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken));
            }
            await Promise.all(writes);
            set({ authed: true, hasLoggedInBefore: true, authUserId: userId ?? null });
        } else {
            await AsyncStorage.multiRemove([AUTH_KEY, REFRESH_TOKEN_KEY]);
            set({ authed: false, authUserId: null });
        }
    },

    // Dev-only testing affordance — clears both flags so the first-launch
    // (onboarding) flow can be retested without reinstalling the app.
    resetOnboarding: async () => {
        await AsyncStorage.multiRemove([ONBOARDING_KEY, AUTH_KEY, REFRESH_TOKEN_KEY]);
        set({ onboardingComplete: false, hasLoggedInBefore: false, authed: false, authUserId: null });
    },
}));
