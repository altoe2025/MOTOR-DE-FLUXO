import { describe, expect, it } from 'vitest';

import type { PortfolioMetrics } from './portfolioAnalysis';
import { paretoScenarioIds } from './portfolioFrontier';

function point(scenarioId: string, wait: string, savings: string, volume = '1'): PortfolioMetrics {
  return {
    scenarioId, name: scenarioId, companyIds: [scenarioId], companyNames: [scenarioId],
    savings, volume, baseline: '100', netted: '0', weightedWait: wait,
    waitP95Days: 0, matchedVolume: '0', netability: '0',
    costDelta: { iof: '0', carry: '0', spread: '0', espera: '0', fixo: '0' },
  };
}

describe('paretoScenarioIds', () => {
  it('keeps non-dominated savings/wait tradeoffs and removes a worse point', () => {
    const rows = [point('A', '3', '100'), point('B', '1', '90'), point('C', '2', '80')];
    expect([...paretoScenarioIds(rows)].sort()).toEqual(['A', 'B']);
  });

  it('keeps equal points and only removes a point on a strictly worse axis', () => {
    const rows = [point('same-1', '2', '100'), point('same-2', '4', '100', '2'),
      point('slower', '3', '100'), point('poorer', '2', '99')];
    expect([...paretoScenarioIds(rows)].sort()).toEqual(['same-1', 'same-2']);
  });

  it('compares exact ratios and savings even when their Number or rounded displays tie', () => {
    const rows = [
      point('best', '1.0000000000000000000000000000000000000001', '100.0000000000000000000000000000000000000001'),
      point('worse', '1.0000000000000000000000000000000000000002', '100.0000000000000000000000000000000000000000'),
      point('ratio-tie', '2.0000000000000000000000000000000000000002', '100.0000000000000000000000000000000000000001', '2'),
    ];
    expect([...paretoScenarioIds(rows)].sort()).toEqual(['best', 'ratio-tie']);
  });

  it('returns an empty frontier for no eligible candidates', () => {
    expect([...paretoScenarioIds([])]).toEqual([]);
  });
});
