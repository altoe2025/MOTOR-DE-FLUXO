import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { components } from './generated';
import { createApiClient } from './client';
import { ApiError } from './errors';

type PreviaRequest = components['schemas']['PreviaRequest'];

const requestFixture = JSON.parse(readFileSync(fileURLToPath(
  new URL('../../../contracts/fixtures/reference-request.json', import.meta.url),
), 'utf8')) as PreviaRequest;

const resultFixture = JSON.parse(readFileSync(fileURLToPath(
  new URL('../../../contracts/fixtures/reference-result.json', import.meta.url),
), 'utf8')) as unknown;

const referenceFixture = {
  cenario: requestFixture.cenario,
  periodo: requestFixture.periodo,
  proveniencia: requestFixture.proveniencia,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('typed API client', () => {
  it('obtém o Bearer no instante de cada chamada', async () => {
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce('token-get')
      .mockResolvedValueOnce('token-post');
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(referenceFixture))
      .mockResolvedValueOnce(jsonResponse(resultFixture));
    const client = createApiClient({ getAccessToken, fetch });

    await client.getReferenceExample();
    await client.runPreview(requestFixture);

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-get' });
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-post' });
  });

  it.each([
    [401, 'SESSAO_INVALIDA'],
    [403, 'ACESSO_NAO_PERMITIDO'],
    [429, 'CAPACIDADE_OCUPADA'],
    [503, 'AUTH_INDISPONIVEL'],
  ])('preserva o erro seguro do servidor em HTTP %i', async (status, code) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: {
      code,
      message: 'Mensagem pública.',
      request_id: '00000000-0000-4000-8000-000000000099',
      fields: [{ path: '/cenario', code: 'invalid', message: 'Campo inválido.' }],
    } }, status));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.runPreview(requestFixture)).rejects.toMatchObject({
      status,
      code,
      message: 'Mensagem pública.',
      requestId: '00000000-0000-4000-8000-000000000099',
      fields: [{ path: '/cenario', code: 'invalid', message: 'Campo inválido.' }],
    });
  });

  it('não preserva campos extras potencialmente sensíveis do erro remoto', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: {
      code: 'ENTRADA_INVALIDA',
      message: 'Mensagem pública.',
      request_id: '00000000-0000-4000-8000-000000000099',
      fields: [{ path: '/cenario', code: 'invalid', message: 'Campo inválido.', secret: 'não copiar' }],
      token: 'não copiar',
    } }, 422));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    const error = await client.runPreview(requestFixture).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual([
      { path: '/cenario', code: 'invalid', message: 'Campo inválido.' },
    ]);
    expect(JSON.stringify(error)).not.toContain('não copiar');
  });

  it('expira a sessão também quando um 401 traz corpo inesperado', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      getAccessToken: async () => 'token',
      fetch: vi.fn().mockResolvedValue(new Response('<html>proxy</html>', {
        status: 401,
        headers: { 'Content-Type': 'text/html' },
      })),
      onUnauthorized,
    });

    await expect(client.getReferenceExample()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it.each([
    ['JSON inválido', new Response('{', { headers: { 'Content-Type': 'application/json' } })],
    ['HTML inesperado', new Response('<html>proxy</html>', { headers: { 'Content-Type': 'text/html' } })],
  ])('rejeita %s sem renderizar conteúdo não validado', async (_name, response) => {
    const client = createApiClient({
      getAccessToken: async () => 'token',
      fetch: vi.fn().mockResolvedValue(response),
    });

    await expect(client.getReferenceExample()).rejects.toMatchObject({
      status: 200,
      code: 'RESPOSTA_INVALIDA',
    });
  });

  it('rejeita versão de envelope incompatível', async () => {
    const changed = structuredClone(resultFixture) as Record<string, unknown>;
    changed.api_version = '2.0.0';
    const client = createApiClient({
      getAccessToken: async () => 'token',
      fetch: vi.fn().mockResolvedValue(jsonResponse(changed)),
    });

    await expect(client.runPreview(requestFixture)).rejects.toMatchObject({
      status: 200,
      code: 'VERSAO_INCOMPATIVEL',
    });
  });

  it('rejeita decimal inválido no envelope', async () => {
    const changed = structuredClone(resultFixture) as {
      result: { agregado: { economia_periodo_brl: unknown } };
    };
    changed.result.agregado.economia_periodo_brl = 1026000;
    const client = createApiClient({
      getAccessToken: async () => 'token',
      fetch: vi.fn().mockResolvedValue(jsonResponse(changed)),
    });

    await expect(client.runPreview(requestFixture)).rejects.toMatchObject({
      status: 200,
      code: 'RESPOSTA_INVALIDA',
    });
  });

  it('encerra a espera no timeout por AbortController sem repetir o POST', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch, timeoutMs: 30_000 });
    const request = client.runPreview(requestFixture);
    const rejection = expect(request).rejects.toMatchObject({ code: 'TEMPO_ESGOTADO', status: 0 });

    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(fetch).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('não repete POST quando o transporte falha', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.runPreview(requestFixture)).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
