import { describe, expect, it } from 'vitest';

import { validatePreparationRequest } from '../api/validators';
import type { ObservedCase, ObservedOrder } from '../cases/domain';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import type { OperationalProfileVersion } from '../profiles/domain';
import { fingerprintOperationalProfile } from '../profiles/fingerprints';
import { createStudy } from '../study/domain';
import { makeScenarioDraft } from '../study/fixtures';
import type { DeepMutable, ScenarioDocument } from '../study/model';
import {
  assertExactEffectiveSources,
  buildProfileMvpPreparationRequest,
  deriveProfileMvpParticipant,
  deriveProfileMvpSelection,
  type ProfileMvpExplicitFields,
  type ProfileMvpParticipantDraft,
} from './profileMvp';

const OWNER = 'owner-1';
const NOW = '2026-09-20T12:00:00Z';
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

function observedCase(): ObservedCase {
  return {
    schemaVersion: '2.0.0', id: 'case-profile-mvp', ownerSub: OWNER,
    companyId: 'company-a', status: 'CONFIRMED', revision: 1,
    window: { startDate: '2026-01-01', endDate: '2026-01-31', closingDate: '2026-01-31' },
    orders: [observedOrder('out', 'OUT'), observedOrder('in', 'IN')],
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

async function profileFixture(input: Readonly<{
  id?: string; companyId?: string; totalBrl?: string; coveredDays?: number;
  ticketP50?: string; outFraction?: string;
  unavailable?: 'volume' | 'ticket' | 'direction'; incompatible?: boolean;
}> = {}): Promise<OperationalProfileVersion> {
  const calculated = await calculateOperationalProfile({
    id: input.id ?? 'profile-a', ownerSub: OWNER,
    companyId: input.companyId ?? 'company-a', version: 1, createdAt: NOW,
    cases: [observedCase()],
  });
  const mutable = structuredClone(calculated) as DeepMutable<OperationalProfileVersion>;
  mutable.coverage.coveredDays = input.coveredDays ?? 31;
  mutable.metrics.volume.totalBrl = input.unavailable === 'volume'
    ? { state: 'NOT_COLLECTED', reason: 'ausente', evidence: [] }
    : { state: 'AVAILABLE', value: input.totalBrl ?? '3100', evidence: [] };
  mutable.metrics.ticketsBrl.p50 = input.unavailable === 'ticket'
    ? { state: 'NOT_COLLECTED', reason: 'ausente', evidence: [] }
    : { state: 'AVAILABLE', value: input.ticketP50 ?? '125', evidence: [] };
  mutable.metrics.direction = input.unavailable === 'direction'
    ? { state: 'NOT_COLLECTED', reason: 'ausente', evidence: [] }
    : {
        state: 'AVAILABLE',
        value: {
          out: { volumeBrl: '1860', fraction: input.outFraction ?? '0.6' },
          in: { volumeBrl: '1240', fraction: '0.4' },
        },
        evidence: [],
      };
  if (input.incompatible) {
    mutable.compatibility = {
      ...mutable.compatibility,
      compatible: false,
      blockers: [{
        code: 'INVALID_STATUS',
        message: 'Caso incompatível para o Perfil.',
        caseIds: ['case-profile-mvp'],
      }],
    };
  }
  mutable.documentFingerprint = await fingerprintOperationalProfile(mutable);
  return mutable as OperationalProfileVersion;
}

function explicitFixture(participantId = '00000000-0000-4000-8000-000000000101'): ProfileMvpExplicitFields {
  return {
    participantId, generatorProfile: 'tesouraria_corporativa', seed: '42',
    deadline: { mode: 'FIXED', days: 7 }, efx: false,
    purposeOut: 'SERVICES', purposeIn: 'GOODS',
  };
}

describe('deriveProfileMvpParticipant', () => {
  it('deriva volume mensal, ticket p50 e fração OUT sem usar fallback', async () => {
    const result = await deriveProfileMvpParticipant(await profileFixture(), explicitFixture(), OWNER);
    expect(result).toMatchObject({ ok: true, value: {
      monthlyVolumeBrl: '3000', ticketMedianBrl: '125', outFraction: '0.6',
    } });
  });

  it.each(['volume', 'ticket', 'direction'] as const)(
    'bloqueia quando %s não está disponível',
    async (metric) => {
      const result = await deriveProfileMvpParticipant(
        await profileFixture({ unavailable: metric }), explicitFixture(), OWNER,
      );
      expect(result).toMatchObject({ ok: false, blockers: [{ code: 'METRIC_UNAVAILABLE' }] });
    },
  );

  it('arredonda volume recorrente para seis casas com HALF_UP', async () => {
    const result = await deriveProfileMvpParticipant(
      await profileFixture({ totalBrl: '1', coveredDays: 7 }), explicitFixture(), OWNER,
    );
    expect(result).toMatchObject({ ok: true, value: { monthlyVolumeBrl: '4.285714' } });
  });

  it.each([
    [{ ticketP50: '0' }, 'INVALID_DECIMAL'],
    [{ ticketP50: '1000000000000.000001' }, 'INVALID_DECIMAL'],
    [{ outFraction: '0.1234567890123' }, 'INVALID_DECIMAL'],
  ] as const)('bloqueia métrica disponível fora do contrato %#', async (override, code) => {
    const result = await deriveProfileMvpParticipant(
      await profileFixture(override), explicitFixture(), OWNER,
    );
    expect(result).toMatchObject({ ok: false, blockers: [{ code }] });
  });

  it('bloqueia owner divergente, fingerprint adulterado e Perfil incompatível', async () => {
    const ownerMismatch = await deriveProfileMvpParticipant(
      await profileFixture(), explicitFixture(), 'other-owner',
    );
    const invalidFingerprint = structuredClone(await profileFixture()) as DeepMutable<OperationalProfileVersion>;
    invalidFingerprint.documentFingerprint = 'f'.repeat(64);
    const invalid = await deriveProfileMvpParticipant(invalidFingerprint, explicitFixture(), OWNER);
    const incompatible = await deriveProfileMvpParticipant(
      await profileFixture({ incompatible: true }), explicitFixture(), OWNER,
    );
    expect(ownerMismatch).toMatchObject({ ok: false, blockers: [{ code: 'OWNER_MISMATCH' }] });
    expect(invalid).toMatchObject({ ok: false, blockers: [{ code: 'INVALID_PROFILE' }] });
    expect(incompatible.ok).toBe(false);
    if (!incompatible.ok) {
      expect(incompatible.blockers.every((item) => item.code === 'INVALID_PROFILE')).toBe(true);
    }
  });
});

describe('deriveProfileMvpSelection', () => {
  it('bloqueia duas versões da mesma empresa', async () => {
    const profileA = await profileFixture({ id: 'profile-a' });
    const profileB = await profileFixture({ id: 'profile-b' });
    const result = await deriveProfileMvpSelection(
      [profileA, profileB],
      {
        'profile-a': explicitFixture(),
        'profile-b': explicitFixture('00000000-0000-4000-8000-000000000102'),
      },
      OWNER,
    );
    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'DUPLICATE_COMPANY' }] });
  });
});

const PARTICIPANT_A = '00000000-0000-4000-8000-000000000101';
const PARTICIPANT_B = '00000000-0000-4000-8000-000000000102';

function participantFixture(
  participantId: string,
  profileId: string,
  fingerprintCharacter: string,
): ProfileMvpParticipantDraft {
  return {
    profileId,
    companyId: `company-${profileId}`,
    profileFingerprint: fingerprintCharacter.repeat(64),
    participantId,
    monthlyVolumeBrl: '3000',
    ticketMedianBrl: '125',
    outFraction: '0.6',
    generatorProfile: 'tesouraria_corporativa',
    seed: participantId === PARTICIPANT_A ? '42' : '43',
    deadline: { mode: 'FIXED', days: 7 },
    efx: false,
    purposeOut: 'SERVICES',
    purposeIn: 'GOODS',
  };
}

async function scenarioFixture() {
  const study = await createStudy({
    id: '00000000-0000-4000-8000-000000000201',
    ownerSub: OWNER,
    name: 'Estudo Perfil MVP',
    baseScenario: makeScenarioDraft(),
    now: NOW,
  });
  return study.scenarios[0]!;
}

describe('buildProfileMvpPreparationRequest', () => {
  it('monta um participante por Perfil e registra a origem textual de cada derivação', async () => {
    const scenario = await scenarioFixture();
    const request = buildProfileMvpPreparationRequest({
      identity: {
        studyId: '00000000-0000-4000-8000-000000000201',
        scenarioId: scenario.id,
        scenarioRevision: 1,
      },
      scenario,
      participants: [
        participantFixture(PARTICIPANT_A, 'profile-a', 'a'),
        participantFixture(PARTICIPANT_B, 'profile-b', 'b'),
      ],
      requestId: '00000000-0000-4000-8000-000000000301',
      expectedBuildSha: 'c'.repeat(40),
      recordedAt: NOW,
    });

    expect(request.input.participants.map((item) => item.id)).toEqual([PARTICIPANT_A, PARTICIPANT_B]);
    expect(request.input.sources[`/participants/${PARTICIPANT_A}/monthly_volume_brl`]).toEqual({
      kind: 'ESTIMATIVA_USUARIO',
      source: `profile-mvp:profile-a@${'a'.repeat(64)}:derived`,
      recorded_at: NOW,
    });
    expect(validatePreparationRequest(request)).toBe(true);
    expect(() => assertExactEffectiveSources(request.input)).not.toThrow();
  });

  it('usa deadline/days somente em FIXED e escapa finalidade como JSON Pointer RFC 6901', async () => {
    const scenario = structuredClone(await scenarioFixture()) as DeepMutable<ScenarioDocument>;
    scenario.premises.costs.iof_por_finalidade = [{
      finalidade: 'A/B~C', direcao: 'OUT', aliquota: '0.01',
    }];
    const fixed = participantFixture(PARTICIPANT_A, 'profile-a', 'a');
    const request = buildProfileMvpPreparationRequest({
      identity: { studyId: '00000000-0000-4000-8000-000000000201', scenarioId: scenario.id, scenarioRevision: 1 },
      scenario,
      participants: [fixed],
      requestId: '00000000-0000-4000-8000-000000000301',
      expectedBuildSha: 'c'.repeat(40),
      recordedAt: NOW,
    });
    expect(Object.keys(request.input.sources)).toContain('/costs/iof_por_finalidade/A~1B~0C/OUT');
    expect(Object.keys(request.input.sources)).toContain(`/participants/${PARTICIPANT_A}/deadline/days`);

    const profileDeadline = buildProfileMvpPreparationRequest({
      identity: { studyId: '00000000-0000-4000-8000-000000000201', scenarioId: scenario.id, scenarioRevision: 1 },
      scenario,
      participants: [{ ...fixed, deadline: { mode: 'PROFILE' } }],
      requestId: '00000000-0000-4000-8000-000000000302',
      expectedBuildSha: 'c'.repeat(40),
      recordedAt: NOW,
    });
    expect(Object.keys(profileDeadline.input.sources)).not.toContain(`/participants/${PARTICIPANT_A}/deadline/days`);
  });

  it.each(['missing', 'extra'] as const)('recusa conjunto de sources %s', async (kind) => {
    const scenario = await scenarioFixture();
    const request = buildProfileMvpPreparationRequest({
      identity: { studyId: '00000000-0000-4000-8000-000000000201', scenarioId: scenario.id, scenarioRevision: 1 },
      scenario,
      participants: [participantFixture(PARTICIPANT_A, 'profile-a', 'a')],
      requestId: '00000000-0000-4000-8000-000000000301',
      expectedBuildSha: 'c'.repeat(40),
      recordedAt: NOW,
    });
    const input = structuredClone(request.input);
    if (kind === 'missing') delete input.sources['/warmup_days'];
    else input.sources['/unexpected'] = {
      kind: 'ESTIMATIVA_USUARIO', source: 'unexpected', recorded_at: NOW,
    };
    expect(() => assertExactEffectiveSources(input)).toThrow('Sources do EffectiveInput não correspondem ao contrato exato.');
  });

  it('recusa draft de participante inválido antes de criar request HTTP', async () => {
    const scenario = await scenarioFixture();
    expect(() => buildProfileMvpPreparationRequest({
      identity: { studyId: '00000000-0000-4000-8000-000000000201', scenarioId: scenario.id, scenarioRevision: 1 },
      scenario,
      participants: [{
        ...participantFixture(PARTICIPANT_A, 'profile-a', 'a'),
        outFraction: '1.1',
      }],
      requestId: '00000000-0000-4000-8000-000000000301',
      expectedBuildSha: 'c'.repeat(40),
      recordedAt: NOW,
    })).toThrow('Participante por Perfil inválido.');
  });
});
