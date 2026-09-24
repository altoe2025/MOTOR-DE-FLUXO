// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('reopens the cited execution even when a newer execution exists for the same scenario', async () => {
    const input = await observedInput();
    input.study.executions.push({ ...structuredClone(input.execution), id: '70000000-0000-4000-8000-000000000001' });
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/estudos/${input.study.id}/diagnostico?scenarioId=${input.scenarioId}&executionId=${input.diagnosticExecutionId}`]}>
      <Routes><Route path="/estudos/:studyId/diagnostico" element={<StudyDiagnosticPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      diagnosticExecutionId: input.diagnosticExecutionId,
    })));
  });

  it('does not publish a newer execution when the cited execution is missing', async () => {
    const input = await observedInput();
    mocks.publishCommunication.mockClear();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/estudos/${input.study.id}/diagnostico?scenarioId=${input.scenarioId}&executionId=missing`]}>
      <Routes><Route path="/estudos/:studyId/diagnostico" element={<StudyDiagnosticPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(null), { timeout: 5_000 });
    expect(await screen.findByText('A execução citada não está disponível neste Estudo.')).toBeVisible();
    expect(mocks.publishCommunication).not.toHaveBeenCalledWith(expect.objectContaining({
      diagnosticExecutionId: input.diagnosticExecutionId,
    }));
  }, 15_000);

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
