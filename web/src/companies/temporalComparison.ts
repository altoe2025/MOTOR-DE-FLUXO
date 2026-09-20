import Decimal from 'decimal.js';

import type { ObservedCase } from '../cases/domain';
import type { EvidenceValue, OperationalProfileVersion } from '../profiles/domain';

const DAY_MS = 86_400_000;

const METRICS = [
  { metricId: 'TOTAL_VOLUME_BRL', label: 'Volume total', unit: 'BRL', definitionVersion: 'gross-observed-volume-v1', percentileMethod: null },
  { metricId: 'OUT_VOLUME_FRACTION', label: 'Participação OUT', unit: 'FRACTION', definitionVersion: 'gross-observed-direction-v1', percentileMethod: null },
  { metricId: 'TICKET_P50_BRL', label: 'Ticket p50', unit: 'BRL', definitionVersion: 'observed-ticket-v1', percentileMethod: 'NEAREST_RANK' },
  { metricId: 'DEADLINE_P50_DAYS', label: 'Prazo p50', unit: 'DAYS', definitionVersion: 'observed-deadline-calendar-days-v1', percentileMethod: 'NEAREST_RANK' },
] as const;

export type TimelineMetricValue =
  | Readonly<{ state: 'AVAILABLE'; value: string }>
  | Readonly<{ state: Exclude<EvidenceValue<unknown>['state'], 'AVAILABLE'>; reason: string }>;

export type TimelineMetricObservation = Readonly<{
  metricId: string;
  label: string;
  unit: string;
  definitionVersion: string;
  percentileMethod: string | null;
  value: TimelineMetricValue;
  provenance: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type TimelineObservation = Readonly<{
  id: string;
  kind: 'OBSERVED_CASE' | 'OPERATIONAL_PROFILE';
  companyId: string;
  label: string;
  sourceVersion: string;
  period: Readonly<{ startDate: string; endDate: string }>;
  coveredDays: number;
  gapDays: number;
  coverageState: EvidenceValue<unknown>['state'];
  provenance: Readonly<{ sourceId: string; sourceVersion: string; evidence: readonly string[] }>;
  metrics: readonly TimelineMetricObservation[];
}>;

export type TemporalComparisonItem = TimelineObservation;

export type TemporalComparison = Readonly<{
  state: 'AVAILABLE' | 'INCOMPATIBLE';
  companyId: string | null;
  observations: readonly TimelineObservation[];
  reasons: readonly Readonly<{ code: string; message: string }> [];
  metricRows: readonly Readonly<{
    metricId: string;
    label: string;
    unit: string;
    values: readonly Readonly<{
      observationId: string;
      period: TimelineObservation['period'];
      coveredDays: number;
      gapDays: number;
      coverageState: TimelineObservation['coverageState'];
      definitionVersion: string;
      value: TimelineMetricValue;
      provenance: readonly string[];
      evidenceRefs: readonly string[];
    }>[];
    deltas: readonly Readonly<{
      fromObservationId: string;
      toObservationId: string;
      value?: string;
      unavailableReason?: string;
    }>[];
  }>[];
}>;

function dateValue(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function inclusiveDays(startDate: string, endDate: string): number {
  return Math.floor((dateValue(endDate) - dateValue(startDate)) / DAY_MS) + 1;
}

function available(value: string): TimelineMetricValue {
  return { state: 'AVAILABLE', value };
}

function notCollected(reason: string): TimelineMetricValue {
  return { state: 'NOT_COLLECTED', reason };
}

function nearestRank(values: readonly Decimal[], quantile: string): string | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left.comparedTo(right));
  const rank = Math.max(1, new Decimal(quantile).times(ordered.length).ceil().toNumber());
  return ordered[rank - 1]!.toString();
}

function provenanceOfCase(input: ObservedCase): readonly string[] {
  return [
    `case:${input.id}@${input.revision}`,
    `normalization:${input.normalization.rulesetId}@${input.normalization.rulesetVersion}`,
    ...input.sourceManifest.files.map((file) => `sha256:${file.sha256}`),
  ];
}

function metric(
  definition: Omit<TimelineMetricObservation, 'value' | 'provenance' | 'evidenceRefs'>,
  value: TimelineMetricValue,
  provenance: readonly string[],
  evidenceRefs: readonly string[],
): TimelineMetricObservation {
  return { ...definition, value, provenance, evidenceRefs };
}

export function projectObservedCaseForTimeline(input: ObservedCase): TimelineObservation {
  const provenance = provenanceOfCase(input);
  const values = input.orders.map((order) => new Decimal(order.valueBrl));
  const total = values.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const out = input.orders.filter((order) => order.direction === 'OUT')
    .reduce((sum, order) => sum.plus(order.valueBrl), new Decimal(0));
  const tickets = nearestRank(values, '0.5');
  const deadlines = nearestRank(input.orders.map((order) => new Decimal(
    (dateValue(order.deadlineDate) - dateValue(order.knownDate)) / DAY_MS,
  )), '0.5');
  const caseEvidence = [`case:${input.id}@${input.revision}`];
  const totalValue = total.gt(0) ? available(total.toString()) : notCollected('Nenhuma ordem observada no caso.');
  const directionValue = total.gt(0) ? available(out.div(total).toString()) : notCollected('Direção não disponível sem volume observado.');
  const ticketValue = tickets === null ? notCollected('Ticket não coletado.') : available(tickets);
  const deadlineValue = deadlines === null ? notCollected('Prazo não coletado.') : available(deadlines);
  return {
    id: `OBSERVED_CASE:${input.id}@${input.revision}`,
    kind: 'OBSERVED_CASE',
    companyId: input.companyId,
    label: `Caso ${input.id} · revisão ${input.revision}`,
    sourceVersion: String(input.revision),
    period: { startDate: input.window.startDate, endDate: input.window.endDate },
    coveredDays: inclusiveDays(input.window.startDate, input.window.endDate),
    gapDays: 0,
    coverageState: 'AVAILABLE',
    provenance: { sourceId: input.id, sourceVersion: String(input.revision), evidence: provenance },
    metrics: [
      metric(METRICS[0], totalValue, provenance, totalValue.state === 'AVAILABLE' ? caseEvidence : []),
      metric(METRICS[1], directionValue, provenance, directionValue.state === 'AVAILABLE' ? caseEvidence : []),
      metric(METRICS[2], ticketValue, provenance, ticketValue.state === 'AVAILABLE' ? caseEvidence : []),
      metric(METRICS[3], deadlineValue, provenance, deadlineValue.state === 'AVAILABLE' ? caseEvidence : []),
    ],
  };
}

function fromEvidence(value: EvidenceValue<string>): TimelineMetricValue {
  return value.state === 'AVAILABLE'
    ? available(value.value)
    : { state: value.state, reason: value.reason };
}

export function projectProfileForTimeline(input: OperationalProfileVersion): TimelineObservation {
  const provenance = [
    `profile:${input.id}@${input.version}`,
    `method:${input.method.id}@${input.method.version}`,
    ...input.provenance.caseEvidence,
    ...input.provenance.sourceFiles.map((sha256) => `sha256:${sha256}`),
  ];
  const direction = input.metrics.direction.state === 'AVAILABLE'
    ? available(input.metrics.direction.value.out.fraction)
    : { state: input.metrics.direction.state, reason: input.metrics.direction.reason } as TimelineMetricValue;
  const coverageState = input.metrics.windows.state;
  const ticketDefinition = { ...METRICS[2], percentileMethod: input.method.percentileMethod };
  const deadlineDefinition = { ...METRICS[3], percentileMethod: input.method.percentileMethod };
  return {
    id: `OPERATIONAL_PROFILE:${input.id}`,
    kind: 'OPERATIONAL_PROFILE',
    companyId: input.companyId,
    label: `Perfil operacional · versão ${input.version}`,
    sourceVersion: String(input.version),
    period: { startDate: input.coverage.firstDate, endDate: input.coverage.lastDate },
    coveredDays: input.coverage.coveredDays,
    gapDays: input.coverage.gapDays,
    coverageState,
    provenance: { sourceId: input.id, sourceVersion: String(input.version), evidence: provenance },
    metrics: [
      metric(METRICS[0], fromEvidence(input.metrics.volume.totalBrl), provenance, input.metrics.volume.totalBrl.evidence),
      metric(METRICS[1], direction, provenance, input.metrics.direction.evidence),
      metric(ticketDefinition, fromEvidence(input.metrics.ticketsBrl.p50), provenance, input.metrics.ticketsBrl.p50.evidence),
      metric(deadlineDefinition, fromEvidence(input.metrics.deadlineDays.p50ByCount), provenance, input.metrics.deadlineDays.p50ByCount.evidence),
    ],
  };
}

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unavailableReason(left: TimelineMetricValue, right: TimelineMetricValue): string {
  const reasons = [left, right]
    .filter((value): value is Exclude<TimelineMetricValue, { state: 'AVAILABLE' }> => value.state !== 'AVAILABLE')
    .map((value) => value.reason);
  return [...new Set(reasons)].join(' · ');
}

export function compareCompanyTimeline(items: readonly TemporalComparisonItem[]): TemporalComparison {
  if (items.length < 2 || items.length > 6) throw new Error('Selecione entre 2 e 6 observações.');
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Selecione observações distintas.');
  const observations = [...items].sort((left, right) =>
    ordinal(left.period.startDate, right.period.startDate)
    || ordinal(left.period.endDate, right.period.endDate)
    || ordinal(left.id, right.id));
  const reasons: Array<{ code: string; message: string }> = [];
  const companies = new Set(observations.map((item) => item.companyId));
  if (companies.size !== 1) reasons.push({ code: 'DIFFERENT_COMPANY', message: 'As observações pertencem a empresas diferentes.' });

  for (const definition of METRICS) {
    const metrics = observations.map((item) => item.metrics.find((candidate) => candidate.metricId === definition.metricId));
    if (metrics.some((item) => item === undefined)) {
      reasons.push({ code: 'INCOMPATIBLE_DEFINITION', message: `${definition.label}: métrica ausente em uma observação.` });
      continue;
    }
    const present = metrics as TimelineMetricObservation[];
    if (new Set(present.map((item) => item.unit)).size !== 1) reasons.push({ code: 'INCOMPATIBLE_UNIT', message: `${definition.label}: unidades incompatíveis.` });
    if (new Set(present.map((item) => item.definitionVersion)).size !== 1) reasons.push({ code: 'INCOMPATIBLE_DEFINITION', message: `${definition.label}: definições incompatíveis.` });
    if (new Set(present.map((item) => item.percentileMethod ?? 'NONE')).size !== 1) reasons.push({ code: 'INCOMPATIBLE_PERCENTILE_METHOD', message: `${definition.label}: métodos de percentil incompatíveis.` });
  }

  const compatible = reasons.length === 0;
  const metricRows = METRICS.map((definition) => {
    const values = observations.map((observation) => {
      const found = observation.metrics.find((candidate) => candidate.metricId === definition.metricId);
      return {
        observationId: observation.id,
        period: observation.period,
        coveredDays: observation.coveredDays,
        gapDays: observation.gapDays,
        coverageState: observation.coverageState,
        definitionVersion: found?.definitionVersion ?? 'INCOMPATIBLE',
        value: found?.value ?? notCollected('Métrica não coletada.'),
        provenance: found?.provenance ?? observation.provenance.evidence,
        evidenceRefs: found?.evidenceRefs ?? [],
      };
    });
    const deltas = compatible ? values.slice(1).map((current, index) => {
      const previous = values[index]!;
      if (previous.value.state === 'AVAILABLE' && current.value.state === 'AVAILABLE') {
        return {
          fromObservationId: previous.observationId,
          toObservationId: current.observationId,
          value: new Decimal(current.value.value).minus(previous.value.value).toString(),
        };
      }
      return {
        fromObservationId: previous.observationId,
        toObservationId: current.observationId,
        unavailableReason: unavailableReason(previous.value, current.value),
      };
    }) : [];
    return { metricId: definition.metricId, label: definition.label, unit: definition.unit, values, deltas };
  });
  return {
    state: compatible ? 'AVAILABLE' : 'INCOMPATIBLE',
    companyId: companies.size === 1 ? observations[0]!.companyId : null,
    observations,
    reasons,
    metricRows,
  };
}
