import { describe, expect, it } from 'vitest';

import type { ObservedCase, ObservedOrder } from '../cases/domain';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { makeObservedCase } from '../study/fixtures';
import {
  compareCompanyTimeline,
  projectObservedCaseForTimeline,
  projectProfileForTimeline,
  type TimelineObservation,
} from './temporalComparison';

const provenance = {
  kind: 'OBSERVED', source: 'timeline.xlsx', version: 'layout-1', recordedAt: '2026-09-20T12:00:00Z',
} as const;

function order(id: string, direction: 'OUT' | 'IN', valueBrl: string, deadlineDays: number): ObservedOrder {
  return {
    id, clientId: `client-${id}`, direction, knownDate: '2026-01-01',
    deadlineDate: `2026-01-${String(1 + deadlineDays).padStart(2, '0')}`,
    valueBrl, purposeCode: 'SERVICES', efxStatus: 'YES', provenance: [provenance],
  };
}

function observedCase(input: Readonly<{
  id: string;
  companyId?: string;
  revision?: number;
  startDate?: string;
  endDate?: string;
  orders?: readonly ObservedOrder[];
}>): ObservedCase {
  const base = makeObservedCase();
  const sourceSha = [...input.id].map((character) => character.charCodeAt(0).toString(16)).join('').padEnd(64, '0').slice(0, 64);
  return {
    ...base,
    id: input.id,
    companyId: input.companyId ?? 'company-1',
    revision: input.revision ?? 1,
    window: {
      startDate: input.startDate ?? '2026-01-01',
      endDate: input.endDate ?? '2026-01-10',
      closingDate: input.endDate ?? '2026-01-10',
    },
    orders: input.orders ?? [order(`${input.id}-out`, 'OUT', '100', 2), order(`${input.id}-in`, 'IN', '300', 4)],
    sourceManifest: {
      ...base.sourceManifest,
      files: [{ ...base.sourceManifest.files[0]!, sha256: sourceSha }],
    },
    observedOutcome: null,
  };
}

function withMetric(
  observation: TimelineObservation,
  metricId: string,
  change: Partial<TimelineObservation['metrics'][number]>,
): TimelineObservation {
  return {
    ...observation,
    metrics: observation.metrics.map((metric) => metric.metricId === metricId ? { ...metric, ...change } : metric),
  };
}

describe('timeline projections', () => {
  // Production break caught: a case projection changes metric definitions, percentile semantics, period, or source revision.
  it('projects a case into the four explicitly comparable observed metric families', () => {
    const projected = projectObservedCaseForTimeline(observedCase({ id: 'case-a', revision: 7 }));
    expect(projected).toMatchObject({
      id: 'OBSERVED_CASE:case-a@7', kind: 'OBSERVED_CASE', companyId: 'company-1',
      period: { startDate: '2026-01-01', endDate: '2026-01-10' }, coveredDays: 10,
      gapDays: 0, coverageState: 'AVAILABLE', sourceVersion: '7',
      provenance: { sourceId: 'case-a', sourceVersion: '7' },
    });
    expect(projected.metrics.map((metric) => [metric.metricId, metric.unit, metric.definitionVersion, metric.percentileMethod, metric.value])).toEqual([
      ['TOTAL_VOLUME_BRL', 'BRL', 'gross-observed-volume-v1', null, { state: 'AVAILABLE', value: '400' }],
      ['OUT_VOLUME_FRACTION', 'FRACTION', 'gross-observed-direction-v1', null, { state: 'AVAILABLE', value: '0.25' }],
      ['TICKET_P50_BRL', 'BRL', 'observed-ticket-v1', 'NEAREST_RANK', { state: 'AVAILABLE', value: '100' }],
      ['DEADLINE_P50_DAYS', 'DAYS', 'observed-deadline-calendar-days-v1', 'NEAREST_RANK', { state: 'AVAILABLE', value: '2' }],
    ]);
  });

  // Production break caught: profile projection recomputes data, drops profile/version provenance, or converts unavailable evidence to zero.
  it('projects a profile from its stored metrics and preserves explicit absence', async () => {
    const first = observedCase({ id: 'case-a' });
    const profile = await calculateOperationalProfile({
      id: 'profile-1', ownerSub: first.ownerSub, companyId: first.companyId, version: 3,
      createdAt: '2026-02-01T12:00:00Z', cases: [first],
    });
    const unavailable = {
      ...profile,
      metrics: { ...profile.metrics, ticketsBrl: {
        ...profile.metrics.ticketsBrl,
        p50: { state: 'NOT_COLLECTED', reason: 'Ticket não coletado.', evidence: ['case:case-a@1'] },
      } },
    } as typeof profile;
    const projected = projectProfileForTimeline(unavailable);
    expect(projected).toMatchObject({
      id: 'OPERATIONAL_PROFILE:profile-1', kind: 'OPERATIONAL_PROFILE', companyId: 'company-1',
      sourceVersion: '3', provenance: { sourceId: 'profile-1', sourceVersion: '3' },
    });
    expect(projected.metrics.find((metric) => metric.metricId === 'TICKET_P50_BRL')?.value).toEqual({
      state: 'NOT_COLLECTED', reason: 'Ticket não coletado.',
    });
  });

  // Production break caught: profile gaps and metric-specific evidence are flattened into aggregate document provenance.
  it('preserves profile gaps and distinct evidence refs without inventing refs for unavailable values', async () => {
    const first = observedCase({ id: 'case-first', startDate: '2026-01-01', endDate: '2026-01-02' });
    const last = observedCase({ id: 'case-last', startDate: '2026-01-05', endDate: '2026-01-05' });
    const profile = await calculateOperationalProfile({
      id: 'profile-gap', ownerSub: first.ownerSub, companyId: first.companyId, version: 2,
      createdAt: '2026-02-01T12:00:00Z', cases: [first, last],
    });
    const withDistinctEvidence = {
      ...profile,
      metrics: {
        ...profile.metrics,
        volume: { ...profile.metrics.volume, totalBrl: { state: 'AVAILABLE', value: '800', evidence: ['metric:volume'] } },
        ticketsBrl: { ...profile.metrics.ticketsBrl, p50: { state: 'AVAILABLE', value: '100', evidence: ['metric:ticket'] } },
        deadlineDays: {
          ...profile.metrics.deadlineDays,
          p50ByCount: { state: 'NOT_COLLECTED', reason: 'Prazo ausente.', evidence: [] },
        },
      },
    } as typeof profile;

    const projected = projectProfileForTimeline(withDistinctEvidence);
    expect(projected.gapDays).toBe(2);
    expect(projected.metrics.find((metric) => metric.metricId === 'TOTAL_VOLUME_BRL')?.evidenceRefs).toEqual(['metric:volume']);
    expect(projected.metrics.find((metric) => metric.metricId === 'TICKET_P50_BRL')?.evidenceRefs).toEqual(['metric:ticket']);
    expect(projected.metrics.find((metric) => metric.metricId === 'DEADLINE_P50_DAYS')?.evidenceRefs).toEqual([]);
    expect(projected.provenance.evidence).toContain('profile:profile-gap@2');
  });
});

describe('compareCompanyTimeline', () => {
  const earlier = projectObservedCaseForTimeline(observedCase({ id: 'case-a', startDate: '2026-01-01', endDate: '2026-01-10' }));
  const later = projectObservedCaseForTimeline(observedCase({
    id: 'case-b', startDate: '2026-02-01', endDate: '2026-02-10',
    orders: [order('b-out', 'OUT', '200', 3), order('b-in', 'IN', '300', 5)],
  }));

  // Production break caught: comparison silently mixes companies or exposes deltas for incompatible semantics.
  it.each([
    ['empresa', { ...later, companyId: 'company-2' }, 'DIFFERENT_COMPANY'],
    ['unidade', withMetric(later, 'TOTAL_VOLUME_BRL', { unit: 'USD' }), 'INCOMPATIBLE_UNIT'],
    ['definição', withMetric(later, 'TOTAL_VOLUME_BRL', { definitionVersion: 'gross-observed-volume-v2' }), 'INCOMPATIBLE_DEFINITION'],
    ['percentil', withMetric(later, 'TICKET_P50_BRL', { percentileMethod: 'LINEAR_INTERPOLATION' }), 'INCOMPATIBLE_PERCENTILE_METHOD'],
  ])('blocks incompatible %s before producing values', (_name, incompatible, code) => {
    const comparison = compareCompanyTimeline([earlier, incompatible]);
    expect(comparison.state).toBe('INCOMPATIBLE');
    expect(comparison.reasons).toContainEqual(expect.objectContaining({ code }));
    expect(comparison.metricRows.every((row) => row.deltas.length === 0)).toBe(true);
  });

  // Production break caught: missing values become zero or receive a fabricated delta.
  it('keeps absence explicit and only computes adjacent deltas between available compatible values', () => {
    const withoutTicket = withMetric(later, 'TICKET_P50_BRL', {
      value: { state: 'NOT_COLLECTED', reason: 'Ticket não coletado.' },
    });
    const comparison = compareCompanyTimeline([withoutTicket, earlier]);
    expect(comparison.state).toBe('AVAILABLE');
    const volume = comparison.metricRows.find((row) => row.metricId === 'TOTAL_VOLUME_BRL');
    expect(volume?.values[0]).toMatchObject({
      observationId: earlier.id,
      period: earlier.period,
      coveredDays: 10,
      gapDays: 0,
      coverageState: 'AVAILABLE',
      definitionVersion: 'gross-observed-volume-v1',
      provenance: earlier.metrics[0]?.provenance,
      evidenceRefs: earlier.metrics[0]?.evidenceRefs,
    });
    expect(volume?.deltas).toEqual([{ fromObservationId: earlier.id, toObservationId: later.id, value: '100' }]);
    const ticket = comparison.metricRows.find((row) => row.metricId === 'TICKET_P50_BRL');
    expect(ticket?.values[1]?.value).toEqual({ state: 'NOT_COLLECTED', reason: 'Ticket não coletado.' });
    expect(ticket?.deltas).toEqual([{
      fromObservationId: earlier.id, toObservationId: later.id,
      unavailableReason: 'Ticket não coletado.',
    }]);
  });

  // Production break caught: case/profile comparison ignores the profile's declared percentile method.
  it('allows compatible case/profile evidence and blocks a different declared percentile method', async () => {
    const source = observedCase({ id: 'profile-source' });
    const profile = await calculateOperationalProfile({
      id: 'profile-1', ownerSub: source.ownerSub, companyId: source.companyId, version: 1,
      createdAt: '2026-03-01T12:00:00Z', cases: [source],
    });
    expect(compareCompanyTimeline([earlier, projectProfileForTimeline(profile)]).state).toBe('AVAILABLE');

    const differentMethod = {
      ...profile,
      method: { ...profile.method, percentileMethod: 'LINEAR_INTERPOLATION' },
    } as unknown as typeof profile;
    const comparison = compareCompanyTimeline([earlier, projectProfileForTimeline(differentMethod)]);
    expect(comparison).toMatchObject({ state: 'INCOMPATIBLE' });
    expect(comparison.reasons).toContainEqual(expect.objectContaining({ code: 'INCOMPATIBLE_PERCENTILE_METHOD' }));
  });

  // Production break caught: caller order changes IDs, temporal order, values, or deltas.
  it('is deterministic under item reordering and uses stable temporal IDs', () => {
    expect(compareCompanyTimeline([later, earlier])).toEqual(compareCompanyTimeline([earlier, later]));
    expect(compareCompanyTimeline([later, earlier]).observations.map((item) => item.id)).toEqual([
      'OBSERVED_CASE:case-a@1', 'OBSERVED_CASE:case-b@1',
    ]);
  });

  // Production break caught: selection limits can be bypassed by direct callers.
  it('requires between two and six distinct observations', () => {
    expect(() => compareCompanyTimeline([earlier])).toThrow('entre 2 e 6');
    expect(() => compareCompanyTimeline([earlier, earlier])).toThrow('distintas');
    expect(() => compareCompanyTimeline(Array.from({ length: 7 }, (_, index) => ({
      ...earlier, id: `OBSERVED_CASE:case-${index}@1`, period: { startDate: `2026-01-${String(index + 1).padStart(2, '0')}`, endDate: `2026-01-${String(index + 1).padStart(2, '0')}` },
    })))).toThrow('entre 2 e 6');
  });
});
