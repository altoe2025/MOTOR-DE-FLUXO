// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth, useAuthControl, useAuthFlow } from './AuthProvider';
import type { AuthClient, AuthSession } from './types';

function session(userId = 'user-a', token = 'token-a'): AuthSession {
  return { access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } };
}

function fakeClient(initial: AuthSession | null = null) {
  let callback: ((event: string, value: AuthSession | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const client: AuthClient = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: session() }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ data: { session: session() }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((next) => {
        callback = next;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
  return { client, unsubscribe, emit: (event: string, value: AuthSession | null) => callback?.(event, value) };
}

function Probe() {
  const auth = useAuth();
  const flow = useAuthFlow();
  const control = useAuthControl();
  const [message, setMessage] = useState('');
  return (
    <div>
      <output>{auth.status}:{auth.userId ?? '-'}</output>
      <button onClick={() => void auth.signIn('a@example.com', 'password-1234').catch((error: Error) => setMessage(error.message))}>login</button>
      <button onClick={() => void auth.signOut()}>logout</button>
      <button onClick={() => void auth.getAccessToken().then((token) => setMessage(token ?? 'sem-token'))}>token</button>
      <button onClick={() => void flow.verifyOtp('hash', 'invite')}>verify</button>
      <button onClick={() => void flow.updatePassword('password-1234')}>password</button>
      <button onClick={() => void flow.updatePassword('curta').catch((error: Error) => setMessage(error.message))}>short-password</button>
      <button onClick={() => void control.expireSession()}>expire</button>
      <p>{message}</p>
    </div>
  );
}

describe('AuthProvider', () => {
  it('resolve sessão e reage a troca de conta por evento do SDK', async () => {
    const auth = fakeClient(session('user-a'));
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);

    expect(await screen.findByText('authenticated:user-a')).toBeVisible();
    auth.emit('SIGNED_IN', session('user-b'));
    expect(await screen.findByText('authenticated:user-b')).toBeVisible();
  });

  it('encerra a tela autenticada quando outra aba emite SIGNED_OUT', async () => {
    const auth = fakeClient(session('user-a'));
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('authenticated:user-a');
    auth.emit('SIGNED_OUT', null);
    expect(await screen.findByText('unauthenticated:-')).toBeVisible();
  });

  it('remove a inscrição ao desmontar', async () => {
    const auth = fakeClient();
    const view = render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('unauthenticated:-');
    view.unmount();
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
  });

  it('distingue indisponibilidade de ausência de sessão', async () => {
    const auth = fakeClient();
    vi.mocked(auth.client.auth.getSession).mockResolvedValue({ data: { session: null }, error: { message: 'offline' } });
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    expect(await screen.findByText('unavailable:-')).toBeVisible();
  });

  it('mostra erro de credencial sem autenticar', async () => {
    const auth = fakeClient();
    vi.mocked(auth.client.auth.signInWithPassword).mockResolvedValue({
      data: { session: null }, error: { message: 'Invalid login credentials' },
    });
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('unauthenticated:-');

    await user.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeVisible();
    expect(screen.getByText('unauthenticated:-')).toBeVisible();
  });

  it('não deixa leitura inicial atrasada apagar login recém-concluído', async () => {
    const auth = fakeClient();
    let resolveInitial!: (value: { data: { session: AuthSession | null }; error: null }) => void;
    vi.mocked(auth.client.auth.getSession).mockReturnValue(new Promise((resolve) => { resolveInitial = resolve; }));
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await user.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('authenticated:user-a')).toBeVisible();
    resolveInitial({ data: { session: null }, error: null });
    await Promise.resolve();
    expect(screen.getByText('authenticated:user-a')).toBeVisible();
  });

  it('marca expirada quando refresh falha e não entrega token antigo', async () => {
    const expired = session();
    expired.expires_at = Math.floor(Date.now() / 1000) - 1;
    const auth = fakeClient(expired);
    vi.mocked(auth.client.auth.refreshSession).mockResolvedValue({
      data: { session: null }, error: { message: 'offline' },
    });
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('authenticated:user-a');

    await user.click(screen.getByRole('button', { name: 'token' }));
    expect(await screen.findByText('expired:-')).toBeVisible();
    expect(screen.getByText('sem-token')).toBeVisible();
  });

  it('permite que o cliente HTTP marque a sessão expirada após 401', async () => {
    const auth = fakeClient(session());
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('authenticated:user-a');
    await user.click(screen.getByRole('button', { name: 'expire' }));
    expect(await screen.findByText('expired:-')).toBeVisible();
  });

  it('encerra a sessão local mesmo quando signOut retorna falha', async () => {
    const auth = fakeClient(session());
    vi.mocked(auth.client.auth.signOut).mockResolvedValue({ error: { message: 'offline' } });
    const onSignedOut = vi.fn();
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client} onSignedOut={onSignedOut}><Probe /></AuthProvider>);
    await screen.findByText('authenticated:user-a');

    await user.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(screen.getByText('unauthenticated:-')).toBeVisible());
    expect(onSignedOut).toHaveBeenCalledWith('user-a');
    expect(auth.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('encerra a sessão local quando o SDK lança erro de rede no logout', async () => {
    const auth = fakeClient(session());
    vi.mocked(auth.client.auth.signOut).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('authenticated:user-a');
    await user.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('unauthenticated:-')).toBeVisible();
  });

  it('só define senha com 12 caracteres após sessão verificada', async () => {
    const auth = fakeClient();
    const user = userEvent.setup();
    render(<AuthProvider client={auth.client}><Probe /></AuthProvider>);
    await screen.findByText('unauthenticated:-');

    await user.click(screen.getByRole('button', { name: 'short-password' }));
    expect(await screen.findByText('Confirme o link de acesso antes de definir a senha.')).toBeVisible();
    expect(auth.client.auth.updateUser).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'verify' }));
    expect(await screen.findByText('authenticated:user-a')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'password' }));
    await waitFor(() => expect(auth.client.auth.updateUser).toHaveBeenCalledWith({ password: 'password-1234' }));
  });
});
