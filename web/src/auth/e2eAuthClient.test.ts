import { describe, expect, it } from 'vitest';

import { CONTROLLED_E2E_TOKEN, createE2eAuthClient } from './e2eAuthClient';

describe('controlled E2E authentication', () => {
  it('provides a deterministic local session without credentials', async () => {
    const client = createE2eAuthClient();
    const result = await client.auth.getSession();

    expect(result.error).toBeNull();
    expect(result.data.session).toMatchObject({
      access_token: CONTROLLED_E2E_TOKEN,
      user: { id: '00000000-0000-4000-8000-000000000021' },
    });
  });
});
