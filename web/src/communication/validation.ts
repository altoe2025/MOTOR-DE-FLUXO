import { validateShape } from '../generated/validators/communication.js';

import type { CommunicationDocumentV1 } from './domain';
import { fingerprintCommunicationDocument } from './evidence';

const decimal = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/** Rejects calendar overflow as well as non-UTC and malformed RFC3339 strings. */
function validUtc(value: string): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?Z$/.exec(value);
  if (!match || match[0].length !== value.length) return false;
  const parts = match.slice(1, 7).map(Number);
  const [year, month, day, hour, minute, second] = parts as [number, number, number, number, number, number];
  const date = new Date(value);
  return year >= 1 && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    && date.getUTCHours() === hour && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

export async function validateCommunicationDocument(value: unknown): Promise<
  { ok: true; value: CommunicationDocumentV1 } | { ok: false; issues: readonly string[] }
> {
  if (!validateShape(value)) {
    return { ok: false, issues: (validateShape.errors ?? []).map((issue) =>
      `${issue.instancePath || '/'}: ${issue.message ?? 'estrutura inválida'}`) };
  }
  const issues: string[] = [];
  const fail = (condition: boolean, issue: string) => { if (!condition) issues.push(issue); };
  const selection = value.selection;
  fail(validUtc(value.generatedAt), 'GENERATED_AT');
  fail(value.source.synthetic === (value.source.family === 'PROFILE_SIMULATION'), 'SOURCE_FAMILY');
  fail((value.comparison === null) === (selection.comparisonExecutionId === null), 'COMPARISON_SELECTION');
  fail((value.replaySnapshot === null) === (selection.replayDay === null), 'REPLAY_SELECTION');
  if (value.replaySnapshot !== null) fail(value.replaySnapshot.day === selection.replayDay, 'REPLAY_DAY');

  const sourceIds = {
    STUDY: value.study.id,
    DIAGNOSTIC: selection.diagnosticExecutionId,
    COMPARISON: selection.comparisonExecutionId,
    REPLAY: selection.diagnosticExecutionId,
  };
  const seen = new Set<string>();
  for (const [ref, evidence] of Object.entries(value.evidenceIndex)) {
    fail(evidence.studyId === value.study.id && evidence.scenarioId === selection.scenarioId
      && evidence.scenarioRevision === selection.scenarioRevision
      && evidence.diagnosticExecutionId === selection.diagnosticExecutionId
      && evidence.repetitionId === selection.repetitionId
      && evidence.sourceId === sourceIds[evidence.source]
      && (evidence.source !== 'REPLAY' || value.replaySnapshot !== null), `EVIDENCE_CONTEXT:${ref}`);
    const identity = JSON.stringify([evidence.source, evidence.sourceId, evidence.path]);
    fail(!seen.has(identity), `DUPLICATE_EVIDENCE:${ref}`);
    seen.add(identity);
  }

  const sections = [value.composition, value.mechanism, value.economics, value.robustness,
    ...(value.comparison ? [value.comparison] : []),
    ...(value.replaySnapshot ? [value.replaySnapshot] : [])];
  const metrics = [...value.executiveMetrics, ...sections.flatMap((section) => section.metrics)];
  const facts = [...value.assumptions, ...value.provenance, ...value.versions,
    ...sections.flatMap((section) => section.facts)];
  for (const metric of metrics) {
    fail(metric.availability === 'AVAILABLE' ? metric.value !== null : metric.value === null,
      `AVAILABILITY:${metric.code}`);
    if (metric.availability === 'AVAILABLE' && metric.unit !== 'TEXT' && metric.value !== null) {
      const match = decimal.exec(metric.value);
      fail(metric.value.length <= 80 && match?.[0].length === metric.value.length, `DECIMAL:${metric.code}`);
    }
  }
  for (const item of [...metrics, ...facts, ...value.limitations]) {
    fail(new Set(item.evidenceRefs).size === item.evidenceRefs.length, `DUPLICATE_REF:${item.code}`);
    const evidence = item.evidenceRefs.map((ref) => Object.hasOwn(value.evidenceIndex, ref)
      ? value.evidenceIndex[ref] : undefined);
    fail(evidence.every((entry) => entry !== undefined), `MISSING_REF:${item.code}`);
    if ('availability' in item && item.availability === 'UNAVAILABLE') {
      fail(evidence.some((entry) => entry && (entry.value === null || entry.value === item.meaning)),
        `UNAVAILABLE_EVIDENCE:${item.code}`);
    } else {
      const published = 'statement' in item ? item.statement : item.value;
      fail(evidence.some((entry) => entry && entry.value === published), `EVIDENCE_VALUE:${item.code}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  if (await fingerprintCommunicationDocument(value) !== value.contextFingerprint) {
    return { ok: false, issues: ['CONTEXT_FINGERPRINT'] };
  }
  return { ok: true, value };
}

export async function assertValidCommunicationDocument(value: unknown): Promise<void> {
  const result = await validateCommunicationDocument(value);
  if (!result.ok) throw new Error(`Documento de comunicação inválido: ${result.issues.join('; ')}`);
}
