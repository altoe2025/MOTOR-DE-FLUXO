import { replaceScenarioBatch, updateScenario } from '../study/domain';
import { canonical } from '../study/fingerprints';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import type { AuthoredPortfolioDefinition, PreparedCombinationCoverage, ScenarioDocument, ScenarioDraft, StudyDocument } from '../study/model';
import { combinationName, variationName } from '../study/naming';
import { isNeutralLevers, type Levers } from './applyLevers';
import { companyResolver } from './companies';
import { buildLeverScenario, companySubsets, leverBaseAvailable, periodCovering } from './leverScenario';

type ExplicitDefinition = Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }>;

function companyIdentity(base: ScenarioDocument) {
  const displayOf = companyResolver(base.sourceSnapshot.source);
  const source = base.sourceSnapshot.source;
  const byOrder = source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    ? source.definition.companyByOrder : undefined;
  return {
    displayOf,
    idOf: (orderId: string) => byOrder?.[orderId]?.companyId ?? displayOf(orderId),
  };
}

function definitionForSubset(base: ScenarioDocument, orders: ScenarioDocument['sourceSnapshot']['orders']): ExplicitDefinition {
  const source = base.sourceSnapshot.source;
  const baseDefinition = source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    ? source.definition : undefined;
  const origin = source.kind === 'OBSERVED_CASE'
    ? { caseId: source.caseId, caseRevision: source.caseRevision }
    : baseDefinition?.derivedFromObservedCase;
  const byOrder = base.sourceSnapshot.provenanceByOrder;
  if (byOrder === undefined) throw new Error('Proveniência das ordens ausente.');
  const kept = new Set(orders.map((order) => order.id));
  return {
    kind: 'EXPLICIT_ORDERS',
    ...(origin === undefined ? {} : { derivedFromObservedCase: structuredClone(origin) }),
    ...(baseDefinition?.sourceCases === undefined ? {} : { sourceCases: structuredClone(baseDefinition.sourceCases) }),
    ...(baseDefinition?.companyByOrder === undefined ? {} : {
      companyByOrder: Object.fromEntries(Object.entries(baseDefinition.companyByOrder)
        .filter(([orderId]) => kept.has(orderId)).map(([orderId, company]) => [orderId, structuredClone(company)])),
    }),
    orders: orders.map((order) => structuredClone(order)),
    provenanceByOrder: Object.fromEntries(orders.map((order) => [order.id, structuredClone(byOrder[order.id]!)])),
  };
}

async function buildCombinationDraft(
  base: ScenarioDocument,
  subset: readonly string[],
  idOf: (orderId: string) => string,
  name: string,
  now: string,
): Promise<ScenarioDraft> {
  const selected = new Set(subset);
  const orders = base.sourceSnapshot.orders.filter((order) => selected.has(idOf(order.id)));
  const sourceSnapshot = await resolvePortfolioSource({
    kind: 'AUTHORED', authoredPortfolioId: crypto.randomUUID(), definition: definitionForSubset(base, orders),
  }, {
    getObservedCase: async () => null,
    preparePortfolio: async () => { throw new Error('Combinação não usa preparação remota.'); },
    now: () => now,
  });
  return {
    id: crypto.randomUUID(), revision: 1, name,
    sourceSnapshot,
    premises: structuredClone(base.premises),
    period: periodCovering(base.period, Math.max(...orders.map((order) => order.dia_limite)) + 1),
    ...(base.inputProvenance === undefined ? {} : { inputProvenance: structuredClone(base.inputProvenance) }),
  };
}

function subsetKey(scenario: ScenarioDraft, companyOf: (orderId: string) => string): string {
  return canonical([...new Set(scenario.sourceSnapshot.orders.map((order) => companyOf(order.id)))].sort());
}

function completeCoverage(study: StudyDocument, subsets: readonly (readonly string[])[], companyOf: (orderId: string) => string): boolean {
  if (study.scenarios.length !== subsets.length + 1) return false;
  const expected = new Set(subsets.map(canonical));
  const seen = new Set<string>();
  for (const scenario of study.scenarios) {
    if (scenario.id === study.baseScenarioId) continue;
    if (!isCurrentCombinationScenario(study, scenario)) return false;
    const key = subsetKey(scenario, companyOf);
    if (!expected.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size === expected.size;
}

export function isCurrentCombinationScenario(study: StudyDocument, scenario: ScenarioDraft): boolean {
  const base = study.scenarios.find((item) => item.id === study.baseScenarioId);
  if (base === undefined) return false;
  if (scenario.id === base.id) return true;
  const companyOf = companyIdentity(base).idOf;
  const kept = new Set(scenario.sourceSnapshot.orders.map((order) => order.id));
  const groups = new Set(base.sourceSnapshot.orders.filter((order) => kept.has(order.id)).map((order) => companyOf(order.id)));
  const allGroups = new Set(base.sourceSnapshot.orders.map((order) => companyOf(order.id)));
  if (groups.size === 0 || groups.size === allGroups.size) return false;
  const orders = base.sourceSnapshot.orders.filter((order) => groups.has(companyOf(order.id)));
  const source = scenario.sourceSnapshot.source;
  if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') return false;
  try {
    const expected = definitionForSubset(base, orders);
    return canonical(source.definition) === canonical(expected)
      && canonical(scenario.sourceSnapshot.orders) === canonical(orders)
      && canonical(scenario.sourceSnapshot.provenanceByOrder ?? null) === canonical(expected.provenanceByOrder)
      && canonical(scenario.premises) === canonical(base.premises)
      && canonical(scenario.period) === canonical(periodCovering(base.period,
        Math.max(...orders.map((order) => order.dia_limite)) + 1))
      && canonical(scenario.inputProvenance ?? null) === canonical(base.inputProvenance ?? null);
  } catch {
    return false;
  }
}

export async function applyLeversToCombinationBase(
  study: StudyDocument,
  levers: Levers,
  recordedAt: string,
  ids: () => string = () => crypto.randomUUID(),
): Promise<StudyDocument> {
  if (study.studyType !== 'PORTFOLIO_COMBINATIONS') throw new Error('Este estudo não é uma combinação de carteiras.');
  if (isNeutralLevers(levers)) return study;
  const base = study.scenarios.find((scenario) => scenario.id === study.baseScenarioId);
  if (base === undefined) throw new Error('Estudo sem cenário base.');
  const draft = await buildLeverScenario({
    base, levers, id: ids(), authoredPortfolioId: ids(), recordedAt,
  });
  return updateScenario(study, base.id, {
    sourceSnapshot: draft.sourceSnapshot,
    period: draft.period,
    name: variationName(levers, base.name, base.name === 'Cenário base'),
  }, recordedAt);
}

/** Generated combinations are internal to this study type; unchanged results are reused. */
export async function prepareCombinationStudy(
  study: StudyDocument,
  onProgress: (message: string) => void,
): Promise<StudyDocument> {
  if (study.studyType !== 'PORTFOLIO_COMBINATIONS') throw new Error('Este estudo não é uma combinação de carteiras.');
  const base = study.scenarios.find((scenario) => scenario.id === study.baseScenarioId);
  if (base === undefined || !leverBaseAvailable(base)) throw new Error('Escolha e aplique os casos das empresas antes de diagnosticar.');
  const { displayOf, idOf: companyOf } = companyIdentity(base);
  const groups = [...new Set(base.sourceSnapshot.orders.map((order) => companyOf(order.id)))].sort();
  if (groups.length < 2 || groups.length > 8) throw new Error('Selecione de 2 a 8 empresas para diagnosticar as combinações.');
  const subsets = companySubsets(groups);
  const coverage: PreparedCombinationCoverage = {
    baseScenarioId: base.id,
    baseInputFingerprint: base.inputFingerprint,
    baseInputProvenanceCanonical: canonical(base.inputProvenance ?? null),
    companyIdsCanonical: JSON.stringify(groups),
  };
  // inputFingerprint hashes source snapshot, normalized costs/window and period (fingerprints.ts).
  // inputProvenance is copied to derivatives but excluded there, so it is signed separately.
  const signatureMatches = study.preparedCombinationCoverage !== undefined
    && canonical(study.preparedCombinationCoverage) === canonical(coverage);
  if (signatureMatches && completeCoverage(study, subsets, companyOf)) return study;
  const now = new Date().toISOString();
  // A full pre-signature V3 matrix is already certified by its scenario content.
  // Adopt its metadata without changing scenario IDs or deleting persisted executions.
  if (study.preparedCombinationCoverage === undefined
    && completeCoverage(study, subsets, companyOf)) {
    onProgress('Salvando as combinações…');
    const adopted = await replaceScenarioBatch(
      study, new Set(study.scenarios.map((scenario) => scenario.id)), [], now,
    );
    return { ...adopted, preparedCombinationCoverage: coverage };
  }
  const displayById = new Map<string, string>();
  for (const order of base.sourceSnapshot.orders) {
    displayById.set(companyOf(order.id), displayOf(order.id));
  }
  const displayCounts = new Map<string, number>();
  for (const name of displayById.values()) displayCounts.set(name, (displayCounts.get(name) ?? 0) + 1);
  const label = (id: string) => {
    const display = displayById.get(id) ?? id;
    return (displayCounts.get(display) ?? 0) > 1 ? `${display} (${id})` : display;
  };
  const drafts: ScenarioDraft[] = [];
  for (const [index, subset] of subsets.entries()) {
    drafts.push(await buildCombinationDraft(base, subset, companyOf,
      combinationName(subset.map(label)), now));
    if ((index + 1) % 8 === 0 || index + 1 === subsets.length) {
      onProgress(`Preparando ${index + 1} de ${subsets.length} combinações…`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress('Salvando as combinações…');
  const retainedIds = new Set([base.id]);
  const retainedSubsets = new Set<string>();
  const expectedSubsets = new Set(subsets.map(canonical));
  if (signatureMatches) {
    for (const scenario of study.scenarios) {
      if (scenario.id === base.id || !isCurrentCombinationScenario(study, scenario)) continue;
      const key = subsetKey(scenario, companyOf);
      if (!expectedSubsets.has(key) || retainedSubsets.has(key)) continue;
      retainedIds.add(scenario.id);
      retainedSubsets.add(key);
    }
  }
  const missing = drafts.filter((_, index) => !retainedSubsets.has(canonical(subsets[index]!)));
  const prepared = await replaceScenarioBatch(study, retainedIds, missing, now);
  if (!completeCoverage(prepared, subsets, companyOf)) {
    throw new Error('Combinações preparadas não cobrem todos os subconjuntos esperados.');
  }
  return { ...prepared, preparedCombinationCoverage: coverage };
}
