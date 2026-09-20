import { describe, expect, it } from 'vitest';

import type { PreviaRequest } from '../api/client';
import { createStudy } from '../study/domain';
import { makeScenarioDraft } from '../study/fixtures';
import type { DiagnosticExecutionRecord } from '../study/model';
import { buildDiagnosticRequest } from './buildDiagnosticRequest';
import { appendDiagnosticExecution } from './domain';

const STUDY_ID = '00000000-0000-4000-8000-000000000301';
const SCENARIO_ID = '00000000-0000-4000-8000-000000000302';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000303';
const JOB_ID = '00000000-0000-4000-8000-000000000304';
const CREATED_AT = '2026-09-20T12:00:00Z';

async function fixture() {
  const draft = makeScenarioDraft({ id: SCENARIO_ID });
  const study = await createStudy({
    id: STUDY_ID, ownerSub: 'owner-a', name: 'Diagnóstico', baseScenario: draft, now: CREATED_AT,
  });
  const scenario = study.scenarios[0]!;
  const previewRequest = {
    api_version: '1.0.0' as const,
    request_id: '00000000-0000-4000-8000-000000000305',
    study_id: study.id,
    scenario_id: scenario.id,
    scenario_revision: scenario.revision,
    cenario: {
      ordens: structuredClone(scenario.sourceSnapshot.orders),
      custo: structuredClone(scenario.premises.costs),
      janela_dias: scenario.premises.windowDays,
      horizonte_dias: 30,
    },
    periodo: structuredClone(scenario.period.httpPeriod),
    proveniencia: {},
  } as unknown as PreviaRequest;
  const request = await buildDiagnosticRequest({
    requestId: '00000000-0000-4000-8000-000000000306',
    idempotencyKey: JOB_ID,
    studyId: study.id,
    scenario,
    count: 1,
    baseSeed: 'fixed',
    previewRequest,
  });
  const reservation: DiagnosticExecutionRecord = {
    kind: 'DIAGNOSTIC',
    id: '00000000-0000-4000-8000-000000000307',
    attemptId: ATTEMPT_ID,
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: request,
    sourceSnapshot: structuredClone(scenario.sourceSnapshot),
    premisesSnapshot: structuredClone(scenario.premises),
    periodSnapshot: structuredClone(scenario.period),
    status: 'QUEUED',
    jobId: JOB_ID,
    envelope: null,
    error: null,
    createdAt: CREATED_AT,
    finishedAt: null,
  };
  return { study, reservation };
}

describe('appendDiagnosticExecution', () => {
  it('preserva reserva e terminal como dois registros append-only correlacionados', async () => {
    const { study, reservation } = await fixture();
    const reserved = await appendDiagnosticExecution(study, reservation, CREATED_AT);
    const terminal: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };

    const completed = await appendDiagnosticExecution(reserved, terminal, terminal.finishedAt!);

    expect(completed.executions).toEqual([reservation, terminal]);
    expect(completed.revision).toBe(study.revision + 2);
  });

  it('rejeita segundo terminal da mesma tentativa', async () => {
    const { study, reservation } = await fixture();
    const terminal = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED' as const,
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };
    const completed = await appendDiagnosticExecution(
      await appendDiagnosticExecution(study, reservation, CREATED_AT), terminal, terminal.finishedAt,
    );

    await expect(appendDiagnosticExecution(completed, {
      ...terminal,
      id: '00000000-0000-4000-8000-000000000309',
    }, '2026-09-20T12:02:00Z')).rejects.toThrow('terminal');
  });
});
