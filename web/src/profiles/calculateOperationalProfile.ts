import Decimal from 'decimal.js';

import type { FieldProvenance, ObservedCase, ObservedOrder } from '../cases/domain';
import { checkProfileCompatibility, orderedCases } from './compatibility';
import type {
  CalculateOperationalProfileInput,
  CivilMonthObservation,
  EvidenceValue,
  OperationalProfileMetrics,
  OperationalProfileVersion,
  ProfileCoverage,
  ProfileProvenance,
  PurposeMetric,
  SelectedProfileCase,
} from './domain';
import {
  canonicalProfileJson,
  fingerprintObservedCase,
  fingerprintOperationalProfile,
  fingerprintProfileSelection,
} from './fingerprints';

const ProfileDecimal = Decimal.clone({ precision: 40 });
const DAY_MS = 86_400_000;

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function daysInclusive(start: string, end: string): number {
  return Math.floor((utcDay(end) - utcDay(start)) / DAY_MS) + 1;
}

function eachDay(start: string, end: string): string[] {
  const result: string[] = [];
  for (let instant = utcDay(start); instant <= utcDay(end); instant += DAY_MS) {
    result.push(new Date(instant).toISOString().slice(0, 10));
  }
  return result;
}

function available<T>(value: T, evidence: readonly string[]): EvidenceValue<T> {
  return { state: 'AVAILABLE', value, evidence };
}

function insufficient<T>(reason: string, evidence: readonly string[]): EvidenceValue<T> {
  return { state: 'INSUFFICIENT_COVERAGE', reason, evidence };
}

export function nearestRank(values: readonly Decimal[], q: Decimal): Decimal {
  if (values.length === 0) throw new Error('Percentil exige ao menos uma observação.');
  if (q.lt(0) || q.gt(1)) throw new Error('Percentil deve estar entre zero e um.');
  const ordered = values.map((value) => new ProfileDecimal(value)).sort((left, right) => left.comparedTo(right));
  const rank = Math.max(1, new ProfileDecimal(q).times(ordered.length).ceil().toNumber());
  return ordered[rank - 1]!;
}

export function weightedNearestRank(
  values: readonly Readonly<{ value: Decimal; weight: Decimal }>[],
  q: Decimal,
): Decimal {
  if (values.length === 0) throw new Error('Percentil ponderado exige ao menos uma observação.');
  if (q.lt(0) || q.gt(1)) throw new Error('Percentil deve estar entre zero e um.');
  const ordered = values.map((item) => ({
    value: new ProfileDecimal(item.value),
    weight: new ProfileDecimal(item.weight),
  })).sort((left, right) => left.value.comparedTo(right.value));
  if (ordered.some((item) => item.weight.lte(0))) throw new Error('Pesos devem ser positivos.');
  const target = ordered.reduce((sum, item) => sum.plus(item.weight), new ProfileDecimal(0)).times(q);
  let cumulative = new ProfileDecimal(0);
  for (const item of ordered) {
    cumulative = cumulative.plus(item.weight);
    if (cumulative.gte(target)) return item.value;
  }
  return ordered.at(-1)!.value;
}

export function calculateCoverage(cases: readonly ObservedCase[]): ProfileCoverage {
  if (cases.length === 0) throw new Error('Cobertura exige ao menos um caso.');
  const ordered = orderedCases(cases);
  const covered = new Set<string>();
  const windows = ordered.map((item) => {
    for (const day of eachDay(item.window.startDate, item.window.endDate)) covered.add(day);
    return {
      caseId: item.id,
      caseRevision: item.revision,
      startDate: item.window.startDate,
      endDate: item.window.endDate,
      durationDays: daysInclusive(item.window.startDate, item.window.endDate),
    };
  });
  const firstDate = windows[0]!.startDate;
  const lastDate = windows.reduce(
    (latest, item) => item.endDate > latest ? item.endDate : latest,
    windows[0]!.endDate,
  );
  const totalWindowDays = windows.reduce((sum, item) => sum + item.durationDays, 0);
  const coveredDays = covered.size;
  return {
    caseCount: cases.length,
    firstDate,
    lastDate,
    totalWindowDays,
    coveredDays,
    overlapDays: totalWindowDays - coveredDays,
    gapDays: daysInclusive(firstDate, lastDate) - coveredDays,
    windows,
  };
}

type LocatedOrder = Readonly<{ caseRecord: ObservedCase; order: ObservedOrder }>;

function aggregatePurposes(
  orders: readonly LocatedOrder[],
  total: Decimal,
  evidence: readonly string[],
): OperationalProfileMetrics['purposes'] {
  const groups = new Map<string, { volume: Decimal; count: number }>();
  const missing: LocatedOrder[] = [];
  for (const located of orders) {
    if (located.order.purposeCode === null || located.order.purposeCode === '') {
      missing.push(located);
      continue;
    }
    const current = groups.get(located.order.purposeCode) ?? { volume: new ProfileDecimal(0), count: 0 };
    groups.set(located.order.purposeCode, {
      volume: current.volume.plus(located.order.valueBrl),
      count: current.count + 1,
    });
  }
  const byCode: PurposeMetric[] = [...groups.entries()].sort(([left], [right]) => ordinal(left, right))
    .map(([code, item]) => ({
      code,
      volumeBrl: item.volume.toString(),
      orderCount: item.count,
      volumeFraction: item.volume.div(total).toString(),
      orderFraction: new ProfileDecimal(item.count).div(orders.length).toString(),
    }));
  const knownVolume = byCode.reduce((sum, item) => sum.plus(item.volumeBrl), new ProfileDecimal(0));
  const knownCount = byCode.reduce((sum, item) => sum + item.orderCount, 0);
  return {
    byCode: available(byCode, evidence),
    knownCoverage: available({
      volumeFraction: knownVolume.div(total).toString(),
      orderFraction: new ProfileDecimal(knownCount).div(orders.length).toString(),
    }, evidence),
    missing: missing.length === 0
      ? available({ volumeBrl: '0', orderCount: 0 }, evidence)
      : {
          state: 'NOT_COLLECTED',
          reason: 'Há ordens sem finalidade coletada.',
          evidence: missing.map(({ caseRecord, order }) => `case:${caseRecord.id}@${caseRecord.revision}/order:${order.id}`),
        },
  };
}

function seasonality(
  cases: readonly ObservedCase[],
  orders: readonly LocatedOrder[],
  denominatorEvidence: readonly string[],
): OperationalProfileMetrics['seasonality'] {
  const coveredByMonth = new Map<string, Set<string>>();
  for (const item of cases) {
    for (const day of eachDay(item.window.startDate, item.window.endDate)) {
      const month = day.slice(0, 7);
      const days = coveredByMonth.get(month) ?? new Set<string>();
      days.add(day);
      coveredByMonth.set(month, days);
    }
  }
  const observations: CivilMonthObservation[] = [...coveredByMonth.entries()]
    .sort(([left], [right]) => ordinal(left, right))
    .map(([month, days]) => {
      const monthlyOrders = orders.filter(({ order }) => order.knownDate.startsWith(`${month}-`));
      const volume = monthlyOrders.reduce((sum, { order }) => sum.plus(order.valueBrl), new ProfileDecimal(0));
      return {
        month,
        volumeBrl: volume.toString(),
        orderCount: monthlyOrders.length,
        coveredDays: days.size,
        averageVolumePerCoveredDay: volume.div(days.size).toString(),
        averageOrdersPerCoveredDay: new ProfileDecimal(monthlyOrders.length).div(days.size).toString(),
      };
    });
  return {
    observations: available(observations, denominatorEvidence),
    comparison: observations.length < 2
      ? insufficient('São necessários ao menos dois meses civis cobertos.', denominatorEvidence)
      : available({ coveredMonthCount: observations.length }, denominatorEvidence),
  };
}

function profileProvenance(cases: readonly ObservedCase[], evidence: readonly string[]): ProfileProvenance {
  const fields = cases.flatMap((item) => item.orders.flatMap((order) => order.provenance))
    .map((item) => structuredClone(item));
  const uniqueFields = new Map<string, FieldProvenance>();
  for (const item of fields) uniqueFields.set(canonicalProfileJson(item), item);
  return {
    caseEvidence: evidence,
    sourceFiles: [...new Set(cases.flatMap((item) => item.sourceManifest.files.map((file) => file.sha256)))].sort(ordinal),
    normalizationVersions: [...new Set(cases.map((item) => `${item.normalization.rulesetId}@${item.normalization.rulesetVersion}`))].sort(ordinal),
    fields: [...uniqueFields.entries()].sort(([left], [right]) => ordinal(left, right)).map(([, item]) => item),
  };
}

export async function calculateOperationalProfile(
  input: CalculateOperationalProfileInput,
): Promise<OperationalProfileVersion> {
  const ordered = orderedCases(input.cases);
  const compatibility = checkProfileCompatibility(ordered, {
    ...(input.company === undefined ? {} : { company: input.company }),
    ...(input.confirmedDistinctSourceSha256 === undefined ? {} : { confirmedDistinctSourceSha256: input.confirmedDistinctSourceSha256 }),
  });
  if (ordered.some((item) => item.ownerSub !== input.ownerSub || item.companyId !== input.companyId)) {
    throw new Error('Seleção incompatível com o proprietário ou a empresa do perfil.');
  }
  if (!compatibility.compatible) {
    throw new Error(`Seleção incompatível: ${compatibility.blockers.map((item) => item.code).join(', ')}.`);
  }

  const selectedCases: SelectedProfileCase[] = await Promise.all(ordered.map(async (item) => ({
    caseId: item.id,
    caseRevision: item.revision,
    caseFingerprint: await fingerprintObservedCase(item),
    window: structuredClone(item.window),
  })));
  const selectionFingerprint = await fingerprintProfileSelection(selectedCases);
  const coverage = calculateCoverage(ordered);
  const caseEvidence = ordered.map((item) => `case:${item.id}@${item.revision}`);
  const overlapWarning = compatibility.warnings.some((item) => item.code === 'OVERLAPPING_WINDOWS')
    ? ['warning:OVERLAPPING_WINDOWS']
    : [];
  const denominatorEvidence = [...caseEvidence, ...overlapWarning];
  const orders: LocatedOrder[] = ordered.flatMap((caseRecord) => caseRecord.orders.map((item) => ({ caseRecord, order: item })))
    .sort((left, right) => ordinal(left.order.id, right.order.id) || ordinal(left.caseRecord.id, right.caseRecord.id));
  if (orders.length === 0) throw new Error('Perfil operacional exige ao menos uma ordem observada.');

  const out = orders.filter(({ order }) => order.direction === 'OUT').reduce((sum, { order }) => sum.plus(order.valueBrl), new ProfileDecimal(0));
  const incoming = orders.filter(({ order }) => order.direction === 'IN').reduce((sum, { order }) => sum.plus(order.valueBrl), new ProfileDecimal(0));
  const total = out.plus(incoming);
  if (total.lte(0)) throw new Error('Perfil operacional exige volume positivo.');
  const tickets = orders.map(({ order }) => new ProfileDecimal(order.valueBrl));
  const deadlineValues = orders.map(({ order }) => new ProfileDecimal((utcDay(order.deadlineDate) - utcDay(order.knownDate)) / DAY_MS));
  const weightedDeadlines = orders.map(({ order }) => ({
    value: new ProfileDecimal((utcDay(order.deadlineDate) - utcDay(order.knownDate)) / DAY_MS),
    weight: new ProfileDecimal(order.valueBrl),
  }));
  const metrics: OperationalProfileMetrics = {
    volume: {
      outBrl: available(out.toString(), caseEvidence),
      inBrl: available(incoming.toString(), caseEvidence),
      totalBrl: available(total.toString(), caseEvidence),
    },
    frequency: {
      orderCount: available(orders.length, caseEvidence),
      ordersPerCoveredDay: available(new ProfileDecimal(orders.length).div(coverage.coveredDays).toString(), denominatorEvidence),
      ordersPer30Days: available(new ProfileDecimal(orders.length).div(coverage.coveredDays).times(30).toString(), denominatorEvidence),
    },
    ticketsBrl: {
      min: available(Decimal.min(...tickets).toString(), caseEvidence),
      p25: available(nearestRank(tickets, new ProfileDecimal('0.25')).toString(), caseEvidence),
      p50: available(nearestRank(tickets, new ProfileDecimal('0.5')).toString(), caseEvidence),
      p75: available(nearestRank(tickets, new ProfileDecimal('0.75')).toString(), caseEvidence),
      max: available(Decimal.max(...tickets).toString(), caseEvidence),
    },
    direction: available({
      out: { volumeBrl: out.toString(), fraction: out.div(total).toString() },
      in: { volumeBrl: incoming.toString(), fraction: incoming.div(total).toString() },
    }, caseEvidence),
    deadlineDays: {
      p50ByCount: available(nearestRank(deadlineValues, new ProfileDecimal('0.5')).toString(), caseEvidence),
      p90ByCount: available(nearestRank(deadlineValues, new ProfileDecimal('0.9')).toString(), caseEvidence),
      p50ByVolume: available(weightedNearestRank(weightedDeadlines, new ProfileDecimal('0.5')).toString(), caseEvidence),
      p90ByVolume: available(weightedNearestRank(weightedDeadlines, new ProfileDecimal('0.9')).toString(), caseEvidence),
    },
    purposes: aggregatePurposes(orders, total, caseEvidence),
    windows: available(coverage, denominatorEvidence),
    seasonality: seasonality(ordered, orders, denominatorEvidence),
  };

  const withoutDocumentFingerprint = {
    schemaVersion: '1.0.0' as const,
    id: input.id,
    ownerSub: input.ownerSub,
    companyId: input.companyId,
    version: input.version,
    createdAt: input.createdAt,
    method: { id: 'operational-profile-v1' as const, version: '1.0.0' as const, percentileMethod: 'NEAREST_RANK' as const },
    selectedCases,
    selectionFingerprint,
    compatibility,
    coverage,
    metrics,
    provenance: profileProvenance(ordered, caseEvidence),
  };
  const documentFingerprint = await fingerprintOperationalProfile(withoutDocumentFingerprint);
  return { ...withoutDocumentFingerprint, documentFingerprint };
}
