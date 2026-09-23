// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { makeScenarioDraft } from '../study/fixtures';
import { ReplayPage, resolveReplayRequest } from './ReplayPage';
import { replayDocumentFixture } from './testFixtures';

const mocks = vi.hoisted(() => {
  const buildReplay = vi.fn();
  const loadStudy = vi.fn();
  return {
    buildReplay,
    loadStudy,
    runtime: { ownerSub: 'owner-1', controller: { loadStudy }, client: { buildReplay } },
  };
});

vi.mock('../app/providers', () => ({
  useDiagnosticRuntime: () => mocks.runtime,
}));

function persistedStudy(status: DiagnosticExecutionRecord['status'] = 'SUCCEEDED'): StudyDocument {
  const scenario = makeScenarioDraft();
  const envelope = {
    selected_execution: { statistics: { repetition_id: '00000000-0000-4000-8000-000000000703' } },
    statistics: { kind: 'DISTRIBUTION', count: 10, selected_repetition_id: '00000000-0000-4000-8000-000000000703' },
    repetitions: [{ repetition_id: '00000000-0000-4000-8000-000000000703' }],
  } as unknown as NonNullable<DiagnosticExecutionRecord['envelope']>;
  return {
    schemaVersion: '3.0.0', id: 'study-1', ownerSub: 'owner-1', name: 'Estudo replay', revision: 1,
    baseScenarioId: scenario.id, scenarios: [scenario as never], evidenceSnapshots: [], createdAt: '2026-09-22T00:00:00Z',
    updatedAt: '2026-09-22T00:00:00Z', deletedAt: null,
    executions: [{
      kind: 'DIAGNOSTIC', id: '00000000-0000-4000-8000-000000000701', attemptId: 'attempt-1',
      scenarioId: scenario.id, scenarioRevision: scenario.revision, inputFingerprint: 'a'.repeat(64),
      requestSnapshot: {} as never, sourceSnapshot: scenario.sourceSnapshot, premisesSnapshot: scenario.premises,
      periodSnapshot: scenario.period, status, jobId: 'job-1', envelope: status === 'SUCCEEDED' ? envelope : null,
      error: null, createdAt: '2026-09-22T00:00:00Z', finishedAt: status === 'SUCCEEDED' ? '2026-09-22T00:01:00Z' : null,
    }],
  };
}

describe('resolução local do Replay', () => {
  it('usa o envelope persistido e mantém o ID local separado', () => {
    const resolved = resolveReplayRequest(persistedStudy(), 'owner-1', '00000000-0000-4000-8000-000000000701');

    expect(resolved).toMatchObject({ ok: true, request: {
      api_version: '1.0.0', diagnostic_execution_id: '00000000-0000-4000-8000-000000000701',
    } });
  });

  it('não expõe execução de outro owner e distingue execução não terminal', () => {
    expect(resolveReplayRequest(persistedStudy(), 'other-owner', '00000000-0000-4000-8000-000000000701')).toMatchObject({
      ok: false, code: 'EXECUCAO_NAO_ENCONTRADA',
    });
    expect(resolveReplayRequest(persistedStudy('RUNNING'), 'owner-1', '00000000-0000-4000-8000-000000000701')).toMatchObject({
      ok: false, code: 'EXECUCAO_NAO_TERMINAL',
    });
  });
});

describe('ReplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadStudy.mockResolvedValue(persistedStudy());
    mocks.buildReplay.mockResolvedValue(replayDocumentFixture());
  });

  it('bloqueia Replay de uma execução XLSX antiga sem catálogo disponível', async () => {
    const original = persistedStudy();
    mocks.loadStudy.mockResolvedValue({ ...original, executions: original.executions.map((execution) => ({ ...execution,
      sourceSnapshot: { ...execution.sourceSnapshot, provenance: [{ kind: 'OBSERVED', source: 'xlsx-operacoes', version: '1.0.0', recordedAt: '2026-09-23T12:00:00Z' }] },
    })) });
    render(<MemoryRouter initialEntries={['/estudos/study-1/replay?executionId=00000000-0000-4000-8000-000000000701']}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByText(/Catálogo da importação indisponível/)).toBeVisible();
    expect(mocks.buildReplay).not.toHaveBeenCalled();
  });

  it('reabre a execução pela URL e constrói o replay com o resultado persistido', async () => {
    render(<MemoryRouter initialEntries={['/estudos/study-1/replay?executionId=00000000-0000-4000-8000-000000000701']}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Fronteira Viva' })).toBeInTheDocument();
    expect(mocks.buildReplay).toHaveBeenCalledWith(expect.objectContaining({
      diagnostic_execution_id: '00000000-0000-4000-8000-000000000701',
    }), expect.any(AbortSignal));
    expect(screen.getByText('Dia 0 de 2')).toBeInTheDocument();
    expect(screen.getByText('00000000-0000-4000-8000-000000000703')).toBeVisible();
    expect(screen.getByText(/10 repetições executadas/i)).toBeVisible();
    expect(screen.getByText(/Primeira repetição do plano/i)).toBeVisible();
    expect(screen.getByText(/Replay mostra uma repetição específica/i)).toBeVisible();
  });

  it('ignora resposta tardia quando a rota muda', async () => {
    let resolveFirst!: (value: ReturnType<typeof replayDocumentFixture>) => void;
    mocks.buildReplay.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const router = createMemoryRouter(
      [{ path: '/estudos/:studyId/replay', element: <ReplayPage /> }],
      { initialEntries: ['/estudos/study-1/replay?executionId=00000000-0000-4000-8000-000000000701'] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(mocks.buildReplay).toHaveBeenCalledOnce());
    await act(() => router.navigate('/estudos/study-1/replay'));
    act(() => resolveFirst(replayDocumentFixture()));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Fronteira Viva' })).not.toBeInTheDocument());
    expect(screen.getByText('EXECUCAO_NAO_ENCONTRADA')).toBeInTheDocument();
  });

  it('não apresenta Replay com ID diferente da repetição selecionada', async () => {
    mocks.buildReplay.mockResolvedValueOnce({ ...replayDocumentFixture(), repetition_id: 'outro-id' });
    render(<MemoryRouter initialEntries={['/estudos/study-1/replay?executionId=00000000-0000-4000-8000-000000000701']}>
      <Routes><Route path="/estudos/:studyId/replay" element={<ReplayPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByText('REPLAY_INCONSISTENTE')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Fronteira Viva' })).not.toBeInTheDocument();
  });
});
