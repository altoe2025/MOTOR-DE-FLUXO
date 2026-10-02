// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import type { StudyDocument } from '../study/model';
import { StudyDiagnosticPage } from './StudyDiagnosticPage';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  controller: {
    snapshot: { document: null as StudyDocument | null, status: 'SAVED' },
    loadStudy: vi.fn(), subscribe: vi.fn(() => () => {}),
  },
  client: { submitDiagnostic: vi.fn(), getDiagnosticJob: vi.fn(), getDiagnosticResult: vi.fn() },
}));
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => ({ controller: mocks.controller, client: mocks.client }) }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => null }));
vi.mock('../diagnostics/diagnosticExecutionService', () => ({
  executeStudyDiagnostic: mocks.execute, cancelStudyDiagnostic: vi.fn(), retryStudyDiagnostic: vi.fn(),
}));

async function comboStudy(count = 2, executed = false) {
  const input = await observedInput();
  input.study.studyType = 'PORTFOLIO_COMBINATIONS';
  if (!executed) input.study.executions = [];
  const base = input.study.scenarios[0]!;
  input.study.scenarios.push(...Array.from({ length: count - 1 }, (_, index) => ({
    ...structuredClone(base), id: crypto.randomUUID(), name: `Composição ${index + 1}`,
  })));
  return input;
}

function openStudy(study: StudyDocument, query = '') {
  mocks.controller.loadStudy.mockImplementation(async () => {
    mocks.controller.snapshot.document = study;
    return study;
  });
  const router = createMemoryRouter([{ path: '/estudos/:studyId/diagnostico', element: <StudyDiagnosticPage /> }], {
    initialEntries: [`/estudos/${study.id}/diagnostico${query}`],
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ status: 'SUCCEEDED', attemptId: 'done', jobId: 'job', envelope: null, error: null, current: true });
  mocks.controller.snapshot.document = null;
});
afterEach(cleanup);

describe('combination study diagnosis', () => {
  it('shows compact progress for a 255-composition batch and restores the recommendation after cancellation', async () => {
    const { study } = await comboStudy(255);
    let finishCurrent!: (value: Awaited<ReturnType<typeof mocks.execute>>) => void;
    mocks.execute.mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = resolve; }));
    openStudy(study);
    expect(await screen.findByText('Comparáveis atuais')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Diagnosticar combinações' }));
    expect(await screen.findByText(/Rodando 1 de 255/)).toHaveAttribute('role', 'status');
    expect(screen.getByText(/recomendação será atualizada após o lote/)).toBeInTheDocument();
    expect(screen.queryByText('Comparáveis atuais')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar lote' }));
    await act(async () => finishCurrent({
      status: 'SUCCEEDED', attemptId: 'done', jobId: 'job', envelope: null, error: null, current: true,
    }));
    expect(await screen.findByText('Comparáveis atuais')).toBeInTheDocument();
    expect(screen.queryByText(/recomendação será atualizada após o lote/)).not.toBeInTheDocument();
  });
  it('offers one batch action and compact recommendation without the 255 scenario table or individual controls', async () => {
    const { study } = await comboStudy(255);
    openStudy(study);
    expect(await screen.findByRole('button', { name: 'Diagnosticar combinações' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Diagnosticar combinações' }))
      .toHaveAttribute('data-chat-help-id', 'control.diagnostico.combinacoes');
    expect(screen.getByRole('heading', { name: 'Qual carteira atende melhor?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir quadros comparativos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Executar diagnóstico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Original × variações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir Replay · Fronteira Viva' })).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('consumes runAll once, ignores completed diagnostics, and does not repeat after rendering updates', async () => {
    const { study } = await comboStudy(2, true);
    let notify = () => {};
    mocks.controller.subscribe.mockImplementation((listener?: () => void) => { notify = listener ?? (() => {}); return () => {}; });
    const router = openStudy(study, '?runAll=1');
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0]![0].scenarioId).toBe(study.scenarios[1]!.id);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await act(async () => { mocks.controller.snapshot.document = { ...study, revision: study.revision + 1 }; notify(); });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Diagnosticar combinações' })).toBeEnabled();
  });

  it('opens one selected execution with a return link and no recursive recommendation', async () => {
    const { study, scenarioId } = await comboStudy(2, true);
    openStudy(study, `?scenarioId=${scenarioId}`);
    expect(await screen.findByRole('link', { name: 'Voltar à recomendação' })).toHaveAttribute('href', `/estudos/${study.id}/diagnostico`);
    expect(screen.getByRole('region', { name: 'Tabela de decomposição de custos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Qual carteira atende melhor?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Executar diagnóstico' })).not.toBeInTheDocument();
  });

  it('runs pending combinations from the visible action', async () => {
    const { study } = await comboStudy(2);
    const historical = structuredClone(study.scenarios[1]!);
    historical.id = crypto.randomUUID();
    historical.premises.costs.iof_out = '0.035';
    study.scenarios.push(historical);
    openStudy(study);
    await userEvent.click(await screen.findByRole('button', { name: 'Diagnosticar combinações' }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls.map((call) => call[0].scenarioId)).toEqual(study.scenarios.slice(0, 2).map((scenario) => scenario.id));
    expect(screen.getByText('2 composições preparadas. Os diagnósticos atuais são reaproveitados.')).toBeInTheDocument();
  });

  it('cancels the batch after the current combination and does not start another one', async () => {
    const { study } = await comboStudy(3);
    let finishCurrent!: (value: Awaited<ReturnType<typeof mocks.execute>>) => void;
    mocks.execute.mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = resolve; }));
    openStudy(study);

    await userEvent.click(await screen.findByRole('button', { name: 'Diagnosticar combinações' }));
    expect(await screen.findByRole('button', { name: 'Cancelar lote' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar lote' }));
    expect(screen.getByText('Cancelando após a combinação atual…')).toHaveAttribute('role', 'status');

    await act(async () => finishCurrent({
      status: 'SUCCEEDED', attemptId: 'done', jobId: 'job', envelope: null, error: null, current: true,
    }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Diagnosticar combinações' })).toBeEnabled());
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
