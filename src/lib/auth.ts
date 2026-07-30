import { insforge } from '@/lib/insforge';

export function syncAuthAccessToken(accessToken: string | null): void {
  insforge.setAccessToken(accessToken ?? null);
}

export async function signInWithPasswordAndSyncAccessToken(input: {
  email: string;
  password: string;
}) {
  const response = await insforge.auth.signInWithPassword(input);
  if (!response.error) {
    syncAuthAccessToken(response.data?.accessToken ?? null);
  }
  return response;
}

export async function refreshSessionAndSyncAccessToken(refreshToken: string) {
  const response = await insforge.auth.refreshSession({ refreshToken });
  if (!response.error) {
    syncAuthAccessToken(response.data?.accessToken ?? null);
  }
  return response;
}

// The access token minted at login/hydrate is short-lived; a long trip can
// outlast it, so any InsForge call made near the end of a trip (submitting a
// rating, completing a trip) can come back with this error even though the
// session itself is still valid — callers should refresh and retry once
// rather than treating it as "not signed in".
export function isInvalidTokenError(error: { message?: string } | null | undefined): boolean {
  return !!error?.message && /token/i.test(error.message);
}
