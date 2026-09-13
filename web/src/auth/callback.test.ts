import { describe, expect, it, vi } from 'vitest';

import { consumeAuthCallback } from './callback';

describe('consumeAuthCallback', () => {
  it.each(['invite', 'recovery'] as const)('limpa a URL e verifica callback %s', async (type) => {
    const verifyOtp = vi.fn(async () => undefined);
    const replace = vi.fn();

    await consumeAuthCallback(
      `http://localhost:8000/auth/callback?token_hash=hash-seguro&type=${type}`,
      replace,
      verifyOtp,
    );

    expect(replace).toHaveBeenCalledWith('/auth/callback');
    expect(verifyOtp).toHaveBeenCalledWith('hash-seguro', type);
  });

  it.each([
    'http://localhost:8000/auth/callback',
    'http://localhost:8000/auth/callback?token_hash=x&type=email',
    'http://localhost:8000/auth/callback?token_hash=&type=invite',
  ])('recusa parâmetros ausentes ou tipo fora do contrato', async (url) => {
    const verifyOtp = vi.fn(async () => undefined);
    const replace = vi.fn();

    await expect(consumeAuthCallback(url, replace, verifyOtp)).rejects.toThrow(/inválido/);
    expect(replace).toHaveBeenCalledWith('/auth/callback');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('não aceita próximo destino vindo do link', async () => {
    const replace = vi.fn();
    await consumeAuthCallback(
      'http://localhost:8000/auth/callback?token_hash=x&type=invite&next=https://evil.example',
      replace,
      vi.fn(async () => undefined),
    );
    expect(replace).toHaveBeenCalledWith('/auth/callback');
  });
});
