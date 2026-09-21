import { describe, expect, it } from 'vitest';

import { appendScenario, createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { diagnosticsForScenario, isCurrentForScenario, latestDiagnostic } from './StudyDiagnosticPage';

function execution(
  id: string,
  scenarioId: string,
  scenarioRevision: number,
  inputFingerprint: string,
): DiagnosticExecutionRecord {
  return {
    kind: 'DIAGNOSTIC', id, attemptId: `attempt-${id}`, scenarioId, scenarioRevision,
    inputFingerprint, requestSnapshot: {} as DiagnosticExecutionRecord['requestSnapshot'],
    sourceSnapshot: {} as DiagnosticExecutionRecord['sourceSnapshot'],
    premisesSnapshot: {} as DiagnosticExecutionRecord['premisesSnapshot'],
    periodSnapshot: {} as DiagnosticExecutionRecord['periodSnapshot'], status: 'FAILED',
    jobId: null, envelope: null, error: { code: 'TEST', message: id },
    createdAt: FIXTURE_NOW, finishedAt: FIXTURE_NOW,
  };
}

describe('escopo de cenário do diagnóstico', () => {
  it('filtra histórico e current pela identidade do cenário selecionado', async () => {
    const original = await createStudy({
      id: '00000000-0000-4000-8000-000000000701', ownerSub: FIXTURE_OWNER,
      name: 'Escopo', baseScenario: makeScenarioDraft({ id: '00000000-0000-4000-8000-000000000702' }),
      now: FIXTURE_NOW,
    });
    const withHypothesis = await appendScenario(original, makeScenarioDraft({
      id: '00000000-0000-4000-8000-000000000703', name: 'Hipótese',
    }), '2026-09-20T12:01:00Z');
    const [base, hypothesis] = withHypothesis.scenarios;
    const baseAttempt = execution('base-attempt', base!.id, base!.revision, base!.inputFingerprint);
    const staleHypothesis = execution('stale-attempt', hypothesis!.id, hypothesis!.revision, '0'.repeat(64));
    const currentHypothesis = execution('current-attempt', hypothesis!.id, hypothesis!.revision, hypothesis!.inputFingerprint);
    const study = { ...withHypothesis, executions: [baseAttempt, staleHypothesis, currentHypothesis] } as StudyDocument;

    expect(diagnosticsForScenario(study, hypothesis!).map((item) => item.id)).toEqual(['stale-attempt', 'current-attempt']);
    expect(latestDiagnostic(study, hypothesis!)?.id).toBe('current-attempt');
    expect(isCurrentForScenario(staleHypothesis, hypothesis!)).toBe(false);
    expect(isCurrentForScenario(currentHypothesis, hypothesis!)).toBe(true);
    expect(diagnosticsForScenario(study, hypothesis!)).not.toContain(baseAttempt);
  });
});
