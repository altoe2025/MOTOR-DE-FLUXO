import Decimal from 'decimal.js';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { StudyDocument } from '../study/model';
import { findCaseStudyLinks, findProfileStudyLinks, type HistoricalStudyLink } from './studyLinks';

const DAY_MS = 86_400_000;

export type CompanyOverview = Readonly<{
  company: CompanyRecord;
  caseCount: number;
  coverage: Readonly<{
    coveredDays: number;
    firstDate: string;
    lastDate: string;
    gapDays: number;
  }> | null;
  volume: Readonly<{ outBrl: string | null; inBrl: string | null }>;
  quality: Readonly<{ blockerCount: number; warningCount: number; notCollectedCount: number }>;
  latestProfile: OperationalProfileVersion | null;
  relatedStudies: readonly HistoricalStudyLink[];
}>;

type OverviewInput = Readonly<{
  company: CompanyRecord;
  cases: readonly ObservedCase[];
  profiles: readonly OperationalProfileVersion[];
  studies: readonly StudyDocument[];
}>;

function toDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function coverage(cases: readonly ObservedCase[]): CompanyOverview['coverage'] {
  if (cases.length === 0) return null;
  const windows = cases
    .map((item) => [toDay(item.window.startDate), toDay(item.window.endDate)] as const)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of windows) {
    const previous = merged.at(-1);
    if (previous === undefined || start > previous[1] + 1) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  const first = merged[0]!;
  const last = merged.at(-1)!;
  const coveredDays = merged.reduce((total, [start, end]) => total + end - start + 1, 0);
  return {
    coveredDays,
    firstDate: fromDay(first[0]),
    lastDate: fromDay(last[1]),
    gapDays: last[1] - first[0] + 1 - coveredDays,
  };
}

function hasNotCollected(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === 'NOT_COLLECTED') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if ('kind' in value && value.kind === 'NOT_COLLECTED') return true;
  return Object.values(value).some((child) => hasNotCollected(child, seen));
}

function latestProfile(profiles: readonly OperationalProfileVersion[]): OperationalProfileVersion | null {
  return [...profiles].sort((left, right) => right.version - left.version
    || right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function deduplicateLinks(links: readonly HistoricalStudyLink[]): HistoricalStudyLink[] {
  const byStudy = new Map<string, HistoricalStudyLink>();
  for (const link of links) {
    const existing = byStudy.get(link.studyId);
    byStudy.set(link.studyId, existing === undefined ? link : {
      ...existing,
      revisions: [...new Set([...existing.revisions, ...link.revisions])].sort((a, b) => a - b),
    });
  }
  return [...byStudy.values()].sort((left, right) => left.studyName.localeCompare(right.studyName, 'pt-BR')
    || left.studyId.localeCompare(right.studyId));
}

export function deriveCompanyOverview(input: OverviewInput): CompanyOverview {
  const cases = input.cases.filter((item) =>
    item.ownerSub === input.company.ownerSub && item.companyId === input.company.id);
  const profiles = input.profiles.filter((item) =>
    item.ownerSub === input.company.ownerSub && item.companyId === input.company.id);
  const out = cases.flatMap((item) => item.orders).filter((item) => item.direction === 'OUT');
  const inbound = cases.flatMap((item) => item.orders).filter((item) => item.direction === 'IN');
  const sum = (orders: readonly ObservedCase['orders'][number][]) =>
    orders.reduce((total, order) => total.plus(order.valueBrl), new Decimal(0)).toString();
  const relatedStudies = deduplicateLinks([
    ...cases.flatMap((item) => findCaseStudyLinks(input.company.ownerSub, item.id, input.studies)),
    ...profiles.flatMap((item) => findProfileStudyLinks(item, input.studies)),
  ]);
  return {
    company: input.company,
    caseCount: cases.length,
    coverage: coverage(cases),
    volume: {
      outBrl: out.length === 0 ? null : sum(out),
      inBrl: inbound.length === 0 ? null : sum(inbound),
    },
    quality: {
      blockerCount: cases.reduce((total, item) => total + item.quality.blockers.length, 0),
      warningCount: cases.reduce((total, item) => total + item.quality.warnings.length, 0),
      notCollectedCount: cases.filter((item) => hasNotCollected(item)).length,
    },
    latestProfile: latestProfile(profiles),
    relatedStudies,
  };
}

export function caseHasNotCollected(caseRecord: ObservedCase): boolean {
  return hasNotCollected(caseRecord);
}
