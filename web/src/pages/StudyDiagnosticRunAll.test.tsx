// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticExecutionAttempt } from '../diagnostics/diagnosticExecutionService';
import { appendScenario, createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { StudyDiagnosticPage } from './StudyDiagnosticPage';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  controller: {
    snapshot: { document: null as StudyDocument | null, status: 'READY' },
    loadStudy: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
  client: { submitDiagnostic: vi.fn(), getDiagnosticJob: vi.fn(), getDiagnosticResult: vi.fn() },
}));

vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => ({ controller: mocks.controller, client: mocks.client }) }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => null }));
vi.mock('../diagnostics/diagnosticExecutionService', () => ({
  executeStudyDiagnostic: mocks.execute,
  cancelStudyDiagnostic: vi.fn(),
  retryStudyDiagnostic: vi.fn(),
}));

async function pendingStudy(name: string) {
  const base = await createStudy({ id: crypto.randomUUID(), ownerSub: FIXTURE_OWNER, name,
    baseScenario: makeScenarioDraft({ id: crypto.randomUUID(), name: `${name} original` }), now: FIXTURE_NOW });
  return appendScenario(base, makeScenarioDraft({ id: crypto.randomUUID(), name: `${name} variação` }), FIXTURE_NOW);
}

function deferredAttempt() {
  let resolve!: (value: DiagnosticExecutionAttempt) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<DiagnosticExecutionAttempt>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function attempt(status: 'SUCCEEDED' | 'FAILED'): DiagnosticExecutionAttempt {
  return { status, attemptId: 'batch-attempt', jobId: 'batch-job', envelope: null, error: null, current: true };
}

function openStudies(first: StudyDocument, second?: StudyDocument) {
  mocks.controller.loadStudy.mockImplementation(async (id: string) => {
    const study = [first, second].find((item) => item?.id === id) ?? null;
    mocks.controller.snapshot.document = study;
    return study;
  });
  const router = createMemoryRouter([{ path: '/estudos/:studyId/diagnostico', element: <StudyDiagnosticPage /> }], {
    initialEntries: [`/estudos/${first.id}/diagnostico`],
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.controller.snapshot.document = null;
});
afterEach(cleanup);

describe('StudyDiagnosticPage run all', () => {
  it.each(['resolved', 'rejected'] as const)('stops the old batch after navigation when its request is %s', async (completion) => {
    const first = await pendingStudy('Primeiro estudo');
    const second = await pendingStudy('Segundo estudo');
    const pending = deferredAttempt();
    mocks.execute.mockReturnValueOnce(pending.promise);
    const router = openStudies(first, second);
    await userEvent.click(await screen.findByRole('button', { name: 'Rodar todas' }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0]![0].scenarioId).toBe(first.baseScenarioId);

    await act(async () => { await router.navigate(`/estudos/${second.id}/diagnostico`); });
    await screen.findByText('Estudo Segundo estudo');
    expect(screen.getByRole('button', { name: 'Rodar todas' })).toBeEnabled();
    await act(async () => {
      if (completion === 'resolved') pending.resolve(attempt('SUCCEEDED'));
      else pending.reject(new Error('late failure from previous study'));
      await pending.promise.catch(() => {});
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.controller.snapshot.document?.id).toBe(second.id);
    expect(screen.getByText('Estudo Segundo estudo')).toBeInTheDocument();
    expect(screen.queryByText('Estudo Primeiro estudo')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rodar todas' })).toBeEnabled();
  });

  it('stops the batch and displays an execution failure returned as a terminal result', async () => {
    const study = await pendingStudy('Estudo com falha');
    mocks.execute.mockResolvedValueOnce(attempt('FAILED'));
    openStudies(study);
    await userEvent.click(await screen.findByRole('button', { name: 'Rodar todas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir o diagnóstico');
    expect(screen.getByText('batch-attempt')).toBeInTheDocument();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rodar todas' })).toBeEnabled();
  });
});
