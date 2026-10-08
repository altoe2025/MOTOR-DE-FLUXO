import Decimal from 'decimal.js';

import type { PreparationRequest } from '../api/client';
import type { components } from '../api/generated';
import { validatePreparationRequest } from '../api/validators';
import type { OperationalProfileVersion } from '../profiles/domain';
import { validateOperationalProfile } from '../profiles/validation';
import type { DeepMutable, EffectiveInput, ScenarioDocument } from '../study/model';

type EffectiveParticipant = components['schemas']['EffectiveParticipant'];

export type ProfileMvpBlockerCode =
  | 'METRIC_UNAVAILABLE'
  | 'INVALID_COVERAGE'
  | 'INVALID_DECIMAL'
  | 'MISSING_EXPLICIT_FIELD'
  | 'INVALID_PROFILE'
  | 'INCOMPATIBLE_PROFILE'
  | 'OWNER_MISMATCH'
  | 'DUPLICATE_COMPANY'
  | 'EMPTY_SELECTION'
  | 'TOO_MANY_PROFILES';

export type ProfileMvpBlocker = Readonly<{
  code: ProfileMvpBlockerCode;
  path: string;
  message: string;
}>;

export type ProfileMvpParticipantDraft = Readonly<{
  profileId: string;
  companyId: string;
  profileFingerprint: string;
  participantId: string;
  monthlyVolumeBrl: string;
  ticketMedianBrl: string;
  outFraction: string;
  generatorProfile: EffectiveParticipant['profile'];
  seed: EffectiveParticipant['seed'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

export type ProfileMvpExplicitFields = Readonly<{
  participantId: string;
  generatorProfile: EffectiveParticipant['profile'];
  seed: EffectiveParticipant['seed'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

export type ProfileMvpDerivation =
  | Readonly<{ ok: true; value: ProfileMvpParticipantDraft }>
  | Readonly<{ ok: false; blockers: readonly ProfileMvpBlocker[] }>;

export type ProfileMvpSelection =
  | Readonly<{ ok: true; value: readonly ProfileMvpParticipantDraft[] }>
  | Readonly<{ ok: false; blockers: readonly ProfileMvpBlocker[] }>;

export type BuildProfileMvpPreparationRequestInput = Readonly<{
  identity: Readonly<{
    studyId: string;
    scenarioId: string;
    scenarioRevision: number;
  }>;
  scenario: ScenarioDocument;
  participants: readonly ProfileMvpParticipantDraft[];
  requestId: string;
  expectedBuildSha: string;
  recordedAt: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED = /^(0|[1-9][0-9]*)$/;
const MAX_SEED = 9223372036854775807n;

function blocker(code: ProfileMvpBlockerCode, path: string, message: string): ProfileMvpBlocker {
  return { code, path, message };
}

function parseDecimal(value: string, maxPlaces?: number): Decimal | null {
  const match = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (match === null || (maxPlaces !== undefined && (match[1]?.length ?? 0) > maxPlaces)) {
    return null;
  }
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalMoney(value: Decimal): string {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

function explicitBlockers(explicit: ProfileMvpExplicitFields): ProfileMvpBlocker[] {
  const issues: ProfileMvpBlocker[] = [];
  if (!UUID.test(explicit.participantId)) {
    issues.push(blocker('MISSING_EXPLICIT_FIELD', '/participantId', 'Informe um participante UUID válido.'));
  }
  if (!SEED.test(explicit.seed)
      || explicit.seed.length > 19
      || BigInt(explicit.seed) > MAX_SEED) {
    issues.push(blocker('MISSING_EXPLICIT_FIELD', '/seed', 'Informe uma seed inteira válida.'));
  }
  for (const [path, value] of [['/purposeOut', explicit.purposeOut], ['/purposeIn', explicit.purposeIn]] as const) {
    if (value.length === 0 || value.trim() !== value) {
      issues.push(blocker('MISSING_EXPLICIT_FIELD', path, 'Informe a finalidade sem espaços externos.'));
    }
  }
  if (explicit.deadline.mode === 'FIXED'
      && (!Number.isInteger(explicit.deadline.days) || explicit.deadline.days < 0)) {
    issues.push(blocker('MISSING_EXPLICIT_FIELD', '/deadline/days', 'Informe um prazo inteiro não negativo.'));
  }
  return issues;
}

export async function deriveProfileMvpParticipant(
  profile: OperationalProfileVersion,
  explicit: ProfileMvpExplicitFields,
  expectedOwnerSub: string,
): Promise<ProfileMvpDerivation> {
  const validation = await validateOperationalProfile(profile);
  if (!validation.ok) {
    return {
      ok: false,
      blockers: validation.issues.map((issue) =>
        blocker('INVALID_PROFILE', issue.path, issue.message)),
    };
  }
  const issues = explicitBlockers(explicit);
  if (profile.ownerSub !== expectedOwnerSub) {
    issues.push(blocker('OWNER_MISMATCH', '/ownerSub', 'Owner do Perfil diverge do estudo.'));
  }
  if (!profile.compatibility.compatible) {
    issues.push(blocker('INCOMPATIBLE_PROFILE', '/compatibility', 'Perfil incompatível não pode gerar simulação.'));
  }
  if (!Number.isInteger(profile.coverage.coveredDays) || profile.coverage.coveredDays <= 0) {
    issues.push(blocker('INVALID_COVERAGE', '/coverage/coveredDays', 'Cobertura deve ser positiva.'));
  }

  const volume = profile.metrics.volume.totalBrl;
  const ticket = profile.metrics.ticketsBrl.p50;
  const direction = profile.metrics.direction;
  for (const [path, metric] of [
    ['/metrics/volume/totalBrl', volume],
    ['/metrics/ticketsBrl/p50', ticket],
    ['/metrics/direction', direction],
  ] as const) {
    if (metric.state !== 'AVAILABLE') {
      issues.push(blocker('METRIC_UNAVAILABLE', path, 'Métrica obrigatória indisponível.'));
    }
  }
  if (issues.length > 0) return { ok: false, blockers: issues };
  if (volume.state !== 'AVAILABLE' || ticket.state !== 'AVAILABLE' || direction.state !== 'AVAILABLE') {
    throw new Error('Guard de disponibilidade não reconciliou.');
  }

  const total = parseDecimal(volume.value);
  const median = parseDecimal(ticket.value, 6);
  const outFraction = parseDecimal(direction.value.out.fraction, 12);
  if (total === null || median === null || outFraction === null
      || total.lessThanOrEqualTo(0) || median.lessThanOrEqualTo(0) || median.greaterThan('1e12')
      || outFraction.isNegative() || outFraction.greaterThan(1)) {
    return {
      ok: false,
      blockers: [blocker('INVALID_DECIMAL', '/metrics', 'Perfil contém decimal inválido para a simulação.')],
    };
  }
  const monthlyVolume = total.div(profile.coverage.coveredDays).times(30);
  if (monthlyVolume.lessThan('0.000001') || monthlyVolume.greaterThan('1e12')) {
    return {
      ok: false,
      blockers: [blocker('INVALID_DECIMAL', '/metrics/volume/totalBrl', 'Volume mensal fora do intervalo aceito.')],
    };
  }

  return {
    ok: true,
    value: {
      profileId: profile.id,
      companyId: profile.companyId,
      profileFingerprint: profile.documentFingerprint,
      participantId: explicit.participantId,
      monthlyVolumeBrl: canonicalMoney(monthlyVolume),
      ticketMedianBrl: median.toString(),
      outFraction: outFraction.toString(),
      generatorProfile: explicit.generatorProfile,
      seed: explicit.seed,
      deadline: structuredClone(explicit.deadline),
      efx: explicit.efx,
      purposeOut: explicit.purposeOut,
      purposeIn: explicit.purposeIn,
    },
  };
}

export async function deriveProfileMvpSelection(
  profiles: readonly OperationalProfileVersion[],
  explicitById: Readonly<Record<string, ProfileMvpExplicitFields>>,
  expectedOwnerSub: string,
): Promise<ProfileMvpSelection> {
  if (profiles.length === 0) {
    return { ok: false, blockers: [blocker('EMPTY_SELECTION', '/', 'Selecione ao menos um Perfil.')] };
  }
  if (profiles.length > 100) {
    return { ok: false, blockers: [blocker('TOO_MANY_PROFILES', '/', 'Selecione no máximo 100 Perfis.')] };
  }
  const duplicatedCompanies = new Set<string>();
  const seenCompanies = new Set<string>();
  for (const profile of profiles) {
    if (seenCompanies.has(profile.companyId)) duplicatedCompanies.add(profile.companyId);
    seenCompanies.add(profile.companyId);
  }
  if (duplicatedCompanies.size > 0) {
    return {
      ok: false,
      blockers: [...duplicatedCompanies].map((companyId) =>
        blocker('DUPLICATE_COMPANY', `/companies/${companyId}`, 'Escolha apenas uma versão de Perfil por empresa.')),
    };
  }

  const values: ProfileMvpParticipantDraft[] = [];
  const blockers: ProfileMvpBlocker[] = [];
  for (const profile of profiles) {
    const explicit = explicitById[profile.id];
    if (explicit === undefined) {
      blockers.push(blocker('MISSING_EXPLICIT_FIELD', `/profiles/${profile.id}`, 'Complete os campos explícitos do Perfil.'));
      continue;
    }
    const result = await deriveProfileMvpParticipant(profile, explicit, expectedOwnerSub);
    if (result.ok) values.push(result.value);
    else blockers.push(...result.blockers);
  }
  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: values };
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function requiredEffectiveSourcePaths(input: EffectiveInput): readonly string[] {
  return [
    '/warmup_days',
    '/measurement_days',
    '/window_days',
    '/costs/iof_out',
    '/costs/iof_in',
    '/costs/carry_cnr',
    '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa',
    '/costs/custo_oportunidade_aa',
    '/costs/ptax',
    ...input.costs.iof_por_finalidade.map((rule) =>
      `/costs/iof_por_finalidade/${escapeJsonPointerSegment(rule.finalidade)}/${rule.direcao}`),
    ...input.participants.flatMap((participant) => {
      const prefix = `/participants/${participant.id}`;
      return [
        `${prefix}/profile`,
        `${prefix}/seed`,
        `${prefix}/monthly_volume_brl`,
        `${prefix}/ticket_median_brl`,
        `${prefix}/out_fraction`,
        `${prefix}/deadline/mode`,
        ...(participant.deadline.mode === 'FIXED' ? [`${prefix}/deadline/days`] : []),
        `${prefix}/eh_efx`,
        `${prefix}/purpose_out`,
        `${prefix}/purpose_in`,
      ];
    }),
  ];
}

export function assertExactEffectiveSources(input: EffectiveInput): void {
  const expected = [...requiredEffectiveSourcePaths(input)].sort();
  const actual = Object.keys(input.sources).sort();
  if (expected.length !== actual.length
      || expected.some((path, index) => path !== actual[index])) {
    throw new Error('Sources do EffectiveInput não correspondem ao contrato exato.');
  }
}

function periodDays(scenario: ScenarioDocument): Readonly<{
  warmupDays: number;
  measurementDays: number;
}> {
  const period = scenario.period.httpPeriod;
  if (period.modo === 'NATURAL') {
    return {
      warmupDays: period.dias_aquecimento,
      measurementDays: period.periodo_medicao_dias,
    };
  }
  if (!('executableHorizonDays' in scenario.period)) {
    throw new Error('Horizonte executável ausente no período legado.');
  }
  return { warmupDays: 0, measurementDays: scenario.period.executableHorizonDays };
}

export function buildProfileMvpPreparationRequest(
  input: BuildProfileMvpPreparationRequestInput,
): PreparationRequest {
  if (input.participants.length === 0 || input.participants.length > 100) {
    throw new Error('Selecione entre um e 100 Perfis.');
  }
  const participantIds = new Set(input.participants.map((participant) => participant.participantId));
  if (participantIds.size !== input.participants.length) {
    throw new Error('IDs de participante duplicados.');
  }
  for (const participant of input.participants) {
    const explicitIssues = explicitBlockers({
      participantId: participant.participantId,
      generatorProfile: participant.generatorProfile,
      seed: participant.seed,
      deadline: participant.deadline,
      efx: participant.efx,
      purposeOut: participant.purposeOut,
      purposeIn: participant.purposeIn,
    });
    const monthly = parseDecimal(participant.monthlyVolumeBrl, 6);
    const ticket = parseDecimal(participant.ticketMedianBrl, 6);
    const fraction = parseDecimal(participant.outFraction, 12);
    if (explicitIssues.length > 0
        || monthly === null || monthly.lessThanOrEqualTo(0) || monthly.greaterThan('1e12')
        || ticket === null || ticket.lessThanOrEqualTo(0) || ticket.greaterThan('1e12')
        || fraction === null || fraction.isNegative() || fraction.greaterThan(1)) {
      throw new Error('Participante por Perfil inválido.');
    }
  }
  const { warmupDays, measurementDays } = periodDays(input.scenario);
  const participants: DeepMutable<EffectiveInput>['participants'] = input.participants.map((participant) => ({
    id: participant.participantId,
    profile: participant.generatorProfile,
    seed: participant.seed,
    monthly_volume_brl: participant.monthlyVolumeBrl,
    ticket_median_brl: participant.ticketMedianBrl,
    out_fraction: participant.outFraction,
    deadline: structuredClone(participant.deadline),
    eh_efx: participant.efx,
    purpose_out: participant.purposeOut,
    purpose_in: participant.purposeIn,
  }));
  const effectiveInput: DeepMutable<EffectiveInput> = {
    participants,
    warmup_days: warmupDays,
    measurement_days: measurementDays,
    window_days: input.scenario.premises.windowDays,
    costs: structuredClone(input.scenario.premises.costs) as DeepMutable<EffectiveInput>['costs'],
    sources: {},
  };
  const participantById = new Map(input.participants.map((participant) => [
    participant.participantId,
    participant,
  ]));
  effectiveInput.sources = Object.fromEntries(requiredEffectiveSourcePaths(effectiveInput).map((path) => {
    const participantId = path.startsWith('/participants/') ? path.split('/')[2] : undefined;
    const participant = participantId === undefined ? undefined : participantById.get(participantId);
    return [path, {
      kind: 'ESTIMATIVA_USUARIO' as const,
      source: participant === undefined
        ? 'profile-mvp:scenario-base'
        : `profile-mvp:${participant.profileId}@${participant.profileFingerprint}:derived`,
      recorded_at: input.recordedAt,
    }];
  }));
  assertExactEffectiveSources(effectiveInput);
  const request: PreparationRequest = {
    preparation_version: '1.0.0',
    request_id: input.requestId,
    study_id: input.identity.studyId,
    scenario_id: input.identity.scenarioId,
    scenario_revision: input.identity.scenarioRevision,
    expected_build_sha: input.expectedBuildSha,
    input: effectiveInput,
  };
  if (!validatePreparationRequest(request)) {
    throw new Error('Request de preparação por Perfil inválido.');
  }
  return request;
}
