import { fingerprintPortfolioSource, fingerprintScenarioInput } from './fingerprints';
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
} from './model';
import { assertValidStudy } from './validation';

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
    schemaVersion: '2.0.0',
    id: input.id,
    ownerSub: input.ownerSub,
    name: checkedName(input.name),
    revision: 1,
    baseScenarioId: baseScenario.id,
    scenarios: [baseScenario],
    executions: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
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
    executions: [...study.executions.map(clone), clone(execution)],
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
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
