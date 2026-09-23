import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import type { ApplicationRepository } from '../storage/applicationRepository';
import type { ChatConversation } from './domain';
import { recoverInterruptedConversation } from './repository';
import { routeChatContext, type RouteChatContext } from './routeContext';

type ChatRepository = Pick<ApplicationRepository, 'listChatConversations' | 'getChatConversation' | 'saveChatConversation'>;
type ChatState = Readonly<{
  routeContext: RouteChatContext | null;
  contextFingerprint: string | null;
  conversations: readonly ChatConversation[];
  activeConversation: ChatConversation | null;
  error: boolean;
  loading: boolean;
  open: boolean;
  show(): void;
  hide(): void;
  selectConversation(id: string): void;
  newConversation(): Promise<void>;
  beginRequest(): AbortSignal;
  setHelpId(helpId: string | null): void;
  setReplayDay(day: number | null): void;
  setDiagnosticExecutionId(id: string | null): void;
  setScenarioId(id: string | null): void;
}>;
const Context = createContext<ChatState | null>(null);

export function useChat(): ChatState {
  const value = useContext(Context);
  if (value === null) throw new Error('useChat requer ChatProvider');
  return value;
}

export function useOptionalChat(): ChatState | null { return useContext(Context); }

export function ChatProvider({ ownerSub, repository, children }: Readonly<{
  ownerSub: string;
  repository: ChatRepository;
  children: ReactNode;
}>) {
  const location = useLocation();
  const routeKey = location.pathname + location.search;
  const baseContext = useMemo(() => routeChatContext(routeKey), [routeKey]);
  const [selection, setSelection] = useState<{ routeKey: string; helpId: string | null; replayDay: number | null | undefined;
    executionId: string | null | undefined; scenarioId: string | null | undefined }>({
    routeKey, helpId: null, replayDay: undefined, executionId: undefined, scenarioId: undefined,
  });
  const routeContext = useMemo(() => baseContext === null ? null : {
    ...baseContext,
    helpId: selection.routeKey === routeKey ? selection.helpId : null,
    replayDay: baseContext.routeId === 'replay' && selection.routeKey === routeKey && selection.replayDay !== undefined
      ? selection.replayDay : baseContext.replayDay,
    diagnosticExecutionId: selection.routeKey === routeKey && selection.executionId !== undefined
      ? selection.executionId : baseContext.diagnosticExecutionId,
    scenarioId: selection.routeKey === routeKey && selection.scenarioId !== undefined
      ? selection.scenarioId : baseContext.scenarioId,
  }, [baseContext, routeKey, selection]);
  const contextFingerprint = routeContext === null ? null : JSON.stringify(routeContext);
  const routeAvailable = routeContext !== null;
  const studyId = routeContext?.studyId ?? null;
  const scope = JSON.stringify([ownerSub, studyId]);
  const [conversations, setConversations] = useState<readonly ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestConversationId = useRef<string | null>(null);
  const creating = useRef(false);
  const recovering = useRef(new Set<string>());
  const reopenPending = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    setConversations([]);
    setActiveId(null);
    setError(false);
    setLoading(true);
    setLoadedScope(null);
    creating.current = false;
    recovering.current.clear();
    reopenPending.current.clear();
    if (!routeAvailable) return;
    void repository.listChatConversations(studyId).then((rows) => {
      if (generation.current !== currentGeneration) return;
      const owned = rows.filter((row) => row.ownerSub === ownerSub && row.studyId === studyId);
      reopenPending.current = new Set(owned.filter((row) => row.messages.some((item) => item.status === 'PENDING'))
        .map((row) => `${row.id}:${row.revision}`));
      setConversations(owned);
      setActiveId(owned[0]?.id ?? null);
      setLoading(false);
      setLoadedScope(scope);
    }).catch(() => {
      if (generation.current === currentGeneration) { setError(true); setLoading(false); }
    });
    return () => { generation.current += 1; request.current?.abort(); requestConversationId.current = null; };
  }, [ownerSub, repository, routeAvailable, scope, studyId]);

  useEffect(() => () => { request.current?.abort(); }, []);

  const newConversation = useCallback(async () => {
    if (routeContext === null || creating.current) return;
    creating.current = true;
    const now = new Date().toISOString();
    const document: ChatConversation = {
      schemaVersion: '1.0.0', id: crypto.randomUUID(), ownerSub, studyId,
      title: studyId === null ? 'Produto' : 'Estudo', messages: [], revision: 1,
      createdAt: now, updatedAt: now,
    };
    const currentGeneration = generation.current;
    try {
      const saved = await repository.saveChatConversation({ document, expectedRevision: 0, operationId: crypto.randomUUID() });
      if (generation.current !== currentGeneration) return;
      setConversations((rows) => [saved, ...rows]);
      setActiveId(saved.id);
    } catch {
      if (generation.current === currentGeneration) setError(true);
    } finally { creating.current = false; }
  }, [ownerSub, repository, routeContext, studyId]);

  useEffect(() => {
    if (open && !loading && loadedScope === scope && !error && conversations.length === 0) void newConversation();
  }, [open, loading, loadedScope, scope, error, conversations.length, newConversation]);

  const beginRequest = useCallback(() => {
    request.current?.abort();
    request.current = new AbortController();
    requestConversationId.current = activeId;
    return request.current.signal;
  }, [activeId]);
  const setHelpId = useCallback((helpId: string | null) => setSelection((current) => ({
    routeKey, helpId, replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setReplayDay = useCallback((day: number | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: day !== null && Number.isSafeInteger(day) && day >= 0 ? day : null,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setDiagnosticExecutionId = useCallback((id: string | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: id,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setScenarioId = useCallback((id: string | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    scenarioId: id,
  })), [routeKey]);
  const visibleConversations = conversations.filter((row) => row.ownerSub === ownerSub && row.studyId === studyId);
  const activeConversation = visibleConversations.find((row) => row.id === activeId) ?? null;
  useEffect(() => {
    if (!open || activeConversation === null || !activeConversation.messages.some((item) => item.status === 'PENDING')) return;
    if (requestConversationId.current === activeConversation.id
      && request.current !== null && !request.current.signal.aborted) return;
    const key = `${activeConversation.id}:${activeConversation.revision}`;
    if (!reopenPending.current.has(key) || recovering.current.has(key)) return;
    reopenPending.current.delete(key);
    recovering.current.add(key);
    const currentGeneration = generation.current;
    const applyRecovered = (document: ChatConversation) => {
      if (generation.current !== currentGeneration || document.ownerSub !== ownerSub || document.studyId !== studyId) return;
      setConversations((rows) => rows.map((row) => row.id === document.id && row.revision <= document.revision ? document : row));
    };
    void recoverInterruptedConversation(repository, activeConversation, crypto.randomUUID(), new Date().toISOString())
      .then(applyRecovered).catch(async () => {
        try {
          const current = await repository.getChatConversation(activeConversation.id);
          if (current !== null) applyRecovered(current);
        } catch {
          if (generation.current === currentGeneration) setError(true);
        }
      });
  }, [activeConversation, open, ownerSub, repository, studyId]);
  const value: ChatState = { routeContext, contextFingerprint, conversations: visibleConversations, activeConversation,
    error, loading, open, show: () => setOpen(true), hide: () => setOpen(false),
    selectConversation: setActiveId, newConversation, beginRequest,
    setHelpId, setReplayDay, setDiagnosticExecutionId, setScenarioId,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
