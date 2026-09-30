// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ChatProvider, useChat } from '../chat/ChatProvider';
import type { CommunicationDocumentV1 } from '../communication/domain';
import type { CommunicationInput } from '../communication/buildCommunicationDocument';

const builds = vi.hoisted(() => ({
  calls: [] as Array<{ input: CommunicationInput; resolve(document: CommunicationDocumentV1): void }>,
  build: vi.fn((input: CommunicationInput) => new Promise<CommunicationDocumentV1>((resolve) => {
    builds.calls.push({ input, resolve });
  })),
}));

vi.mock('../communication/buildCommunicationDocument', () => ({ buildCommunicationDocument: builds.build }));

function input(day: number): CommunicationInput {
  return { study: { id: 'study-a' }, scenarioId: 'scenario-a', diagnosticExecutionId: 'run-a',
    comparisonExecutionId: null, replay: null, replayDay: day } as unknown as CommunicationInput;
}

function documentFor(day: number): CommunicationDocumentV1 {
  return { study: { id: 'study-a' }, selection: { scenarioId: 'scenario-a', diagnosticExecutionId: 'run-a',
    comparisonExecutionId: null, replayDay: day }, contextFingerprint: `day-${day}` } as unknown as CommunicationDocumentV1;
}

function Controls() {
  const chat = useChat();
  function publish(day: number) {
    chat.setScenarioId('scenario-a');
    chat.setDiagnosticExecutionId('run-a');
    chat.setReplayDay(day);
    chat.publishCommunication(input(day));
  }
  return <>
    <button onClick={() => publish(0)}>Publicar dia 0</button>
    <button onClick={() => publish(1)}>Publicar dia 1</button>
    <button onClick={() => publish(2)}>Publicar dia 2</button>
    <button onClick={() => chat.publishCommunication(null)}>Invalidar publicação</button>
    <output data-testid="published-day">{chat.communication?.selection.replayDay ?? 'none'}</output>
  </>;
}

describe('publicação assíncrona do Replay', () => {
  it('descarta builds antigos ao mudar ou fechar e publica o dia atual ao reabrir', async () => {
    builds.calls.length = 0;
    builds.build.mockClear();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/estudos/study-a/replay?executionId=run-a']}>
      <ChatProvider ownerSub="owner-a" repository={{ deleteChatConversation: async () => undefined,
        listChatConversations: async () => [], getChatConversation: async () => null,
        saveChatConversation: async ({ document }) => document }}>
        <Controls />
      </ChatProvider>
    </MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Publicar dia 0' }));
    await waitFor(() => expect(builds.calls).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Publicar dia 1' }));
    await waitFor(() => expect(builds.calls).toHaveLength(2));
    builds.calls[0]!.resolve(documentFor(0));
    await Promise.resolve();
    expect(screen.getByTestId('published-day')).toHaveTextContent('none');
    builds.calls[1]!.resolve(documentFor(1));
    await waitFor(() => expect(screen.getByTestId('published-day')).toHaveTextContent('1'));

    await user.click(screen.getByRole('button', { name: 'Publicar dia 2' }));
    await waitFor(() => expect(builds.calls).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: 'Invalidar publicação' }));
    builds.calls[2]!.resolve(documentFor(2));
    await Promise.resolve();
    expect(screen.getByTestId('published-day')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: 'Publicar dia 2' }));
    await waitFor(() => expect(builds.calls).toHaveLength(4));
    builds.calls[3]!.resolve(documentFor(2));
    await waitFor(() => expect(screen.getByTestId('published-day')).toHaveTextContent('2'));
  });
});
