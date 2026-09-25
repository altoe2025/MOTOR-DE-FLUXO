// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import { ReplayPage } from './ReplayPage';
import { replayDocumentFixture } from './testFixtures';

const mocks = vi.hoisted(() => {
  const loadStudy = vi.fn(); const buildReplay = vi.fn();
  return { loadStudy, buildReplay, publishCommunication: vi.fn(), setReplayDay: vi.fn(), setScenarioId: vi.fn(),
    runtime: { ownerSub: 'owner-fixture', controller: { loadStudy },
      client: { buildReplay, getImportCatalog: vi.fn() } } };
});
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => mocks.runtime }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => ({ publishCommunication: mocks.publishCommunication,
  setReplayDay: mocks.setReplayDay, setScenarioId: mocks.setScenarioId }) }));

describe('replay communication context', () => {
  it('publishes the selected day with the loaded Study and Replay', async () => {
    const input = await observedInput();
    const selected = input.execution.envelope!.statistics.selected_repetition_id;
    const replay = { ...replayDocumentFixture(), repetition_id: selected,
      diagnostic_execution_id: input.diagnosticExecutionId };
    mocks.loadStudy.mockResolvedValue(input.study);
    mocks.buildReplay.mockResolvedValue(replay);
    render(<MemoryRouter initialEntries={[`/estudos/${input.study.id}/replay?executionId=${input.diagnosticExecutionId}`]}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    await screen.findByRole('heading', { name: 'Fronteira Viva' });
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      study: expect.objectContaining({ id: input.study.id }), replay, replayDay: 0,
      diagnosticExecutionId: input.diagnosticExecutionId,
    })));
  });
});
