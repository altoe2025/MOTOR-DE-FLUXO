import Decimal from 'decimal.js';

import type { OperationalProfileVersion } from '../profiles/domain';
import { fingerprintPortfolioSource } from '../study/fingerprints';
import { PROFILE_MVP_EXAMPLE_ID } from '../study/domain';
import type {
  CostPremises, DeepMutable, EffectiveInput, PortfolioSourceSnapshot, ScenarioDocument,
  ScenarioDraft,
} from '../study/model';
import { mergeScenarioInputProvenance, validateMvpScalarCosts } from './hypothesis';
import {
  assertExactEffectiveSources,
  deriveProfileMvpParticipant,
  requiredEffectiveSourcePaths,
  type ProfileMvpExplicitFields,
} from './profileMvp';

type EffectiveParticipant = EffectiveInput['participants'][number];

export type CompositionParticipantPatch = Readonly<Partial<{
  monthlyVolumeBrl: string;
  ticketMedianBrl: string;
  outFraction: string;
  generatorProfile: EffectiveParticipant['profile'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>>;

export type CompositionParticipantChange =
  | Readonly<{
      kind: 'ADD_PROFILE';
      profile: OperationalProfileVersion;
      explicit: ProfileMvpExplicitFields;
    }>
  | Readonly<{ kind: 'REMOVE_PARTICIPANT'; participantId: string }>
  | Readonly<{
      kind: 'UPDATE_PARTICIPANT';
      participantId: string;
      patch: CompositionParticipantPatch;
    }>;

export type CompositionHypothesisDraft = Readonly<{
  kind: 'PROFILE_COMPOSITION';
  name: string;
  participantChanges: readonly CompositionParticipantChange[];
  windowDays: number;
  costs: CostPremises;
}>;

export type CompositionInputDiff = Readonly<{
  added: readonly Readonly<{ participantId: string }>[];
  removed: readonly Readonly<{ participantId: string }>[];
  modified: readonly Readonly<{ participantId: string; fields: readonly string[] }>[];
}>;

export type CompositionMaterialization = Readonly<{
  input: EffectiveInput;
  profilesToAttach: readonly OperationalProfileVersion[];
  diff: CompositionInputDiff;
  requiresPreparation: boolean;
}>;

export type MaterializeCompositionDraftInput = Readonly<{
  base: ScenarioDocument;
  evidenceProfiles: readonly OperationalProfileVersion[];
  draft: CompositionHypothesisDraft;
  recordedAt: string;
}>;

export type CompositionDraftErrorCode =
  | 'EMPTY_COMPOSITION'
  | 'DUPLICATE_PROFILE'
  | 'DUPLICATE_COMPANY'
  | 'DUPLICATE_PARTICIPANT'
  | 'UNKNOWN_PARTICIPANT'
  | 'CONTRADICTORY_CHANGE'
  | 'INVALID_PARTICIPANT_PATCH'
  | 'PROFILE_UNAVAILABLE'
  | 'OWNER_MISMATCH'
  | 'IOF_RULE_DUPLICATE'
  | 'UNDECLARED_CHANGE'
  | 'INCOMPATIBLE_COMPOSITION';

export class CompositionDraftError extends Error {
  constructor(readonly code: CompositionDraftErrorCode, message: string) {
    super(message);
    this.name = 'CompositionDraftError';
  }
}

const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function fail(code: CompositionDraftErrorCode, message: string): never {
  throw new CompositionDraftError(code, message);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function checkedDecimal(
  value: string,
  field: string,
  options: Readonly<{ max: string; places: number; allowZero?: boolean }>,
): string {
  const match = DECIMAL.exec(value);
  if (match === null || (match[1]?.length ?? 0) > options.places) {
    return fail('INVALID_PARTICIPANT_PATCH', `${field} possui formato ou precisão inválida.`);
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative()
      || (options.allowZero !== true && parsed.isZero()) || parsed.greaterThan(options.max)) {
    return fail('INVALID_PARTICIPANT_PATCH', `${field} fora do intervalo permitido.`);
  }
  return parsed.toString();
}

function checkedPurpose(value: string, field: string): string {
  if (value.length === 0 || value.trim() !== value) {
    return fail('INVALID_PARTICIPANT_PATCH', `${field} inválida.`);
  }
  return value;
}

function hypothesisSource(recordedAt: string, original?: EffectiveInput['sources'][string]) {
  const source = original?.source.startsWith('profile-mvp:') === true
    ? original.source.replace(/:(?:derived|hypothesis)$/, ':hypothesis')
    : 'profile-mvp:hypothesis';
  return { kind: 'ESTIMATIVA_USUARIO' as const, source, recorded_at: recordedAt };
}

function participantSource(
  profile: OperationalProfileVersion,
  recordedAt: string,
): EffectiveInput['sources'][string] {
  return {
    kind: 'ESTIMATIVA_USUARIO',
    source: `profile-mvp:${profile.id}@${profile.documentFingerprint}:derived`,
    recorded_at: recordedAt,
  };
}

function participantPaths(input: EffectiveInput, participantId: string): readonly string[] {
  return requiredEffectiveSourcePaths(input)
    .filter((path) => path.startsWith(`/participants/${participantId}/`));
}

function applyPatch(
  participant: EffectiveParticipant,
  patch: CompositionParticipantPatch,
  sources: Record<string, EffectiveInput['sources'][string]>,
  recordedAt: string,
): EffectiveParticipant {
  const fields = Object.keys(patch) as (keyof CompositionParticipantPatch)[];
  if (fields.length === 0 || fields.some((field) => patch[field] === undefined)) {
    return fail('INVALID_PARTICIPANT_PATCH', 'Patch de participante vazio ou indefinido.');
  }
  const next = structuredClone(participant) as DeepMutable<EffectiveParticipant>;
  const prefix = `/participants/${participant.id}`;
  const mark = (path: string) => {
    sources[path] = hypothesisSource(recordedAt, sources[path]);
  };
  for (const field of fields) {
    const value = patch[field];
    if (field === 'monthlyVolumeBrl' && typeof value === 'string') {
      next.monthly_volume_brl = checkedDecimal(value, 'Volume mensal', { max: '1e12', places: 6 });
      mark(`${prefix}/monthly_volume_brl`);
    } else if (field === 'ticketMedianBrl' && typeof value === 'string') {
      next.ticket_median_brl = checkedDecimal(value, 'Ticket mediano', { max: '1e12', places: 6 });
      mark(`${prefix}/ticket_median_brl`);
    } else if (field === 'outFraction' && typeof value === 'string') {
      next.out_fraction = checkedDecimal(value, 'Fração OUT', {
        max: '1', places: 12, allowZero: true,
      });
      mark(`${prefix}/out_fraction`);
    } else if (field === 'generatorProfile' && typeof value === 'string') {
      next.profile = value as EffectiveParticipant['profile'];
      mark(`${prefix}/profile`);
    } else if (field === 'deadline' && value !== undefined && typeof value === 'object') {
      if (value.mode === 'FIXED'
          && (!Number.isInteger(value.days) || value.days < 0 || value.days > 1095)) {
        return fail('INVALID_PARTICIPANT_PATCH', 'Prazo fixo fora do intervalo permitido.');
      }
      next.deadline = structuredClone(value);
      mark(`${prefix}/deadline/mode`);
      if (value.mode === 'FIXED') mark(`${prefix}/deadline/days`);
      else delete sources[`${prefix}/deadline/days`];
    } else if (field === 'efx' && typeof value === 'boolean') {
      next.eh_efx = value;
      mark(`${prefix}/eh_efx`);
    } else if (field === 'purposeOut' && typeof value === 'string') {
      next.purpose_out = checkedPurpose(value, 'Finalidade OUT');
      mark(`${prefix}/purpose_out`);
    } else if (field === 'purposeIn' && typeof value === 'string') {
      next.purpose_in = checkedPurpose(value, 'Finalidade IN');
      mark(`${prefix}/purpose_in`);
    } else {
      return fail('INVALID_PARTICIPANT_PATCH', `Campo ${field} inválido.`);
    }
  }
  return next;
}

function canonicalCosts(
  costs: CostPremises,
  previous: CostPremises,
  recordedAt: string,
  sources: Record<string, EffectiveInput['sources'][string]>,
): CostPremises {
  validateMvpScalarCosts(costs);
  const scalarKeys = [
    'iof_out', 'iof_in', 'carry_cnr', 'spread_rail_bps',
    'custo_fixo_remessa', 'custo_oportunidade_aa', 'ptax',
  ] as const;
  for (const key of scalarKeys) {
    if (!new Decimal(costs[key]).equals(previous[key])) {
      const path = `/costs/${key}`;
      sources[path] = hypothesisSource(recordedAt, sources[path]);
    }
  }
  const seen = new Set<string>();
  const rules = [...costs.iof_por_finalidade]
    .map((rule) => structuredClone(rule))
    .sort((left, right) => `${left.finalidade}\0${left.direcao}`
      .localeCompare(`${right.finalidade}\0${right.direcao}`));
  for (const rule of rules) {
    const key = `${rule.finalidade}\0${rule.direcao}`;
    if (seen.has(key)) fail('IOF_RULE_DUPLICATE', 'Regra de IOF duplicada.');
    if (rule.finalidade.length === 0 || rule.finalidade.trim() !== rule.finalidade) {
      fail('INVALID_PARTICIPANT_PATCH', 'Finalidade da regra de IOF inválida.');
    }
    seen.add(key);
    checkedDecimal(rule.aliquota, 'Alíquota de IOF', { max: '1', places: 12, allowZero: true });
  }
  const canonical = (value: unknown) => JSON.stringify(value);
  const rulesChanged = canonical(rules) !== canonical(previous.iof_por_finalidade);
  if (rulesChanged) for (const path of Object.keys(sources)) {
    if (path.startsWith('/costs/iof_por_finalidade/')) delete sources[path];
  }
  const escape = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1');
  for (const rule of rulesChanged ? rules : []) {
    const path = `/costs/iof_por_finalidade/${escape(rule.finalidade)}/${rule.direcao}`;
    sources[path] = hypothesisSource(recordedAt);
  }
  return { ...structuredClone(costs), iof_por_finalidade: rules };
}

export async function materializeCompositionDraft(
  request: MaterializeCompositionDraftInput,
): Promise<CompositionMaterialization> {
  const { base, draft, recordedAt } = request;
  const source = base.sourceSnapshot.generationInputSnapshot;
  if (base.sourceSnapshot.source.kind !== 'SYNTHETIC'
      || base.sourceSnapshot.source.recipe.exampleId !== PROFILE_MVP_EXAMPLE_ID
      || source === undefined) {
    return fail('INCOMPATIBLE_COMPOSITION', 'A base não contém entrada sintética materializável.');
  }
  if (draft.kind !== 'PROFILE_COMPOSITION' || draft.name.length === 0
      || draft.name.trim() !== draft.name || draft.name.length > 120) {
    return fail('INCOMPATIBLE_COMPOSITION', 'Draft de composição inválido.');
  }
  if (!Number.isInteger(draft.windowDays) || draft.windowDays < 1 || draft.windowDays > 730) {
    return fail('INVALID_PARTICIPANT_PATCH', 'Janela fora do intervalo permitido.');
  }

  const participants = structuredClone(source.participants) as EffectiveParticipant[];
  const sources = structuredClone(source.sources) as Record<string, EffectiveInput['sources'][string]>;
  const touched = new Set<string>();
  const added: { participantId: string }[] = [];
  const removed: { participantId: string }[] = [];
  const modified: { participantId: string; fields: string[] }[] = [];
  const profilesToAttach: OperationalProfileVersion[] = [];
  const evidenceById = new Map(request.evidenceProfiles.map((profile) => [profile.id, profile]));
  const baseProfileIds = new Set<string>();
  const baseCompanyIds = new Set<string>();
  const profileIdByParticipant = new Map<string, string>();
  const companyIdByParticipant = new Map<string, string>();
  for (const participant of source.participants) {
    const lineage = source.sources[`/participants/${participant.id}/profile`]?.source
      .match(/^profile-mvp:(.+)@([0-9a-f]{64}):(?:derived|hypothesis)$/);
    if (lineage === undefined || lineage === null) {
      fail('INCOMPATIBLE_COMPOSITION', `Linhagem ausente para ${participant.id}.`);
    }
    const profileId = lineage[1]!;
    baseProfileIds.add(profileId);
    profileIdByParticipant.set(participant.id, profileId);
    const evidence = evidenceById.get(profileId);
    if (evidence !== undefined) {
      baseCompanyIds.add(evidence.companyId);
      companyIdByParticipant.set(participant.id, evidence.companyId);
    }
  }
  const addedProfileIds = new Set<string>();
  const addedCompanyIds = new Set<string>();

  for (const change of draft.participantChanges) {
    const participantId = change.kind === 'ADD_PROFILE'
      ? change.explicit.participantId : change.participantId;
    if (touched.has(participantId)) {
      return fail('CONTRADICTORY_CHANGE', `Participante ${participantId} possui operações contraditórias.`);
    }
    touched.add(participantId);
    const index = participants.findIndex((participant) => participant.id === participantId);
    if (change.kind === 'REMOVE_PARTICIPANT') {
      if (index < 0) fail('UNKNOWN_PARTICIPANT', `Participante ${participantId} não existe.`);
      participants.splice(index, 1);
      const removedProfileId = profileIdByParticipant.get(participantId);
      const removedCompanyId = companyIdByParticipant.get(participantId);
      if (removedProfileId !== undefined) baseProfileIds.delete(removedProfileId);
      if (removedCompanyId !== undefined) baseCompanyIds.delete(removedCompanyId);
      for (const path of Object.keys(sources)) {
        if (path.startsWith(`/participants/${participantId}/`)) delete sources[path];
      }
      removed.push({ participantId });
    } else if (change.kind === 'UPDATE_PARTICIPANT') {
      if (index < 0) fail('UNKNOWN_PARTICIPANT', `Participante ${participantId} não existe.`);
      participants[index] = applyPatch(participants[index]!, change.patch, sources, recordedAt);
      modified.push({ participantId, fields: Object.keys(change.patch).sort() });
    } else {
      if (index >= 0) fail('DUPLICATE_PARTICIPANT', `Participante ${participantId} já existe.`);
      if (baseProfileIds.has(change.profile.id) || addedProfileIds.has(change.profile.id)) {
        fail('DUPLICATE_PROFILE', 'Perfil duplicado na composição.');
      }
      if (baseCompanyIds.has(change.profile.companyId)
          || addedCompanyIds.has(change.profile.companyId)) {
        fail('DUPLICATE_COMPANY', 'Empresa duplicada na composição.');
      }
      const baseEvidence = [...baseProfileIds]
        .map((profileId) => evidenceById.get(profileId))
        .find((profile) => profile !== undefined);
      const expectedOwnerSub = baseEvidence?.ownerSub
        ?? request.evidenceProfiles[0]?.ownerSub
        ?? change.profile.ownerSub;
      const derived = await deriveProfileMvpParticipant(
        change.profile, change.explicit, expectedOwnerSub,
      );
      if (!derived.ok) {
        const ownerMismatch = derived.blockers.some((blocker) => blocker.code === 'OWNER_MISMATCH');
        fail(ownerMismatch ? 'OWNER_MISMATCH' : 'PROFILE_UNAVAILABLE', derived.blockers[0]?.message ?? 'Perfil indisponível.');
      }
      const value = derived.value;
      const participant: EffectiveParticipant = {
        id: value.participantId, profile: value.generatorProfile, seed: value.seed,
        monthly_volume_brl: value.monthlyVolumeBrl,
        ticket_median_brl: value.ticketMedianBrl,
        out_fraction: value.outFraction, deadline: structuredClone(value.deadline),
        eh_efx: value.efx, purpose_out: value.purposeOut, purpose_in: value.purposeIn,
      };
      participants.push(participant);
      const temporary: EffectiveInput = { ...structuredClone(source), participants, sources };
      const provenance = participantSource(change.profile, recordedAt);
      for (const path of participantPaths(temporary, participantId)) sources[path] = provenance;
      profilesToAttach.push(change.profile);
      addedProfileIds.add(change.profile.id);
      addedCompanyIds.add(change.profile.companyId);
      added.push({ participantId });
    }
  }

  if (participants.length === 0) fail('EMPTY_COMPOSITION', 'A composição precisa de ao menos um participante.');
  if (participants.length > 100) fail('INCOMPATIBLE_COMPOSITION', 'A composição aceita no máximo 100 participantes.');
  if (new Set(participants.map((participant) => participant.id)).size !== participants.length) {
    fail('DUPLICATE_PARTICIPANT', 'IDs de participante duplicados.');
  }
  const input: EffectiveInput = {
    ...structuredClone(source), participants,
    window_days: draft.windowDays,
    costs: canonicalCosts(draft.costs, source.costs, recordedAt, sources),
    sources,
  };
  if (draft.windowDays !== source.window_days) {
    sources['/window_days'] = hypothesisSource(recordedAt, sources['/window_days']);
  }
  assertExactEffectiveSources(input);
  return deepFreeze({
    input,
    profilesToAttach: structuredClone(profilesToAttach),
    diff: { added, removed, modified },
    requiresPreparation: draft.participantChanges.length > 0,
  });
}

export async function buildCompositionSourceSnapshot(
  base: PortfolioSourceSnapshot,
  materialized: CompositionMaterialization,
  recordedAt: string,
): Promise<PortfolioSourceSnapshot> {
  if (materialized.requiresPreparation) {
    fail('INCOMPATIBLE_COMPOSITION', 'Mudança de geração exige nova preparação de ordens.');
  }
  const snapshot = structuredClone(base) as DeepMutable<PortfolioSourceSnapshot>;
  snapshot.capturedAt = recordedAt;
  snapshot.generationInputSnapshot = structuredClone(materialized.input) as DeepMutable<EffectiveInput>;
  snapshot.sourceFingerprint = await fingerprintPortfolioSource(snapshot);
  return deepFreeze(snapshot);
}

export function buildCompositionScenarioDraft(input: Readonly<{
  base: ScenarioDocument;
  hypothesis: CompositionHypothesisDraft;
  sourceSnapshot: PortfolioSourceSnapshot;
  id: string;
  recordedAt: string;
}>): ScenarioDraft {
  const { base, hypothesis, sourceSnapshot, id, recordedAt } = input;
  if (hypothesis.name.length === 0 || hypothesis.name.trim() !== hypothesis.name
      || hypothesis.name.length > 120) {
    fail('INCOMPATIBLE_COMPOSITION', 'Nome da hipótese inválido.');
  }
  return deepFreeze({
    id,
    revision: 1,
    name: hypothesis.name,
    sourceSnapshot: structuredClone(sourceSnapshot),
    premises: {
      windowDays: hypothesis.windowDays,
      costs: structuredClone(hypothesis.costs),
    },
    period: structuredClone(base.period),
    inputProvenance: mergeScenarioInputProvenance(
      base,
      { windowDays: hypothesis.windowDays, costs: hypothesis.costs },
      recordedAt,
    ),
  });
}
