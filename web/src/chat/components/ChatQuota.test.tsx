// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import productHelp from '../../../../servidor/catalogs/product_help.v1.json';
import { validateProductHelpCatalog } from '../../help/catalog';
import type { ChatConversation } from '../domain';
import { conversation, message } from '../fixtures';
import { ChatProvider } from '../ChatProvider';
import { ChatPanel } from './ChatPanel';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
function records(count: number) {
  return Array.from({ length: count }, (_, i) => conversation({ id: `conversation-${i}`, title: `Conversa ${i}`, messages: [] }));
}
function setup(initial: ChatConversation[]) {
  let rows = structuredClone(initial);
  const repository = {
    listChatConversations: vi.fn(async () => structuredClone(rows)),
    getChatConversation: vi.fn(async (id: string) => rows.find((row) => row.id === id) ?? null),
    saveChatConversation: vi.fn(async ({ document }: { document: ChatConversation }) => {
      rows = [document, ...rows.filter((row) => row.id !== document.id)];
      return structuredClone(document);
    }),
    deleteChatConversation: vi.fn(async (id: string, revision: number) => {
      if (rows.find((row) => row.id === id)?.revision !== revision) throw new Error('CAS');
      rows = rows.filter((row) => row.id !== id);
    }),
  };
  const sendChatMessage = vi.fn();
  render(<MemoryRouter initialEntries={['/estudos']}><ChatProvider ownerSub="owner-a" repository={repository}
    client={{ sendChatMessage }} catalog={catalog}><ChatPanel /></ChatProvider></MemoryRouter>);
  return { repository, sendChatMessage, setRows: (next: ChatConversation[]) => { rows = next; }, get rows() { return rows; } };
}

describe('chat quota recovery', () => {
  it('blocks adding messages at 100 and offers a fresh conversation without removing history', async () => {
    const user = userEvent.setup();
    const full = conversation({ messages: Array.from({ length: 100 }, (_, i) => message({ id: `message-${i}` })) });
    const state = setup([full]);
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeDisabled();
    expect(screen.getByText(/limite de 100 mensagens/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nova conversa' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled());
    expect(state.rows.find((row) => row.id === full.id)?.messages).toHaveLength(100);
    expect(state.repository.deleteChatConversation).not.toHaveBeenCalled();
    expect(state.sendChatMessage).not.toHaveBeenCalled();
  });

  it('requires explicit deletion at 20 conversations, then permits creation', async () => {
    const user = userEvent.setup(); const state = setup(records(20));
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    expect(screen.getByText(/limite de 20 conversas/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled();
    expect(state.repository.deleteChatConversation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Excluir conversa' }));
    expect(state.repository.deleteChatConversation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    expect(state.rows).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Excluir conversa' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(state.repository.deleteChatConversation).toHaveBeenCalledWith('conversation-0', 1, expect.any(String)));
    expect(state.rows).toHaveLength(19);
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Nova conversa' }));
    await waitFor(() => expect(state.rows).toHaveLength(20));
    expect(state.rows.some((row) => row.id === 'conversation-0')).toBe(false);
  });

  it('reconciles a concurrently filled quota without making existing conversations unavailable', async () => {
    const user = userEvent.setup(); const state = setup(records(19));
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    state.setRows(records(20));
    state.repository.saveChatConversation.mockRejectedValueOnce(new Error('Limite de 20 conversas atingido.'));
    await user.click(screen.getByRole('button', { name: 'Nova conversa' }));
    expect(await screen.findByText(/limite de 20 conversas/i)).toBeVisible();
    expect(screen.queryByText(/Histórico do chat indisponível/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled();
    expect(state.repository.deleteChatConversation).not.toHaveBeenCalled();
  });

  it('preserves a concurrently updated conversation after delete CAS failure and uses its latest revision on explicit retry', async () => {
    const user = userEvent.setup(); const state = setup(records(20));
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));
    state.setRows(records(20).map((row, i) => i === 0 ? { ...row, revision: 2, messages: [message({ text: 'Resposta preservada' })] } : row));
    await user.click(screen.getByRole('button', { name: 'Excluir conversa' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Resposta preservada')).toBeVisible();
    expect(state.rows).toHaveLength(20);
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Excluir conversa' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(state.repository.deleteChatConversation).toHaveBeenLastCalledWith('conversation-0', 2, expect.any(String)));
    expect(state.rows).toHaveLength(19);
  });
});
