import { useQueryClient } from '@tanstack/react-query';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';

import type { ApiClient, PreviaRequest, PreviewEnvelope } from '../api/client';
import { ApiError } from '../api/errors';
import { validatePreviewEnvelope } from '../api/validators';

type PreviewStatus = 'idle' | 'running';
type PreviewValue = {
  status: PreviewStatus;
  envelope: PreviewEnvelope | null;
  error: ApiError | null;
  executeReference(): Promise<void>;
  executeRequest(input: PreviaRequest): Promise<PreviewEnvelope>;
  restoreEnvelope(envelope: PreviewEnvelope): void;
};
type StoredState = Omit<PreviewValue, 'executeReference' | 'executeRequest' | 'restoreEnvelope'>;
type InFlight = {
  marker: symbol;
  ownerId: string;
  controller: AbortController;
  promise: Promise<PreviewEnvelope>;
};

const EMPTY_STATE: StoredState = { status: 'idle', envelope: null, error: null };
const PreviewContext = createContext<PreviewValue | null>(null);

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) freeze(child);
    }
  };
  freeze(clone);
  return clone;
}

function contextError(): ApiError {
  return new ApiError({
    status: 0, code: 'CONTEXTO_DIVERGENTE',
    message: 'A resposta pertence a outra execução e foi descartada.',
  });
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError({
      status: 0, code: 'ERRO_INESPERADO',
      message: 'Não foi possível concluir a execução.',
    });
}

function envelopeMatches(input: PreviaRequest, envelope: PreviewEnvelope): boolean {
  return envelope.request_id === input.request_id
    && envelope.study_id === input.study_id
    && envelope.scenario_id === input.scenario_id
    && envelope.scenario_revision === input.scenario_revision;
}

export function PreviewProvider({
  client, ownerId, children,
}: {
  client: ApiClient;
  ownerId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const statesRef = useRef(new Map<string, StoredState>());
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const inFlightRef = useRef<InFlight | null>(null);
  const [, render] = useState(0);

  const update = useCallback((
    targetOwner: string,
    next: (current: StoredState) => StoredState,
  ) => {
    statesRef.current.set(
      targetOwner,
      next(statesRef.current.get(targetOwner) ?? EMPTY_STATE),
    );
    if (ownerRef.current === targetOwner) render((version) => version + 1);
  }, []);

  useEffect(() => () => {
    const active = inFlightRef.current;
    if (active?.ownerId === ownerId) {
      active.controller.abort();
      inFlightRef.current = null;
      if (ownerId !== null) {
        update(ownerId, (state) => ({ ...state, status: 'idle' }));
      }
    }
  }, [ownerId, update]);

  const startRequest = useCallback((
    input: PreviaRequest,
  ): Promise<PreviewEnvelope> => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null) return Promise.reject(contextError());
    if (inFlightRef.current !== null) return inFlightRef.current.promise;
    const marker = Symbol('preview-request');
    const controller = new AbortController();
    update(activeOwner, (state) => ({ ...state, status: 'running', error: null }));
    const promise = client.runPreview(input, controller.signal)
      .then((envelope) => {
        if (
          ownerRef.current !== activeOwner
          || inFlightRef.current?.marker !== marker
          || !envelopeMatches(input, envelope)
        ) {
          throw contextError();
        }
        const immutable = immutableClone(envelope);
        update(activeOwner, () => ({
          status: 'idle', envelope: immutable, error: null,
        }));
        return immutable;
      })
      .catch((error: unknown) => {
        const safe = asApiError(error);
        if (
          ownerRef.current === activeOwner
          && inFlightRef.current?.marker === marker
        ) {
          update(activeOwner, (state) => ({
            ...state, status: 'idle', error: safe,
          }));
        }
        throw safe;
      })
      .finally(() => {
        if (inFlightRef.current?.marker === marker) inFlightRef.current = null;
      });
    inFlightRef.current = {
      marker, ownerId: activeOwner, controller, promise,
    };
    return promise;
  }, [client, update]);

  const executeReference = useCallback(async () => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null || inFlightRef.current !== null) return;
    try {
      const reference = await queryClient.fetchQuery({
        queryKey: ['reference-example', activeOwner],
        queryFn: ({ signal }) => client.getReferenceExample(signal),
        staleTime: Infinity,
      });
      if (ownerRef.current !== activeOwner) return;
      await startRequest({
        api_version: '1.0.0',
        request_id: crypto.randomUUID(),
        study_id: crypto.randomUUID(),
        scenario_id: crypto.randomUUID(),
        scenario_revision: 1,
        cenario: immutableClone(reference.cenario),
        periodo: immutableClone(reference.periodo),
        proveniencia: immutableClone(reference.proveniencia),
      });
    } catch {
      // startRequest já publicou o erro seguro no contexto.
    }
  }, [client, queryClient, startRequest]);

  const restoreEnvelope = useCallback((envelope: PreviewEnvelope) => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null) return;
    if (!validatePreviewEnvelope(envelope)) {
      update(activeOwner, (state) => ({
        ...state,
        error: new ApiError({
          status: 0, code: 'RESPOSTA_INVALIDA',
          message: 'O resultado salvo é inválido.',
        }),
      }));
      return;
    }
    update(activeOwner, () => ({
      status: 'idle', envelope: immutableClone(envelope), error: null,
    }));
  }, [update]);

  const state = ownerId === null
    ? EMPTY_STATE
    : (statesRef.current.get(ownerId) ?? EMPTY_STATE);
  const value = useMemo<PreviewValue>(() => ({
    ...state,
    executeReference,
    executeRequest: startRequest,
    restoreEnvelope,
  }), [executeReference, restoreEnvelope, startRequest, state]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewValue {
  const value = useContext(PreviewContext);
  if (value === null) {
    throw new Error('usePreview deve ser usado dentro de PreviewProvider');
  }
  return value;
}
