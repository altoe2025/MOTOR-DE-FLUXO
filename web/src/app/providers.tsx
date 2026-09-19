import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';

import { createApiClient, type ApiClient } from '../api/client';
import { useAuth, useAuthControl } from '../auth/AuthProvider';
import { PreviewProvider } from '../preview/PreviewProvider';
import { ImportFlowProvider } from '../importer/components/ImportFlowContext';
import { createUserQueryClient } from './queryClient';

export function ApplicationProviders({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const { userId, getAccessToken } = useAuth();
  const { expireSession } = useAuthControl();
  const queryClient = useMemo(() => createUserQueryClient(), [userId]);
  useEffect(() => () => queryClient.clear(), [queryClient]);
  const apiClient = useMemo(
    () => client ?? createApiClient({ getAccessToken, onUnauthorized: expireSession }),
    [client, expireSession, getAccessToken],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PreviewProvider client={apiClient} ownerId={userId}>
        <ImportFlowProvider client={apiClient}>{children}</ImportFlowProvider>
      </PreviewProvider>
    </QueryClientProvider>
  );
}
