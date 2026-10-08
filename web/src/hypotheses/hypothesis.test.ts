import { describe, expect, it } from 'vitest';

import { createStudy } from '../study/domain';
import { makeObservedSnapshot, makeScenarioDraft, makeSyntheticSnapshot } from '../study/fixtures';
import type { DeepMutable, EffectiveInput, ScenarioDocument } from '../study/model';
import {
  applyProfileHypothesis,
  buildHypothesisScenarioDraft,
  isProfileMvpScenario,
  validateMvpScalarCosts,
  type MvpScalarCostDraft,
  type ProfileHypothesisDraft,
} from './hypothesis';

const NOW = '2026-09-20T15:00:00Z';
const PARTICIPANT_A = '00000000-0000-4000-8000-000000000101';
const PARTICIPANT_B = '00000000-0000-4000-8000-000000000102';

const costs: MvpScalarCostDraft = {
  iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
  spread_rail_bps: '25', custo_fixo_remessa: '40',
  custo_oportunidade_aa: '0', ptax: '5.4',
};

function source(path: string) {
  return { kind: 'ESTIMATIVA_USUARIO' as const, source: `fixture:${path}`, recorded_at: NOW };
}

function effectiveInput(): EffectiveInput {
  const participants = [PARTICIPANT_A, PARTICIPANT_B].map((id, index) => ({
    id,
    profile: index === 0 ? 'exportador' as const : 'tesouraria_corporativa' as const,
    seed: String(index + 1),
    monthly_volume_brl: index === 0 ? '1000' : '2000',
    ticket_median_brl: index === 0 ? '100' : '200',
    out_fraction: index === 0 ? '0.6' : '0.4',
    deadline: index === 0 ? { mode: 'PROFILE' as const } : { mode: 'FIXED' as const, days: 7 },
    eh_efx: false,
    purpose_out: 'SERVICES',
    purpose_in: 'GOODS',
  }));
  const paths = [
    '/warmup_days', '/measurement_days', '/window_days',
    '/costs/iof_out', '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
    ...participants.flatMap((participant) => {
      const prefix = `/participants/${participant.id}`;
      return [
        `${prefix}/profile`, `${prefix}/seed`, `${prefix}/monthly_volume_brl`,
        `${prefix}/ticket_median_brl`, `${prefix}/out_fraction`, `${prefix}/deadline/mode`,
        ...(participant.deadline.mode === 'FIXED' ? [`${prefix}/deadline/days`] : []),
        `${prefix}/eh_efx`, `${prefix}/purpose_out`, `${prefix}/purpose_in`,
      ];
    }),
  ];
  return {
    participants,
    warmup_days: 0,
    measurement_days: 30,
    window_days: 7,
    costs: { ...costs, iof_por_finalidade: [] },
    sources: Object.fromEntries(paths.map((path) => [path, source(path)])),
  };
}

function profileDraft(): ProfileHypothesisDraft {
  return {
    kind: 'PROFILE_SIMULATION',
    name: 'Hipótese de escala e mix',
    volumeMultiplier: '2',
    ticketMultiplier: '0.5',
    outFractionDelta: '-0.1',
    deadline: { mode: 'FIXED', days: 3 },
    windowDays: 3,
    costs,
  };
}

async function materializedScenario(kind: 'OBSERVED' | 'PROFILE'): Promise<ScenarioDocument> {
  const snapshot = kind === 'OBSERVED' ? makeObservedSnapshot() : makeSyntheticSnapshot();
  if (kind === 'PROFILE') {
    if (snapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    snapshot.source.recipe.exampleId = 'perfil-operacional-mvp';
    snapshot.generationInputSnapshot = structuredClone(effectiveInput()) as DeepMutable<EffectiveInput>;
  }
  const base = makeScenarioDraft({ sourceSnapshot: snapshot });
  const provenance = {
    kind: 'SYNTHETIC_DEFAULT' as const,
    source: 'fixture', version: '1.0.0', recordedAt: NOW, rule: 'fixture-v1',
  };
  base.inputProvenance = {
    premises: {
      windowDays: provenance,
      costs: {
        iof_out: provenance, iof_in: provenance, carry_cnr: provenance,
        spread_rail_bps: provenance, custo_fixo_remessa: provenance,
        custo_oportunidade_aa: provenance, ptax: provenance,
      },
    },
    period: { horizonDays: provenance },
  };
  const study = await createStudy({
    id: `study-${kind.toLowerCase()}`,
    ownerSub: 'owner-1',
    name: `Estudo ${kind}`,
    baseScenario: base,
    now: NOW,
  });
  return study.scenarios[0]!;
}

describe('applyProfileHypothesis', () => {
  it('aplica deltas globais e preserva identidade, seed, perfil, eFX e finalidades', () => {
    const base = effectiveInput();
    const frozen = structuredClone(base);
    const next = applyProfileHypothesis(base, profileDraft(), NOW);

    expect(next.participants[0]).toMatchObject({
      id: PARTICIPANT_A, seed: '1', profile: 'exportador',
      monthly_volume_brl: '2000', ticket_median_brl: '50', out_fraction: '0.5',
      deadline: { mode: 'FIXED', days: 3 },
      eh_efx: false, purpose_out: 'SERVICES', purpose_in: 'GOODS',
    });
    expect(base).toEqual(frozen);
  });

  it('KEEP preserva prazos heterogêneos e FIXED reconcilia deadline/days', () => {
    const base = effectiveInput();
    const kept = applyProfileHypothesis(base, { ...profileDraft(), deadline: { mode: 'KEEP' } }, NOW);
    expect(kept.participants.map((item) => item.deadline))
      .toEqual(base.participants.map((item) => item.deadline));

    const changed = applyProfileHypothesis(base, profileDraft(), NOW);
    expect(Object.keys(changed.sources)).toContain(`/participants/${PARTICIPANT_A}/deadline/days`);
    expect(Object.keys(changed.sources)).toContain(`/participants/${PARTICIPANT_B}/deadline/days`);
  });

  it('recusa fração OUT fora de zero a um sem truncar', () => {
    expect(() => applyProfileHypothesis(
      effectiveInput(), { ...profileDraft(), outFractionDelta: '0.7' }, NOW,
    )).toThrow('Fração OUT fora do intervalo permitido.');
  });
});

describe('buildHypothesisScenarioDraft', () => {
  it('recusa draft simulado para origem observada', async () => {
    const base = await materializedScenario('OBSERVED');
    expect(() => buildHypothesisScenarioDraft({
      base,
      draft: profileDraft(),
      sourceSnapshot: base.sourceSnapshot,
      id: 'hypothesis-observed',
      recordedAt: NOW,
    })).toThrow('Carteira observada permite alterar somente janela e custos.');
  });

  it('congela IOF por finalidade e altera origem apenas das premissas modificadas', async () => {
    const base = await materializedScenario('PROFILE');
    expect(isProfileMvpScenario(base)).toBe(true);
    const draft = buildHypothesisScenarioDraft({
      base,
      draft: { ...profileDraft(), costs: { ...costs, iof_out: '0.04' } },
      sourceSnapshot: base.sourceSnapshot,
      id: 'hypothesis-profile',
      recordedAt: NOW,
    });
    expect(draft.premises.costs.iof_por_finalidade).toEqual(base.premises.costs.iof_por_finalidade);
    expect(draft.inputProvenance?.premises.costs.iof_out).toMatchObject({ kind: 'USER_ESTIMATE' });
    expect(draft.inputProvenance?.premises.costs.iof_in)
      .toEqual(base.inputProvenance?.premises.costs.iof_in);
    expect(draft.inputProvenance?.premises.windowDays).toMatchObject({ kind: 'USER_ESTIMATE' });
  });
});

describe('validateMvpScalarCosts', () => {
  it.each([
    ['iof_out', '1.0000000000001'],
    ['iof_in', '-0.1'],
    ['carry_cnr', '2'],
    ['custo_oportunidade_aa', '0.0000000000001'],
    ['spread_rail_bps', '10000.000000000001'],
    ['custo_fixo_remessa', '1000000000000.000001'],
    ['ptax', '0'],
    ['ptax', '1000000.000000000001'],
  ] as const)('recusa custo %s=%s fora do contrato', (field, value) => {
    expect(() => validateMvpScalarCosts({ ...costs, [field]: value })).toThrow();
  });
});
