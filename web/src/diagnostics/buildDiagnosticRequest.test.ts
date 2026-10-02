import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import { createStudy, updateScenario } from '../study/domain';
import { appendDiagnosticExecution } from './domain';
import { currentDiagnostic } from '../levers/savingsOrigin';
import { isCurrentForScenario } from '../pages/StudyDiagnosticPage';
import { validateStudyDocument } from '../study/validation';
import type { DiagnosticExecutionRecord } from '../study/model';
import observedSource from '../../../contracts/fixtures/communication/observed-source.json';
import { describe, expect, it } from 'vitest';

import type { PreviaRequest } from '../api/client';
import type { components } from '../api/generated';
import { validateDiagnosticRequest } from '../api/validators';
import { makeScenarioDraft, makeSyntheticSnapshot } from '../study/fixtures';
import type { DeepMutable, PortfolioSourceSnapshot, ScenarioDocument } from '../study/model';
import {
  DiagnosticRequestBuildError,
  buildDiagnosticRequest,
} from './buildDiagnosticRequest';

type EffectiveInput = components['schemas']['EffectiveInput'];

const REQUEST_ID = '00000000-0000-4000-8000-000000000101';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000102';
const PARTICIPANT_A = '00000000-0000-4000-8000-000000000201';
const PARTICIPANT_B = '00000000-0000-4000-8000-000000000202';

function generationInput(): EffectiveInput {
  const source = {
    kind: 'PADRAO_SINTETICO' as const,
    source: 'Fixture T8',
    recorded_at: '2026-09-20T12:00:00Z',
  };
  return {
    participants: [PARTICIPANT_A, PARTICIPANT_B].map((id, index) => ({
      id,
      profile: 'tesouraria_corporativa' as const,
      seed: String(index + 1),
      monthly_volume_brl: '1000000',
      ticket_median_brl: '100000',
      out_fraction: '0.5',
      deadline: { mode: 'PROFILE' as const },
      eh_efx: false,
      purpose_out: 'DISPONIBILIDADE',
      purpose_in: 'EXPORTACAO',
    })),
    warmup_days: 0,
    measurement_days: 30,
    window_days: 7,
    costs: makeScenarioDraft().premises.costs,
    sources: Object.fromEntries([
      '/warmup_days', '/measurement_days', '/window_days', '/costs/iof_out',
      '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
      '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
      ...[PARTICIPANT_A, PARTICIPANT_B].flatMap((id) => [
        'profile', 'seed', 'monthly_volume_brl', 'ticket_median_brl', 'out_fraction',
        'deadline/mode', 'eh_efx', 'purpose_out', 'purpose_in',
      ].map((field) => `/participants/${id}/${field}`)),
    ].map((path) => [path, source])),
  };
}

function input(count: 1 | 10 | 30 | 100, sourceSnapshot = makeSyntheticSnapshot()) {
  const scenario = makeScenarioDraft({
    id: '00000000-0000-4000-8000-000000000105',
    sourceSnapshot,
    inputFingerprint: 'a'.repeat(64),
  }) as ScenarioDocument;
  return {
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    studyId: '00000000-0000-4000-8000-000000000103',
    scenario,
    count,
    baseSeed: 'base-seed-T8',
    previewRequest: {
      api_version: '1.0.0' as const,
      request_id: '00000000-0000-4000-8000-000000000104',
      study_id: '00000000-0000-4000-8000-000000000103',
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
    } as unknown as PreviaRequest,
  };
}

describe('buildDiagnosticRequest', () => {
  it('constrói entrada fixa com uma única repetição selecionada', async () => {
    const request = await buildDiagnosticRequest(input(1));

    expect(request.sampling).toEqual({
      kind: 'FIXED_INPUT', count: 1, preview_request: input(1).previewRequest,
    });
    expect(request.selected_repetition_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(validateDiagnosticRequest(request)).toBe(true);
  });

  it('rejeita distribuição quando o snapshot gerável legado não preserva receita', async () => {
    await expect(buildDiagnosticRequest(input(10))).rejects.toEqual(expect.objectContaining({
      name: 'DiagnosticRequestBuildError',
      code: 'GENERATION_RECIPE_UNAVAILABLE',
    } satisfies Partial<DiagnosticRequestBuildError>));
  });

  it.each([10, 30, 100] as const)('gera plano %i determinístico, completo e válido', async (count) => {
    const source = makeSyntheticSnapshot() as DeepMutable<PortfolioSourceSnapshot>;
    source.generationInputSnapshot = generationInput();
    const first = await buildDiagnosticRequest(input(count, source));
    const second = await buildDiagnosticRequest(input(count, source));
    if (first.sampling.kind !== 'GENERATED_INPUT') throw new Error('plano incorreto');

    expect(first).toEqual(second);
    expect(first.sampling.repetitions).toHaveLength(count);
    expect(new Set(first.sampling.repetitions.map((item) => item.repetition_id)).size).toBe(count);
    for (const participantId of [PARTICIPANT_A, PARTICIPANT_B]) {
      const seeds = first.sampling.repetitions.map((item) => item.participant_seeds[participantId]);
      expect(seeds.every((seed) => seed !== undefined && BigInt(seed) <= 9223372036854775807n)).toBe(true);
      expect(new Set(seeds).size).toBe(count);
    }
    expect(validateDiagnosticRequest(first)).toBe(true);
  });
});


it('uses current premises, period and rule sources without mutating preserved participants', async () => {
  const source = makeSyntheticSnapshot();
  source.generationInputSnapshot = generationInput();
  const original = structuredClone(source.generationInputSnapshot);
  const value = input(10, source);
  value.scenario = { ...value.scenario, premises: { windowDays: 1, costs: { ...value.scenario.premises.costs, iof_out: '0.01', iof_por_finalidade: [{ finalidade: 'NEW', direcao: 'OUT', aliquota: '0.02' }] } }, period: { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 2, periodo_medicao_dias: 20 } } };
  const origin = { tipo: 'ESTIMATIVA_USUARIO' as const, fonte: 'edited-now', registrado_em_utc: '2026-10-02T12:00:00Z' };
  value.previewRequest.proveniencia = Object.fromEntries(['/janela_dias', '/horizonte_dias', ...Object.keys(value.scenario.premises.costs).filter((k) => k !== 'iof_por_finalidade').map((k) => `/custo/${k}`), '/custo/iof_por_finalidade/0/aliquota'].map((path) => [path, origin]));
  const request = await buildDiagnosticRequest(value);
  if (request.sampling.kind !== 'GENERATED_INPUT') throw new Error('wrong kind');
  expect(request.sampling.preparation_input).toMatchObject({ window_days: 1, warmup_days: 2, measurement_days: 20, costs: { iof_out: '0.01' } });
  expect(request.sampling.preparation_input.participants).toEqual(original.participants);
  expect(request.sampling.preparation_input.sources['/costs/iof_por_finalidade/NEW/OUT']).toEqual({ kind: 'ESTIMATIVA_USUARIO', source: 'edited-now', recorded_at: origin.registrado_em_utc });
  expect(source.generationInputSnapshot).toEqual(original);
});


it.each([99, 1000])('real preview builder supplies complete provenance for %i orders', async (count) => {
  const source = makeSyntheticSnapshot();
  source.orders = Array.from({ length: count }, (_, i) => ({ ...source.orders[0]!, id: `order-${i}` }));
  const value = input(1, source);
  const provenance = source.provenance[0]!;
  value.previewRequest = buildPreviewRequest(source, value.scenario.premises, value.scenario.period,
    { requestId: REQUEST_ID, studyId: value.studyId, scenarioId: value.scenario.id, scenarioRevision: 1 },
    { premises: { windowDays: provenance, costs: Object.fromEntries(Object.keys(value.scenario.premises.costs).filter(k => k !== 'iof_por_finalidade').map(k => [k, provenance])) }, period: { horizonDays: provenance } } as PreviewRequestProvenance);
  expect(Object.keys(value.previewRequest.proveniencia)).toHaveLength(9 + count * 5);
  expect((await buildDiagnosticRequest(value)).provenance).toEqual(value.previewRequest.proveniencia);
});

it('persists edited generated scenarios and keeps legacy mismatches historical, never current', async () => {
  const source = makeSyntheticSnapshot();
  source.generationInputSnapshot = generationInput();
  const value = input(10, source);
  let study = await createStudy({ id: value.studyId, ownerSub: 'owner-a', name: 'generated', baseScenario: value.scenario, now: '2026-10-02T12:00:00Z' });
  study = await updateScenario(study, value.scenario.id, { premises: { ...value.scenario.premises, windowDays: 1, costs: { ...value.scenario.premises.costs, iof_out: '0.01' } }, period: { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 2, periodo_medicao_dias: 20 } } }, '2026-10-02T12:01:00Z');
  value.scenario = study.scenarios[0]!;
  const origin = { tipo: 'ESTIMATIVA_USUARIO' as const, fonte: 'current-edit', registrado_em_utc: '2026-10-02T12:01:00Z' };
  value.previewRequest.proveniencia = Object.fromEntries(['/janela_dias', '/horizonte_dias', '/custo/iof_out'].map(path => [path, origin]));
  const request = await buildDiagnosticRequest(value);
  const reservation: DiagnosticExecutionRecord = { kind: 'DIAGNOSTIC', id: 'reservation-edited', attemptId: 'attempt-edited', scenarioId: value.scenario.id, scenarioRevision: value.scenario.revision, inputFingerprint: value.scenario.inputFingerprint, requestSnapshot: request, sourceSnapshot: value.scenario.sourceSnapshot, premisesSnapshot: value.scenario.premises, periodSnapshot: value.scenario.period, status: 'QUEUED', jobId: request.idempotency_key, envelope: null, error: null, createdAt: '2026-10-02T12:02:00Z', finishedAt: null };
  study = await appendDiagnosticExecution(study, reservation, reservation.createdAt);
  const envelope = structuredClone(observedSource.envelope);
  Object.assign(envelope, { job_id: request.idempotency_key, request_fingerprint: request.input_fingerprint });
  Object.assign(envelope.selected_execution, { study_id: request.study_id, scenario_id: request.scenario_id, scenario_revision: request.scenario_revision });
  const terminal = { ...reservation, id: 'terminal-edited', status: 'SUCCEEDED' as const, envelope, finishedAt: '2026-10-02T12:03:00Z' } as DiagnosticExecutionRecord;
  study = await appendDiagnosticExecution(study, terminal, terminal.finishedAt!);
  expect((await validateStudyDocument(study)).ok).toBe(true);
  expect(currentDiagnostic(study, value.scenario)?.id).toBe(terminal.id);
  const legacy = structuredClone(study) as DeepMutable<typeof study>;
  for (const execution of legacy.executions) {
    if (execution.kind === 'DIAGNOSTIC' && execution.requestSnapshot.sampling.kind === 'GENERATED_INPUT') execution.requestSnapshot.sampling.preparation_input = structuredClone(source.generationInputSnapshot);
  }
  expect((await validateStudyDocument(legacy)).ok).toBe(true);
  expect(currentDiagnostic(legacy, value.scenario)).toBeNull();
  expect(isCurrentForScenario(legacy.executions[1] as DiagnosticExecutionRecord, value.scenario)).toBe(false);
});
