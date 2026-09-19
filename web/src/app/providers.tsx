import { QueryClientProvider } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { createApiClient, type ApiClient } from '../api/client';
import { useAuth, useAuthControl } from '../auth/AuthProvider';
import { PreviewProvider } from '../preview/PreviewProvider';
import type { ApplicationRepository } from '../storage/applicationRepository';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';
import {
  StudyController,
  type StudyChannelFactory,
} from '../study/studyController';
import { createUserQueryClient, disposeUserQueryClient } from './queryClient';

const StudyControllerContext = createContext<StudyController | null>(null);
const ApiClientContext = createContext<ApiClient | null>(null);

type ApplicationProvidersProps = Readonly<{
  children: ReactNode;
  client?: ApiClient;
  projectRef?: string;
  repositoryFactory?: (ownerSub: string) => ApplicationRepository;
  channelFactory?: StudyChannelFactory;
}>;

function configuredProjectRef(): string {
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
  if (typeof configuredUrl === 'string') {
    try {
      const firstHostPart = new URL(configuredUrl).hostname.split('.')[0];
      if (firstHostPart !== undefined && firstHostPart.length > 0) return firstHostPart;
    } catch {
      // A autenticação produzirá o erro de configuração correspondente.
    }
  }
  return 'local';
}

export function ApplicationProviders({
  children,
  client,
  projectRef,
  repositoryFactory,
  channelFactory,
}: ApplicationProvidersProps) {
  const { status, userId, getAccessToken } = useAuth();
  const { expireSession } = useAuthControl();
  const queryClient = useMemo(() => createUserQueryClient(), [userId]);
  const activeQueryClient = useRef(queryClient);
  const sessionQueryClients = useRef(new Set([queryClient]));
  const storageProjectRef = projectRef ?? configuredProjectRef();
  const controller = useMemo(() => new StudyController({
    repositoryFactory: repositoryFactory ?? ((ownerSub) => new IndexedDbApplicationRepository({
      projectRef: storageProjectRef,
      ownerSub,
    })),
    cancelPending: async () => {
      await Promise.all([...sessionQueryClients.current].map(disposeUserQueryClient));
      sessionQueryClients.current.clear();
      sessionQueryClients.current.add(activeQueryClient.current);
    },
    channelScope: storageProjectRef,
    ...(channelFactory === undefined ? {} : { channelFactory }),
  }), [channelFactory, repositoryFactory, storageProjectRef]);
  const lifecycle = useRef({ controller, generation: 0 });

  useEffect(() => {
    activeQueryClient.current = queryClient;
    sessionQueryClients.current.add(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (status === 'loading') return;
    void controller.switchSession(userId);
  }, [controller, status, userId]);

  useEffect(() => {
    const generation = lifecycle.current.generation + 1;
    lifecycle.current = { controller, generation };
    return () => {
      queueMicrotask(() => {
        if (lifecycle.current.controller !== controller
          || lifecycle.current.generation === generation) controller.close();
      });
    };
  }, [controller]);

  const apiClient = useMemo(
    () => client ?? createApiClient({ getAccessToken, onUnauthorized: expireSession }),
    [client, expireSession, getAccessToken],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={apiClient}>
        <StudyControllerContext.Provider value={controller}>
          <PreviewProvider client={apiClient} ownerId={userId}>{children}</PreviewProvider>
        </StudyControllerContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useStudyController(): StudyController {
  const controller = useContext(StudyControllerContext);
  if (controller === null) {
    throw new Error('useStudyController deve ser usado dentro de ApplicationProviders');
  }
  return controller;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) throw new Error('useApiClient deve ser usado dentro de ApplicationProviders');
  return client;
}
