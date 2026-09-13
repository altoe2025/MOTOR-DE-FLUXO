import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import type { AuthClient, AuthResponse, AuthSession } from './types';

function toSession(session: Session | null): AuthSession | null {
  if (session === null) return null;
  return {
    access_token: session.access_token,
    ...(session.expires_at === undefined ? {} : { expires_at: session.expires_at }),
    user: { id: session.user.id },
  };
}

function response(result: { data: { session: Session | null }; error: { message: string } | null }): Awaited<AuthResponse> {
  return { data: { session: toSession(result.data.session) }, error: result.error };
}

function adapt(client: SupabaseClient): AuthClient {
  return {
    auth: {
      getSession: async () => response(await client.auth.getSession()),
      refreshSession: async () => response(await client.auth.refreshSession()),
      signInWithPassword: async (credentials) => response(await client.auth.signInWithPassword(credentials)),
      signOut: async (options) => {
        const { error } = await client.auth.signOut(options);
        return { error };
      },
      verifyOtp: async (input) => response(await client.auth.verifyOtp(input)),
      updateUser: async (input) => {
        const { error } = await client.auth.updateUser(input);
        return { error };
      },
      onAuthStateChange: (callback) => {
        const { data } = client.auth.onAuthStateChange((event, session) => callback(event, toSession(session)));
        return { data };
      },
    },
  };
}

let singleton: AuthClient | null = null;

export function getSupabaseAuthClient(): AuthClient {
  if (singleton !== null) return singleton;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) {
    throw new Error('Configuração pública do Supabase ausente ou inválida.');
  }
  singleton = adapt(createClient(url, publishableKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  }));
  return singleton;
}
