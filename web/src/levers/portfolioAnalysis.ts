import Decimal from 'decimal.js';

import type { DiagnosticExecutionRecord, PreviewEnvelope, StudyDocument } from '../study/model';
import { companyResolver } from './companies';
import { compositionComparisonReason } from './portfolioRecommendation';
import { isCurrentCombinationScenario } from './prepareCombinationStudy';
import type { ScenarioRow } from './savingsOrigin';

type CostComponent = 'iof' | 'carry' | 'spread' | 'espera' | 'fixo';
const costComponents: readonly CostComponent[] = ['iof', 'carry', 'spread', 'espera', 'fixo'];
export type PortfolioCostDelta = Readonly<Record<CostComponent, string>>;

export type PortfolioMetrics = Readonly<{
  scenarioId: string;
  name: string;
  /** Sorted IDs and corresponding display names; homonyms remain separate. */
  companyIds: readonly string[];
  companyNames: readonly string[];
  companyIdentitySource?: 'REGISTERED' | 'LEGACY' | 'MIXED';
  savings: string;
  volume: string;
  baseline: string;
  netted: string;
  /** Sum of allocation BRL × waiting days, not the rounded mean. */
  weightedWait: string;
  waitP95Days: number;
  matchedVolume: string;
  netability: string;
  costDelta: PortfolioCostDelta;
}>;

export type PortfolioExclusion = Readonly<{ scenarioId: string; name: string; reason: string }>;
export type PortfolioDataset = Readonly<{
  candidates: readonly PortfolioMetrics[];
  excluded: readonly PortfolioExclusion[];
  preparedCount: number;
  complete: boolean;
}>;

function executionRow(study: StudyDocument, scenario: StudyDocument['scenarios'][number]): ScenarioRow {
  const execution = [...study.executions].reverse().find((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.scenarioId === scenario.id && item.status === 'SUCCEEDED'
    && item.envelope !== null && item.scenarioRevision === scenario.revision
    && item.inputFingerprint === scenario.inputFingerprint) ?? null;
  return { scenario, execution, envelope: execution?.envelope?.selected_execution ?? null, breakdown: null };
}

function portfolioCompanies(row: ScenarioRow) {
  const source = row.execution!.sourceSnapshot.source;
  const registered = source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    ? source.definition.companyByOrder : undefined;
  const nameOf = companyResolver(source);
  const companies = new Map<string, string>();
  const registeredIds = new Set<string>();
  const legacyIds = new Set<string>();
  let hasRegistered = false;
  let hasLegacy = false;
  for (const order of row.envelope!.input_snapshot.cenario.ordens) {
    const record = registered?.[order.id];
    if (record === undefined) hasLegacy = true;
    else hasRegistered = true;
    const id = record?.companyId ?? nameOf(order.id);
    (record === undefined ? legacyIds : registeredIds).add(id);
    if (legacyIds.has(id) && registeredIds.has(id)) return null;
    companies.set(id, nameOf(order.id));
  }
  const companyIds = [...companies.keys()].sort();
  const companyIdentitySource = hasLegacy ? (hasRegistered ? 'MIXED' : 'LEGACY') : 'REGISTERED';
  return { companyIds, companyNames: companyIds.map(id => companies.get(id)!), companyIdentitySource } as const;
}

/** Covers aligned decimal sums, safe-integer day products and the P95 ×100 comparison. */
function exactArithmetic(values: readonly string[]): typeof Decimal {
  let integers = 1;
  let fractions = 0;
  for (const value of values) {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) throw new Error('Valor decimal não finito.');
    integers = Math.max(integers, decimal.e + 1);
    fractions = Math.max(fractions, decimal.decimalPlaces());
  }
  return Decimal.clone({ precision: integers + fractions + String(values.length).length + 20 });
}

function measuredMetrics(envelope: PreviewEnvelope): Omit<PortfolioMetrics,
  'scenarioId' | 'name' | 'companyIds' | 'companyNames' | 'companyIdentitySource'> | null {
  const aggregate = envelope.result.agregado;
  const measured = new Set(aggregate.ids_ordens_medidas);
  const orders = new Map(envelope.input_snapshot.cenario.ordens.map(order => [order.id, order]));
  const allocations = aggregate.execucao_completa.ciclos.flatMap(cycle =>
    cycle.alocacoes.filter(allocation => measured.has(allocation.ordem_id)));
  const Exact = exactArithmetic([
    aggregate.economia_periodo_brl, aggregate.volume_bruto_periodo_brl,
    aggregate.volume_casado_periodo_brl, aggregate.taxa_netabilidade_periodo,
    ...Object.values(aggregate.baseline_periodo), ...Object.values(aggregate.netado_periodo),
    ...allocations.map(allocation => allocation.valor_brl),
    ...envelope.input_snapshot.cenario.ordens.map(order => order.valor_brl),
  ]);
  let volume = new Exact(0);
  let matchedAllocations = new Exact(0);
  let weightedWait = new Exact(0);
  const allocated = new Map<string, Decimal>();
  const byWait = new Map<number, Decimal>();
  for (const allocation of allocations) {
    const order = orders.get(allocation.ordem_id);
    if (order === undefined || !Number.isSafeInteger(allocation.dia)
      || !Number.isSafeInteger(order.dia_conhecida)) return null;
    const days = allocation.dia - order.dia_conhecida;
    if (!Number.isSafeInteger(days) || days < 0) return null;
    const value = new Exact(allocation.valor_brl);
    if (value.lte(0)) return null;
    volume = volume.plus(value);
    if (allocation.tipo === 'CASADO') matchedAllocations = matchedAllocations.plus(value);
    weightedWait = weightedWait.plus(value.times(days));
    allocated.set(order.id, (allocated.get(order.id) ?? new Exact(0)).plus(value));
    byWait.set(days, (byWait.get(days) ?? new Exact(0)).plus(value));
  }
  if (volume.lte(0) || !volume.eq(aggregate.volume_bruto_periodo_brl)) return null;
  for (const id of measured) {
    const order = orders.get(id);
    if (order === undefined || !(allocated.get(id) ?? new Exact(0)).eq(order.valor_brl)) return null;
  }
  const baseline = new Exact(aggregate.baseline_periodo.total);
  const netted = new Exact(aggregate.netado_periodo.total);
  const matched = new Exact(aggregate.volume_casado_periodo_brl);
  const netability = new Exact(aggregate.taxa_netabilidade_periodo);
  const savings = new Exact(aggregate.economia_periodo_brl);
  if (baseline.lt(0) || netted.lt(0) || matched.lt(0) || matched.gt(volume)
    || netability.lt(0) || netability.gt(1)) return null;
  for (const costs of [aggregate.baseline_periodo, aggregate.netado_periodo]) {
    if (costComponents.some(component => new Exact(costs[component]).lt(0))) return null;
  }
  // _reconciliar_ledger preserves the legacy totals, savings and components
  // independently, including their Decimal rounding residues. These authoritative
  // fields must not be replaced or rejected by recomputing identities between them.
  if (!matched.eq(matchedAllocations)) return null;
  // The publication contract divides with Python Decimal's 28-significant-digit,
  // half-even context. Exact rational equality would reject valid repeating ratios.
  const PublishedRatio = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });
  if (!new PublishedRatio(matched).div(volume).eq(netability)) return null;
  let cumulative = new Exact(0);
  let waitP95Days = 0;
  for (const [days, value] of [...byWait].sort(([left], [right]) => left - right)) {
    cumulative = cumulative.plus(value);
    if (cumulative.times(100).gte(volume.times(95))) {
      waitP95Days = days;
      break;
    }
  }
  const delta = (component: CostComponent) => new Exact(aggregate.baseline_periodo[component])
    .minus(aggregate.netado_periodo[component]).toFixed();
  return {
    savings: savings.toFixed(),
    volume: volume.toFixed(), baseline: baseline.toFixed(), netted: netted.toFixed(),
    weightedWait: weightedWait.toFixed(), waitP95Days,
    matchedVolume: matched.toFixed(), netability: netability.toFixed(),
    costDelta: { iof: delta('iof'), carry: delta('carry'), spread: delta('spread'), espera: delta('espera'), fixo: delta('fixo') },
  };
}

/** Pure projection of current whole-company comparisons; missing results never become zero. */
export function collectPortfolioMetrics(study: StudyDocument): PortfolioDataset {
  const scenarios = study.studyType === 'PORTFOLIO_COMBINATIONS'
    ? study.scenarios.filter(scenario => isCurrentCombinationScenario(study, scenario)) : study.scenarios;
  const rows = scenarios.map(scenario => executionRow(study, scenario));
  const reference = rows.find(row => row.scenario.id === study.baseScenarioId);
  const referenceCompanies = reference?.execution !== null && reference?.envelope != null
    ? portfolioCompanies(reference) : null;
  const candidates: PortfolioMetrics[] = [];
  const excluded: PortfolioExclusion[] = [];
  for (const row of rows) {
    let reason: string | null;
    if (row.execution === null || row.envelope === null) {
      const previous = study.executions.some(execution => execution.scenarioId === row.scenario.id
        && execution.kind === 'DIAGNOSTIC' && execution.status === 'SUCCEEDED' && execution.envelope !== null);
      reason = previous ? 'Diagnóstico desatualizado; execute novamente este cenário.' : 'Sem diagnóstico concluído; execute este cenário.';
    } else {
      reason = reference === undefined ? 'O cenário original não está disponível.'
        : reference.envelope !== null && referenceCompanies === null
          ? 'A identificação das empresas do original é ambígua entre cadastro e origem legada.'
          : compositionComparisonReason(reference, row);
    }
    if (reason === null && row.envelope !== null) {
      let metrics = null;
      try {
        metrics = measuredMetrics(row.envelope);
      } catch {
        // Persisted numeric data can be invalid; exclude it rather than crashing the analysis.
      }
      const companies = portfolioCompanies(row);
      if (companies === null) {
        reason = 'A identificação das empresas é ambígua entre cadastro e origem legada.';
      } else if (metrics === null) {
        reason = 'O resultado não tem métricas válidas, volume positivo e alocações completas para medir a espera.';
      } else {
        candidates.push({ scenarioId: row.scenario.id, name: row.scenario.name, ...companies, ...metrics });
      }
    }
    if (reason !== null) excluded.push({ scenarioId: row.scenario.id, name: row.scenario.name, reason });
  }
  const universe = referenceCompanies?.companyIds ?? [];
  const universeIds = new Set(universe);
  const subsets = new Set(candidates
    .filter(candidate => candidate.companyIds.length > 0 && candidate.companyIds.every(id => universeIds.has(id)))
    .map(candidate => JSON.stringify(candidate.companyIds)));
  const complete = universe.length > 0 && BigInt(subsets.size) === 2n ** BigInt(universe.length) - 1n;
  return { candidates, excluded, preparedCount: scenarios.length, complete };
}
