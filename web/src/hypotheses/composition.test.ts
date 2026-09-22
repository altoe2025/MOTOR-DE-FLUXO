import { describe, expect, it } from 'vitest';

import type { ObservedCase, ObservedOrder } from '../cases/domain';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import type { OperationalProfileVersion } from '../profiles/domain';
import { fingerprintOperationalProfile } from '../profiles/fingerprints';
import { appendCompositionHypothesis, createStudy } from '../study/domain';
import { makeScenarioDraft, makeSyntheticSnapshot } from '../study/fixtures';
import type {
  DeepMutable, EffectiveInput, PortfolioSourceSnapshot, ScenarioDocument, ScenarioDraft,
} from '../study/model';
import {
  buildCompositionSourceSnapshot,
  buildCompositionScenarioDraft,
  CompositionDraftError,
  materializeCompositionDraft,
} from './composition';

const NOW = '2026-09-21T15:00:00Z';
const OWNER = 'owner-1';
const PARTICIPANT_A = '00000000-0000-4000-8000-000000000101';
const PARTICIPANT_B = '00000000-0000-4000-8000-000000000102';
const PARTICIPANT_C = '00000000-0000-4000-8000-000000000103';

const provenance = {
  kind: 'OBSERVED', source: 'fixture.xlsx', version: 'layout-1', recordedAt: NOW,
} as const;

function observedOrder(id: string, direction: 'OUT' | 'IN'): ObservedOrder {
  return {
    id, clientId: `client-${id}`, direction,
    knownDate: '2026-01-01', deadlineDate: '2026-01-02', valueBrl: '100',
    purposeCode: 'SERVICES', efxStatus: 'NO', provenance: [provenance],
  };
}

function observedCase(companyId: string, ownerSub = OWNER): ObservedCase {
  return {
    schemaVersion: '2.0.0', id: `case-${companyId}`, ownerSub,
    companyId, status: 'CONFIRMED', revision: 1,
    window: { startDate: '2026-01-01', endDate: '2026-01-31', closingDate: '2026-01-31' },
    orders: [observedOrder(`${companyId}-out`, 'OUT'), observedOrder(`${companyId}-in`, 'IN')],
    controlTotals: [
      { code: 'GROSS_OUT_BRL', valueBrl: '100', provenance },
      { code: 'GROSS_IN_BRL', valueBrl: '100', provenance },
    ],
    sourceManifest: {
      adapterId: 'fixture', adapterVersion: '1', sourceKind: 'XLSX',
      files: [{ name: 'fixture.xlsx', sizeBytes: 10, sha256: 'a'.repeat(64) }],
    },
    normalization: { rulesetId: 'fixture', rulesetVersion: '1', normalizedAt: NOW },
    quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null,
    confirmedAt: NOW,
  };
}

async function profileFixture(
  id: string,
  companyId: string,
  ownerSub = OWNER,
): Promise<OperationalProfileVersion> {
  const calculated = await calculateOperationalProfile({
    id, ownerSub, companyId, version: 1, createdAt: NOW,
    cases: [observedCase(companyId, ownerSub)],
  });
  const mutable = structuredClone(calculated) as DeepMutable<OperationalProfileVersion>;
  mutable.coverage.coveredDays = 31;
  mutable.metrics.volume.totalBrl = { state: 'AVAILABLE', value: '3100', evidence: [] };
  mutable.metrics.ticketsBrl.p50 = { state: 'AVAILABLE', value: '125', evidence: [] };
  mutable.metrics.direction = {
    state: 'AVAILABLE',
    value: {
      out: { volumeBrl: '1860', fraction: '0.6' },
      in: { volumeBrl: '1240', fraction: '0.4' },
    },
    evidence: [],
  };
  mutable.documentFingerprint = await fingerprintOperationalProfile(mutable);
  return mutable as OperationalProfileVersion;
}

function effectiveInput(): EffectiveInput {
  const participants = [
    {
      id: PARTICIPANT_A, profile: 'exportador' as const, seed: '41',
      monthly_volume_brl: '1000', ticket_median_brl: '100', out_fraction: '0.6',
      deadline: { mode: 'PROFILE' as const }, eh_efx: false,
      purpose_out: 'SERVICES', purpose_in: 'GOODS',
    },
    {
      id: PARTICIPANT_B, profile: 'tesouraria_corporativa' as const, seed: '42',
      monthly_volume_brl: '2000', ticket_median_brl: '200', out_fraction: '0.4',
      deadline: { mode: 'FIXED' as const, days: 7 }, eh_efx: false,
      purpose_out: 'SERVICES', purpose_in: 'GOODS',
    },
  ];
  const fixedSources = [
    '/warmup_days', '/measurement_days', '/window_days',
    '/costs/iof_out', '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
  ];
  const participantSources = participants.flatMap((participant, index) => {
    const prefix = `/participants/${participant.id}`;
    const fingerprint = (index === 0 ? 'a' : 'b').repeat(64);
    const profileId = index === 0 ? 'profile-a' : 'profile-b';
    return [
      [`${prefix}/profile`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/seed`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/monthly_volume_brl`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/ticket_median_brl`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/out_fraction`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/deadline/mode`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      ...(participant.deadline.mode === 'FIXED'
        ? [[`${prefix}/deadline/days`, `profile-mvp:${profileId}@${fingerprint}:derived`]]
        : []),
      [`${prefix}/eh_efx`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/purpose_out`, `profile-mvp:${profileId}@${fingerprint}:derived`],
      [`${prefix}/purpose_in`, `profile-mvp:${profileId}@${fingerprint}:derived`],
    ] as const;
  });
  const source = (label: string) => ({
    kind: 'ESTIMATIVA_USUARIO' as const, source: label, recorded_at: NOW,
  });
  return {
    participants, warmup_days: 0, measurement_days: 30, window_days: 7,
    costs: {
      iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
      spread_rail_bps: '25', custo_fixo_remessa: '40',
      custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
    },
    sources: Object.fromEntries([
      ...fixedSources.map((path) => [path, source(`fixture:${path}`)] as const),
      ...participantSources.map(([path, label]) => [path, source(label)] as const),
    ]),
  };
}

async function baseScenario(): Promise<ScenarioDocument> {
  const snapshot = makeSyntheticSnapshot();
  if (snapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture inválida');
  snapshot.source.recipe.exampleId = 'perfil-operacional-mvp';
  snapshot.generationInputSnapshot = structuredClone(effectiveInput()) as DeepMutable<EffectiveInput>;
  const study = await createStudy({
    id: '00000000-0000-4000-8000-000000000201', ownerSub: OWNER,
    name: 'Estudo B', baseScenario: makeScenarioDraft({ sourceSnapshot: snapshot }), now: NOW,
  });
  return study.scenarios[0]!;
}

describe('materializeCompositionDraft', () => {
  it('preserva identidade e seed do mantido, remove um e adiciona outro Perfil', async () => {
    const profileC = await profileFixture('profile-c', 'company-c');
    const result = await materializeCompositionDraft({
      base: await baseScenario(), evidenceProfiles: [profileC], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Troca B por C',
        participantChanges: [
          { kind: 'REMOVE_PARTICIPANT', participantId: PARTICIPANT_B },
          {
            kind: 'ADD_PROFILE', profile: profileC,
            explicit: {
              participantId: PARTICIPANT_C, generatorProfile: 'tesouraria_corporativa',
              seed: '43', deadline: { mode: 'FIXED', days: 5 }, efx: true,
              purposeOut: 'SERVICES', purposeIn: 'GOODS',
            },
          },
          {
            kind: 'UPDATE_PARTICIPANT', participantId: PARTICIPANT_A,
            patch: { monthlyVolumeBrl: '2500000', purposeOut: 'SERVICOS' },
          },
        ],
        windowDays: 7,
        costs: (await baseScenario()).premises.costs,
      },
    });

    const maintained = result.input.participants.find((item) => item.id === PARTICIPANT_A);
    expect(maintained).toMatchObject({
      id: PARTICIPANT_A, seed: '41', monthly_volume_brl: '2500000', purpose_out: 'SERVICOS',
    });
    expect(result.input.participants.map((item) => item.id)).toEqual([PARTICIPANT_A, PARTICIPANT_C]);
    expect(result.diff).toMatchObject({
      removed: [{ participantId: PARTICIPANT_B }],
      added: [{ participantId: PARTICIPANT_C }],
      modified: [{ participantId: PARTICIPANT_A }],
    });
    expect(result.profilesToAttach.map((item) => item.id)).toEqual(['profile-c']);
    expect(result.requiresPreparation).toBe(true);
  });

  it('reutiliza ordens e atualiza snapshot, sources e IOF quando só custos mudam', async () => {
    const base = await baseScenario();
    const nextCosts = {
      ...structuredClone(base.premises.costs),
      spread_rail_bps: '30',
      iof_por_finalidade: [{ finalidade: 'A/B~C', direcao: 'OUT' as const, aliquota: '0.01' }],
    };
    const result = await materializeCompositionDraft({
      base, evidenceProfiles: [], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Custo alternativo', participantChanges: [],
        windowDays: 7, costs: nextCosts,
      },
    });
    const snapshot = await buildCompositionSourceSnapshot(base.sourceSnapshot, result, NOW);

    expect(result.requiresPreparation).toBe(false);
    expect(snapshot.orders).toEqual(base.sourceSnapshot.orders);
    expect(snapshot.generationInputSnapshot?.costs).toEqual(nextCosts);
    expect(snapshot.generationInputSnapshot?.sources)
      .toHaveProperty('/costs/iof_por_finalidade/A~1B~0C/OUT');
    expect(snapshot.generationInputSnapshot?.sources['/costs/spread_rail_bps'])
      .toMatchObject({ kind: 'ESTIMATIVA_USUARIO', source: 'profile-mvp:hypothesis' });
    expect(snapshot.generationInputSnapshot?.sources['/costs/ptax'])
      .toEqual(base.sourceSnapshot.generationInputSnapshot?.sources['/costs/ptax']);
  });

  it.each([
    ['EMPTY_COMPOSITION', [{ kind: 'REMOVE_PARTICIPANT', participantId: PARTICIPANT_A }, { kind: 'REMOVE_PARTICIPANT', participantId: PARTICIPANT_B }]],
    ['CONTRADICTORY_CHANGE', [{ kind: 'REMOVE_PARTICIPANT', participantId: PARTICIPANT_A }, { kind: 'UPDATE_PARTICIPANT', participantId: PARTICIPANT_A, patch: { efx: true } }]],
    ['INVALID_PARTICIPANT_PATCH', [{ kind: 'UPDATE_PARTICIPANT', participantId: PARTICIPANT_A, patch: {} }]],
  ] as const)('falha com código estável %s', async (code, participantChanges) => {
    const base = await baseScenario();
    await expect(materializeCompositionDraft({
      base, evidenceProfiles: [], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Inválida',
        participantChanges, windowDays: 7, costs: base.premises.costs,
      },
    })).rejects.toMatchObject({ name: 'CompositionDraftError', code });
  });

  it('recusa regra de IOF duplicada pela chave finalidade e direção', async () => {
    const base = await baseScenario();
    await expect(materializeCompositionDraft({
      base, evidenceProfiles: [], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'IOF duplicado', participantChanges: [],
        windowDays: 7,
        costs: {
          ...base.premises.costs,
          iof_por_finalidade: [
            { finalidade: 'SERVICES', direcao: 'OUT', aliquota: '0.01' },
            { finalidade: 'SERVICES', direcao: 'OUT', aliquota: '0.02' },
          ],
        },
      },
    })).rejects.toEqual(expect.objectContaining<Partial<CompositionDraftError>>({
      code: 'IOF_RULE_DUPLICATE',
    }));
  });

  it.each([
    ['DUPLICATE_PROFILE', 'profile-a', 'company-new', OWNER],
    ['DUPLICATE_COMPANY', 'profile-new', 'company-a', OWNER],
    ['OWNER_MISMATCH', 'profile-new', 'company-new', 'foreign-owner'],
  ] as const)('recusa Perfil adicionado com %s', async (code, id, companyId, ownerSub) => {
    const base = await baseScenario();
    const profileA = await profileFixture('profile-a', 'company-a');
    const addedProfile = await profileFixture(id, companyId, ownerSub);
    await expect(materializeCompositionDraft({
      base, evidenceProfiles: [profileA, addedProfile], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Perfil inválido',
        participantChanges: [{
          kind: 'ADD_PROFILE', profile: addedProfile,
          explicit: {
            participantId: PARTICIPANT_C, generatorProfile: 'tesouraria_corporativa',
            seed: '43', deadline: { mode: 'PROFILE' }, efx: false,
            purposeOut: 'SERVICES', purposeIn: 'GOODS',
          },
        }],
        windowDays: 7, costs: base.premises.costs,
      },
    })).rejects.toMatchObject({ code });
  });

  it('permite substituir o Perfil removido por outro da mesma empresa', async () => {
    const base = await baseScenario();
    const profileB = await profileFixture('profile-b', 'company-b');
    const replacement = await profileFixture('profile-b-v2', 'company-b');
    const result = await materializeCompositionDraft({
      base, evidenceProfiles: [profileB, replacement], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Nova versão de B',
        participantChanges: [
          { kind: 'REMOVE_PARTICIPANT', participantId: PARTICIPANT_B },
          {
            kind: 'ADD_PROFILE', profile: replacement,
            explicit: {
              participantId: PARTICIPANT_C, generatorProfile: 'tesouraria_corporativa',
              seed: '43', deadline: { mode: 'PROFILE' }, efx: false,
              purposeOut: 'SERVICES', purposeIn: 'GOODS',
            },
          },
        ],
        windowDays: 7, costs: base.premises.costs,
      },
    });
    expect(result.input.participants.map((item) => item.id))
      .toEqual([PARTICIPANT_A, PARTICIPANT_C]);
  });

  it('anexa Perfil e cenário na mesma revisão do Estudo', async () => {
    const base = await baseScenario();
    const study = await createStudy({
      id: '00000000-0000-4000-8000-000000000301', ownerSub: OWNER,
      name: 'Estudo atômico',
      baseScenario: {
        id: base.id, revision: base.revision, name: base.name,
        sourceSnapshot: base.sourceSnapshot, premises: base.premises, period: base.period,
      },
      now: NOW,
    });
    const profileC = await profileFixture('profile-c', 'company-c');
    const materialized = await materializeCompositionDraft({
      base: study.scenarios[0]!, evidenceProfiles: [profileC], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Com C',
        participantChanges: [{
          kind: 'ADD_PROFILE', profile: profileC,
          explicit: {
            participantId: PARTICIPANT_C, generatorProfile: 'tesouraria_corporativa',
            seed: '43', deadline: { mode: 'PROFILE' }, efx: false,
            purposeOut: 'SERVICES', purposeIn: 'GOODS',
          },
        }],
        windowDays: 7, costs: study.scenarios[0]!.premises.costs,
      },
    });
    const sourceSnapshot = structuredClone(
      study.scenarios[0]!.sourceSnapshot,
    ) as DeepMutable<PortfolioSourceSnapshot>;
    sourceSnapshot.generationInputSnapshot = structuredClone(
      materialized.input,
    ) as DeepMutable<EffectiveInput>;
    const scenario: ScenarioDraft = {
      id: '00000000-0000-4000-8000-000000000302', revision: 1,
      name: 'Com C', sourceSnapshot,
      premises: study.scenarios[0]!.premises,
      period: study.scenarios[0]!.period,
    };

    const next = await appendCompositionHypothesis(study, {
      scenario, profiles: [profileC], recordedAt: NOW,
    });

    expect(next.revision).toBe(study.revision + 1);
    expect(next.scenarios.map((item) => item.id)).toContain(scenario.id);
    expect(next.evidenceSnapshots.map((item) => item.profile.id)).toEqual(['profile-c']);
    expect(study.scenarios).toHaveLength(1);
    expect(study.evidenceSnapshots).toHaveLength(0);
  });

  it('recusa evidência nova que não participa do cenário atômico', async () => {
    const base = await baseScenario();
    const study = await createStudy({
      id: '00000000-0000-4000-8000-000000000311', ownerSub: OWNER,
      name: 'Estudo inconsistente',
      baseScenario: {
        id: base.id, revision: base.revision, name: base.name,
        sourceSnapshot: base.sourceSnapshot, premises: base.premises, period: base.period,
      },
      now: NOW,
    });
    const unrelated = await profileFixture('profile-c', 'company-c');
    await expect(appendCompositionHypothesis(study, {
      scenario: {
        id: '00000000-0000-4000-8000-000000000312', revision: 1,
        name: 'Sem C', sourceSnapshot: study.scenarios[0]!.sourceSnapshot,
        premises: study.scenarios[0]!.premises, period: study.scenarios[0]!.period,
      },
      profiles: [unrelated], recordedAt: NOW,
    })).rejects.toThrow('Evidência de Perfil não participa do cenário da hipótese.');
  });

  it('recusa origem sintética que não seja a simulação por Perfil', async () => {
    const snapshot = makeSyntheticSnapshot();
    snapshot.generationInputSnapshot = effectiveInput() as DeepMutable<EffectiveInput>;
    const study = await createStudy({
      id: '00000000-0000-4000-8000-000000000321', ownerSub: OWNER,
      name: 'Sintético legado', baseScenario: makeScenarioDraft({ sourceSnapshot: snapshot }), now: NOW,
    });
    await expect(materializeCompositionDraft({
      base: study.scenarios[0]!, evidenceProfiles: [], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Inválida', participantChanges: [],
        windowDays: 7, costs: study.scenarios[0]!.premises.costs,
      },
    })).rejects.toMatchObject({ code: 'INCOMPATIBLE_COMPOSITION' });
  });

  it('constrói cenário V3 completo sem modificar a base', async () => {
    const base = await baseScenario();
    const frozen = structuredClone(base);
    const costs = {
      ...structuredClone(base.premises.costs),
      iof_por_finalidade: [{ finalidade: 'SERVICES', direcao: 'OUT' as const, aliquota: '0.01' }],
    };
    const materialized = await materializeCompositionDraft({
      base, evidenceProfiles: [], recordedAt: NOW,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'IOF específico', participantChanges: [],
        windowDays: 5, costs,
      },
    });
    const sourceSnapshot = await buildCompositionSourceSnapshot(
      base.sourceSnapshot, materialized, NOW,
    );
    const draft = buildCompositionScenarioDraft({
      base,
      hypothesis: {
        kind: 'PROFILE_COMPOSITION', name: 'IOF específico', participantChanges: [],
        windowDays: 5, costs,
      },
      sourceSnapshot,
      id: '00000000-0000-4000-8000-000000000401',
      recordedAt: NOW,
    });

    expect(draft).toMatchObject({
      name: 'IOF específico', revision: 1,
      premises: { windowDays: 5, costs: { iof_por_finalidade: costs.iof_por_finalidade } },
    });
    expect(draft.inputProvenance?.premises.windowDays.kind).toBe('USER_ESTIMATE');
    expect(base).toEqual(frozen);
  });
});
