import type { CommunicationDocumentV1, CommunicationMetric, CommunicationSection } from '../communication/domain';
import { fingerprintCommunicationDocument } from '../communication/evidence';
import { assertValidCommunicationDocument } from '../communication/validation';
import type { RouteChatContext } from './routeContext';

export type ChatIntent = Readonly<{ kind: 'HELP'; id: string } | { kind: 'METRIC'; id: string }
  | { kind: 'COMPARISON' } | { kind: 'REPLAY' } | { kind: 'LIMITATIONS' }
  | { kind: 'REPETITION' } | { kind: 'BROAD' }>;

const MAX_REQUEST_BYTES = 1_048_576;

export function communicationMatchesRoute(document: CommunicationDocumentV1, route: RouteChatContext | null): boolean {
  return route !== null && route.studyId === document.study.id
    && route.scenarioId === document.selection.scenarioId
    && route.diagnosticExecutionId === document.selection.diagnosticExecutionId
    && (route.comparisonExecutionId ?? null) === document.selection.comparisonExecutionId
    && route.replayDay === document.selection.replayDay;
}

function section(section: CommunicationSection, keep: boolean, metricId?: string): CommunicationSection {
  return { ...section, metrics: keep ? section.metrics.filter((metric) => metricId === undefined || metric.code === metricId) : [],
    facts: keep && metricId === undefined ? section.facts : [] };
}

function bytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }

/** Produces a self-validating projection; no source item is recomputed or rewritten. */
export async function selectChatContext(document: CommunicationDocumentV1 | null, intent: ChatIntent,
  maxBytes = MAX_REQUEST_BYTES): Promise<CommunicationDocumentV1 | null> {
  if (intent.kind === 'HELP') return null;
  if (document === null) {
    if (intent.kind === 'BROAD') return null;
    throw new Error('Dados deste contexto ainda não estão disponíveis.');
  }
  await assertValidCommunicationDocument(document);
  if (intent.kind === 'BROAD') {
    if (bytes(document) > maxBytes) throw new Error('Contexto amplo excede o limite; pergunte sobre um item específico.');
    return document;
  }
  const metricId = intent.kind === 'METRIC' ? intent.id : undefined;
  const include = () => intent.kind === 'METRIC';
  const executiveMetrics = intent.kind === 'METRIC'
    ? document.executiveMetrics.filter((metric) => metric.code === metricId) : [];
  const comparison = document.comparison === null ? null
    : section(document.comparison, intent.kind === 'COMPARISON' || intent.kind === 'METRIC', metricId);
  const replaySnapshot = document.replaySnapshot === null ? null : {
    ...document.replaySnapshot,
    metrics: intent.kind === 'REPLAY' ? document.replaySnapshot.metrics
      : intent.kind === 'METRIC' ? document.replaySnapshot.metrics.filter((metric) => metric.code === metricId) : [],
    facts: intent.kind === 'REPLAY' ? document.replaySnapshot.facts : [],
  };
  const projection = {
    ...document,
    executiveMetrics,
    composition: section(document.composition, include(), metricId),
    mechanism: section(document.mechanism, include(), metricId),
    economics: section(document.economics, include(), metricId),
    robustness: intent.kind === 'REPETITION' ? { ...document.robustness, metrics: [] }
      : section(document.robustness, include(), metricId),
    comparison,
    replaySnapshot,
    assumptions: [], provenance: [], versions: [],
    limitations: intent.kind === 'LIMITATIONS' ? document.limitations : [],
  };
  const metrics: CommunicationMetric[] = [...projection.executiveMetrics, ...[
    projection.composition, projection.mechanism, projection.economics, projection.robustness,
    projection.comparison, projection.replaySnapshot,
  ].filter((item): item is NonNullable<typeof item> => item !== null).flatMap((item) => item.metrics)];
  if (intent.kind === 'METRIC' && metrics.length === 0) throw new Error('Métrica ausente do contexto atual.');
  if (intent.kind === 'COMPARISON' && document.comparison === null) throw new Error('Comparação ausente do contexto atual.');
  if (intent.kind === 'REPLAY' && document.replaySnapshot === null) throw new Error('Replay ausente do contexto atual.');
  const refs = new Set([
    ...metrics.flatMap((item) => item.evidenceRefs),
    ...projection.limitations.flatMap((item) => item.evidenceRefs),
    ...[projection.composition, projection.mechanism, projection.economics, projection.robustness,
      projection.comparison, projection.replaySnapshot]
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .flatMap((item) => item.facts.flatMap((fact) => fact.evidenceRefs)),
  ]);
  const evidenceIndex = Object.fromEntries(Object.entries(document.evidenceIndex).filter(([ref]) => refs.has(ref)));
  const withoutFingerprint = { ...projection, evidenceIndex };
  const fragment = { ...withoutFingerprint, contextFingerprint: await fingerprintCommunicationDocument(withoutFingerprint) };
  await assertValidCommunicationDocument(fragment);
  if (bytes(fragment) > maxBytes) throw new Error('Fragmento excede o limite do chat.');
  return fragment;
}
