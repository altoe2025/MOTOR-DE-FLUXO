import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/errors';
import { createUserQueryClient, disposeUserQueryClient } from './queryClient';

describe('QueryClient por identidade', () => {
  it('isola dados de contas diferentes', () => {
    const first = createUserQueryClient();
    const second = createUserQueryClient();
    first.setQueryData(['reference-example'], { owner: 'user-a' });

    expect(second.getQueryData(['reference-example'])).toBeUndefined();
  });

  it.each([401, 403])('não repete GET em HTTP %i', async (status) => {
    const queryClient = createUserQueryClient();
    let attempts = 0;

    await expect(queryClient.fetchQuery({
      queryKey: ['reference-example'],
      queryFn: async () => {
        attempts += 1;
        throw new ApiError({ status, code: 'AUTH', message: 'auth' });
      },
    })).rejects.toBeInstanceOf(ApiError);

    expect(attempts).toBe(1);
  });

  it.each([0, 429, 503])('repete GET transitório HTTP %i somente uma vez', async (status) => {
    const queryClient = createUserQueryClient();
    let attempts = 0;

    const result = await queryClient.fetchQuery({
      queryKey: ['reference-example'],
      queryFn: async () => {
        attempts += 1;
        if (attempts === 1) throw new ApiError({ status, code: 'TRANSIENT', message: 'transient' });
        return 'ok';
      },
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('não refaz consulta quando a janela ganha foco', () => {
    const queryClient = createUserQueryClient();
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it('cancela fetches ativos antes de limpar o cache da identidade', async () => {
    const queryClient = createUserQueryClient();
    let signal: AbortSignal | undefined;
    const pending = queryClient.fetchQuery({
      queryKey: ['study', 'user-a'],
      queryFn: ({ signal: querySignal }) => {
        signal = querySignal;
        return new Promise<string>(() => undefined);
      },
    });
    void pending.catch(() => undefined);
    queryClient.setQueryData(['cached', 'user-a'], 'segredo-a');

    await disposeUserQueryClient(queryClient);

    expect(signal?.aborted).toBe(true);
    expect(queryClient.getQueryData(['cached', 'user-a'])).toBeUndefined();
  });
});
