import { fingerprintPortfolioSource, fingerprintScenarioInput } from './fingerprints';
import { validateOperationalProfile } from '../profiles/validation';
import type { OperationalProfileVersion } from '../profiles/domain';
import type {
  CreateStudyInput,
  DeepMutable,
  DeepReadonly,
  ExecutionRecord,
  IdFactory,
  ScenarioDocument,
  ScenarioDraft,
  ScenarioUpdate,
  StudyDocument,
  StudyDocumentV3,
} from './model';
import { assertValidStudy } from './validation';

export const PROFILE_MVP_EXAMPLE_ID = 'perfil-operacional-mvp';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function checkedName(name: string): string {
  if (name.length === 0 || name.length > 120 || name.trim() !== name) {
    throw new Error('Nome do estudo ou cenário inválido.');
  }
  return name;
}

function checkedInstant(now: string): string {
  if (!now.endsWith('Z') || Number.isNaN(Date.parse(now))) throw new Error('Instante UTC inválido.');
  return now;
}

async function materializeScenario(draft: ScenarioDraft): Promise<ScenarioDocument> {
  const candidate = clone(draft) as DeepMutable<ScenarioDraft>;
  candidate.sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(
    candidate.sourceSnapshot,
  );
  const scenario: ScenarioDocument = {
    id: candidate.id,
    revision: candidate.revision,
    name: checkedName(candidate.name),
    sourceSnapshot: candidate.sourceSnapshot,
    premises: candidate.premises,
    period: candidate.period,
    ...(candidate.inputProvenance === undefined
      ? {}
      : { inputProvenance: candidate.inputProvenance }),
    inputFingerprint: await fingerprintScenarioInput(candidate),
  };
  return deepFreeze(scenario);
}

async function finalize(study: StudyDocument): Promise<StudyDocument> {
  const detached = clone(study);
  await assertValidStudy(detached);
  return deepFreeze(detached);
}

export async function createStudy(input: CreateStudyInput): Promise<StudyDocument> {
  const now = checkedInstant(input.now);
  const baseScenario = await materializeScenario(input.baseScenario);
  return finalize({
    schemaVersion: '3.0.0',
    id: input.id,
    ownerSub: input.ownerSub,
    name: checkedName(input.name),
    revision: 1,
    baseScenarioId: baseScenario.id,
    scenarios: [baseScenario],
    evidenceSnapshots: [],
    executions: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

export type CreateProfileStudyInput = Readonly<{
  id: string;
  ownerSub: string;
  name: string;
  baseScenario: ScenarioDraft;
  profiles: readonly OperationalProfileVersion[];
  now: string;
}>;

function profileLineageFromScenario(
  scenario: ScenarioDraft,
): readonly Readonly<{ profileId: string; profileFingerprint: string; participantId: string }>[] {
  if (scenario.sourceSnapshot.source.kind !== 'SYNTHETIC'
      || scenario.sourceSnapshot.source.recipe.exampleId !== PROFILE_MVP_EXAMPLE_ID
      || scenario.sourceSnapshot.generationInputSnapshot === undefined) {
    throw new Error('Cenário-base não é uma simulação por Perfil do MVP.');
  }
  return scenario.sourceSnapshot.generationInputSnapshot.participants.map((participant) => {
    const path = `/participants/${participant.id}/profile`;
    const source = scenario.sourceSnapshot.generationInputSnapshot?.sources[path]?.source;
    const match = source?.match(/^profile-mvp:(.+)@([0-9a-f]{64}):(?:derived|hypothesis)$/);
    if (match === undefined || match === null) {
      throw new Error(`Linhagem de Perfil ausente para o participante ${participant.id}.`);
    }
    return {
      profileId: match[1]!,
      profileFingerprint: match[2]!,
      participantId: participant.id,
    };
  });
}

export async function createProfileStudy(
  input: CreateProfileStudyInput,
): Promise<StudyDocument> {
  const now = checkedInstant(input.now);
  if (input.profiles.length === 0 || input.profiles.length > 100) {
    throw new Error('Selecione entre um e 100 Perfis para criar o estudo.');
  }
  const profileIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const profile of input.profiles) {
    const validation = await validateOperationalProfile(profile);
    if (!validation.ok) throw new Error('Perfil Operacional inválido.');
    if (profile.ownerSub !== input.ownerSub) {
      throw new Error('Owner do Perfil Operacional diverge do estudo.');
    }
    if (profileIds.has(profile.id) || companyIds.has(profile.companyId)) {
      throw new Error('Perfis repetidos por ID ou empresa.');
    }
    profileIds.add(profile.id);
    companyIds.add(profile.companyId);
  }
  const lineage = profileLineageFromScenario(input.baseScenario);
  const lineageKeys = new Set(lineage.map((item) => `${item.profileId}\0${item.profileFingerprint}`));
  if (lineage.length !== input.profiles.length
      || lineageKeys.size !== lineage.length
      || input.profiles.some((profile) =>
        !lineageKeys.has(`${profile.id}\0${profile.documentFingerprint}`))) {
    throw new Error('Linhagem Perfil-participante diverge das evidências selecionadas.');
  }
  const baseScenario = await materializeScenario(input.baseScenario);
  return finalize({
    schemaVersion: '3.0.0',
    id: input.id,
    ownerSub: input.ownerSub,
    name: checkedName(input.name),
    revision: 1,
    baseScenarioId: baseScenario.id,
    scenarios: [baseScenario],
    evidenceSnapshots: input.profiles.map((profile) => ({
      kind: 'OPERATIONAL_PROFILE' as const,
      capturedAt: now,
      profile: clone(profile),
    })),
    executions: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

export async function appendScenario(
  study: StudyDocument,
  draft: ScenarioDraft,
  now: string,
): Promise<StudyDocument> {
  if (study.scenarios.some((scenario) => scenario.id === draft.id)) {
    throw new Error('ID de cenário já existe no estudo.');
  }
  const scenario = await materializeScenario({ ...clone(draft), revision: 1 });
  return finalize({
    ...clone(study),
    scenarios: [...study.scenarios.map(clone), scenario],
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}

export async function appendCompositionHypothesis(
  study: StudyDocumentV3,
  input: Readonly<{
    scenario: ScenarioDraft;
    profiles: readonly OperationalProfileVersion[];
    recordedAt: string;
  }>,
): Promise<StudyDocumentV3> {
  if (study.scenarios.some((scenario) => scenario.id === input.scenario.id)) {
    throw new Error('ID de cenário já existe no estudo.');
  }
  const scenarioLineage = new Set(profileLineageFromScenario(input.scenario)
    .map((item) => `${item.profileId}\0${item.profileFingerprint}`));
  if (input.profiles.some((profile) =>
    !scenarioLineage.has(`${profile.id}\0${profile.documentFingerprint}`))) {
    throw new Error('Evidência de Perfil não participa do cenário da hipótese.');
  }
  const evidenceSnapshots = study.evidenceSnapshots.map(clone);
  for (const profile of input.profiles) {
    const validation = await validateOperationalProfile(profile);
    if (!validation.ok) throw new Error('Perfil Operacional inválido.');
    if (profile.ownerSub !== study.ownerSub) {
      throw new Error('Owner do Perfil Operacional diverge do estudo.');
    }
    const existing = evidenceSnapshots.find((snapshot) =>
      snapshot.kind === 'OPERATIONAL_PROFILE' && snapshot.profile.id === profile.id);
    if (existing !== undefined) {
      if (existing.profile.documentFingerprint !== profile.documentFingerprint) {
        throw new Error('Perfil Operacional já anexado com outro fingerprint.');
      }
      continue;
    }
    evidenceSnapshots.push({
      kind: 'OPERATIONAL_PROFILE',
      capturedAt: checkedInstant(input.recordedAt),
      profile: clone(profile),
    });
  }
  const scenario = await materializeScenario({ ...clone(input.scenario), revision: 1 });
  return finalize({
    ...clone(study),
    evidenceSnapshots,
    scenarios: [...study.scenarios.map(clone), scenario],
    revision: study.revision + 1,
    updatedAt: checkedInstant(input.recordedAt),
  }) as Promise<StudyDocumentV3>;
}

/** Apaga um cenário que não é o base, junto com as execuções dele. */
export async function removeScenario(
  study: StudyDocument,
  scenarioId: string,
  now: string,
): Promise<StudyDocument> {
  if (scenarioId === study.baseScenarioId) throw new Error('O cenário base não pode ser apagado.');
  if (!study.scenarios.some((scenario) => scenario.id === scenarioId)) throw new Error('Cenário não encontrado no estudo.');
  return finalize({
    ...clone(study),
    scenarios: study.scenarios.filter((scenario) => scenario.id !== scenarioId).map(clone),
    executions: study.executions.filter((execution) => execution.scenarioId !== scenarioId).map(clone),
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}

export async function renameStudy(
  study: StudyDocument,
  name: string,
  now: string,
): Promise<StudyDocument> {
  return finalize({
    ...clone(study),
    name: checkedName(name),
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}

export async function duplicateStudy(
  study: StudyDocument,
  now: string,
  ids: IdFactory,
): Promise<StudyDocument> {
  const duplicatedAt = checkedInstant(now);
  const id = ids();
  const scenarioIds = new Map(study.scenarios.map((scenario) => [scenario.id, ids()]));
  const scenarios = study.scenarios.map((scenario) => ({
    ...clone(scenario),
    id: scenarioIds.get(scenario.id)!,
    revision: 1,
  }));
  return finalize({
    ...clone(study),
    id,
    revision: 1,
    baseScenarioId: scenarioIds.get(study.baseScenarioId)!,
    scenarios,
    executions: [],
    createdAt: duplicatedAt,
    updatedAt: duplicatedAt,
    deletedAt: null,
  });
}

export async function updateScenario(
  study: StudyDocument,
  scenarioId: string,
  update: ScenarioUpdate,
  now: string,
): Promise<StudyDocument> {
  const index = study.scenarios.findIndex((scenario) => scenario.id === scenarioId);
  if (index < 0) throw new Error('Cenário não encontrado.');
  const current = study.scenarios[index]!;
  const nextDraft: ScenarioDraft = {
    id: current.id,
    revision: current.revision + 1,
    name: update.name ?? current.name,
    sourceSnapshot: update.sourceSnapshot ?? current.sourceSnapshot,
    premises: update.premises ?? current.premises,
    period: update.period ?? current.period,
    ...(update.inputProvenance === undefined && current.inputProvenance === undefined
      ? {}
      : { inputProvenance: update.inputProvenance ?? current.inputProvenance }),
  };
  const nextScenario = await materializeScenario(nextDraft);
  const scenarios = study.scenarios.map((scenario, position) =>
    position === index ? nextScenario : clone(scenario));
  return finalize({
    ...clone(study),
    scenarios,
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}

export async function appendExecution(
  study: StudyDocument,
  execution: ExecutionRecord,
  now: string,
): Promise<StudyDocument> {
  if (study.executions.some((existing) => existing.id === execution.id)) {
    throw new Error('Execução já anexada.');
  }
  const scenario = study.scenarios.find((candidate) => candidate.id === execution.scenarioId);
  if (scenario === undefined || execution.scenarioRevision > scenario.revision) {
    throw new Error('Execução ligada a revisão inexistente.');
  }
  return finalize({
    ...clone(study),
    executions: [...study.executions.map(clone), { ...clone(execution), kind: 'PREVIEW' }],
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}

export async function attachOperationalProfileEvidence(
  study: StudyDocumentV3,
  profile: OperationalProfileVersion,
  capturedAt: string,
): Promise<StudyDocumentV3> {
  const validation = await validateOperationalProfile(profile);
  if (!validation.ok) throw new Error('Perfil Operacional inválido.');
  if (profile.ownerSub !== study.ownerSub) {
    throw new Error('Owner do Perfil Operacional diverge do estudo.');
  }
  const existing = study.evidenceSnapshots.find((snapshot) =>
    snapshot.kind === 'OPERATIONAL_PROFILE' && snapshot.profile.id === profile.id);
  if (existing !== undefined) {
    if (existing.profile.documentFingerprint !== profile.documentFingerprint) {
      throw new Error('Perfil Operacional já anexado com outro fingerprint.');
    }
    return study;
  }
  const captured = checkedInstant(capturedAt);
  return finalize({
    ...clone(study),
    evidenceSnapshots: [
      ...study.evidenceSnapshots.map(clone),
      { kind: 'OPERATIONAL_PROFILE', capturedAt: captured, profile: clone(profile) },
    ],
    revision: study.revision + 1,
    updatedAt: captured,
  });
}

export async function moveStudyToTrash(
  study: StudyDocument,
  now: string,
): Promise<StudyDocument> {
  const deletedAt = checkedInstant(now);
  return finalize({
    ...clone(study),
    deletedAt,
    revision: study.revision + 1,
    updatedAt: deletedAt,
  });
}

export { deepFreeze };
