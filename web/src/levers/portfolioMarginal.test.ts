import { describe, expect, it } from 'vitest';

import type { PortfolioMetrics } from './portfolioAnalysis';
import { portfolioMarginals } from './portfolioMarginal';

function item(scenarioId: string, companyIds: string[], savings: string, volume: string, weightedWait: string): PortfolioMetrics {
  return { scenarioId, name: scenarioId, companyIds, companyNames: companyIds.map(() => 'Homônima'),
    savings, volume, weightedWait, baseline: '200', netted: '100', waitP95Days: 4,
    matchedVolume: '0', netability: '0', costDelta: { iof: savings, carry: '0', spread: '0', espera: '0', fixo: '0' } };
}

function fixture() {
  return [item('AB', ['A', 'B'], '100', '10000', '20000'), item('A', ['A'], '30', '4000', '4000'),
    item('B', ['B'], '20', '6000', '18000'), item('ABC', ['A', 'B', 'C'], '120', '15000', '45000')];
}

describe('portfolioMarginals', () => {
  it('computes exact target-minus-selected deltas by IDs, even for homonyms', () => {
    const candidates = fixture();
    const before = structuredClone(candidates);
    const rows = portfolioMarginals(candidates, 'AB', ['C', 'B', 'A']);
    expect(rows).toMatchObject([
      { companyId: 'A', action: 'REMOVE', targetScenarioId: 'B', savingsDelta: '-80', volumeDelta: '-4000', weightedMeanWaitDelta: '1', bpsDelta: expect.stringMatching(/^-66\.666666666666666/), companyCountDelta: -1 },
      { companyId: 'B', action: 'REMOVE', targetScenarioId: 'A', savingsDelta: '-70', volumeDelta: '-6000', weightedMeanWaitDelta: '-1', bpsDelta: '-25', companyCountDelta: -1 },
      { companyId: 'C', action: 'ADD', targetScenarioId: 'ABC', savingsDelta: '20', volumeDelta: '5000', weightedMeanWaitDelta: '1', bpsDelta: '-20', companyCountDelta: 1 },
    ]);
    expect(rows[1]?.before).toEqual({ savings: '100', volume: '10000', weightedMeanWait: '2', bps: '100', companyCount: 2 });
    expect(rows[1]?.after).toEqual({ savings: '30', volume: '4000', weightedMeanWait: '1', bps: '75', companyCount: 1 });
    expect(candidates).toEqual(before);
  });

  it('does not infer unavailable or stale counterparts and never assigns zero to empty portfolios', () => {
    const rows = portfolioMarginals([fixture()[0]!], 'AB', ['A', 'B', 'C']);
    expect(rows.every(row => row.targetScenarioId === null && row.savingsDelta === null && row.after === null && row.reason)).toBe(true);
    expect(portfolioMarginals(fixture(), 'A', ['A'])[0]).toMatchObject({ reason: 'Carteira vazia não avaliada.', savingsDelta: null });
    expect(portfolioMarginals(fixture(), 'stale-selection', ['A', 'B'])).toEqual([]);
  });

  it('resolves equivalent duplicates by scenario ID, independent of input and company ordering', () => {
    const candidates = fixture();
    const duplicate = { ...candidates[3]!, scenarioId: '000-copy', companyIds: ['C', 'A', 'B'], savings: '120.00' };
    expect(portfolioMarginals([...candidates, duplicate], 'AB', ['A', 'B', 'C'])[2]?.targetScenarioId).toBe('000-copy');
    expect(portfolioMarginals([duplicate, ...candidates].reverse(), 'AB', ['C', 'B', 'A'])[2]?.targetScenarioId).toBe('000-copy');
  });

  it('refuses contradictory duplicate results for both target and selected sets', () => {
    const candidates = fixture();
    const conflict = { ...candidates[3]!, scenarioId: 'conflict', weightedWait: '46000' };
    expect(portfolioMarginals([...candidates, conflict], 'AB', ['A', 'B', 'C'])[2]).toMatchObject({ targetScenarioId: null, after: null, savingsDelta: null, reason: expect.stringMatching(/contraditórios/) });
    const selectedConflict = { ...candidates[0]!, scenarioId: 'conflicting-selected', costDelta: { ...candidates[0]!.costDelta, carry: '1' } };
    expect(portfolioMarginals([...candidates, selectedConflict], 'AB', ['A', 'B', 'C']).every(row => row.savingsDelta === null && row.reason?.includes('contraditórios'))).toBe(true);
  });

  it('withholds selected values when duplicate sets conflict, regardless of input order', () => {
    const candidates = fixture();
    const contradictory = [...candidates, { ...candidates[0]!, scenarioId: 'AB-conflict', savings: '999' }];
    const rows = portfolioMarginals(contradictory, 'AB', ['A', 'B', 'C']);
    expect(rows.every(row => row.before === null && row.after === null && row.savingsDelta === null)).toBe(true);
    expect(portfolioMarginals([...contradictory].reverse(), 'AB', ['A', 'B', 'C'])).toEqual(rows);
  });

  it('preserves differences beyond default Decimal precision and calculates ratio deltas without cancellation', () => {
    const large = item('A', ['A'], '10000000000000000000000000000000000000001', '10000000000000000000000000000000000000000', '10000000000000000000000000000000000000000');
    const larger = item('AB', ['A', 'B'], '10000000000000000000000000000000000000002', large.volume, '10000000000000000000000000000000000000001');
    const row = portfolioMarginals([large, larger], 'A', ['A', 'B'])[1];
    expect(row).toMatchObject({ savingsDelta: '1', volumeDelta: '0', bpsDelta: '0.000000000000000000000000000000000001', weightedMeanWaitDelta: '0.0000000000000000000000000000000000000001' });
  });

  it('leaves ratios unavailable for invalid denominators without replacing money deltas with zero', () => {
    const candidates = [item('A', ['A'], '30', '0', '0'), item('AB', ['A', 'B'], '100', '10000', '20000')];
    const row = portfolioMarginals(candidates, 'AB', ['A', 'B'])[1];
    expect(row).toMatchObject({ savingsDelta: '-70', bpsDelta: null, weightedMeanWaitDelta: null, after: { bps: null, weightedMeanWait: null } });
  });
});
