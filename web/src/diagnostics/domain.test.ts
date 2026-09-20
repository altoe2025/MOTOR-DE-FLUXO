import { describe, expect, it } from 'vitest';

import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import { createStudy } from '../study/domain';
import { makeScenarioDraft } from '../study/fixtures';
import type { DeepMutable, DiagnosticExecutionRecord } from '../study/model';
import { parseStudyV3, validateStudyDocument } from '../study/validation';
import { buildDiagnosticRequest } from './buildDiagnosticRequest';
import { appendDiagnosticExecution } from './domain';

const STUDY_ID = '00000000-0000-4000-8000-000000000301';
const SCENARIO_ID = '00000000-0000-4000-8000-000000000302';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000303';
const JOB_ID = '00000000-0000-4000-8000-000000000304';
const CREATED_AT = '2026-09-20T12:00:00Z';

const provenance = {
  kind: 'SYNTHETIC_DEFAULT' as const,
  source: 'fixture', version: '1', recordedAt: CREATED_AT, rule: 'fixture',
};
const previewProvenance: PreviewRequestProvenance = {
  premises: {
    windowDays: provenance,
    costs: {
      iof_out: provenance, iof_in: provenance, carry_cnr: provenance,
      custo_fixo_remessa: provenance, custo_oportunidade_aa: provenance,
      spread_rail_bps: provenance, ptax: provenance,
    },
  },
  period: { horizonDays: provenance },
};

async function fixture() {
  const draft = makeScenarioDraft({ id: SCENARIO_ID });
  const study = await createStudy({
    id: STUDY_ID, ownerSub: 'owner-a', name: 'Diagnóstico', baseScenario: draft, now: CREATED_AT,
  });
  const scenario = study.scenarios[0]!;
  const previewRequest = buildPreviewRequest(
    scenario.sourceSnapshot,
    scenario.premises,
    scenario.period,
    {
      requestId: '00000000-0000-4000-8000-000000000305',
      studyId: study.id,
      scenarioId: scenario.id,
      scenarioRevision: scenario.revision,
    },
    previewProvenance,
  );
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
  it('aceita snapshot b,a quando o request fixo preserva o mesmo conteúdo canônico a,b', async () => {
    const { study, reservation } = await fixture();
    if (reservation.requestSnapshot.sampling.kind !== 'FIXED_INPUT') throw new Error('fixture');
    expect(reservation.sourceSnapshot.orders.map((order) => order.id)).toEqual(['order-b', 'order-a']);
    expect(reservation.requestSnapshot.sampling.preview_request.cenario.ordens
      .map((order) => order.id)).toEqual(['order-a', 'order-b']);

    const reserved = await appendDiagnosticExecution(study, reservation, CREATED_AT);

    await expect(validateStudyDocument(reserved)).resolves.toEqual({ ok: true, value: reserved });
    expect(reserved.executions[0]).toEqual(reservation);
  });

  it('rejeita snapshot cujo conteúdo difere do request fixo mesmo após ordenar por id', async () => {
    const { study, reservation } = await fixture();
    const changed = structuredClone(reservation) as DeepMutable<DiagnosticExecutionRecord>;
    if (changed.requestSnapshot.sampling.kind !== 'FIXED_INPUT') throw new Error('fixture');
    changed.requestSnapshot.sampling.preview_request.cenario.ordens[0]!.valor_brl = '71';

    await expect(appendDiagnosticExecution(study, changed, CREATED_AT))
      .rejects.toThrow('INCOMPATIBLE_EXECUTION_SNAPSHOT');
  });

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

  it.each([
    ['job/idempotency', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      jobId: '00000000-0000-4000-8000-000000000399',
      requestSnapshot: {
        ...terminal.requestSnapshot,
        idempotency_key: '00000000-0000-4000-8000-000000000399',
      },
    })],
    ['request', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      requestSnapshot: {
        ...terminal.requestSnapshot,
        request_id: '00000000-0000-4000-8000-000000000398',
      },
    })],
    ['cenário', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      scenarioId: '00000000-0000-4000-8000-000000000397',
      requestSnapshot: {
        ...terminal.requestSnapshot,
        scenario_id: '00000000-0000-4000-8000-000000000397',
      },
    })],
    ['fingerprint', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      inputFingerprint: 'b'.repeat(64),
      requestSnapshot: { ...terminal.requestSnapshot, input_fingerprint: 'b'.repeat(64) },
    })],
    ['origem', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      sourceSnapshot: { ...terminal.sourceSnapshot, capturedAt: '2026-09-20T12:00:01Z' },
    })],
    ['premissas', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      premisesSnapshot: { ...terminal.premisesSnapshot, windowDays: terminal.premisesSnapshot.windowDays + 1 },
    })],
    ['período', (terminal: DiagnosticExecutionRecord) => ({
      ...terminal,
      periodSnapshot: 'executableHorizonDays' in terminal.periodSnapshot
        ? {
            ...terminal.periodSnapshot,
            executableHorizonDays: terminal.periodSnapshot.executableHorizonDays + 1,
          }
        : {
            ...terminal.periodSnapshot,
            httpPeriod: {
              ...terminal.periodSnapshot.httpPeriod,
              periodo_medicao_dias: terminal.periodSnapshot.httpPeriod.periodo_medicao_dias + 1,
            },
          },
    })],
  ] as const)('rejeita terminal cuja identidade %s diverge da reserva', async (_label, mutate) => {
    const { study, reservation } = await fixture();
    const reserved = await appendDiagnosticExecution(study, reservation, CREATED_AT);
    const terminal = mutate({
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    });

    await expect(appendDiagnosticExecution(
      reserved,
      terminal as DiagnosticExecutionRecord,
      terminal.finishedAt!,
    )).rejects.toThrow('reserva');
  });

  it('validação integral rejeita terminal artesanal sem reserva correspondente', async () => {
    const { study, reservation } = await fixture();
    const terminal: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };

    const result = await validateStudyDocument({ ...study, executions: [terminal] });

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'INCOMPATIBLE_DIAGNOSTIC_ATTEMPT' })],
    });
  });

  it('validação integral rejeita terminal artesanal divergente da reserva', async () => {
    const { study, reservation } = await fixture();
    const terminal: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      requestSnapshot: {
        ...structuredClone(reservation.requestSnapshot),
        request_id: '00000000-0000-4000-8000-000000000398',
      },
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };

    const result = await validateStudyDocument({ ...study, executions: [reservation, terminal] });

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'INCOMPATIBLE_DIAGNOSTIC_ATTEMPT' })],
    });
  });

  it('validação integral exige exatamente uma reserva QUEUED por terminal', async () => {
    const { study, reservation } = await fixture();
    const secondReservation: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000309',
    };
    const terminal: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };

    const result = await validateStudyDocument({
      ...study,
      executions: [reservation, secondReservation, terminal],
    });

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'INCOMPATIBLE_DIAGNOSTIC_ATTEMPT' })],
    });
  });

  it('aceita forma persistida com somente reserva ou reserva seguida de terminal', async () => {
    const { study, reservation } = await fixture();
    const reservationOnly = { ...study, executions: [reservation] };
    const terminal: DiagnosticExecutionRecord = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000308',
      status: 'FAILED',
      error: { code: 'DIAGNOSTICO_INVALIDO', message: 'A execução falhou.' },
      finishedAt: '2026-09-20T12:01:00Z',
    };
    const completed = { ...study, executions: [reservation, terminal] };

    await expect(validateStudyDocument(reservationOnly)).resolves.toMatchObject({ ok: true });
    await expect(validateStudyDocument(completed)).resolves.toMatchObject({ ok: true });
    expect(parseStudyV3(reservationOnly)).toMatchObject({ executions: [{ status: 'QUEUED' }] });
    expect(parseStudyV3(completed).executions.map((item) => item.status)).toEqual(['QUEUED', 'FAILED']);
  });

  it('rejeita RUNNING persistido e duas reservas QUEUED do mesmo attempt', async () => {
    const { study, reservation } = await fixture();
    const running = { ...structuredClone(reservation), status: 'RUNNING' as const };
    const duplicate = {
      ...structuredClone(reservation),
      id: '00000000-0000-4000-8000-000000000309',
    };

    await expect(validateStudyDocument({ ...study, executions: [running] })).resolves.toEqual({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INCOMPATIBLE_DIAGNOSTIC_ATTEMPT' }),
      ]),
    });
    await expect(validateStudyDocument({ ...study, executions: [reservation, duplicate] })).resolves.toEqual({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INCOMPATIBLE_DIAGNOSTIC_ATTEMPT' }),
      ]),
    });
    expect(() => parseStudyV3({ ...study, executions: [running] })).toThrow('persistida');
    expect(() => parseStudyV3({ ...study, executions: [reservation, duplicate] })).toThrow('persistida');
  });
});
