import type { AuthClient, AuthSession } from './types';

export const CONTROLLED_E2E_TOKEN = 'mot21-controlled-e2e-token';

const session: AuthSession = Object.freeze({
  access_token: CONTROLLED_E2E_TOKEN,
  expires_at: 4_102_444_800,
  user: Object.freeze({ id: '00000000-0000-4000-8000-000000000021' }),
});

const sessionResponse = async () => ({ data: { session }, error: null });

export function createE2eAuthClient(): AuthClient {
  return {
    auth: {
      getSession: sessionResponse,
      refreshSession: sessionResponse,
      signInWithPassword: sessionResponse,
      signOut: async () => ({ error: null }),
      verifyOtp: sessionResponse,
      updateUser: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
}
