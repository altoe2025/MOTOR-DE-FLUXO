// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { appendScenario, createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { DiagnosticExecutionRecord, ScenarioDocument, StudyDocument } from '../study/model';
import { StudyComparisonPage } from './StudyComparisonPage';

const controller = { loadStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>() };
vi.mock('../app/providers', () => ({ useStudyController: () => controller }));

function terminal(id: string, scenario: ScenarioDocument): DiagnosticExecutionRecord {
  return {
    kind: 'DIAGNOSTIC', id, attemptId: `attempt-${id}`, scenarioId: scenario.id,
    scenarioRevision: scenario.revision, inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: {} as DiagnosticExecutionRecord['requestSnapshot'],
    sourceSnapshot: scenario.sourceSnapshot, premisesSnapshot: scenario.premises,
    periodSnapshot: scenario.period, status: 'SUCCEEDED', jobId: id,
    envelope: {} as NonNullable<DiagnosticExecutionRecord['envelope']>, error: null,
    createdAt: FIXTURE_NOW, finishedAt: FIXTURE_NOW,
  };
}

describe('StudyComparisonPage', () => {
  it('não escolhe execuções silenciosamente e exige o par explícito', async () => {
    const original = await createStudy({ id: '00000000-0000-4000-8000-000000000801', ownerSub: FIXTURE_OWNER,
      name: 'Comparação', baseScenario: makeScenarioDraft({ id: '00000000-0000-4000-8000-000000000802' }), now: FIXTURE_NOW });
    const appended = await appendScenario(original, makeScenarioDraft({ id: '00000000-0000-4000-8000-000000000803', name: 'Hipótese' }), '2026-09-20T12:01:00Z');
    const study = { ...appended, executions: appended.scenarios.map((scenario, index) => terminal(`execution-${index}`, scenario)) } as StudyDocument;
    controller.loadStudy.mockResolvedValue(study);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[`/comparar?studyId=${study.id}`]}><StudyComparisonPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Comparar cenários' })).toHaveFocus();
    expect(screen.getByText('Simulação sintética legada')).toBeInTheDocument();
    const action = await screen.findByRole('button', { name: 'Comparar' });
    expect(action).toBeDisabled();
    expect(screen.getByLabelText('Execução base')).toHaveValue('');
    expect(screen.getByLabelText('Execução da hipótese')).toHaveValue('');
    await user.selectOptions(screen.getByLabelText('Execução base'), 'execution-0');
    await user.selectOptions(screen.getByLabelText('Execução da hipótese'), 'execution-1');
    expect(action).toBeEnabled();
  });
});
