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

type PreviewStatus = 'idle' | 'running';

type PreviewValue = {
  status: PreviewStatus;
  envelope: PreviewEnvelope | null;
  error: ApiError | null;
  executeReference(): Promise<void>;
};

type StoredState = Omit<PreviewValue, 'executeReference'>;
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
      if (
        envelope.request_id !== request.request_id
        || envelope.study_id !== request.study_id
        || envelope.scenario_id !== request.scenario_id
        || envelope.scenario_revision !== request.scenario_revision
      ) {
        throw contextError();
      }
      update(activeOwner, () => ({ status: 'idle', envelope: immutableClone(envelope), error: null }));
    } catch (error) {
      if (ownerRef.current === activeOwner && inFlightRef.current?.marker === marker) {
        update(activeOwner, (state) => ({ ...state, status: 'idle', error: asApiError(error) }));
      }
    } finally {
      if (inFlightRef.current?.marker === marker) inFlightRef.current = null;
    }
  }, [client, mutation, queryClient, update]);

  const state = ownerId === null ? EMPTY_STATE : (statesRef.current.get(ownerId) ?? EMPTY_STATE);
  const value = useMemo<PreviewValue>(() => ({ ...state, executeReference }), [executeReference, state]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewValue {
  const value = useContext(PreviewContext);
  if (value === null) throw new Error('usePreview deve ser usado dentro de PreviewProvider');
  return value;
}
