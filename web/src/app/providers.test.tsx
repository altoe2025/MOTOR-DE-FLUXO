// @vitest-environment jsdom

import { useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState, useSyncExternalStore } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import { createApiClient } from '../api/client';
import type { AuthClient, AuthSession } from '../auth/types';
import { useProductHelpCatalog } from '../help/HelpCatalogProvider';
import productHelp from '../../../servidor/catalogs/product_help.v1.json';
import type { ApplicationRepository } from '../storage/applicationRepository';
import type { StudyChannel } from '../study/studyController';
import { ApplicationProviders, resolveStorageProjectRef, useChatRepository, useStudyController } from './providers';

function ChatRepositoryProbe() {
  const repository = useChatRepository();
  const [result, setResult] = useState('pending');
  return <><button onClick={() => void repository.listChatConversations(null).then(() => setResult('open')).catch(() => setResult('closed'))}>Ler chat</button>
    <output data-testid="chat-repository">{result}</output></>;
}

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

function session(userId: string): AuthSession {
  return { access_token: `token-${userId}`, expires_at: 4_102_444_800, user: { id: userId } };
}

function authClient() {
  let listener: ((event: string, session: AuthSession | null) => void) | null = null;
  const client: AuthClient = {
    auth: {
      getSession: async () => ({ data: { session: session(USER_A) }, error: null }),
      refreshSession: async () => ({ data: { session: session(USER_A) }, error: null }),
      signInWithPassword: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { session: null }, error: null }),
      updateUser: async () => ({ error: null }),
      onAuthStateChange: (callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  };
  return {
    client,
    emit(next: AuthSession | null) {
      if (listener === null) throw new Error('listener ausente');
      listener('SIGNED_IN', next);
    },
  };
}

function Probe() {
  const controller = useStudyController();
  const queryClient = useQueryClient();
  const [, rerender] = useState(0);
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.snapshot,
  );
  const secret = queryClient.getQueryData<string>(['owner-secret']);
  return (
    <>
      <button type="button" onClick={() => {
        queryClient.setQueryData(['owner-secret'], snapshot.ownerSub);
        rerender((value) => value + 1);
      }}>guardar cache</button>
      <output data-testid="controller-state">{`${snapshot.ownerSub ?? 'none'}:${snapshot.sessionEpoch}`}</output>
      <output data-testid="query-cache">{secret ?? 'none'}</output>
    </>
  );
}

function HelpProbe() {
  const catalog = useProductHelpCatalog();
  return <output data-testid="product-help-state">{
    catalog === undefined ? 'loading' : catalog === null ? 'unavailable' : catalog.apiVersion
  }</output>;
}

function deferredReset() {
  let resolve!: (value: boolean) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<boolean>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('ApplicationProviders', () => {
  it('mantém os filhos bloqueados até o reset assíncrono terminar', async () => {
    const auth = authClient();
    const reset = deferredReset();
    const resetAllLocalDataOnce = vi.fn(() => reset.promise);
    const repositoryFactory = () => ({ close: vi.fn(), resetAllLocalDataOnce }) as unknown as ApplicationRepository;
    render(<AuthProvider client={auth.client}>
      <ApplicationProviders repositoryFactory={repositoryFactory}><Probe /></ApplicationProviders>
    </AuthProvider>);

    await waitFor(() => expect(resetAllLocalDataOnce).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Preparando dados locais');
    expect(screen.queryByTestId('controller-state')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => { reset.resolve(true); });
    await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(USER_A));
    expect(screen.queryByText('Preparando dados locais…')).not.toBeInTheDocument();
  });

  it('ignora rejeição tardia do reset de A depois de inicializar a conta B', async () => {
    const auth = authClient();
    const resetA = deferredReset();
    const resetB = deferredReset();
    const resetForA = vi.fn(() => resetA.promise);
    const resetForB = vi.fn(() => resetB.promise);
    const repositoryFactory = (ownerSub: string) => ({
      close: vi.fn(),
      resetAllLocalDataOnce: ownerSub === USER_A ? resetForA : resetForB,
    }) as unknown as ApplicationRepository;
    render(<AuthProvider client={auth.client}>
      <ApplicationProviders repositoryFactory={repositoryFactory}><Probe /></ApplicationProviders>
    </AuthProvider>);

    await waitFor(() => expect(resetForA).toHaveBeenCalledOnce());
    act(() => auth.emit(session(USER_B)));
    await waitFor(() => expect(resetForB).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('controller-state')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preparando dados locais');

    await act(async () => { resetB.resolve(true); });
    await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(USER_B));
    fireEvent.click(screen.getByRole('button', { name: 'guardar cache' }));
    expect(screen.getByTestId('query-cache')).toHaveTextContent(USER_B);
    const readyState = screen.getByTestId('controller-state').textContent;

    await act(async () => { resetA.reject(new Error('Reset antigo indisponível')); });
    expect(screen.getByTestId('controller-state').textContent).toBe(readyState);
    expect(screen.getByTestId('query-cache')).toHaveTextContent(USER_B);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('mostra falha de armazenamento sem liberar dados e permite tentar novamente', async () => {
    const auth = authClient();
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Indisponível', 'InvalidStateError');
    });
    try {
      render(<AuthProvider client={auth.client}>
        <ApplicationProviders projectRef="boot-recovery"><Probe /></ApplicationProviders>
      </AuthProvider>);
      expect(await screen.findByRole('alert')).toHaveTextContent('armazenamento');
      expect(screen.queryByTestId('controller-state')).not.toBeInTheDocument();
      expect(screen.queryByText('Preparando dados locais…')).not.toBeInTheDocument();
      open.mockRestore();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(USER_A));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      open.mockRestore();
    }
  });

  it('carrega ajuda na sessão autenticada e a remove quando a sessão termina', async () => {
    const auth = authClient();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...productHelp, catalogVersion: 'a'.repeat(64),
    }), { headers: { 'Content-Type': 'application/json' } }));
    const client = createApiClient({ getAccessToken: async () => `token-${USER_A}`, fetch });

    render(
      <AuthProvider client={auth.client}>
        <ApplicationProviders client={client} projectRef="project-test"><HelpProbe /></ApplicationProviders>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('product-help-state')).toHaveTextContent('1.0.0'));
    expect(fetch).toHaveBeenCalledWith('/api/v1/catalogos/ajuda', expect.objectContaining({ method: 'GET' }));

    act(() => auth.emit(null));
    await waitFor(() => expect(screen.getByTestId('product-help-state')).toHaveTextContent('unavailable'));
  });

  it('keeps chat storage usable after StrictMode effect replay', async () => {
    const auth = authClient();
    const repositoryFactory = () => {
      let closed = false;
      return { close: () => { closed = true; },
        listChatConversations: async () => { if (closed) throw new Error('closed'); return []; },
      } as unknown as ApplicationRepository;
    };
    render(<StrictMode><AuthProvider client={auth.client}>
      <ApplicationProviders repositoryFactory={repositoryFactory} channelFactory={() => ({
        postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
      }) as unknown as StudyChannel}><ChatRepositoryProbe /></ApplicationProviders>
    </AuthProvider></StrictMode>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ler chat' }));
    await waitFor(() => expect(screen.getByTestId('chat-repository')).toHaveTextContent('open'));
  });

  it('mantém o namespace local no modo E2E mesmo com Supabase real configurado', () => {
    expect(resolveStorageProjectRef('e2e', 'https://projeto-real.supabase.co')).toBe('local');
  });

  it('mantém um controlador e troca seus recursos na sequência A → B → A', async () => {
    const auth = authClient();
    const repositories: Array<{ ownerSub: string; close: ReturnType<typeof vi.fn> }> = [];
    const repositoryFactory = (ownerSub: string) => {
      const repository = { ownerSub, close: vi.fn() };
      repositories.push(repository);
      return repository as unknown as ApplicationRepository;
    };
    const channelFactory = () => ({
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    }) as unknown as StudyChannel;

    const view = render(
      <AuthProvider client={auth.client}>
        <ApplicationProviders
          projectRef="project-test"
          repositoryFactory={repositoryFactory}
          channelFactory={channelFactory}
        >
          <Probe />
        </ApplicationProviders>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(new RegExp(`^${USER_A}:`)));
    const epochA1 = Number(screen.getByTestId('controller-state').textContent?.split(':')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'guardar cache' }));
    expect(screen.getByTestId('query-cache')).toHaveTextContent(USER_A);

    act(() => auth.emit(session(USER_B)));
    await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(new RegExp(`^${USER_B}:`)));
    const epochB = Number(screen.getByTestId('controller-state').textContent?.split(':')[1]);
    expect(screen.getByTestId('query-cache')).toHaveTextContent('none');

    act(() => auth.emit(session(USER_A)));
    await waitFor(() => expect(screen.getByTestId('controller-state')).toHaveTextContent(new RegExp(`^${USER_A}:`)));
    const epochA2 = Number(screen.getByTestId('controller-state').textContent?.split(':')[1]);

    expect([epochA1, epochB, epochA2]).toEqual([1, 2, 3]);
    expect(repositories.map((repository) => repository.ownerSub)).toEqual([USER_A, USER_A, USER_B, USER_B, USER_A, USER_A]);
    for (const repository of repositories.slice(0, 4)) expect(repository.close).toHaveBeenCalledOnce();

    view.unmount();
    await Promise.resolve();
    for (const repository of repositories.slice(4)) expect(repository.close).toHaveBeenCalledOnce();
  });
});
