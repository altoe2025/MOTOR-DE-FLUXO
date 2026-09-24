// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { makeScenarioDraft } from '../study/fixtures';
import { observedInput } from '../communication/testFixtures';
import { StudyDiagnosticPage } from './StudyDiagnosticPage';

const mocks = vi.hoisted(() => ({
  setScenarioId: vi.fn(), setDiagnosticExecutionId: vi.fn(), publishCommunication: vi.fn(), loadStudy: vi.fn(),
}));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => ({
  setScenarioId: mocks.setScenarioId, setDiagnosticExecutionId: mocks.setDiagnosticExecutionId,
  publishCommunication: mocks.publishCommunication,
}) }));
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => ({
  controller: { loadStudy: mocks.loadStudy, subscribe: () => () => {}, snapshot: { status: 'SAVED' } },
  client: {},
}) }));

describe('diagnostic chat context', () => {
  it('publishes the selected persisted diagnostic source to the communication projection', async () => {
    const input = await observedInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/estudos/${input.study.id}/diagnostico?scenarioId=${input.scenarioId}`]}>
      <Routes><Route path="/estudos/:studyId/diagnostico" element={<StudyDiagnosticPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      study: expect.objectContaining({ id: input.study.id }),
      scenarioId: input.scenarioId, diagnosticExecutionId: input.diagnosticExecutionId,
      comparisonExecutionId: null, replay: null, replayDay: null,
    })));
  });

  it('reports the effective base scenario when the route has no scenario query', async () => {
    const study = await createStudy({ id: 'study-1', ownerSub: 'owner-a', name: 'Estudo',
      baseScenario: makeScenarioDraft({ id: 'scenario-base' }), now: '2026-09-23T12:00:00Z' });
    mocks.loadStudy.mockResolvedValue(study);
    render(<MemoryRouter initialEntries={['/estudos/study-1/diagnostico']}>
      <Routes><Route path="/estudos/:studyId/diagnostico" element={<StudyDiagnosticPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(mocks.setScenarioId).toHaveBeenCalledWith('scenario-base'));
    expect(mocks.setDiagnosticExecutionId).toHaveBeenCalledWith(null);
  });
});
