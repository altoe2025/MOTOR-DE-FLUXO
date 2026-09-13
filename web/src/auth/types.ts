export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'expired' | 'unavailable';

export type AuthUser = { id: string };

export type AuthSession = {
  access_token: string;
  expires_at?: number;
  user: AuthUser;
};

export type AuthFailure = { message: string };

export type AuthResponse = Promise<{
  data: { session: AuthSession | null };
  error: AuthFailure | null;
}>;

export type AuthSubscription = { unsubscribe(): void };

export type AuthClient = {
  auth: {
    getSession(): AuthResponse;
    refreshSession(): AuthResponse;
    signInWithPassword(credentials: { email: string; password: string }): AuthResponse;
    signOut(options: { scope: 'local' }): Promise<{ error: AuthFailure | null }>;
    verifyOtp(input: { token_hash: string; type: 'invite' | 'recovery' }): AuthResponse;
    updateUser(input: { password: string }): Promise<{ error: AuthFailure | null }>;
    onAuthStateChange(callback: (event: string, session: AuthSession | null) => void): {
      data: { subscription: AuthSubscription };
    };
  };
};
