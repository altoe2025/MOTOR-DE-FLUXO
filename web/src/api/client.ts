import type { components } from './generated';
import { ApiError, type ApiErrorField } from './errors';
import {
  validatePreviaRequest,
  validatePreviewEnvelope,
  validateReferenceExample,
} from './validators';

export type PreviaRequest = components['schemas']['PreviaRequest'];
export type PreviewEnvelope = components['schemas']['PreviewEnvelope'];
export type ReferenceExample = components['schemas']['ReferenceExample'];

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ApiClient = {
  getReferenceExample(signal?: AbortSignal): Promise<ReferenceExample>;
  runPreview(input: PreviaRequest, signal?: AbortSignal): Promise<PreviewEnvelope>;
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
    message: code === 'VERSAO_INCOMPATIVEL'
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
  };
}
