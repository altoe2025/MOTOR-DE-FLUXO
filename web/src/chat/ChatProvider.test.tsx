// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ChatConversation } from './domain';
import { conversation, message } from './fixtures';
import { ChatProvider, useChat } from './ChatProvider';
import { ChatPanel } from './components/ChatPanel';
import { DefinitionTooltip } from '../ui/DefinitionTooltip';
import { buildBoardChatContext } from './boardContext';
import type { BoardRow } from '../pages/ComparisonBoardPage';
import type { ChatRequest, ChatResponse } from '../api/client';
import { validateProductHelpCatalog } from '../help/catalog';
import productHelp from '../../../servidor/catalogs/product_help.v1.json';

let activeSignal: AbortSignal | null = null;
function Controls() {
  const navigate = useNavigate();
  const chat = useChat();
  return <>
    <button onClick={() => navigate('/estudos/study-b/diagnostico?scenarioId=other')}>Mudar contexto</button>
    <button onClick={() => navigate('/estudos/study-a/diagnostico?scenarioId=other')}>Mudar cenário</button>
    <button onClick={() => { activeSignal = chat.beginRequest(); }}>Iniciar request</button>
    <button onClick={() => chat.setHelpId('replay.day')}>Definir ajuda</button>
    <button onClick={() => navigate('/estudos/study-a/replay?executionId=run-a')}>Abrir Replay</button>
    <button onClick={() => chat.selectConversation('conversation-older')}>Selecionar conversa antiga</button>
    <button onClick={() => chat.setReplayDay(2)}>Selecionar dia 2</button>
    <button onClick={() => navigate('/estudos/study-a/diagnostico?scenarioId=invalid')}>Abrir cenário inválido</button>
    <button onClick={() => chat.setScenarioId(null)}>Limpar cenário</button>
    <DefinitionTooltip term="Ajuda externa">Explicação externa.</DefinitionTooltip>
    <output data-testid="context">{JSON.stringify(chat.routeContext)}</output>
    <output data-testid="active-conversation">{chat.activeConversation?.id ?? 'none'}</output>
  </>;
}

function setup(ownerSub = 'owner-a', records: ChatConversation[] = []) {
  const repository = {
    deleteChatConversation: async () => undefined,
    listChatConversations: vi.fn(async (studyId: string | null) => records.filter((row) => row.studyId === studyId)),
    getChatConversation: vi.fn(async (id: string) => records.find((row) => row.id === id) ?? null),
    saveChatConversation: vi.fn(async ({ document }: { document: ChatConversation }) => document),
  };
  const view = render(<MemoryRouter initialEntries={['/estudos/study-a/diagnostico?scenarioId=base']}>
    <ChatProvider key={ownerSub} ownerSub={ownerSub} repository={repository}>
      <ChatPanel /><Controls />
    </ChatProvider>
  </MemoryRouter>);
  return { ...view, repository };
}

describe('session chat shell', () => {
  it('marks BOARD answers as previous context and disables their references after changing selection on /quadro', async () => {
    const row = { key: 's:c', studyId: 's', scenarioId: 'c', executionId: 'e', studyName: 'Estudo',
      scenarioName: 'Cenário', origin: 'Sintético', windowDays: 7, orderCount: 2, inBrl: '10', outBrl: '20',
      netability: '0.5', baselineTotal: '8', nettedTotal: '3', savings: '5',
      diagnosticExecutionId: 'e', finishedAt: '2026-09-26T12:00:00Z', breakdown: null } satisfies BoardRow;
    const board = await buildBoardChatContext([row]);
    const nextBoard = await buildBoardChatContext([{ ...row, key: 's:c-b', scenarioId: 'c-b', scenarioName: 'Outra seleção' }]);
    let current = conversation({ studyId: null });
    const repository = {
      deleteChatConversation: async () => undefined,
      listChatConversations: async () => [current],
      getChatConversation: async () => current,
      saveChatConversation: async ({ document }: { document: ChatConversation }) => { current = document; return current; },
    };
    const sendChatMessage = vi.fn(async (request: ChatRequest): Promise<ChatResponse> => ({
      apiVersion: '1.0.0', messageId: request.messageId, classification: 'IN_SCOPE', answer: 'Economia citada',
      citations: [{ kind: 'EVIDENCE', id: 'BOARD:s:c:savingsBrl' }],
      contextFingerprint: request.context?.document.contextFingerprint ?? null, limitationCodes: [],
    }));
    function BoardControls() {
      const chat = useChat(); const navigate = useNavigate();
      return <><button onClick={() => chat.publishBoardContext(board)}>Publicar quadro</button>
        <button onClick={() => chat.publishBoardContext(nextBoard)}>Mudar seleção do quadro</button>
        <button onClick={() => navigate('/estudos')}>Sair do quadro</button>
        <output data-testid="context-kind">{chat.context?.kind ?? 'none'}</output></>;
    }
    const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
    render(<MemoryRouter initialEntries={['/quadro']}><ChatProvider ownerSub="owner-a" repository={repository}
      client={{ sendChatMessage }} catalog={catalog}><BoardControls /><ChatPanel /></ChatProvider></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publicar quadro' }));
    expect(screen.getByTestId('context-kind')).toHaveTextContent('BOARD');
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    await waitFor(() => expect(screen.getByLabelText('Sua pergunta')).toBeEnabled());
    await user.type(screen.getByLabelText('Sua pergunta'), 'Qual tem maior economia?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalled());
    expect(sendChatMessage.mock.calls[0]![0].context).toMatchObject({
      kind: 'BOARD', document: { rows: [{ rowKey: 's:c' }] },
    });
    expect(await screen.findByText('Economia citada', { selector: 'p' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Estudo · Cenário — Economia' })).toHaveAttribute('href', '/quadro');
    expect(screen.queryByText('Contexto anterior')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mudar seleção do quadro' }));
    expect(screen.getByText('Contexto anterior')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Estudo · Cenário — Economia' })).not.toBeInTheDocument();
    expect(screen.getByText('BOARD:s:c:savingsBrl (referência indisponível neste contexto)')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sair do quadro' }));
    expect(screen.getByTestId('context-kind')).toHaveTextContent('none');
  });

  it('preserves an older active PENDING conversation and its live request across routes in one Study', async () => {
    const user = userEvent.setup();
    const newer = conversation({ id: 'conversation-newer', studyId: 'study-a', title: 'Recente',
      updatedAt: '2026-09-23T13:00:00Z' });
    const older = conversation({ id: 'conversation-older', studyId: 'study-a', title: 'Antiga',
      messages: [message({ id: 'pending', role: 'ASSISTANT', text: '', status: 'PENDING' })] });
    const { repository } = setup('owner-a', [newer, older]);
    await waitFor(() => expect(repository.listChatConversations).toHaveBeenCalledWith('study-a'));
    await user.click(screen.getByRole('button', { name: 'Selecionar conversa antiga' }));
    await user.click(screen.getByRole('button', { name: 'Iniciar request' }));
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect(screen.getByTestId('active-conversation')).toHaveTextContent('conversation-older');
    expect(screen.getByText('Respondendo…')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Abrir Replay' }));
    expect(screen.getByTestId('active-conversation')).toHaveTextContent('conversation-older');
    expect(activeSignal?.aborted).toBe(false);
    expect(screen.getByText('Respondendo…')).toBeVisible();
    expect(repository.listChatConversations).toHaveBeenCalledTimes(1);
    expect(repository.saveChatConversation).not.toHaveBeenCalled();
  });

  it('clears an invalid route selection when the page resolves no scenario', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Abrir cenário inválido' }));
    expect(screen.getByTestId('context')).toHaveTextContent('"scenarioId":"invalid"');
    await user.click(screen.getByRole('button', { name: 'Limpar cenário' }));
    expect(screen.getByTestId('context')).toHaveTextContent('"scenarioId":null');
  });

  it('recovers a reopened pending answer as retryable failure without changing its context fingerprint', async () => {
    const user = userEvent.setup();
    const pending = conversation({ studyId: 'study-a', messages: [message({ id: 'pending', role: 'ASSISTANT', text: '',
      status: 'PENDING', contextFingerprint: 'original-fingerprint' })] });
    const { repository } = setup('owner-a', [pending]);
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect((await screen.findAllByText('Falha ao responder. Tente novamente.')).length).toBeGreaterThan(0);
    expect(repository.saveChatConversation).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 1, document: expect.objectContaining({ revision: 2,
        messages: [expect.objectContaining({ status: 'FAILED', contextFingerprint: 'original-fingerprint' })] }),
    }));
  });

  it('exposes help and current replay day without carrying them to another route', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Abrir Replay' }));
    await user.click(screen.getByRole('button', { name: 'Selecionar dia 2' }));
    await user.click(screen.getByRole('button', { name: 'Definir ajuda' }));
    expect(screen.getByTestId('context')).toHaveTextContent('"replayDay":2');
    expect(screen.getByTestId('context')).toHaveTextContent('"helpId":"replay.day"');
    await user.click(screen.getByRole('button', { name: 'Mudar contexto' }));
    expect(screen.getByTestId('context')).toHaveTextContent('"replayDay":null');
    expect(screen.getByTestId('context')).toHaveTextContent('"helpId":null');
  });

  it('creates a session-owned study conversation when opening an empty history', async () => {
    const user = userEvent.setup();
    const { repository } = setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    await waitFor(() => expect(repository.saveChatConversation).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 0,
      document: expect.objectContaining({ ownerSub: 'owner-a', studyId: 'study-a', messages: [] }),
    })));
  });

  it('opens a study conversation, changes route context and marks the old messages as earlier context', async () => {
    const user = userEvent.setup();
    const originalFingerprint = JSON.stringify({ routeId: 'diagnostic', helpId: null, studyId: 'study-a',
      scenarioId: 'base', diagnosticExecutionId: null, replayDay: null });
    const original = conversation({ studyId: 'study-a', messages: [message({ text: 'Pergunta anterior', contextFingerprint: originalFingerprint })] });
    const { repository } = setup('owner-a', [original]);
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect(await screen.findByText('Pergunta anterior')).toBeVisible();
    expect(repository.listChatConversations).toHaveBeenCalledWith('study-a');
    expect(screen.queryByText('Contexto anterior')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mudar cenário' }));
    expect(screen.getByText('Pergunta anterior')).toBeVisible();
    expect(screen.getByText('Contexto anterior')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mudar contexto' }));
    expect(screen.getByTestId('context')).toHaveTextContent('"studyId":"study-b"');
    await waitFor(() => expect(repository.listChatConversations).toHaveBeenCalledWith('study-b'));
    expect(screen.queryByText('Pergunta anterior')).not.toBeInTheDocument();
  });

  it('restores focus to the opener and keeps the panel nonmodal', async () => {
    const user = userEvent.setup();
    setup();
    const opener = screen.getByRole('button', { name: 'Perguntar' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'ORKE AI' })).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByRole('button', { name: 'Mudar contexto' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fechar chat' }));
    expect(screen.queryByRole('dialog', { name: 'ORKE AI' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('clears pending deletion when Escape closes and the chat is reopened', async () => {
    const user = userEvent.setup();
    setup('owner-a', [conversation({ studyId: 'study-a' })]);
    const opener = screen.getByRole('button', { name: 'Perguntar' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: 'Excluir conversa' }));
    expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'ORKE AI' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    await user.click(opener);
    expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument();
  });

  it('does not close nonmodal chat when Escape belongs to an external DefinitionTooltip', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    const trigger = screen.getByRole('button', { name: 'Definição de Ajuda externa' });
    await user.click(trigger);
    expect(screen.getByRole('tooltip')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'ORKE AI' })).toBeVisible();
    expect(trigger).toHaveFocus();
  });

  it('does not close chat when a descendant consumes Escape', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    const close = screen.getByRole('button', { name: 'Fechar chat' });
    close.addEventListener('keydown', (event) => event.preventDefault());
    close.focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'ORKE AI' })).toBeVisible();
    expect(close).toHaveFocus();
  });

  it('does not close chat when a descendant stops Escape propagation', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    const close = screen.getByRole('button', { name: 'Fechar chat' });
    close.addEventListener('keydown', (event) => event.stopPropagation());
    close.focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'ORKE AI' })).toBeVisible();
    expect(close).toHaveFocus();
  });

  it('aborts an active request on account change and does not show the former account history', async () => {
    const user = userEvent.setup();
    const records = [conversation({ studyId: 'study-a', messages: [message({ text: 'Segredo da conta A' })] })];
    const { rerender } = setup('owner-a', records);
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    await screen.findByText('Segredo da conta A');
    await user.click(screen.getByRole('button', { name: 'Iniciar request' }));
    // A keyed provider is remounted by ApplicationProviders when ownerSub changes.
    rerender(<MemoryRouter initialEntries={['/estudos/study-a/diagnostico']}>
      <ChatProvider key="owner-b" ownerSub="owner-b" repository={{
        deleteChatConversation: async () => undefined,
        listChatConversations: async () => [], getChatConversation: async () => null,
        saveChatConversation: async ({ document }) => document,
      }}><ChatPanel /><Controls /></ChatProvider>
    </MemoryRouter>);
    expect(activeSignal?.aborted).toBe(true);
    expect(screen.queryByText('Segredo da conta A')).not.toBeInTheDocument();
  });
});
