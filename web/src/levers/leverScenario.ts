import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import type { AuthoredPortfolioDefinition, PeriodDocument, ScenarioDocument, ScenarioDraft } from '../study/model';
import { applyLevers, describeLevers, type Levers } from './applyLevers';

export function leverBaseAvailable(scenario: ScenarioDocument): boolean {
  const byOrder = scenario.sourceSnapshot.provenanceByOrder;
  return byOrder !== undefined && scenario.sourceSnapshot.orders.every((order) => byOrder[order.id] !== undefined);
}

function derivedFrom(scenario: ScenarioDocument) {
  const source = scenario.sourceSnapshot.source;
  if (source.kind === 'OBSERVED_CASE') return { caseId: source.caseId, caseRevision: source.caseRevision };
  if (source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS') return source.definition.derivedFromObservedCase;
  return undefined;
}

function periodCovering(period: PeriodDocument, horizonDays: number): PeriodDocument {
  if (period.httpPeriod.modo === 'NATURAL') {
    const total = period.httpPeriod.dias_aquecimento + period.httpPeriod.periodo_medicao_dias;
    if (total >= horizonDays) return structuredClone(period);
    return { httpPeriod: { ...period.httpPeriod, periodo_medicao_dias: horizonDays - period.httpPeriod.dias_aquecimento } };
  }
  if ('executableHorizonDays' in period && period.executableHorizonDays < horizonDays) {
    throw new Error('O período deste cenário é fixo e as alavancas empurram ordens para fora dele.');
  }
  return structuredClone(period);
}

export async function buildLeverScenario(input: Readonly<{
  base: ScenarioDocument;
  levers: Levers;
  id: string;
  authoredPortfolioId: string;
  recordedAt: string;
}>): Promise<ScenarioDraft> {
  const { base, levers, recordedAt } = input;
  if (!leverBaseAvailable(base)) throw new Error('Este cenário não tem ordens explícitas para aplicar alavancas.');
  const result = applyLevers(base.sourceSnapshot.orders, base.sourceSnapshot.provenanceByOrder!, levers, recordedAt);
  const origin = derivedFrom(base);
  const definition: Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }> = {
    kind: 'EXPLICIT_ORDERS',
    ...(origin === undefined ? {} : { derivedFromObservedCase: structuredClone(origin) }),
    orders: result.orders,
    provenanceByOrder: result.provenanceByOrder,
  };
  const sourceSnapshot = await resolvePortfolioSource(
    { kind: 'AUTHORED', authoredPortfolioId: input.authoredPortfolioId, definition },
    {
      getObservedCase: async () => null,
      preparePortfolio: async () => { throw new Error('Variação por alavanca não usa preparação.'); },
      now: () => recordedAt,
    },
  );
  return {
    id: input.id,
    revision: 1,
    name: `${base.name} · ${describeLevers(levers)}`.slice(0, 200),
    sourceSnapshot,
    premises: structuredClone(base.premises),
    period: periodCovering(base.period, result.horizonDays),
    ...(base.inputProvenance === undefined ? {} : { inputProvenance: structuredClone(base.inputProvenance) }),
  };
}
