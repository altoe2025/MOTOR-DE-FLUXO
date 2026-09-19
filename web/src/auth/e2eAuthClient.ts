import type { AuthClient, AuthSession } from './types';

export const CONTROLLED_E2E_TOKEN = 'mot21-controlled-e2e-token';
export const CONTROLLED_E2E_TOKEN_B = 'mot61-controlled-e2e-token-b';

const session: AuthSession = Object.freeze({
  access_token: CONTROLLED_E2E_TOKEN,
  expires_at: 4_102_444_800,
  user: Object.freeze({ id: '00000000-0000-4000-8000-000000000021' }),
});

const expiredSession: AuthSession = Object.freeze({ ...session, expires_at: 1 });
type StateReader = Pick<Storage, 'getItem'>;

export function createE2eAuthClient(state?: StateReader): AuthClient {
  const reader = state ?? (typeof window === 'undefined'
    ? { getItem: () => null }
    : window.localStorage);
  const isExpired = () => reader.getItem('motor-fluxo:e2e-session') === 'expired';
  const selectedSession = (): AuthSession => reader.getItem('motor-fluxo:e2e-user') === 'B'
    ? { ...session, access_token: CONTROLLED_E2E_TOKEN_B, user: { id: '00000000-0000-4000-8000-000000000061' } }
    : session;
  const sessionResponse = async () => ({
    data: { session: isExpired() ? expiredSession : selectedSession() },
    error: null,
  });
  const refreshResponse = async () => isExpired()
    ? { data: { session: null }, error: { message: 'controlled session expired' } }
    : sessionResponse();
  return {
    auth: {
      getSession: sessionResponse,
      refreshSession: refreshResponse,
      signInWithPassword: sessionResponse,
      signOut: async () => ({ error: null }),
      verifyOtp: sessionResponse,
      updateUser: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
}
