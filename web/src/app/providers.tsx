import { QueryClientProvider } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createApiClient, type ApiClient } from '../api/client';
import { useAuth, useAuthControl } from '../auth/AuthProvider';
import { PreviewProvider } from '../preview/PreviewProvider';
import { HelpCatalogProvider } from '../help/HelpCatalogProvider';
import type { ApplicationRepository } from '../storage/applicationRepository';
import { createBrowserApplicationRepository } from '../storage/productionRepository';
import {
  StudyController,
  type StudyChannelFactory,
} from '../study/studyController';
import { createUserQueryClient, disposeUserQueryClient } from './queryClient';

const StudyControllerContext = createContext<StudyController | null>(null);
const ApiClientContext = createContext<ApiClient | null>(null);
const ChatRepositoryContext = createContext<ApplicationRepository | null>(null);
const DiagnosticRuntimeContext = createContext<Readonly<{
  ownerSub: string | null;
  controller: StudyController;
  client: ApiClient;
}> | null>(null);

type ApplicationProvidersProps = Readonly<{
  children: ReactNode;
  client?: ApiClient;
  projectRef?: string;
  repositoryFactory?: (ownerSub: string) => ApplicationRepository;
  channelFactory?: StudyChannelFactory;
}>;

export function resolveStorageProjectRef(mode: string, configuredUrl: unknown): string {
  if (mode === 'e2e') return 'local';
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

function configuredProjectRef(): string {
  return resolveStorageProjectRef(import.meta.env.MODE, import.meta.env.VITE_SUPABASE_URL);
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
  const [controllerOwner, setControllerOwner] = useState<string | null | undefined>(undefined);
  const controller = useMemo(() => new StudyController({
    repositoryFactory: repositoryFactory ?? ((ownerSub) => createBrowserApplicationRepository({
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
  const chatRepository = useMemo(() => userId === null ? null
    : (repositoryFactory ?? ((ownerSub: string) => createBrowserApplicationRepository({
      projectRef: storageProjectRef, ownerSub,
    })))(userId), [repositoryFactory, storageProjectRef, userId]);
  const lifecycle = useRef({ controller, generation: 0 });

  useEffect(() => {
    activeQueryClient.current = queryClient;
    sessionQueryClients.current.add(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (status === 'loading') return;
    let current = true;
    setControllerOwner(undefined);
    void controller.switchSession(userId).then(() => {
      if (current) setControllerOwner(userId);
    });
    return () => { current = false; };
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

  useEffect(() => () => { chatRepository?.close(); }, [chatRepository]);

  const apiClient = useMemo(
    () => client ?? createApiClient({ getAccessToken, onUnauthorized: expireSession }),
    [client, expireSession, getAccessToken],
  );

  if (status === 'loading' || controllerOwner !== userId) {
    return <p className="session-loading" role="status">Preparando dados locais…</p>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={apiClient}>
        <StudyControllerContext.Provider value={controller}>
          <DiagnosticRuntimeContext.Provider value={{ ownerSub: userId, controller, client: apiClient }}>
            <HelpCatalogProvider client={apiClient} ownerSub={status === 'authenticated' ? userId : null}>
              <ChatRepositoryContext.Provider value={chatRepository}>
                <PreviewProvider client={apiClient} ownerId={userId}>{children}</PreviewProvider>
              </ChatRepositoryContext.Provider>
            </HelpCatalogProvider>
          </DiagnosticRuntimeContext.Provider>
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

export function useChatRepository(): ApplicationRepository {
  const repository = useContext(ChatRepositoryContext);
  if (repository === null) throw new Error('useChatRepository requer sessão autenticada');
  return repository;
}

export function useDiagnosticRuntime() {
  const runtime = useContext(DiagnosticRuntimeContext);
  if (runtime === null) {
    throw new Error('useDiagnosticRuntime deve ser usado dentro de ApplicationProviders');
  }
  return runtime;
}
