// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatRequest, ChatResponse } from '../api/client';
import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import demoJson from '../demo/generated/demo-study.v1.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { validateProductHelpCatalog } from '../help/catalog';
import productHelp from '../../../servidor/catalogs/product_help.v1.json';
import type { ChatConversation } from './domain';
import { conversation } from './fixtures';
import { ChatProvider, useChat } from './ChatProvider';

async function setup(route: 'diagnostic' | 'presentation' | 'replay') {
  const demo = demoJson as unknown as DemoStudyPackageV1;
  const study = demo.study;
  const execution = study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')!;
  const input = { study, scenarioId: execution.scenarioId, diagnosticExecutionId: execution.id,
    comparisonExecutionId: null, replay: route === 'replay' ? demo.replays[execution.scenarioId]! : null,
    replayDay: route === 'replay' ? 31 : null };
  const document = await buildCommunicationDocument(input);
  let current = conversation({ studyId: study.id, messages: [] });
  const repository = {
    deleteChatConversation: async () => undefined,
    listChatConversations: async () => [current],
    getChatConversation: async () => current,
    saveChatConversation: async ({ document }: { document: ChatConversation }) => { current = document; return current; },
  };
  const sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({
    apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE', answer: 'Resposta',
    citations: [], contextFingerprint: request.context?.document.contextFingerprint ?? null, limitationCodes: [],
  }));
  let state!: ReturnType<typeof useChat>;
  function Probe() { state = useChat(); return null; }
  const path = route === 'replay' ? `replay?executionId=${execution.id}&day=31`
    : route === 'presentation' ? `apresentacao?cenario=${execution.scenarioId}&execucao=${execution.id}`
      : `diagnostico?scenarioId=${execution.scenarioId}&executionId=${execution.id}`;
  render(<MemoryRouter initialEntries={[`/estudos/${study.id}/${path}`]}>
    <ChatProvider ownerSub="owner-a" repository={repository} client={{ sendChatMessage }}
      catalog={validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!}>
      <Probe />
    </ChatProvider>
  </MemoryRouter>);
  await waitFor(() => expect(state.loading).toBe(false));
  if (route === 'replay') act(() => state.setScenarioId(execution.scenarioId));
  return { get state() { return state; }, input, document, sendChatMessage };
}

describe('selected execution chat readiness', () => {
  it.each(['diagnostic', 'presentation', 'replay'] as const)('waits for matching publication on %s and invalidates it after selection changes', async (route) => {
    const chat = await setup(route);
    expect(chat.state.canSend).toBe(false);
    act(() => chat.state.publishCommunication(chat.input, chat.document));
    await waitFor(() => expect(chat.state.canSend).toBe(true));
    await act(() => chat.state.send('Explique a seleção.'));
    expect(chat.sendChatMessage).toHaveBeenCalledOnce();
    expect(chat.sendChatMessage.mock.calls[0]![0].context?.kind).toBe('STUDY');
    if (route === 'replay') act(() => chat.state.setReplayDay(32));
    else act(() => chat.state.setDiagnosticExecutionId('outra-execucao'));
    expect(chat.state.canSend).toBe(false);
  });

  it('rejects direct send before publication without persisting or dispatching a message', async () => {
    const chat = await setup('replay');
    await act(async () => {
      await expect(chat.state.send('Explique o dia.')).rejects.toThrow('Chat indisponível neste contexto.');
    });
    expect(chat.sendChatMessage).not.toHaveBeenCalled();
    expect(chat.state.activeConversation?.messages).toHaveLength(0);
  });
});
