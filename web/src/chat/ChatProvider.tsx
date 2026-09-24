import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import type { ApplicationRepository } from '../storage/applicationRepository';
import type { ApiClient } from '../api/client';
import { buildCommunicationDocument, type CommunicationInput } from '../communication/buildCommunicationDocument';
import type { CommunicationDocumentV1 } from '../communication/domain';
import type { ProductHelpCatalogV1 } from '../help/catalog';
import type { HelpId } from '../help/helpIds';
import { sendChatMessage } from './chatService';
import { communicationMatchesRoute, selectChatContext, type ChatIntent } from './contextFragment';
import type { ChatConversation } from './domain';
import { recoverInterruptedConversation } from './repository';
import { routeChatContext, type RouteChatContext } from './routeContext';

type ChatRepository = Pick<ApplicationRepository, 'listChatConversations' | 'getChatConversation' | 'saveChatConversation' | 'deleteChatConversation'>;
type ChatState = Readonly<{
  routeContext: RouteChatContext | null;
  contextFingerprint: string | null;
  conversations: readonly ChatConversation[];
  activeConversation: ChatConversation | null;
  error: boolean;
  loading: boolean;
  open: boolean;
  busy: boolean;
  canSend: boolean;
  managing: boolean;
  actionError: string | null;
  conversationLimitReached: boolean;
  messageLimitReached: boolean;
  catalog: ProductHelpCatalogV1 | null;
  communication: CommunicationDocumentV1 | null;
  sentContext: CommunicationDocumentV1 | null;
  focusComposerToken: number;
  intent: ChatIntent | null;
  show(): void;
  hide(): void;
  selectConversation(id: string): void;
  newConversation(): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  beginRequest(): AbortSignal;
  send(question: string, retryAssistantId?: string): Promise<void>;
  cancel(): void;
  askAbout(helpId: HelpId, metricId?: string, contextKind?: 'REPLAY' | 'REPETITION' | 'LIMITATIONS' | 'COMPARISON'): void;
  publishCommunication(input: CommunicationInput | null): void;
  setHelpId(helpId: string | null): void;
  setReplayDay(day: number | null): void;
  setDiagnosticExecutionId(id: string | null): void;
  setComparisonExecutionId(id: string | null): void;
  setScenarioId(id: string | null): void;
}>;
const Context = createContext<ChatState | null>(null);

export function useChat(): ChatState {
  const value = useContext(Context);
  if (value === null) throw new Error('useChat requer ChatProvider');
  return value;
}

export function useOptionalChat(): ChatState | null { return useContext(Context); }

export function ChatProvider({ ownerSub, repository, client, catalog = null, children }: Readonly<{
  ownerSub: string;
  repository: ChatRepository;
  client?: Pick<ApiClient, 'sendChatMessage'>;
  catalog?: ProductHelpCatalogV1 | null;
  children: ReactNode;
}>) {
  const location = useLocation();
  const routeKey = location.pathname + location.search;
  const baseContext = useMemo(() => routeChatContext(routeKey), [routeKey]);
  const [selection, setSelection] = useState<{ routeKey: string; helpId: string | null; replayDay: number | null | undefined;
    executionId: string | null | undefined; comparisonExecutionId: string | null | undefined;
    scenarioId: string | null | undefined }>({
    routeKey, helpId: null, replayDay: undefined, executionId: undefined, comparisonExecutionId: undefined,
    scenarioId: undefined,
  });
  const routeContext = useMemo(() => baseContext === null ? null : {
    ...baseContext,
    helpId: selection.routeKey === routeKey ? selection.helpId : null,
    replayDay: (baseContext.routeId === 'replay' || baseContext.routeId === 'presentation')
      && selection.routeKey === routeKey && selection.replayDay !== undefined
      ? selection.replayDay : baseContext.replayDay,
    diagnosticExecutionId: selection.routeKey === routeKey && selection.executionId !== undefined
      ? selection.executionId : baseContext.diagnosticExecutionId,
    ...(baseContext.routeId === 'comparison' || baseContext.routeId === 'presentation' ? { comparisonExecutionId:
      selection.routeKey === routeKey && selection.comparisonExecutionId !== undefined
        ? selection.comparisonExecutionId : baseContext.comparisonExecutionId ?? null } : {}),
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [focusComposerToken, setFocusComposerToken] = useState(0);
  const [intent, setIntent] = useState<ChatIntent | null>(null);
  const [publication, setPublication] = useState<{ routeKey: string; document: CommunicationDocumentV1 } | null>(null);
  const [sentPublication, setSentPublication] = useState<{ routeKey: string; document: CommunicationDocumentV1 } | null>(null);
  const publicationToken = useRef(0);
  const routeKeyRef = useRef(routeKey);
  routeKeyRef.current = routeKey;
  const request = useRef<AbortController | null>(null);
  const requestConversationId = useRef<string | null>(null);
  const creating = useRef(false);
  const recovering = useRef(new Set<string>());
  const reopenPending = useRef(new Set<string>());
  const generation = useRef(0);
  const communication = publication?.routeKey === routeKey && communicationMatchesRoute(publication.document, routeContext)
    ? publication.document : null;
  const sentContext = sentPublication?.routeKey === routeKey ? sentPublication.document : null;
  const currentContextFingerprint = sentContext !== null && communicationMatchesRoute(sentContext, routeContext)
    ? sentContext.contextFingerprint : contextFingerprint;

  useEffect(() => {
    const currentGeneration = ++generation.current;
    setConversations([]);
    setActiveId(null);
    setError(false);
    setActionError(null);
    setManaging(false);
    setLoading(true);
    setLoadedScope(null);
    creating.current = false;
    recovering.current.clear();
    reopenPending.current.clear();
    setPublication(null);
    setSentPublication(null);
    setIntent(null);
    publicationToken.current += 1;
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

  const refreshConversations = useCallback(async (currentGeneration: number) => {
    const rows = await repository.listChatConversations(studyId);
    if (generation.current !== currentGeneration) return [];
    const owned = rows.filter((row) => row.ownerSub === ownerSub && row.studyId === studyId);
    setConversations(owned);
    setActiveId((id) => owned.some((row) => row.id === id) ? id : owned[0]?.id ?? null);
    return owned;
  }, [ownerSub, repository, studyId]);

  const newConversation = useCallback(async () => {
    if (routeContext === null || creating.current || busyRef.current || loading || error
      || conversations.length >= 20) return;
    creating.current = true;
    setManaging(true);
    setActionError(null);
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
      if (generation.current !== currentGeneration) return;
      let quotaReached = false;
      try { quotaReached = (await refreshConversations(currentGeneration)).length >= 20; } catch { /* Keep the readable history. */ }
      if (generation.current === currentGeneration && !quotaReached) {
        setActionError('Não foi possível criar a conversa. Tente novamente.');
      }
    } finally {
      if (generation.current === currentGeneration) { creating.current = false; setManaging(false); }
    }
  }, [ownerSub, repository, routeContext, studyId, loading, error, conversations.length, refreshConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    const document = conversations.find((row) => row.id === id && row.ownerSub === ownerSub && row.studyId === studyId);
    if (document === undefined || creating.current || busyRef.current || loading || error) return;
    creating.current = true;
    setManaging(true);
    setActionError(null);
    const currentGeneration = generation.current;
    try {
      await repository.deleteChatConversation(document.id, document.revision, crypto.randomUUID());
      if (generation.current !== currentGeneration) return;
      setConversations((rows) => rows.filter((row) => row.id !== document.id));
      setActiveId((current) => current === document.id ? conversations.find((row) => row.id !== document.id)?.id ?? null : current);
    } catch {
      if (generation.current !== currentGeneration) return;
      try { await refreshConversations(currentGeneration); } catch { /* Keep the readable history. */ }
      if (generation.current === currentGeneration) {
        setActionError('Não foi possível excluir a conversa. Confira o histórico atualizado e tente novamente.');
      }
    } finally {
      if (generation.current === currentGeneration) { creating.current = false; setManaging(false); }
    }
  }, [conversations, ownerSub, studyId, loading, error, repository, refreshConversations]);

  useEffect(() => {
    if (open && !loading && loadedScope === scope && !error && actionError === null && conversations.length === 0) void newConversation();
  }, [open, loading, loadedScope, scope, error, actionError, conversations.length, newConversation]);

  const beginRequest = useCallback(() => {
    request.current?.abort();
    request.current = new AbortController();
    requestConversationId.current = activeId;
    return request.current.signal;
  }, [activeId]);
  const setHelpId = useCallback((helpId: string | null) => setSelection((current) => ({
    routeKey, helpId, replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    comparisonExecutionId: current.routeKey === routeKey ? current.comparisonExecutionId : undefined,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setReplayDay = useCallback((day: number | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: day !== null && Number.isSafeInteger(day) && day >= 0 ? day : null,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    comparisonExecutionId: current.routeKey === routeKey ? current.comparisonExecutionId : undefined,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setDiagnosticExecutionId = useCallback((id: string | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: id,
    comparisonExecutionId: current.routeKey === routeKey ? current.comparisonExecutionId : undefined,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setComparisonExecutionId = useCallback((id: string | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    comparisonExecutionId: id,
    scenarioId: current.routeKey === routeKey ? current.scenarioId : undefined,
  })), [routeKey]);
  const setScenarioId = useCallback((id: string | null) => setSelection((current) => ({
    routeKey, helpId: current.routeKey === routeKey ? current.helpId : null,
    replayDay: current.routeKey === routeKey ? current.replayDay : undefined,
    executionId: current.routeKey === routeKey ? current.executionId : undefined,
    comparisonExecutionId: current.routeKey === routeKey ? current.comparisonExecutionId : undefined,
    scenarioId: id,
  })), [routeKey]);
  const publishCommunication = useCallback((input: CommunicationInput | null) => {
    const token = ++publicationToken.current;
    setPublication(null);
    if (input === null) return;
    const selectedRoute = routeKey;
    void buildCommunicationDocument(input).then((document) => {
      if (publicationToken.current !== token || routeKeyRef.current !== selectedRoute) return;
      setPublication({ routeKey: selectedRoute, document });
    }).catch(() => { if (publicationToken.current === token) setPublication(null); });
  }, [routeKey]);
  const askAbout = useCallback((helpId: HelpId, metricId?: string, contextKind?: 'REPLAY' | 'REPETITION' | 'LIMITATIONS' | 'COMPARISON') => {
    setHelpId(helpId);
    setIntent(metricId !== undefined ? { kind: 'METRIC', id: metricId }
      : contextKind !== undefined ? { kind: contextKind } : { kind: 'HELP', id: helpId });
    setOpen(true);
    setFocusComposerToken((value) => value + 1);
  }, [setHelpId]);
  const visibleConversations = conversations.filter((row) => row.ownerSub === ownerSub && row.studyId === studyId);
  const activeConversation = visibleConversations.find((row) => row.id === activeId) ?? null;
  const messageLimitReached = activeConversation !== null && activeConversation.messages.length > 98;
  const cancel = useCallback(() => request.current?.abort(), []);
  const send = useCallback(async (question: string, retryAssistantId?: string) => {
    if (busyRef.current || creating.current || activeConversation === null || routeContext === null || catalog === null || client === undefined) {
      throw new Error('Chat indisponível neste contexto.');
    }
    busyRef.current = true; setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    requestConversationId.current = activeConversation.id;
    const currentGeneration = generation.current;
    const selectedScope = scope;
    const selectedRoute = routeKey;
    const selectedIntent: ChatIntent = intent ?? (routeContext.routeId === 'comparison' ? { kind: 'COMPARISON' }
      : routeContext.routeId === 'replay' ? { kind: 'REPLAY' } : { kind: 'BROAD' });
    const applySaved = (document: ChatConversation) => {
      if (generation.current !== currentGeneration || selectedScope !== scope
        || document.ownerSub !== ownerSub || document.studyId !== studyId) return;
      setConversations((rows) => rows.map((row) => row.id === document.id && row.revision <= document.revision ? document : row));
    };
    try {
      const fragment = await selectChatContext(communication, selectedIntent);
      if (controller.signal.aborted || generation.current !== currentGeneration) throw new Error('Envio cancelado.');
      if (fragment !== null && routeKeyRef.current === selectedRoute) setSentPublication({ routeKey: selectedRoute, document: fragment });
      await sendChatMessage({ repository, client, conversation: activeConversation, question,
        ...(retryAssistantId === undefined ? {} : { retryAssistantId }),
        routeContext, communication: fragment, catalog, signal: controller.signal, onSaved: applySaved });
      setIntent(null);
      setHelpId(null);
    } finally {
      if (request.current === controller) { request.current = null; requestConversationId.current = null; }
      busyRef.current = false; setBusy(false);
    }
  }, [activeConversation, catalog, client, communication, intent, ownerSub, repository, routeContext, routeKey, scope, studyId, setHelpId]);
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
  const value: ChatState = { routeContext, contextFingerprint: currentContextFingerprint, conversations: visibleConversations, activeConversation,
    error, loading, open, busy, managing, actionError, conversationLimitReached: visibleConversations.length >= 20, messageLimitReached,
    canSend: !loading && !error && !managing && !messageLimitReached && activeConversation !== null && client !== undefined && catalog !== null,
    catalog, communication, sentContext, focusComposerToken, intent,
    show: () => setOpen(true), hide: () => setOpen(false),
    selectConversation: setActiveId, newConversation, deleteConversation, beginRequest, send, cancel, askAbout, publishCommunication,
    setHelpId, setReplayDay, setDiagnosticExecutionId, setComparisonExecutionId, setScenarioId,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
