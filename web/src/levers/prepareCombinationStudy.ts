import { appendScenarios } from '../study/domain';
import { canonical } from '../study/fingerprints';
import type { ScenarioDraft, StudyDocument } from '../study/model';
import { combinationName } from '../study/naming';
import { NEUTRAL_LEVERS } from './applyLevers';
import { companyResolver } from './companies';
import { buildLeverScenario, companySubsets, leverBaseAvailable } from './leverScenario';

function compositionKey(scenario: ScenarioDraft): string {
  const companyOf = companyResolver(scenario.sourceSnapshot.source);
  return canonical({
    orders: scenario.sourceSnapshot.orders.map((order) => ({ ...order, company: companyOf(order.id) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    premises: scenario.premises,
    period: scenario.period,
  });
}

export function isCurrentCombinationScenario(study: StudyDocument, scenario: ScenarioDraft): boolean {
  const base = study.scenarios.find((item) => item.id === study.baseScenarioId);
  if (base === undefined) return false;
  if (scenario.id === base.id) return true;
  const companyOf = companyResolver(base.sourceSnapshot.source);
  const kept = new Set(scenario.sourceSnapshot.orders.map((order) => order.id));
  const groups = new Set(base.sourceSnapshot.orders.filter((order) => kept.has(order.id)).map((order) => companyOf(order.id)));
  const orders = base.sourceSnapshot.orders.filter((order) => groups.has(companyOf(order.id)));
  return orders.length > 0 && compositionKey(scenario) === compositionKey({ ...base,
    sourceSnapshot: { ...base.sourceSnapshot, orders } });
}

/** Generated combinations are internal to this study type; unchanged results are reused. */
export async function prepareCombinationStudy(
  study: StudyDocument,
  onProgress: (message: string) => void,
): Promise<StudyDocument> {
  if (study.studyType !== 'PORTFOLIO_COMBINATIONS') throw new Error('Este estudo não é uma combinação de carteiras.');
  const base = study.scenarios.find((scenario) => scenario.id === study.baseScenarioId);
  if (base === undefined || !leverBaseAvailable(base)) throw new Error('Escolha e aplique os casos das empresas antes de diagnosticar.');
  const companyOf = companyResolver(base.sourceSnapshot.source);
  const groups = [...new Set(base.sourceSnapshot.orders.map((order) => companyOf(order.id)))].sort();
  if (groups.length < 2 || groups.length > 8) throw new Error('Selecione de 2 a 8 empresas para diagnosticar as combinações.');
  const subsets = companySubsets(groups);
  const now = new Date().toISOString();
  const drafts: ScenarioDraft[] = [];
  for (const [index, subset] of subsets.entries()) {
    drafts.push(await buildLeverScenario({
      base, id: crypto.randomUUID(), authoredPortfolioId: crypto.randomUUID(), recordedAt: now,
      name: combinationName(subset),
      levers: groups.filter((company) => !subset.includes(company))
        .map((group) => ({ ...NEUTRAL_LEVERS, group, removeCompany: true })),
    }));
    if ((index + 1) % 8 === 0 || index + 1 === subsets.length) {
      onProgress(`Preparando ${index + 1} de ${subsets.length} combinações…`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  const existing = new Set(study.scenarios.filter((scenario) => scenario.id !== base.id).map(compositionKey));
  const missing = drafts.filter((draft) => !existing.has(compositionKey(draft)));
  if (missing.length === 0) return study;
  onProgress('Salvando as combinações…');
  return appendScenarios(study, missing, now);
}
