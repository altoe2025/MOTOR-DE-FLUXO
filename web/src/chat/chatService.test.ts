import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ChatRequest, ChatResponse } from '../api/client';
import productHelp from '../../../servidor/catalogs/product_help.v1.json';
import { validateProductHelpCatalog } from '../help/catalog';
import { conversation, message } from './fixtures';
import { sendChatMessage } from './chatService';
import type { ChatConversation } from './domain';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
const routeContext = { routeId: 'studies', helpId: null, studyId: null, scenarioId: null,
  diagnosticExecutionId: null, replayDay: null };

function fixture(initial = conversation({ messages: [] })) {
  let current = initial;
  const saved: ChatConversation[] = [];
  const repository = { saveChatConversation: vi.fn(async ({ document, expectedRevision }: {
    document: ChatConversation; expectedRevision: number; operationId: string;
  }) => {
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    current = structuredClone(document); saved.push(current); return current;
  }) };
  const send = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({
    apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE',
    answer: 'Ajuda publicada', citations: [{ kind: 'HELP', id: 'page.chat' }],
    contextFingerprint: null, limitationCodes: [],
  }));
  return { repository, client: { sendChatMessage: send } as Pick<ApiClient, 'sendChatMessage'>,
    get current() { return current; }, saved };
}

describe('chat send lifecycle', () => {
  it('persists USER and PENDING before transport then replaces PENDING by CAS', async () => {
    const state = fixture();
    const completed = await sendChatMessage({ repository: state.repository, client: state.client,
      conversation: state.current, question: 'Como funciona?', routeContext, communication: null, catalog,
      onSaved: () => undefined });
    expect(state.saved.map((row) => row.messages.at(-1)?.status)).toEqual(['PENDING', 'SUCCEEDED']);
    expect(completed.messages.map((item) => item.role)).toEqual(['USER', 'ASSISTANT']);
    expect(state.saved[0]?.messages[0]?.text).toBe('Como funciona?');
    expect(state.saved[0]?.messages.at(-1)?.status).toBe('PENDING');
  });

  it('fails closed on a citation absent from the current catalog', async () => {
    const state = fixture();
    state.client.sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({ apiVersion: '1.0.0',
      messageId: request.messageId, classification: 'IN_SCOPE', answer: 'Inválida',
      citations: [{ kind: 'HELP', id: 'missing' }], contextFingerprint: null, limitationCodes: [],
    }));
    await expect(sendChatMessage({ repository: state.repository, client: state.client,
      conversation: state.current, question: 'Ajuda', routeContext, communication: null, catalog })).rejects.toThrow();
    expect(state.current.messages.at(-1)?.status).toBe('FAILED');
    expect(state.current.messages.at(-1)?.text).toBe('');
  });

  it('keeps a canceled request retryable even if the transport resolves after abort', async () => {
    const state = fixture();
    const controller = new AbortController();
    state.client.sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => {
      controller.abort();
      return { apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE',
        answer: 'Late', citations: [], contextFingerprint: null, limitationCodes: [] };
    });
    await expect(sendChatMessage({ repository: state.repository, client: state.client,
      conversation: state.current, question: 'Pergunta', routeContext, communication: null, catalog,
      signal: controller.signal })).rejects.toThrow();
    expect(state.current.messages.at(-1)?.status).toBe('FAILED');
  });

  it('retries one failed answer with the original question and a fresh message ID', async () => {
    const original = conversation({ revision: 1, messages: [message({ id: 'user-1', text: 'Pergunta original' }),
      message({ id: 'failed-1', role: 'ASSISTANT', text: '', status: 'FAILED' })] });
    const state = fixture(original);
    const result = await sendChatMessage({ repository: state.repository, client: state.client,
      conversation: original, retryAssistantId: 'failed-1', question: '', routeContext, communication: null, catalog });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.text).toBe('Pergunta original');
    expect(result.messages[1]?.id).not.toBe('failed-1');
  });
});
