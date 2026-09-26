import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import type {
  AuthoredPortfolioDefinition, CanonicalAuthoredOrder, OrderFieldProvenance, PeriodDocument, ScenarioDocument, ScenarioDraft,
} from '../study/model';
import { applyLevers, describeLevers, type Levers } from './applyLevers';
import { companyResolver } from './companies';

type ExplicitDefinition = Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }>;

export function leverBaseAvailable(scenario: ScenarioDocument): boolean {
  const byOrder = scenario.sourceSnapshot.provenanceByOrder;
  return byOrder !== undefined && scenario.sourceSnapshot.orders.every((order) => byOrder[order.id] !== undefined);
}

function explicitDefinition(scenario: ScenarioDocument): ExplicitDefinition | undefined {
  const source = scenario.sourceSnapshot.source;
  return source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS' ? source.definition : undefined;
}

function derivedFrom(scenario: ScenarioDocument) {
  const source = scenario.sourceSnapshot.source;
  if (source.kind === 'OBSERVED_CASE') return { caseId: source.caseId, caseRevision: source.caseRevision };
  return explicitDefinition(scenario)?.derivedFromObservedCase;
}

export function periodCovering(period: PeriodDocument, horizonDays: number): PeriodDocument {
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
  levers: Levers | readonly Levers[];
  id: string;
  authoredPortfolioId: string;
  recordedAt: string;
  name?: string;
}>): Promise<ScenarioDraft> {
  const { base, recordedAt } = input;
  if (!leverBaseAvailable(base)) throw new Error('Este cenário não tem ordens explícitas para aplicar alavancas.');
  const steps = Array.isArray(input.levers) ? input.levers as readonly Levers[] : [input.levers as Levers];
  if (steps.length === 0) throw new Error('Nenhuma alavanca informada.');
  const companyOf = companyResolver(base.sourceSnapshot.source);
  let orders: CanonicalAuthoredOrder[] = base.sourceSnapshot.orders.map((order) => structuredClone(order) as CanonicalAuthoredOrder);
  let provenance: Record<string, OrderFieldProvenance> = structuredClone(base.sourceSnapshot.provenanceByOrder!) as Record<string, OrderFieldProvenance>;
  let horizonDays = 1;
  for (const levers of steps) {
    const result = applyLevers(orders, provenance, levers, recordedAt, companyOf);
    orders = result.orders;
    provenance = result.provenanceByOrder;
    horizonDays = result.horizonDays;
  }
  const baseDefinition = explicitDefinition(base);
  const kept = new Set(orders.map((order) => order.id));
  const companyByOrder = baseDefinition?.companyByOrder === undefined ? undefined
    : Object.fromEntries(Object.entries(baseDefinition.companyByOrder).filter(([id]) => kept.has(id)));
  const origin = derivedFrom(base);
  const definition: ExplicitDefinition = {
    kind: 'EXPLICIT_ORDERS',
    ...(origin === undefined ? {} : { derivedFromObservedCase: structuredClone(origin) }),
    ...(baseDefinition?.sourceCases === undefined ? {} : { sourceCases: structuredClone(baseDefinition.sourceCases) }),
    ...(companyByOrder === undefined ? {} : { companyByOrder }),
    orders,
    provenanceByOrder: provenance,
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
    name: (input.name ?? `${base.name} · ${steps.map(describeLevers).join(' · ')}`).slice(0, 200),
    sourceSnapshot,
    premises: structuredClone(base.premises),
    period: periodCovering(base.period, horizonDays),
    ...(base.inputProvenance === undefined ? {} : { inputProvenance: structuredClone(base.inputProvenance) }),
  };
}

/** Todas as carteiras formadas por um subconjunto não vazio e próprio das empresas. */
export function companySubsets(companies: readonly string[]): string[][] {
  const subsets: string[][] = [];
  for (let mask = 1; mask < (1 << companies.length) - 1; mask += 1) {
    subsets.push(companies.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return subsets.sort((left, right) => left.length - right.length || left.join().localeCompare(right.join()));
}
