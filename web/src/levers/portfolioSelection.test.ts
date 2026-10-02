import { describe, expect, it } from 'vitest';
import {
  emptyFilters,
  selectPortfolios,
  type SelectablePortfolio,
} from './portfolioSelection';

function portfolio(
  scenarioId: string,
  values: Partial<SelectablePortfolio> = {},
): SelectablePortfolio {
  return {
    scenarioId,
    name: scenarioId,
    companyIds: [scenarioId],
    companyNames: [scenarioId],
    savings: '10',
    volume: '100',
    baseline: '20',
    netted: '10',
    weightedWait: '100',
    netability: '0.5',
    ...values,
  };
}

function rankingCandidates(): SelectablePortfolio[] {
  return [
    portfolio('A', { companyIds: ['a', 'b', 'c'], savings: '100', volume: '10000', baseline: '200', netted: '100', weightedWait: '30000', netability: '0.8' }),
    portfolio('B', { companyIds: ['a', 'b'], savings: '90', volume: '3000', baseline: '100', netted: '10', weightedWait: '3000', netability: '0.6' }),
    portfolio('C', { companyIds: ['a'], savings: '40', volume: '2000', baseline: '80', netted: '40', weightedWait: '1000', netability: '0.4' }),
  ];
}

describe('portfolio objective selection', () => {
  it('distinguishes total savings, efficiency, cost reduction, wait, size and netability', () => {
    const rows = rankingCandidates();
    expect(selectPortfolios(rows, 'savings', emptyFilters).winner?.scenarioId).toBe('A');
    expect(selectPortfolios(rows, 'efficiency', emptyFilters).winner?.scenarioId).toBe('B');
    expect(selectPortfolios(rows, 'costReduction', emptyFilters).winner?.scenarioId).toBe('B');
    expect(selectPortfolios(rows, 'wait', emptyFilters).winner?.scenarioId).toBe('C');
    expect(selectPortfolios(rows, 'companyCount', emptyFilters).winner?.scenarioId).toBe('C');
    expect(selectPortfolios(rows, 'netability', emptyFilters).winner?.scenarioId).toBe('A');
  });

  it('uses the best positive saving after absolute filters, before the relative target', () => {
    const chosen = selectPortfolios(rankingCandidates(), 'companyCount', {
      ...emptyFilters, minVolume: '3000', retainBestPercent: '90',
    });
    expect(chosen.relativeReference).toBe('100');
    expect(chosen.relativeReferenceUniverseCount).toBe(2);
    expect(chosen.ranked.map((row) => row.scenarioId)).toEqual(['B', 'A']);
    expect(chosen.winner?.scenarioId).toBe('B');
    expect(chosen.ineligible.find((entry) => entry.candidate.scenarioId === 'C')?.reasons).toContain('minVolume');
  });

  it('includes exact boundaries and resolves required companies by ID', () => {
    const selected = selectPortfolios(rankingCandidates(), 'savings', {
      ...emptyFilters,
      maxWaitDays: '1', minVolume: '3000', minSavings: '90', maxCompanies: 2,
      requiredCompanyIds: ['b'], retainBestPercent: '100',
    });
    expect(selected.ranked.map((row) => row.scenarioId)).toEqual(['B']);
    const homonyms = [
      portfolio('id-one', { companyIds: ['id-1'], companyNames: ['Same'] }),
      portfolio('id-two', { companyIds: ['id-2'], companyNames: ['Same'] }),
    ];
    expect(selectPortfolios(homonyms, 'savings', { ...emptyFilters, requiredCompanyIds: ['id-2'] }).winner?.scenarioId).toBe('id-two');
  });

  it('rejects malformed limits with explicit field errors and no recommendation', () => {
    const bad = selectPortfolios(rankingCandidates(), 'savings', {
      ...emptyFilters, maxWaitDays: 'NaN', minVolume: '-1', minSavings: 'Infinity',
      maxCompanies: 1.5, requiredCompanyIds: [''], retainBestPercent: '100,1',
    });
    expect(Object.keys(bad.errors).sort()).toEqual([
      'maxCompanies', 'maxWaitDays', 'minSavings', 'minVolume', 'requiredCompanyIds', 'retainBestPercent',
    ]);
    expect(bad.ranked).toEqual([]);
    expect(bad.winner).toBeNull();
    expect(bad.highlights.savings).toBeNull();
  });

  it('accepts Brazilian decimal commas and empty optional text', () => {
    const result = selectPortfolios(rankingCandidates(), 'wait', {
      ...emptyFilters, maxWaitDays: '0,5', minSavings: '', retainBestPercent: '',
    });
    expect(result.errors).toEqual({});
    expect(result.winner?.scenarioId).toBe('C');
  });

  it('keeps nonpositive savings visible when the relative target has no positive reference', () => {
    const rows = [portfolio('loss', { savings: '-5' }), portfolio('zero', { savings: '0' })];
    const result = selectPortfolios(rows, 'savings', { ...emptyFilters, retainBestPercent: '95' });
    expect(result.relativeReference).toBeNull();
    expect(result.relativeUnavailableReason).toBeTruthy();
    expect(result.ranked.map((row) => row.scenarioId)).toEqual(['zero', 'loss']);
  });

  it('excludes zero baseline only from percentage cost reduction', () => {
    const rows = [portfolio('zero', { baseline: '0', savings: '100' }), portfolio('ordinary', { baseline: '20', savings: '10' })];
    expect(selectPortfolios(rows, 'savings', emptyFilters).winner?.scenarioId).toBe('zero');
    const reduction = selectPortfolios(rows, 'costReduction', emptyFilters);
    expect(reduction.winner?.scenarioId).toBe('ordinary');
    expect(reduction.ineligible.find((entry) => entry.candidate.scenarioId === 'zero')?.reasons).toContain('baseline');
    expect(selectPortfolios(rows, 'savings', emptyFilters).highlights.costReduction).toBe('ordinary');
  });

  it('keeps independent highlights when cost reduction excludes a zero-baseline portfolio', () => {
    const rows = [
      portfolio('zero-baseline', { companyIds: ['z'], savings: '100', volume: '100', baseline: '0', weightedWait: '100', netability: '0.8' }),
      portfolio('positive-baseline', { companyIds: ['p', 'q'], savings: '90', volume: '300', baseline: '100', weightedWait: '150', netability: '0.7' }),
    ];
    const filters = { ...emptyFilters, retainBestPercent: '90' };
    const savings = selectPortfolios(rows, 'savings', filters);
    const reduction = selectPortfolios(rows, 'costReduction', filters);
    expect(reduction.relativeReference).toBe('100');
    expect(reduction.relativeReferenceUniverseCount).toBe(2);
    expect(reduction.ranked.map((row) => row.scenarioId)).toEqual(['positive-baseline']);
    expect(reduction.highlights).toEqual({
      savings: 'zero-baseline', efficiency: 'zero-baseline',
      costReduction: 'positive-baseline', wait: 'positive-baseline',
      companyCount: 'zero-baseline', netability: 'zero-baseline',
    });
    expect(reduction.highlights).toEqual(savings.highlights);
  });

  it('excludes zero volume from every recommendation', () => {
    const rows = [portfolio('empty', { savings: '100', volume: '0' }), portfolio('measured')];
    const result = selectPortfolios(rows, 'savings', emptyFilters);
    expect(result.winner?.scenarioId).toBe('measured');
    expect(result.ineligible.find((entry) => entry.candidate.scenarioId === 'empty')?.reasons).toContain('volume');
  });

  it('compares 80-digit ratios exactly rather than rounding at Decimal default precision', () => {
    const n = `1${'0'.repeat(79)}`;
    const rows = [
      portfolio('slightly-below', { savings: `${n.slice(0, -1)}1`, volume: `${n.slice(0, -1)}2` }),
      portfolio('equal-one', { savings: n, volume: n }),
    ];
    expect(selectPortfolios(rows, 'efficiency', emptyFilters).winner?.scenarioId).toBe('equal-one');
  });

  it('breaks rounded-looking ties by savings, wait, company count, IDs and scenario ID regardless of input order', () => {
    const rows = [
      portfolio('later', { savings: '1.0000000000000000000000001', companyIds: ['b'], weightedWait: '1' }),
      portfolio('better-money', { savings: '1.0000000000000000000000002', companyIds: ['b'], weightedWait: '1' }),
    ];
    expect(selectPortfolios(rows, 'savings', emptyFilters).winner?.scenarioId).toBe('better-money');
    const tied = [
      portfolio('Z', { companyIds: ['a'], weightedWait: '100' }),
      portfolio('Y', { companyIds: ['b'], weightedWait: '50' }),
      portfolio('X', { companyIds: ['a', 'b'], weightedWait: '50' }),
    ];
    expect(selectPortfolios(tied, 'savings', emptyFilters).winner?.scenarioId).toBe('Y');
    const same = [portfolio('b', { companyIds: ['x'] }), portfolio('a', { companyIds: ['x'] })];
    expect(selectPortfolios(same, 'savings', emptyFilters).ranked.map((row) => row.scenarioId)).toEqual(['a', 'b']);
    expect(selectPortfolios([...same].reverse(), 'savings', emptyFilters).ranked.map((row) => row.scenarioId)).toEqual(['a', 'b']);
  });
});
