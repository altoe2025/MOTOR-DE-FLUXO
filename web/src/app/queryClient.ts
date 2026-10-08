import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/errors';

const TRANSIENT_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

function retryGet(failureCount: number, error: unknown): boolean {
  return failureCount < 1
    && error instanceof ApiError
    && TRANSIENT_STATUS.has(error.status);
}

export function createUserQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryGet,
        retryDelay: 100,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export async function disposeUserQueryClient(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
}
