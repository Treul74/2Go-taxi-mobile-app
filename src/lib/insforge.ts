import { createClient } from '@insforge/sdk';

const INSFORGE_URL = process.env.EXPO_PUBLIC_INSFORGE_URL!;
const INSFORGE_ANON_KEY = process.env.EXPO_PUBLIC_INSFORGE_ANON_KEY!;

if (!INSFORGE_URL || !INSFORGE_ANON_KEY) {
  throw new Error(
    'Missing InsForge credentials. Check .env has ' +
      'EXPO_PUBLIC_INSFORGE_URL and EXPO_PUBLIC_INSFORGE_ANON_KEY set.'
  );
}

export const insforge = createClient({
  baseUrl: INSFORGE_URL.replace(/\/+$/, ''),
  anonKey: INSFORGE_ANON_KEY,
  // React Native has no httpOnly cookie jar, so the browser session flow
  // can't work here. Mobile mode makes auth endpoints return `refreshToken`
  // in the response body instead, which authStore persists to AsyncStorage
  // and redeems via `auth.refreshSession()` on launch.
  isServerMode: true,
});
