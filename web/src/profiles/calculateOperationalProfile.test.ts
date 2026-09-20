import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { ObservedCase, ObservedOrder } from '../cases/domain';
import { calculateCoverage, calculateOperationalProfile, nearestRank, weightedNearestRank } from './calculateOperationalProfile';

const provenance = { kind: 'OBSERVED', source: 'fixture.xlsx', version: 'layout-1', recordedAt: '2026-09-20T12:00:00Z' } as const;
function order(id: string, direction: 'OUT' | 'IN', knownDate: string, deadlineDate: string, purposeCode: string | null): ObservedOrder {
  return { id, clientId: `client-${id}`, direction, knownDate, deadlineDate, valueBrl: '100', purposeCode, efxStatus: 'NOT_COLLECTED', provenance: [provenance] };
}
function aCase(input: Readonly<{ id: string; startDate: string; endDate: string; orders: readonly ObservedOrder[]; sha: string }>): ObservedCase {
  const out = input.orders.filter((item) => item.direction === 'OUT').length * 100;
  const incoming = input.orders.filter((item) => item.direction === 'IN').length * 100;
  return {
    schemaVersion: '2.0.0', id: input.id, ownerSub: 'owner-1', companyId: 'company-1', status: 'CONFIRMED', revision: 1,
    window: { startDate: input.startDate, endDate: input.endDate, closingDate: input.endDate }, orders: input.orders,
    controlTotals: [...(out === 0 ? [] : [{ code: 'GROSS_OUT_BRL' as const, valueBrl: String(out), provenance }]), ...(incoming === 0 ? [] : [{ code: 'GROSS_IN_BRL' as const, valueBrl: String(incoming), provenance }])],
    sourceManifest: { adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX', files: [{ name: `${input.id}.xlsx`, sizeBytes: 100, sha256: input.sha.repeat(64) }] },
    normalization: { rulesetId: 'canonical-xlsx', rulesetVersion: '1.0.0', normalizedAt: '2026-09-20T12:00:00Z' },
    quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null, confirmedAt: '2026-09-20T12:05:00Z',
  };
}
const january = aCase({ id: 'january', startDate: '2026-01-01', endDate: '2026-01-02', sha: 'a', orders: [order('a', 'OUT', '2026-01-01', '2026-01-02', 'SERVICES'), order('b', 'IN', '2026-01-01', '2026-01-03', null)] });
const february = aCase({ id: 'february', startDate: '2026-02-01', endDate: '2026-02-02', sha: 'b', orders: [order('c', 'OUT', '2026-02-01', '2026-02-04', 'GOODS'), order('d', 'IN', '2026-02-01', '2026-02-06', 'SERVICES')] });
const evidence = ['case:january@1', 'case:february@1'];

describe('percentiles', () => {
  // Production break caught: nearest-rank uses interpolation or a zero-based rank.
  it('uses the first one-based rank at or above q*n', () => {
    const values = ['5', '1', '3', '2'].map((value) => new Decimal(value));
    expect(nearestRank(values, new Decimal('0.25')).toString()).toBe('1');
    expect(nearestRank(values, new Decimal('0.5')).toString()).toBe('2');
    expect(nearestRank(values, new Decimal('0.9')).toString()).toBe('5');
  });

  // Production break caught: weighted rank uses observation count instead of cumulative volume.
  it('selects the first deadline whose cumulative volume reaches the quantile', () => {
    const values = [{ value: new Decimal('1'), weight: new Decimal('100') }, { value: new Decimal('3'), weight: new Decimal('300') }, { value: new Decimal('5'), weight: new Decimal('100') }];
    expect(weightedNearestRank(values, new Decimal('0.5')).toString()).toBe('3');
    expect(weightedNearestRank(values, new Decimal('0.9')).toString()).toBe('5');
  });
});

describe('calculateCoverage', () => {
  // Production break caught: overlap duplicates covered-day denominators or erases gap accounting.
  it('unions civil UTC days and reports overlap and gaps separately', () => {
    const overlap = aCase({ id: 'overlap', startDate: '2026-01-02', endDate: '2026-01-03', sha: 'c', orders: [] });
    expect(calculateCoverage([february, overlap, january])).toEqual({
      caseCount: 3, firstDate: '2026-01-01', lastDate: '2026-02-02', totalWindowDays: 6, coveredDays: 5, overlapDays: 1, gapDays: 28,
      windows: [
        { caseId: 'january', caseRevision: 1, startDate: '2026-01-01', endDate: '2026-01-02', durationDays: 2 },
        { caseId: 'overlap', caseRevision: 1, startDate: '2026-01-02', endDate: '2026-01-03', durationDays: 2 },
        { caseId: 'february', caseRevision: 1, startDate: '2026-02-01', endDate: '2026-02-02', durationDays: 2 },
      ],
    });
  });
});

describe('calculateOperationalProfile', () => {
  // Production break caught: any metric family is omitted, uses the wrong denominator, or fabricates missing purpose/months as zero.
  it('publishes every metric from two hand-calculated civil-month cases', async () => {
    const profile = await calculateOperationalProfile({ id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 1, createdAt: '2026-09-20T14:00:00Z', cases: [february, january] });
    expect(profile.selectedCases.map((item) => item.caseId)).toEqual(['january', 'february']);
    expect(profile.coverage).toMatchObject({ caseCount: 2, totalWindowDays: 4, coveredDays: 4, overlapDays: 0, gapDays: 29 });
    expect(profile.metrics.volume).toEqual({ outBrl: { state: 'AVAILABLE', value: '200', evidence }, inBrl: { state: 'AVAILABLE', value: '200', evidence }, totalBrl: { state: 'AVAILABLE', value: '400', evidence } });
    expect(profile.metrics.frequency).toEqual({ orderCount: { state: 'AVAILABLE', value: 4, evidence }, ordersPerCoveredDay: { state: 'AVAILABLE', value: '1', evidence }, ordersPer30Days: { state: 'AVAILABLE', value: '30', evidence } });
    expect(profile.metrics.ticketsBrl).toEqual({ min: { state: 'AVAILABLE', value: '100', evidence }, p25: { state: 'AVAILABLE', value: '100', evidence }, p50: { state: 'AVAILABLE', value: '100', evidence }, p75: { state: 'AVAILABLE', value: '100', evidence }, max: { state: 'AVAILABLE', value: '100', evidence } });
    expect(profile.metrics.direction).toEqual({ state: 'AVAILABLE', value: { out: { volumeBrl: '200', fraction: '0.5' }, in: { volumeBrl: '200', fraction: '0.5' } }, evidence });
    expect(profile.metrics.deadlineDays).toEqual({ p50ByCount: { state: 'AVAILABLE', value: '2', evidence }, p90ByCount: { state: 'AVAILABLE', value: '5', evidence }, p50ByVolume: { state: 'AVAILABLE', value: '2', evidence }, p90ByVolume: { state: 'AVAILABLE', value: '5', evidence } });
    expect(profile.metrics.purposes).toEqual({
      byCode: { state: 'AVAILABLE', value: [{ code: 'GOODS', volumeBrl: '100', orderCount: 1, volumeFraction: '0.25', orderFraction: '0.25' }, { code: 'SERVICES', volumeBrl: '200', orderCount: 2, volumeFraction: '0.5', orderFraction: '0.5' }], evidence },
      knownCoverage: { state: 'AVAILABLE', value: { volumeFraction: '0.75', orderFraction: '0.75' }, evidence },
      missing: { state: 'NOT_COLLECTED', reason: 'Há ordens sem finalidade coletada.', evidence: ['case:january@1/order:b'] },
    });
    expect(profile.metrics.windows).toEqual({ state: 'AVAILABLE', value: profile.coverage, evidence });
    expect(profile.metrics.seasonality.observations).toEqual({ state: 'AVAILABLE', value: [
      { month: '2026-01', volumeBrl: '200', orderCount: 2, coveredDays: 2, averageVolumePerCoveredDay: '100', averageOrdersPerCoveredDay: '1' },
      { month: '2026-02', volumeBrl: '200', orderCount: 2, coveredDays: 2, averageVolumePerCoveredDay: '100', averageOrdersPerCoveredDay: '1' },
    ], evidence });
    expect(profile.metrics.seasonality.comparison).toEqual({ state: 'AVAILABLE', value: { coveredMonthCount: 2 }, evidence });
  });

  // Production break caught: one observed month is treated as comparative seasonality or missing months are inserted as zero.
  it('keeps observed months while marking comparison as insufficient', async () => {
    const profile = await calculateOperationalProfile({ id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 1, createdAt: '2026-09-20T14:00:00Z', cases: [january] });
    expect(profile.metrics.seasonality.observations.state).toBe('AVAILABLE');
    if (profile.metrics.seasonality.observations.state === 'AVAILABLE') {
      expect(profile.metrics.seasonality.observations.value.map((item) => item.month)).toEqual(['2026-01']);
    }
    expect(profile.metrics.seasonality.comparison).toEqual({ state: 'INSUFFICIENT_COVERAGE', reason: 'São necessários ao menos dois meses civis cobertos.', evidence: ['case:january@1'] });
  });

  // Production break caught: selection or operation ordering changes bytes, metrics, provenance, or fingerprints.
  it('is byte-deterministic under case and operation reordering', async () => {
    const base = { id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 1, createdAt: '2026-09-20T14:00:00Z' } as const;
    const ordered = await calculateOperationalProfile({ ...base, cases: [january, february] });
    const reordered = await calculateOperationalProfile({ ...base, cases: [february, { ...january, orders: [...january.orders].reverse() }] });
    expect(reordered).toEqual(ordered);
  });

  // Production break caught: overlapping windows either remove distinct orders or fail to annotate denominator-dependent metrics.
  it('keeps distinct-case orders and carries overlap warning evidence', async () => {
    const overlap = aCase({ id: 'overlap', startDate: '2026-01-02', endDate: '2026-01-03', sha: 'c', orders: [order('overlap-order', 'OUT', '2026-01-02', '2026-01-03', 'SERVICES')] });
    const profile = await calculateOperationalProfile({ id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 1, createdAt: '2026-09-20T14:00:00Z', cases: [january, overlap] });
    expect(profile.metrics.frequency.orderCount).toMatchObject({ value: 3 });
    expect(profile.coverage).toMatchObject({ totalWindowDays: 4, coveredDays: 3, overlapDays: 1 });
    expect(profile.metrics.frequency.ordersPerCoveredDay.evidence).toContain('warning:OVERLAPPING_WINDOWS');
    expect(profile.metrics.windows.evidence).toContain('warning:OVERLAPPING_WINDOWS');
    expect(profile.metrics.seasonality.observations).toMatchObject({ state: 'AVAILABLE' });
    if (profile.metrics.seasonality.observations.state === 'AVAILABLE') {
      expect(profile.metrics.seasonality.observations.value).toHaveLength(1);
    }
  });
});
