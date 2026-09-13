// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient, AuthSession } from '../auth/types';
import { AppRoutes } from './router';

function session(userId = 'user-a'): AuthSession {
  return { access_token: `token-${userId}`, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } };
}

function client(initial: AuthSession | null, options: { loginError?: string } = {}): AuthClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      signInWithPassword: vi.fn(async () => options.loginError === undefined
        ? { data: { session: session() }, error: null }
        : { data: { session: null }, error: { message: options.loginError } }),
      signOut: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ data: { session: session() }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };
}

function renderAppAt(path: string, authClient: AuthClient = client(session())) {
  return render(
    <AuthProvider client={authClient}>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </AuthProvider>,
  );
}

describe('application routes', () => {
  it.each([
    ['/carteira', 'Carteira'], ['/diagnostico', 'Diagnóstico'], ['/comparar', 'Comparar cenários'],
    ['/replay', 'Replay'], ['/premissas', 'Dados e premissas'],
  ])('protege %s e marca o destino ativo', async (path, destination) => {
    renderAppAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: destination })).toBeVisible();
    expect(screen.getByRole('link', { name: destination })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
  });

  it('redireciona visitante para login', async () => {
    renderAppAt('/carteira', client(null));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('faz login por e-mail e senha', async () => {
    const authClient = client(null);
    const user = userEvent.setup();
    renderAppAt('/login', authClient);
    await screen.findByRole('heading', { name: 'Entrar' });
    await user.type(screen.getByLabelText('E-mail'), 'gabriel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'password-1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeVisible();
    expect(authClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'gabriel@example.com', password: 'password-1234' });
  });

  it('preserva e exibe erro de credencial', async () => {
    const user = userEvent.setup();
    renderAppAt('/login', client(null, { loginError: 'Invalid login credentials' }));
    await user.type(await screen.findByLabelText('E-mail'), 'gabriel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'incorreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('gabriel@example.com');
  });

  it('define senha depois da sessão validada', async () => {
    const authClient = client(session());
    const user = userEvent.setup();
    renderAppAt('/auth/definir-senha', authClient);
    await user.type(await screen.findByLabelText('Nova senha'), 'password-1234');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'password-1234');
    await user.click(screen.getByRole('button', { name: 'Definir senha' }));
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeVisible();
    expect(authClient.auth.updateUser).toHaveBeenCalledWith({ password: 'password-1234' });
  });

  it('não envia senhas divergentes', async () => {
    const authClient = client(session());
    const user = userEvent.setup();
    renderAppAt('/auth/definir-senha', authClient);
    await user.type(await screen.findByLabelText('Nova senha'), 'password-1234');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'password-5678');
    await user.click(screen.getByRole('button', { name: 'Definir senha' }));
    expect(await screen.findByText('As senhas informadas não coincidem.')).toBeVisible();
    expect(authClient.auth.updateUser).not.toHaveBeenCalled();
  });

  it('salva o nome por usuário e não restaura em outra conta', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const first = renderAppAt('/carteira', client(session('user-a')));
    const field = await screen.findByLabelText('Nome do estudo');
    await user.type(field, 'Carteira A');
    await waitFor(() => expect(localStorage.getItem('motor-fluxo:draft:v1:user-a')).toContain('Carteira A'));
    first.unmount();

    renderAppAt('/carteira', client(session('user-b')));
    expect(await screen.findByLabelText('Nome do estudo')).toHaveValue('');
  });

  it('renderiza callback inválido como erro recuperável', async () => {
    renderAppAt('/auth/callback', client(null));
    expect(await screen.findByRole('heading', { name: 'Confirmando acesso' })).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(/inválido/);
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toBeVisible();
  });

  it('processa callback somente uma vez sob StrictMode e limpa token da URL', async () => {
    const authClient = client(null);
    window.history.replaceState({}, '', '/auth/callback?token_hash=hash-valido&type=invite');
    render(
      <StrictMode>
        <AuthProvider client={authClient}>
          <MemoryRouter initialEntries={['/auth/callback']}><AppRoutes /></MemoryRouter>
        </AuthProvider>
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'Definir senha' })).toBeVisible();
    expect(authClient.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });
});
