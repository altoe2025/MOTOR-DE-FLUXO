import type { components } from './generated';
import { ApiError, type ApiErrorField } from './errors';
import {
  validatePreparationRequest,
  validatePreparationResponse,
  validateDiagnosticEnvelope,
  validateDiagnosticRequest,
  validateJobSnapshot,
  validatePreviaRequest,
  validatePreviewEnvelope,
  validateReferenceExample,
  validateReplayDocument,
  validateReplayRequest,
  validateCatalogoImportacao,
} from './validators';

export type PreviaRequest = components['schemas']['PreviaRequest'];
export type PreviewEnvelope = components['schemas']['PreviewEnvelope'];
export type ReferenceExample = components['schemas']['ReferenceExample'];
export type PreparationRequest = components['schemas']['PreparationRequest'];
export type PreparationResponse = components['schemas']['PreparationResponse'];
export type DiagnosticRequest = components['schemas']['DiagnosticRequest'];
export type DiagnosticEnvelope = components['schemas']['DiagnosticEnvelope'];
export type JobSnapshot = components['schemas']['JobSnapshot'];
export type ReplayRequest = components['schemas']['ReplayRequestV1'];
export type ReplayDocument = components['schemas']['ReplayDocumentV1'];
export type ImportCatalog = components['schemas']['CatalogoImportacao'];

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ApiClient = {
  getReferenceExample(signal?: AbortSignal): Promise<ReferenceExample>;
  getImportCatalog?(signal?: AbortSignal): Promise<ImportCatalog>;
  preparePortfolio?(input: PreparationRequest, signal?: AbortSignal): Promise<PreparationResponse>;
  runPreview(input: PreviaRequest, signal?: AbortSignal): Promise<PreviewEnvelope>;
  submitDiagnostic(input: DiagnosticRequest, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticJob(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticResult(jobId: string, signal?: AbortSignal): Promise<DiagnosticEnvelope>;
  cancelDiagnostic(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
  retryDiagnostic(jobId: string, idempotencyKey: string, signal?: AbortSignal): Promise<JobSnapshot>;
  buildReplay(input: ReplayRequest, signal?: AbortSignal): Promise<ReplayDocument>;
};

type ErrorDocument = {
  error: {
    code: string;
    message: string;
    request_id: string;
    fields: ApiErrorField[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseErrorDocument(value: unknown): ErrorDocument | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const { code, message, request_id: requestId, fields } = value.error;
  if (typeof code !== 'string' || typeof message !== 'string' || typeof requestId !== 'string' || !Array.isArray(fields)) {
    return null;
  }
  const validFields = fields.every((field) => (
    isRecord(field)
    && typeof field.path === 'string'
    && typeof field.code === 'string'
    && typeof field.message === 'string'
  ));
  if (!validFields) return null;
  const safeFields = fields.map((field) => {
    const safe = field as Record<string, unknown>;
    return {
      path: safe.path as string,
      code: safe.code as string,
      message: safe.message as string,
    };
  });
  return { error: { code, message, request_id: requestId, fields: safeFields } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalidResponse(status: number, code = 'RESPOSTA_INVALIDA'): ApiError {
  return new ApiError({
    status,
    code,
    message: code === 'VERSAO_INCOMPATIVEL' || code === 'VERSAO_REPLAY_NAO_SUPORTADA'
      ? 'A versão da resposta não é compatível com esta aplicação.'
      : 'O servidor devolveu uma resposta que não pôde ser validada.',
  });
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw invalidResponse(response.status);
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse(response.status);
  }
}

export function createApiClient({
  getAccessToken,
  fetch: fetchImplementation = globalThis.fetch.bind(globalThis),
  timeoutMs = 30_000,
  onUnauthorized,
}: {
  getAccessToken(): Promise<string | null>;
  fetch?: FetchLike;
  timeoutMs?: number;
  onUnauthorized?(): void | Promise<void>;
}): ApiClient {
  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const token = await getAccessToken();
    if (token === null) {
      throw new ApiError({ status: 401, code: 'SESSAO_INVALIDA', message: 'Entre novamente para continuar.' });
    }

    const controller = new AbortController();
    let timeoutExpired = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted === true) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timeoutExpired = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImplementation(path, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
        signal: controller.signal,
      });
      if (response.status === 401) {
        try { await onUnauthorized?.(); } catch { /* o erro HTTP original continua sendo a fonte */ }
      }
      const document = await readJson(response);
      if (!response.ok) {
        const error = parseErrorDocument(document);
        if (error === null) throw invalidResponse(response.status);
        throw new ApiError({
          status: response.status,
          code: error.error.code,
          message: error.error.message,
          fields: error.error.fields,
          requestId: error.error.request_id,
        });
      }
      return document;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (timeoutExpired) {
        throw new ApiError({
          status: 0,
          code: 'TEMPO_ESGOTADO',
          message: 'A espera de 30 segundos foi encerrada. O motor pode continuar processando no servidor.',
        });
      }
      if (signal?.aborted === true) {
        throw new ApiError({ status: 0, code: 'REQUISICAO_CANCELADA', message: 'A espera pela resposta foi encerrada.' });
      }
      throw new ApiError({ status: 0, code: 'TRANSPORTE_INDISPONIVEL', message: 'Não foi possível alcançar o servidor.' });
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    async getReferenceExample(signal) {
      const document = await request('/api/v1/examples/reference', { method: 'GET' }, signal);
      if (!validateReferenceExample(document)) throw invalidResponse(200);
      return deepFreeze(document as ReferenceExample);
    },

    async getImportCatalog(signal) {
      const document = await request('/api/v1/catalogos/importacao', { method: 'GET' }, signal);
      if (!validateCatalogoImportacao(document)) throw invalidResponse(200);
      return deepFreeze(document as ImportCatalog);
    },

    async preparePortfolio(input, signal) {
      if (!validatePreparationRequest(input)) {
        throw new ApiError({ status: 0, code: 'ENTRADA_CLIENTE_INVALIDA', message: 'A entrada local não passou pela validação.' });
      }
      const document = await request('/api/v1/preparacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }, signal);
      if (!validatePreparationResponse(document)) throw invalidResponse(200);
      return deepFreeze(document as PreparationResponse);
    },

    async runPreview(input, signal) {
      if (!validatePreviaRequest(input)) {
        throw new ApiError({ status: 0, code: 'ENTRADA_CLIENTE_INVALIDA', message: 'A entrada local não passou pela validação.' });
      }
      const document = await request('/api/v1/previas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }, signal);
      if (isRecord(document) && document.api_version !== '1.0.0') {
        throw invalidResponse(200, 'VERSAO_INCOMPATIVEL');
      }
      if (!validatePreviewEnvelope(document)) throw invalidResponse(200);
      return deepFreeze(document as PreviewEnvelope);
    },

    async submitDiagnostic(input, signal) {
      if (!validateDiagnosticRequest(input)) {
        throw new ApiError({ status: 0, code: 'ENTRADA_CLIENTE_INVALIDA', message: 'A entrada local não passou pela validação.' });
      }
      const document = await request('/api/v1/diagnosticos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }, signal);
      if (!validateJobSnapshot(document)) throw invalidResponse(202);
      return deepFreeze(document as JobSnapshot);
    },

    async getDiagnosticJob(jobId, signal) {
      const document = await request(`/api/v1/diagnosticos/${encodeURIComponent(jobId)}`, {
        method: 'GET',
      }, signal);
      if (!validateJobSnapshot(document)) throw invalidResponse(200);
      return deepFreeze(document as JobSnapshot);
    },

    async getDiagnosticResult(jobId, signal) {
      const document = await request(`/api/v1/diagnosticos/${encodeURIComponent(jobId)}/resultado`, {
        method: 'GET',
      }, signal);
      if (!validateDiagnosticEnvelope(document)) throw invalidResponse(200);
      return deepFreeze(document as DiagnosticEnvelope);
    },

    async cancelDiagnostic(jobId, signal) {
      const document = await request(`/api/v1/diagnosticos/${encodeURIComponent(jobId)}/cancelamentos`, {
        method: 'POST',
      }, signal);
      if (!validateJobSnapshot(document)) throw invalidResponse(202);
      return deepFreeze(document as JobSnapshot);
    },

    async retryDiagnostic(jobId, idempotencyKey, signal) {
      const document = await request(`/api/v1/diagnosticos/${encodeURIComponent(jobId)}/retries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_version: '1.0.0',
          request_id: idempotencyKey,
          idempotency_key: idempotencyKey,
        }),
      }, signal);
      if (!validateJobSnapshot(document)) throw invalidResponse(202);
      return deepFreeze(document as JobSnapshot);
    },

    async buildReplay(input, signal) {
      if (!validateReplayRequest(input)) {
        throw new ApiError({ status: 0, code: 'ENTRADA_CLIENTE_INVALIDA', message: 'O resultado persistido não passou pela validação local.' });
      }
      const document = await request('/api/v1/replays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }, signal);
      if (isRecord(document) && document.api_version !== '1.0.0') {
        throw invalidResponse(200, 'VERSAO_REPLAY_NAO_SUPORTADA');
      }
      if (!validateReplayDocument(document)) throw invalidResponse(200);
      return deepFreeze(document as ReplayDocument);
    },
  };
}
