import type { ApiClient, ChatRequest, ChatResponse } from '../api/client';
import type { CommunicationDocumentV1 } from '../communication/domain';
import type { ProductHelpCatalogV1 } from '../help/catalog';
import type { ApplicationRepository } from '../storage/applicationRepository';
import type { ChatConversation, ChatMessage } from './domain';
import type { RouteChatContext } from './routeContext';

type ChatRepository = Pick<ApplicationRepository, 'saveChatConversation'>;
type ChatClient = Pick<ApiClient, 'sendChatMessage'>;

function now(): string { return new Date().toISOString(); }
function update(document: ChatConversation, messages: readonly ChatMessage[]): ChatConversation {
  return { ...document, revision: document.revision + 1, updatedAt: now(), messages };
}
function validResponse(response: ChatResponse, request: ChatRequest, catalog: ProductHelpCatalogV1): boolean {
  if (response.messageId !== request.messageId
    || response.contextFingerprint !== (request.communication?.contextFingerprint ?? null)) return false;
  const doc = request.communication;
  const metrics = doc === null ? [] : [...doc.executiveMetrics, ...[
    doc.composition, doc.mechanism, doc.economics, doc.robustness, doc.comparison, doc.replaySnapshot,
  ].filter((item): item is NonNullable<typeof item> => item !== null).flatMap((item) => item.metrics)];
  const known = {
    HELP: new Set<string>(catalog.items.map((item) => item.id)),
    METRIC: new Set(metrics.map((item) => item.code)),
    EVIDENCE: new Set(Object.keys(doc?.evidenceIndex ?? {})),
    LIMITATION: new Set(doc?.limitations.map((item) => item.code) ?? []),
  };
  return response.citations.every((citation) => known[citation.kind].has(citation.id))
    && response.limitationCodes.every((code) => code === 'INSUFFICIENT_EVIDENCE' || known.LIMITATION.has(code));
}

/** One active call per conversation. On retry, the prior USER stays and only FAILED is replaced. */
export async function sendChatMessage(input: Readonly<{
  repository: ChatRepository;
  client: ChatClient;
  conversation: ChatConversation;
  question: string;
  routeContext: RouteChatContext;
  communication: CommunicationDocumentV1 | null;
  catalog: ProductHelpCatalogV1;
  retryAssistantId?: string;
  signal?: AbortSignal;
  onSaved?(document: ChatConversation): void;
}>): Promise<ChatConversation> {
  const snapshot = structuredClone(input.conversation);
  if (snapshot.studyId !== input.routeContext.studyId) throw new Error('Conversa pertence a outro Estudo.');
  const retryIndex = input.retryAssistantId === undefined ? -1
    : snapshot.messages.findIndex((item) => item.id === input.retryAssistantId);
  let question = input.question.trim();
  if (input.retryAssistantId !== undefined) {
    const failed = snapshot.messages[retryIndex];
    const user = snapshot.messages[retryIndex - 1];
    if (failed?.role !== 'ASSISTANT' || failed.status !== 'FAILED' || user?.role !== 'USER'
      || retryIndex !== snapshot.messages.length - 1) throw new Error('Resposta não pode ser repetida.');
    question = user.text;
  }
  if (question.length === 0 || question.length > 4000 || (retryIndex < 0 && snapshot.messages.length > 98)
    || snapshot.messages.some((item) => item.status === 'PENDING')) throw new Error('Pergunta ou conversa inválida.');
  const fingerprint = input.communication?.contextFingerprint ?? null;
  const answerId = crypto.randomUUID();
  const pending: ChatMessage = { id: answerId, role: 'ASSISTANT', text: '', status: 'PENDING',
    classification: null, citations: [], contextFingerprint: fingerprint, createdAt: now() };
  const user: ChatMessage = { id: crypto.randomUUID(), role: 'USER', text: question, status: 'SUCCEEDED',
    classification: null, citations: [], contextFingerprint: fingerprint, createdAt: now() };
  const previous = retryIndex < 0 ? snapshot.messages : snapshot.messages.slice(0, retryIndex);
  const messages = retryIndex < 0 ? [...previous, user, pending] : [...previous, pending];
  const persisted = await input.repository.saveChatConversation({ document: update(snapshot, messages),
    expectedRevision: snapshot.revision, operationId: crypto.randomUUID() });
  input.onSaved?.(persisted);
  const history = previous.slice(0, retryIndex < 0 ? undefined : -1)
    .filter((item) => item.status === 'SUCCEEDED' && item.text.length > 0)
    .slice(-98).map((item) => ({ role: item.role, text: item.text, contextFingerprint: item.contextFingerprint }));
  const request: ChatRequest = { apiVersion: '1.0.0', conversationId: snapshot.id, messageId: answerId,
    message: question, routeContext: structuredClone(input.routeContext),
    communication: input.communication === null ? null : structuredClone(input.communication) as ChatRequest['communication'],
    history };
  try {
    if (input.signal?.aborted) throw new Error('Envio cancelado.');
    const response = await input.client.sendChatMessage(request, input.signal);
    if (input.signal?.aborted) throw new Error('Envio cancelado.');
    if (!validResponse(response, request, input.catalog)) throw new Error('Resposta do chat sem referências válidas.');
    const final = await input.repository.saveChatConversation({ expectedRevision: persisted.revision,
      operationId: crypto.randomUUID(), document: update(persisted, persisted.messages.map((item) => item.id === answerId
        ? { ...item, text: response.answer, status: 'SUCCEEDED', classification: response.classification,
          citations: response.citations } : item)) });
    input.onSaved?.(final);
    return final;
  } catch (error) {
    try {
      const failed = await input.repository.saveChatConversation({ expectedRevision: persisted.revision,
        operationId: crypto.randomUUID(), document: update(persisted, persisted.messages.map((item) => item.id === answerId
          ? { ...item, status: 'FAILED' } : item)) });
      input.onSaved?.(failed);
    } catch { /* A competing CAS or closed session owns the current state. */ }
    throw error;
  }
}
