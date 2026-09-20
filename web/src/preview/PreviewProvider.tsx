import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ApiClient, PreviaRequest, PreviewEnvelope } from '../api/client';
import { ApiError } from '../api/errors';
import { validatePreviewEnvelope } from '../api/validators';
import { canonical } from '../study/fingerprints';

type PreviewStatus = 'idle' | 'running';

type PreviewValue = {
  status: PreviewStatus;
  envelope: PreviewEnvelope | null;
  error: ApiError | null;
  executeReference(): Promise<void>;
  executeRequest(input: PreviaRequest): Promise<PreviewEnvelope>;
  restoreEnvelope(input: PreviaRequest, envelope: PreviewEnvelope, expectedExecutionId?: string): void;
};

type StoredState = Pick<PreviewValue, 'status' | 'envelope' | 'error'>;
type InFlight = { marker: symbol; ownerId: string; controller: AbortController };

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
    status: 0,
    code: 'CONTEXTO_DIVERGENTE',
    message: 'A resposta pertence a outra execução e foi descartada.',
  });
}

function assertCompatibleEnvelope(
  input: PreviaRequest,
  envelope: PreviewEnvelope,
  expectedExecutionId?: string,
): void {
  if (!validatePreviewEnvelope(envelope)
    || envelope.api_version !== input.api_version
    || envelope.request_id !== input.request_id
    || envelope.study_id !== input.study_id
    || envelope.scenario_id !== input.scenario_id
    || envelope.scenario_revision !== input.scenario_revision
    || (expectedExecutionId !== undefined && envelope.execution_id !== expectedExecutionId)
    || canonical(envelope.input_snapshot) !== canonical({
      cenario: input.cenario,
      periodo: input.periodo,
      proveniencia: input.proveniencia,
    })) {
    throw contextError();
  }
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError({ status: 0, code: 'ERRO_INESPERADO', message: 'Não foi possível concluir a execução.' });
}

export function PreviewProvider({
  client,
  ownerId,
  children,
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
  const mutation = useMutation({
    mutationFn: ({ input, signal }: { input: PreviaRequest; signal: AbortSignal }) => client.runPreview(input, signal),
    retry: false,
  });

  const update = useCallback((targetOwner: string, next: (current: StoredState) => StoredState) => {
    statesRef.current.set(targetOwner, next(statesRef.current.get(targetOwner) ?? EMPTY_STATE));
    if (ownerRef.current === targetOwner) render((version) => version + 1);
  }, []);

  useEffect(() => () => {
    const active = inFlightRef.current;
    if (active?.ownerId === ownerId) {
      active.controller.abort();
      inFlightRef.current = null;
      if (ownerId !== null) update(ownerId, (state) => ({ ...state, status: 'idle' }));
    }
  }, [ownerId, update]);

  const executeReference = useCallback(async () => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null || inFlightRef.current !== null) return;

    const marker = Symbol('preview-request');
    const controller = new AbortController();
    inFlightRef.current = { marker, ownerId: activeOwner, controller };
    update(activeOwner, (state) => ({ ...state, status: 'running', error: null }));

    try {
      const reference = await queryClient.fetchQuery({
        queryKey: ['reference-example', activeOwner],
        queryFn: ({ signal }) => client.getReferenceExample(signal),
        staleTime: Infinity,
      });
      if (ownerRef.current !== activeOwner || inFlightRef.current?.marker !== marker) return;

      const request: PreviaRequest = {
        api_version: '1.0.0',
        request_id: crypto.randomUUID(),
        study_id: crypto.randomUUID(),
        scenario_id: crypto.randomUUID(),
        scenario_revision: 1,
        cenario: immutableClone(reference.cenario),
        periodo: immutableClone(reference.periodo),
        proveniencia: immutableClone(reference.proveniencia),
      };
      const envelope = await mutation.mutateAsync({ input: request, signal: controller.signal });
      if (ownerRef.current !== activeOwner || inFlightRef.current?.marker !== marker) return;
      assertCompatibleEnvelope(request, envelope);
      update(activeOwner, () => ({ status: 'idle', envelope: immutableClone(envelope), error: null }));
    } catch (error) {
      if (ownerRef.current === activeOwner && inFlightRef.current?.marker === marker) {
        update(activeOwner, (state) => ({ ...state, status: 'idle', error: asApiError(error) }));
      }
    } finally {
      if (inFlightRef.current?.marker === marker) inFlightRef.current = null;
    }
  }, [client, mutation, queryClient, update]);

  const executeRequest = useCallback(async (
    input: PreviaRequest,
  ): Promise<PreviewEnvelope> => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null) throw contextError();
    if (inFlightRef.current !== null) {
      throw new ApiError({ status: 0, code: 'EXECUCAO_EM_ANDAMENTO', message: 'Já existe uma execução em andamento.' });
    }
    const marker = Symbol('preview-request');
    const controller = new AbortController();
    inFlightRef.current = { marker, ownerId: activeOwner, controller };
    update(activeOwner, (state) => ({ ...state, status: 'running', error: null }));
    try {
      const envelope = await mutation.mutateAsync({ input: immutableClone(input), signal: controller.signal });
      if (ownerRef.current !== activeOwner || inFlightRef.current?.marker !== marker) throw contextError();
      assertCompatibleEnvelope(input, envelope);
      const restored = immutableClone(envelope);
      update(activeOwner, () => ({ status: 'idle', envelope: restored, error: null }));
      return restored;
    } catch (error) {
      const apiError = asApiError(error);
      if (ownerRef.current === activeOwner && inFlightRef.current?.marker === marker) {
        update(activeOwner, (state) => ({ ...state, status: 'idle', error: apiError }));
      }
      throw apiError;
    } finally {
      if (inFlightRef.current?.marker === marker) inFlightRef.current = null;
    }
  }, [mutation, update]);

  const restoreEnvelope = useCallback((
    input: PreviaRequest,
    envelope: PreviewEnvelope,
    expectedExecutionId?: string,
  ): void => {
    const activeOwner = ownerRef.current;
    if (activeOwner === null) throw contextError();
    assertCompatibleEnvelope(input, envelope, expectedExecutionId);
    update(activeOwner, () => ({ status: 'idle', envelope: immutableClone(envelope), error: null }));
  }, [update]);

  const state = ownerId === null ? EMPTY_STATE : (statesRef.current.get(ownerId) ?? EMPTY_STATE);
  const value = useMemo<PreviewValue>(() => ({
    ...state,
    executeReference,
    executeRequest,
    restoreEnvelope,
  }), [executeReference, executeRequest, restoreEnvelope, state]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewValue {
  const value = useContext(PreviewContext);
  if (value === null) throw new Error('usePreview deve ser usado dentro de PreviewProvider');
  return value;
}
