import Decimal from 'decimal.js';

import type { PortfolioMetrics } from './portfolioAnalysis';

export type MarginalValues = Readonly<{
  savings: string;
  volume: string;
  weightedMeanWait: string | null;
  bps: string | null;
  companyCount: number;
}>;

export type MarginalRow = Readonly<{
  companyId: string;
  companyName: string;
  action: 'ADD' | 'REMOVE';
  targetScenarioId: string | null;
  reason: string | null;
  before: MarginalValues | null;
  after: MarginalValues | null;
  savingsDelta: string | null;
  volumeDelta: string | null;
  weightedMeanWaitDelta: string | null;
  bpsDelta: string | null;
  companyCountDelta: number | null;
}>;

const keyOf = (ids: readonly string[]) => JSON.stringify([...new Set(ids)].sort());
const numericFields = ['savings', 'volume', 'baseline', 'netted', 'weightedWait', 'matchedVolume', 'netability'] as const;
const components = ['iof', 'carry', 'spread', 'espera', 'fixo'] as const;

function equivalent(left: PortfolioMetrics, right: PortfolioMetrics): boolean {
  return left.waitP95Days === right.waitP95Days
    && numericFields.every(field => new Decimal(left[field]).eq(right[field]))
    && components.every(field => new Decimal(left.costDelta[field]).eq(right.costDelta[field]));
}

function arithmetic(candidates: readonly PortfolioMetrics[]): typeof Decimal {
  let integers = 1;
  let fractions = 0;
  for (const candidate of candidates) {
    for (const field of ['savings', 'volume', 'weightedWait'] as const) {
      const value = new Decimal(candidate[field]);
      integers = Math.max(integers, value.e + 1);
      fractions = Math.max(fractions, value.decimalPlaces());
    }
  }
  // Two products and their difference stay exact before ratio division, including
  // operands with large integral and fractional parts. Never change global Decimal.
  return Decimal.clone({ precision: 2 * (integers + fractions) + 50 });
}

function values(candidate: PortfolioMetrics, Exact: typeof Decimal): MarginalValues {
  const volume = new Exact(candidate.volume);
  return {
    savings: candidate.savings, volume: candidate.volume,
    weightedMeanWait: volume.gt(0) ? new Exact(candidate.weightedWait).div(volume).toFixed() : null,
    bps: volume.gt(0) ? new Exact(candidate.savings).times(10000).div(volume).toFixed() : null,
    companyCount: new Set(candidate.companyIds).size,
  };
}

/** Uses only current comparable executions supplied by the caller, never filters or company cost shares. */
export function portfolioMarginals(
  allComparable: readonly PortfolioMetrics[], selectedScenarioId: string, universeCompanyIds: readonly string[],
): readonly MarginalRow[] {
  const selected = allComparable.find(candidate => candidate.scenarioId === selectedScenarioId);
  if (selected === undefined) return [];
  const Exact = arithmetic(allComparable);
  const index = new Map<string, PortfolioMetrics | null>();
  const names = new Map<string, string>();
  for (const candidate of [...allComparable].sort((a, b) => a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0)) {
    const key = keyOf(candidate.companyIds);
    const previous = index.get(key);
    if (previous === undefined) index.set(key, candidate);
    else if (previous !== null && !equivalent(previous, candidate)) index.set(key, null);
    candidate.companyIds.forEach((id, i) => {
      if (!names.has(id)) names.set(id, candidate.companyNames[i] ?? id);
    });
  }
  selected.companyIds.forEach((id, i) => names.set(id, selected.companyNames[i] ?? id));
  const selectedIds = new Set(selected.companyIds);
  const selectedConflict = index.get(keyOf(selected.companyIds)) === null;
  const before = selectedConflict ? null : values(selected, Exact);

  return [...new Set([...universeCompanyIds, ...selectedIds])].sort().map(companyId => {
    const action = selectedIds.has(companyId) ? 'REMOVE' : 'ADD';
    const targetIds = action === 'REMOVE' ? [...selectedIds].filter(id => id !== companyId) : [...selectedIds, companyId];
    const target = index.get(keyOf(targetIds));
    const reason = selectedConflict ? 'A composição selecionada tem resultados contraditórios para o mesmo conjunto de empresas.'
      : targetIds.length === 0 ? 'Carteira vazia não avaliada.'
        : target === null ? 'A contraparte tem resultados contraditórios para o mesmo conjunto de empresas.'
          : target === undefined ? 'Contraparte sem resultado atual comparável; ausente, desatualizada ou incompatível.' : null;
    const common = { companyId, companyName: names.get(companyId) ?? companyId, action, before } as const;
    if (reason !== null || target == null || before === null) {
      return { ...common, targetScenarioId: null, reason, after: null, savingsDelta: null, volumeDelta: null,
        weightedMeanWaitDelta: null, bpsDelta: null, companyCountDelta: null };
    }
    const after = values(target, Exact);
    const ratioDelta = (field: 'savings' | 'weightedWait', multiplier: number) => {
      if (new Exact(selected.volume).lte(0) || new Exact(target.volume).lte(0)) return null;
      const numerator = new Exact(target[field]).times(selected.volume).minus(new Exact(selected[field]).times(target.volume));
      return numerator.times(multiplier).div(new Exact(selected.volume).times(target.volume)).toFixed();
    };
    return {
      ...common, targetScenarioId: target.scenarioId, reason: null, after,
      savingsDelta: new Exact(target.savings).minus(selected.savings).toFixed(),
      volumeDelta: new Exact(target.volume).minus(selected.volume).toFixed(),
      weightedMeanWaitDelta: ratioDelta('weightedWait', 1), bpsDelta: ratioDelta('savings', 10000),
      companyCountDelta: after.companyCount - before.companyCount,
    };
  });
}
