// @vitest-environment jsdom

import { useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, useSyncExternalStore } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient, AuthSession } from '../auth/types';
import type { ApplicationRepository } from '../storage/applicationRepository';
import type { StudyChannel } from '../study/studyController';
import { ApplicationProviders, useStudyController } from './providers';

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

describe('ApplicationProviders', () => {
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
    expect(repositories.map((repository) => repository.ownerSub)).toEqual([USER_A, USER_B, USER_A]);
    expect(repositories[0]?.close).toHaveBeenCalledOnce();
    expect(repositories[1]?.close).toHaveBeenCalledOnce();

    view.unmount();
    await Promise.resolve();
    expect(repositories[2]?.close).toHaveBeenCalledOnce();
  });
});
