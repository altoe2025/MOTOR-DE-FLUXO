// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ChatRequest, ChatResponse } from '../../api/client';
import productHelp from '../../../../servidor/catalogs/product_help.v1.json';
import { AskAboutThis } from '../../help/AskAboutThis';
import { HELP_IDS } from '../../help/helpIds';
import { validateProductHelpCatalog } from '../../help/catalog';
import { ChatProvider } from '../ChatProvider';
import { ChatPanel } from './ChatPanel';
import type { ChatConversation } from '../domain';
import { observedInput } from '../../communication/testFixtures';
import { useChat } from '../ChatProvider';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;

function setup(deferCreate = false) {
  let current: ChatConversation | null = null;
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const repository = {
    listChatConversations: vi.fn(async () => current === null ? [] : [current]),
    getChatConversation: vi.fn(async () => current),
    saveChatConversation: vi.fn(async ({ document, expectedRevision }: { document: ChatConversation; expectedRevision: number }) => {
      if (deferCreate && expectedRevision === 0) await createGate;
      if ((current?.revision ?? 0) !== expectedRevision) throw new Error('CAS');
      current = structuredClone(document); return current;
    }),
  };
  const sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({
    apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE', answer: 'Ajuda do produto',
    citations: [{ kind: 'HELP', id: HELP_IDS.IMPORT_PAGE }], contextFingerprint: null, limitationCodes: [],
  }));
  render(<MemoryRouter initialEntries={['/estudos']}><ChatProvider ownerSub="owner-a" repository={repository}
    client={{ sendChatMessage }} catalog={catalog}>
    <AskAboutThis helpId={HELP_IDS.REPLAY} />
    <ChatPanel />
  </ChatProvider></MemoryRouter>);
  return { repository, sendChatMessage, releaseCreate, get current() { return current; } };
}

describe('chat panel send', () => {
  it('marks a sent answer as earlier context when selection changes on the same URL', async () => {
    const input = await observedInput();
    const user = userEvent.setup();
    let current: ChatConversation | null = null;
    const repository = {
      listChatConversations: async () => current === null ? [] : [current],
      getChatConversation: async () => current,
      saveChatConversation: async ({ document, expectedRevision }: { document: ChatConversation; expectedRevision: number }) => {
        if ((current?.revision ?? 0) !== expectedRevision) throw new Error('CAS');
        current = structuredClone(document); return current;
      },
    };
    function Selection() {
      const chat = useChat();
      return <><button onClick={() => chat.publishCommunication(input)}>Publicar contexto</button>
        <button onClick={() => chat.askAbout(HELP_IDS.COMPARISON_PAGE, 'SAVINGS_BRL')}>Perguntar métrica</button>
        <button onClick={() => chat.setDiagnosticExecutionId('outra-execucao')}>Mudar execução</button></>;
    }
    const sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({
      apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE', answer: 'Resposta citada',
      citations: [{ kind: 'METRIC', id: 'SAVINGS_BRL' }],
      contextFingerprint: request.communication?.contextFingerprint ?? null, limitationCodes: [],
    }));
    render(<MemoryRouter initialEntries={[`/estudos/${input.study.id}/diagnostico?scenarioId=${input.scenarioId}&executionId=${input.diagnosticExecutionId}`]}>
      <ChatProvider ownerSub="owner-a" repository={repository} client={{ sendChatMessage }} catalog={catalog}>
        <Selection /><ChatPanel />
      </ChatProvider>
    </MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Publicar contexto' }));
    await user.click(screen.getByRole('button', { name: 'Perguntar métrica' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled());
    await user.type(screen.getByRole('textbox', { name: 'Sua pergunta' }), 'Qual economia?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByText('Resposta citada', { selector: '.chat-message p' })).toBeVisible());
    expect(screen.queryByText('Contexto anterior')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mudar execução' }));
    expect(screen.getByText('Contexto anterior')).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Economia simulada' })).toHaveAttribute('href',
      expect.stringContaining(`executionId=${input.diagnosticExecutionId}`));
  });
  it('does not accept a question before its conversation is persisted', async () => {
    const user = userEvent.setup(); const state = setup(true);
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeDisabled();
    state.releaseCreate?.();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled());
  });

  it('opens from canonical help and focuses the contextual composer', async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar sobre isto' }));
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveFocus();
    expect(screen.getByText('Contexto: Replay', { selector: '.chat-context-label' })).toBeVisible();
    expect(screen.queryByText('Contexto anterior')).not.toBeInTheDocument();
  });

  it('sends after disclosure and renders a navigable help citation', async () => {
    const user = userEvent.setup(); const state = setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    await user.type(screen.getByRole('textbox', { name: 'Sua pergunta' }), 'Como funciona o Replay?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(state.current?.messages.at(-1)?.status).toBe('SUCCEEDED'));
    expect(screen.getByRole('link', { name: /Importação/ })).toHaveAttribute('href', '/importar');
    expect(screen.getByText('Ajuda do produto', { selector: '.chat-message p' })).toBeVisible();
    expect(state.sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Como funciona o Replay?', communication: null,
    }), expect.any(AbortSignal));
  });
});
