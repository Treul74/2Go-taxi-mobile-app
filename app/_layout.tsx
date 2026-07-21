import { insforge } from '@/lib/insforge';
import '@/lib/polyfills';
import { useAuthStore } from '@/state/authStore';
import { AccountsLoadError, useUserStore } from '@/state/userStore';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

SplashScreen.preventAutoHideAsync();

// Captured at module load (cold launch) so the minimum splash display time
// below is measured from app start, not from RootLayout's first render.
const splashStartTime = Date.now();
const MIN_SPLASH_MS = 2500;

export default function RootLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hasLoggedInBefore = useAuthStore((state) => state.hasLoggedInBefore);
  const authed = useAuthStore((state) => state.authed);
  const hydrate = useAuthStore((state) => state.hydrate);
  const setAuthed = useAuthStore((state) => state.setAuthed);

  // A restored/valid session only proves the refresh token is still good —
  // it says nothing about whether the customers row behind it still exists
  // or is still active. 'idle'/'checking' hold the app on the spinner so a
  // deleted or suspended account can never flash the protected stack before
  // being signed back out.
  const [sessionCheck, setSessionCheck] = useState<'idle' | 'checking' | 'ok'>('idle');

  useEffect(() => {
    if (Platform.OS === 'android') {
      SystemUI.setBackgroundColorAsync('#FFFFFF');
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !authed) {
      setSessionCheck('idle');
      return;
    }

    let cancelled = false;
    setSessionCheck('checking');

    (async () => {
      // Also re-fetches the drivers row and demotes role 'driver' -> 'passenger'
      // when it's no longer 'approved' (see userStore.loadAccounts).
      try {
        await useUserStore.getState().loadAccounts();
      } catch (err) {
        // A typed AccountsLoadError indicates one of the underlying fetches
        // or AsyncStorage reads failed. Transition sessionCheck out of
        // 'checking' so startup doesn't remain on the loading screen.
        if (err instanceof AccountsLoadError) {
          if (!cancelled) setSessionCheck('ok');
          return;
        }
        // Unknown errors fall through so they can be observed during
        // development — but still ensure the startup doesn't hang.
        console.error(err);
        if (!cancelled) setSessionCheck('ok');
        return;
      }

      if (cancelled) return;

      const { customerAccount } = useUserStore.getState();

      if (!customerAccount) {
        // No customers row for this auth_id — the account was deleted.
        await insforge.auth.signOut();
        insforge.setAccessToken(null);
        await setAuthed(false);
        return;
      }

      if (customerAccount.accountStatus === 'suspended' || customerAccount.accountStatus === 'deleted') {
        await insforge.auth.signOut();
        insforge.setAccessToken(null);
        await setAuthed(false);
        if (!cancelled) {
          Alert.alert('Account Suspended', 'Your account has been suspended. Contact support.');
        }
        return;
      }

      if (!cancelled) setSessionCheck('ok');
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, authed, setAuthed]);

  const appReady = hydrated && (!authed || sessionCheck === 'ok');

  // Keeps the native splash on screen for at least MIN_SPLASH_MS from cold
  // launch, once startup (session check, AsyncStorage hydration) finishes.
  // Guarded so it only ever fires once per app start.
  const splashHiddenRef = useRef(false);
  useEffect(() => {
    if (!appReady || splashHiddenRef.current) return;
    splashHiddenRef.current = true;

    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    (async () => {
      await new Promise((resolve) => setTimeout(resolve, remaining));
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Fast Refresh (or web, which has no native splash) can re-run this
        // effect after the splash for the current view controller was
        // already hidden — safe to ignore, the desired end state already holds.
      }
    })();
  }, [appReady]);

  // Every fresh launch of an already-logged-in session must land on a fixed
  // screen, not wherever navigation history last left off (e.g. the tabs'
  // Home screen) — this fires once per app start, right as the protected
  // stack becomes reachable, and never again this session. Passengers land
  // on the 'Where to?' discover screen; a restored driver session (see
  // userStore.loadAccounts) lands directly on the driver tabs instead.
  const hasLandedOnLaunch = useRef(false);
  useEffect(() => {
    if (!appReady || !authed || hasLandedOnLaunch.current) return;
    hasLandedOnLaunch.current = true;
    const role = useUserStore.getState().role;
    router.replace(role === 'driver' ? '/(tabs)' : '/discover');
  }, [appReady, authed]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {!appReady ? (
          <View className="flex-1 items-center justify-center bg-background">
            <ActivityIndicator size="large" color="#FE5035" />
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#E7F1F9' },
            }}
          >
            {/* Rule 1: no AUTH_KEY yet — always show onboarding first */}
            <Stack.Protected guard={!hasLoggedInBefore}>
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
            </Stack.Protected>

            {/* Rule 2 + normal login/signup/otp flow — reachable whenever the
                current session hasn't authenticated yet, whether that's a
                brand-new user coming from onboarding or a returning user
                (AUTH_KEY exists) landing straight here, skipping onboarding */}
            <Stack.Protected guard={!authed}>
              <Stack.Screen name="auth" options={{ headerShown: false }} />
              <Stack.Screen name="signup" options={{ headerShown: false }} />
              <Stack.Screen name="otp" options={{ headerShown: false }} />
              <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
            </Stack.Protected>

            {/* Main app — only once OTP has been verified this session.
                'discover' is declared first so it's the default landing
                screen for this group (React Navigation uses the first
                Stack.Screen as the initial route when none is specified) —
                passengers see it before the map-based (tabs) home screen. */}
            <Stack.Protected guard={authed}>
              <Stack.Screen name="discover" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(driver)" options={{ headerShown: false }} />
              <Stack.Screen name="(customer)" options={{ headerShown: false }} />
              <Stack.Screen
                name="rating/[id]"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="ride/[id]"
                options={{
                  presentation: 'card',
                  headerShown: true,
                  headerTitle: 'Ride Details',
                  headerTintColor: '#26344F',
                  headerStyle: { backgroundColor: '#E7F1F9' },
                }}
              />
              <Stack.Screen
                name="chat/[id]"
                options={{
                  presentation: 'card',
                  headerShown: true,
                  headerTitle: 'Chat',
                  headerTintColor: '#26344F',
                  headerStyle: { backgroundColor: '#E7F1F9' },
                }}
              />
              <Stack.Screen
                name="driver/onboarding"
                options={{
                  presentation: 'modal',
                  headerShown: true,
                  headerTitle: 'Become a Driver',
                  headerTintColor: '#26344F',
                  headerStyle: { backgroundColor: '#E7F1F9' },
                }}
              />
              <Stack.Screen
                name="modal"
                options={{
                  presentation: 'modal',
                }}
              />
            </Stack.Protected>
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

