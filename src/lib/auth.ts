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
