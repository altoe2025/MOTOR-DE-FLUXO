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
