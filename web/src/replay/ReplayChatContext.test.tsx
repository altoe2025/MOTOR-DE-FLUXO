// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import { ReplayPage } from './ReplayPage';
import { replayDocumentFixture } from './testFixtures';

const mocks = vi.hoisted(() => {
  const loadStudy = vi.fn(); const buildReplay = vi.fn();
  return { loadStudy, buildReplay, publishCommunication: vi.fn(), setReplayDay: vi.fn(), setScenarioId: vi.fn(),
    chat: { open: false },
    runtime: { ownerSub: 'owner-fixture', controller: { loadStudy, listObservedCases: async () => [] },
      client: { buildReplay, getImportCatalog: vi.fn() } } };
});
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => mocks.runtime }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => ({ publishCommunication: mocks.publishCommunication,
  setReplayDay: mocks.setReplayDay, setScenarioId: mocks.setScenarioId, open: mocks.chat.open }) }));

describe('replay communication context', () => {
  it('publishes only while the chat is open and coalesces rapid day changes', async () => {
    const input = await observedInput();
    const selected = input.execution.envelope!.statistics.selected_repetition_id;
    const replay = { ...replayDocumentFixture(), repetition_id: selected,
      diagnostic_execution_id: input.diagnosticExecutionId };
    mocks.loadStudy.mockResolvedValue(input.study);
    mocks.buildReplay.mockResolvedValue(replay);
    const route = `/estudos/${input.study.id}/replay?executionId=${input.diagnosticExecutionId}`;
    const view = render(<MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    await screen.findByRole('heading', { name: 'Fronteira Viva' });
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.days[0])).toBe(true);
    expect(mocks.publishCommunication).not.toHaveBeenCalledWith(expect.objectContaining({ replayDay: 0 }));
    expect(mocks.publishCommunication).toHaveBeenLastCalledWith(null);

    mocks.chat.open = true;
    view.rerender(<MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      study: expect.objectContaining({ id: input.study.id }), replay, replayDay: 0,
      diagnosticExecutionId: input.diagnosticExecutionId,
    })));

    mocks.publishCommunication.mockClear();
    fireEvent.change(screen.getByRole('slider', { name: 'Selecionar dia' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Selecionar dia' }), { target: { value: '2' } });
    expect(mocks.publishCommunication).toHaveBeenCalledWith(null);
    expect(mocks.publishCommunication.mock.calls.filter(([input]) => input !== null)).toHaveLength(0);
    await waitFor(() => expect(mocks.publishCommunication.mock.calls.filter(([input]) => input !== null)).toHaveLength(1));
    expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({ replayDay: 2 }));

    mocks.publishCommunication.mockClear();
    mocks.chat.open = false;
    view.rerender(<MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    expect(mocks.publishCommunication).toHaveBeenLastCalledWith(null);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mocks.publishCommunication.mock.calls.filter(([input]) => input !== null)).toHaveLength(0);

    mocks.publishCommunication.mockClear();
    mocks.chat.open = true;
    view.rerender(<MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    expect(mocks.publishCommunication).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({ replayDay: 2 })));
  });
});
