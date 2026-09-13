import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AuthClient, AuthSession, AuthStatus } from './types';

export class AuthOperationError extends Error {}

type PublicAuth = {
  status: AuthStatus;
  userId: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
};

type AuthFlow = {
  verifyOtp(tokenHash: string, type: 'invite' | 'recovery'): Promise<void>;
  updatePassword(password: string): Promise<void>;
};

type AuthControl = { expireSession(): Promise<void> };

type ContextValue = PublicAuth & AuthFlow & AuthControl;

const AuthContext = createContext<ContextValue | null>(null);

function messageFor(error: { message: string }): string {
  if (/invalid login credentials/i.test(error.message)) return 'E-mail ou senha inválidos.';
  return 'Não foi possível concluir a autenticação. Tente novamente.';
}

export function AuthProvider({
  client,
  children,
  onIdentityChange,
  onSignedOut,
}: {
  client: AuthClient;
  children: ReactNode;
  onIdentityChange?: (previousUserId: string | null, nextUserId: string | null) => void;
  onSignedOut?: (userId: string) => void;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const userIdRef = useRef<string | null>(null);
  const sessionVersionRef = useRef(0);

  const acceptSession = useCallback((session: AuthSession | null, emptyStatus: AuthStatus = 'unauthenticated') => {
    sessionVersionRef.current += 1;
    const previous = userIdRef.current;
    const next = session?.user.id ?? null;
    sessionRef.current = session;
    userIdRef.current = next;
    setUserId(next);
    setStatus(session === null ? emptyStatus : 'authenticated');
    if (previous !== next) onIdentityChange?.(previous, next);
  }, [onIdentityChange]);

  useEffect(() => {
    let active = true;
    const initialVersion = sessionVersionRef.current;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active || sessionVersionRef.current !== initialVersion) return;
      if (error !== null) {
        sessionRef.current = null;
        userIdRef.current = null;
        setUserId(null);
        setStatus('unavailable');
        return;
      }
      acceptSession(data.session);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (active) acceptSession(session);
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [acceptSession, client]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error !== null || data.session === null) {
      acceptSession(null);
      throw new AuthOperationError(messageFor(error ?? { message: 'sessão ausente' }));
    }
    acceptSession(data.session);
  }, [acceptSession, client]);

  const signOut = useCallback(async () => {
    const previous = userIdRef.current;
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // A tela local deve sair mesmo quando a revogação remota fica indisponível.
    } finally {
      if (previous !== null) onSignedOut?.(previous);
      acceptSession(null);
    }
  }, [acceptSession, client, onSignedOut]);

  const getAccessToken = useCallback(async () => {
    const current = sessionRef.current;
    const now = Math.floor(Date.now() / 1000);
    if (current !== null && (current.expires_at === undefined || current.expires_at > now + 5)) {
      return current.access_token;
    }
    const { data, error } = await client.auth.refreshSession();
    if (error !== null || data.session === null) {
      acceptSession(null, 'expired');
      return null;
    }
    acceptSession(data.session);
    return data.session.access_token;
  }, [acceptSession, client]);

  const expireSession = useCallback(async () => {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* estado local vence */ }
    acceptSession(null, 'expired');
  }, [acceptSession, client]);

  const verifyOtp = useCallback(async (tokenHash: string, type: 'invite' | 'recovery') => {
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error !== null || data.session === null) {
      acceptSession(null);
      throw new AuthOperationError('O link é inválido ou expirou. Solicite um novo acesso.');
    }
    acceptSession(data.session);
  }, [acceptSession, client]);

  const updatePassword = useCallback(async (password: string) => {
    if (sessionRef.current === null) throw new AuthOperationError('Confirme o link de acesso antes de definir a senha.');
    if (password.length < 12) throw new AuthOperationError('A senha deve ter pelo menos 12 caracteres.');
    const { error } = await client.auth.updateUser({ password });
    if (error !== null) throw new AuthOperationError(messageFor(error));
  }, [client]);

  const value = useMemo<ContextValue>(() => ({
    status, userId, signIn, signOut, getAccessToken, verifyOtp, updatePassword, expireSession,
  }), [expireSession, getAccessToken, signIn, signOut, status, updatePassword, userId, verifyOtp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): ContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}

export function useAuth(): PublicAuth {
  const { status, userId, signIn, signOut, getAccessToken } = useAuthContext();
  return { status, userId, signIn, signOut, getAccessToken };
}

export function useAuthFlow(): AuthFlow {
  const { verifyOtp, updatePassword } = useAuthContext();
  return { verifyOtp, updatePassword };
}

export function useAuthControl(): AuthControl {
  const { expireSession } = useAuthContext();
  return { expireSession };
}
