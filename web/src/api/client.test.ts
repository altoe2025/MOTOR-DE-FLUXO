import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { components } from './generated';
import { createApiClient } from './client';
import { ApiError } from './errors';

type PreviaRequest = components['schemas']['PreviaRequest'];
type DiagnosticRequest = components['schemas']['DiagnosticRequest'];

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

function preparationFixture() {
  const request = {
    preparation_version: '1.0.0' as const,
    request_id: '00000000-0000-4000-8000-000000000010',
    study_id: '00000000-0000-4000-8000-000000000011',
    scenario_id: '00000000-0000-4000-8000-000000000012',
    scenario_revision: 1,
    expected_build_sha: 'a'.repeat(40),
    input: {
      participants: [], warmup_days: 0, measurement_days: 30, window_days: 7,
      costs: {
        iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '0',
        custo_fixo_remessa: '0', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [],
      },
      sources: {},
    },
  };
  return {
    request,
    response: {
      preparation_version: '1.0.0', preparation_id: '00000000-0000-4000-8000-000000000014',
      request_id: request.request_id, study_id: request.study_id, scenario_id: request.scenario_id,
      scenario_revision: request.scenario_revision, created_at: '2026-09-19T00:00:00Z',
      motor_build_sha: request.expected_build_sha, generator_version: 'dimensionamento-v1',
      generation_fingerprint: 'b'.repeat(64), input_snapshot: request.input,
      orders: [], parameters: [], composition: [{
        participant_id: null, order_count: 0, out_brl: '0', in_brl: '0', total_brl: '0', out_fraction: null,
      }], derived_provenance: {},
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function diagnosticRequestFixture(): DiagnosticRequest {
  return {
    api_version: '1.0.0',
    request_id: '00000000-0000-4000-8000-000000000020',
    idempotency_key: '00000000-0000-4000-8000-000000000021',
    study_id: requestFixture.study_id,
    scenario_id: requestFixture.scenario_id,
    scenario_revision: requestFixture.scenario_revision,
    input_fingerprint: 'a'.repeat(64),
    sampling: { kind: 'FIXED_INPUT', count: 1, preview_request: requestFixture },
    selected_repetition_id: '00000000-0000-4000-8000-000000000022',
    provenance: {},
  };
}

function jobSnapshotFixture(status: 'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' = 'QUEUED') {
  return {
    api_version: '1.0.0',
    job_id: '00000000-0000-4000-8000-000000000021',
    request_id: '00000000-0000-4000-8000-000000000020',
    status,
    progress: {
      completed: 0,
      failed: 0,
      total: 1,
      current_repetition_id: null,
      phase: 'QUEUED',
      created_at: '2026-09-20T12:00:00Z',
      started_at: null,
      updated_at: '2026-09-20T12:00:00Z',
      finished_at: null,
    },
    retry_of_job_id: null,
    error: null,
  };
}

describe('typed API client', () => {
  it('bloqueia Replay local inválido antes de chamar a API', async () => {
    const fetch = vi.fn();
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.buildReplay({
      api_version: '1.0.0',
      diagnostic_execution_id: '00000000-0000-4000-8000-000000000701',
      diagnostic_envelope: { file_payload: 'invalid' },
    } as never)).rejects.toMatchObject({ code: 'ENTRADA_CLIENTE_INVALIDA' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submete diagnóstico validado uma única vez pela rota oficial', async () => {
    const request = diagnosticRequestFixture();
    const snapshot = jobSnapshotFixture();
    const fetch = vi.fn().mockResolvedValue(jsonResponse(snapshot, 202));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.submitDiagnostic(request)).resolves.toEqual(snapshot);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/v1/diagnosticos', expect.objectContaining({
      method: 'POST', body: JSON.stringify(request),
    }));
  });

  it('consulta status e resultado pelas rotas isoladas do job', async () => {
    const snapshot = jobSnapshotFixture('RUNNING');
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(jsonResponse({ file_payload: 'invalid' }));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.getDiagnosticJob(snapshot.job_id)).resolves.toEqual(snapshot);
    await expect(client.getDiagnosticResult(snapshot.job_id)).rejects.toMatchObject({
      code: 'RESPOSTA_INVALIDA',
    });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      [`/api/v1/diagnosticos/${snapshot.job_id}`, 'GET'],
      [`/api/v1/diagnosticos/${snapshot.job_id}/resultado`, 'GET'],
    ]);
  });

  it('cancela e repete por POST sem retry de transporte implícito', async () => {
    const snapshot = jobSnapshotFixture();
    const retryKey = '00000000-0000-4000-8000-000000000099';
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...snapshot, status: 'CANCEL_REQUESTED' }, 202))
      .mockResolvedValueOnce(jsonResponse({ ...snapshot, job_id: retryKey }, 202));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await client.cancelDiagnostic(snapshot.job_id);
    await client.retryDiagnostic(snapshot.job_id, retryKey);

    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`/api/v1/diagnosticos/${snapshot.job_id}/cancelamentos`, 'POST', undefined],
      [`/api/v1/diagnosticos/${snapshot.job_id}/retries`, 'POST', JSON.stringify({
        api_version: '1.0.0', request_id: retryKey, idempotency_key: retryKey,
      })],
    ]);
  });

  it('valida e envia a preparação canônica pela rota oficial', async () => {
    const { request, response } = preparationFixture();
    const fetch = vi.fn().mockResolvedValue(jsonResponse(response));
    const client = createApiClient({ getAccessToken: async () => 'token', fetch });

    await expect(client.preparePortfolio!(request)).resolves.toMatchObject({
      preparation_id: response.preparation_id,
      generation_fingerprint: response.generation_fingerprint,
    });
    expect(fetch).toHaveBeenCalledWith('/api/v1/preparacoes', expect.objectContaining({
      method: 'POST', body: JSON.stringify(request),
    }));
  });

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
