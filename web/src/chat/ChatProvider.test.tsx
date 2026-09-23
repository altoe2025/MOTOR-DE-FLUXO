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
    <output data-testid="context">{JSON.stringify(chat.routeContext)}</output>
    <output data-testid="active-conversation">{chat.activeConversation?.id ?? 'none'}</output>
  </>;
}

function setup(ownerSub = 'owner-a', records: ChatConversation[] = []) {
  const repository = {
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
    expect(screen.getByRole('dialog', { name: 'Chat' })).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByRole('button', { name: 'Mudar contexto' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fechar chat' }));
    expect(screen.queryByRole('dialog', { name: 'Chat' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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
        listChatConversations: async () => [], getChatConversation: async () => null,
        saveChatConversation: async ({ document }) => document,
      }}><ChatPanel /><Controls /></ChatProvider>
    </MemoryRouter>);
    expect(activeSignal?.aborted).toBe(true);
    expect(screen.queryByText('Segredo da conta A')).not.toBeInTheDocument();
  });
});
