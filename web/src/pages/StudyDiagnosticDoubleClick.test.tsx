// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticExecutionAttempt } from '../diagnostics/diagnosticExecutionService';
import { createStudy } from '../study/domain';
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.controller.snapshot.document = null;
});
afterEach(cleanup);

describe('StudyDiagnosticPage com cliques repetidos', () => {
  it('dois cliques no mesmo instante iniciam um único diagnóstico', async () => {
    const study = await createStudy({ id: crypto.randomUUID(), ownerSub: FIXTURE_OWNER, name: 'Estudo único',
      baseScenario: makeScenarioDraft({ id: crypto.randomUUID(), name: 'Original' }), now: FIXTURE_NOW });
    mocks.controller.loadStudy.mockImplementation(async () => {
      mocks.controller.snapshot.document = study;
      return study;
    });
    let finish!: (value: DiagnosticExecutionAttempt) => void;
    mocks.execute.mockImplementation(() => new Promise<DiagnosticExecutionAttempt>((resolve) => { finish = resolve; }));
    const router = createMemoryRouter([{ path: '/estudos/:studyId/diagnostico', element: <StudyDiagnosticPage /> }], {
      initialEntries: [`/estudos/${study.id}/diagnostico`],
    });
    render(<RouterProvider router={router} />);
    const execute = await screen.findByRole('button', { name: 'Executar diagnóstico' });

    // Os dois cliques chegam antes de o React re-renderizar, como no duplo clique do E2E de fundação.
    act(() => { execute.click(); execute.click(); });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ status: 'SUCCEEDED', attemptId: 'a', jobId: 'j', envelope: null, error: null, current: true }); });
  });
});
