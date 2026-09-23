import type { CorrectionRecord, ObservedCase } from '../cases/domain';
import { validateObservedCase } from '../cases/validation';
import type { ApplicationRepository, ImportBatchRecord, ImportEventRecord } from '../storage/applicationRepository';
import { InvalidDocumentError, OwnerMismatchError } from '../storage/errors';
import { rejectBinary } from '../storage/rejectBinary';
import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type { ImportEvent } from './domain';
import type { ImportReview } from './eligibility';
import { normalizeDirection, normalizePurposeCode } from './normalization';

function auditValue(path: string, value: string | null): string | null {
  if (value === null) return null;
  try {
    switch (path.split('/').at(-1)) {
      case 'direction': return normalizeDirection(value);
      case 'knownDate': case 'deadlineDate': return parseCivilDate(value);
      case 'valueBrl': return parseBrlDecimal(value);
      case 'purposeCode': return normalizePurposeCode(value);
      default: throw new InvalidDocumentError('Campo de correção não permitido.');
    }
  } catch { return null; } // Invalid source cells are deliberately not durable audit values.
}

function correctionRecord(value: CorrectionRecord, ownerSub: string): CorrectionRecord {
  if (value.actorSub !== ownerSub) throw new OwnerMismatchError();
  if (!/^versions\/[^/]+\/(direction|knownDate|deadlineDate|valueBrl|purposeCode)$/.test(value.fieldPath)) {
    throw new InvalidDocumentError('Campo de correção não permitido.');
  }
  return {
    id: value.id, fieldPath: value.fieldPath,
    originalValue: auditValue(value.fieldPath, value.originalValue),
    previousValue: auditValue(value.fieldPath, value.previousValue),
    nextValue: auditValue(value.fieldPath, value.nextValue),
    actionAt: value.actionAt, actorSub: value.actorSub,
  };
}

function eventPath(event: ImportEvent): string {
  switch (event.kind) {
    case 'BATCH_IMPORTED': case 'BATCH_REVERTED': return `batches/${event.batchId}`;
    case 'CONFLICT_RESOLVED': return `versions/${event.selectedVersionId}`;
    case 'OPERATION_EXCLUDED': case 'OPERATION_RESTORED': return `orders/${encodeURIComponent(event.operationId)}`;
    case 'OPERATION_CORRECTED': return `versions/${event.versionId}/${event.field}`;
  }
}

/** Publish a new case; review edit revisions are not persisted CAS revisions. */
export async function confirmImport(review: ImportReview, repository: ApplicationRepository, operationId: string): Promise<ObservedCase> {
  rejectBinary(review);
  const company = review.company;
  const draft = review.draft;
  if (company !== null && company.ownerSub !== draft.ownerSub) throw new OwnerMismatchError();
  if (company === null || review.blockers.length > 0 || draft.quality.blockers.length > 0
    || draft.orders.length === 0 || !review.context.positionIdentified) {
    throw new InvalidDocumentError('A revisão da importação possui bloqueios.');
  }
  const corrections = draft.corrections.map((value) => correctionRecord(value, draft.ownerSub));
  const observedCase: ObservedCase = {
    schemaVersion: '2.0.0', id: draft.id, ownerSub: draft.ownerSub, companyId: draft.companyId,
    revision: 1, status: 'CONFIRMED', window: structuredClone(draft.window),
    orders: structuredClone(draft.orders), controlTotals: structuredClone(draft.controlTotals),
    sourceManifest: {
      adapterId: draft.sourceManifest.adapterId, adapterVersion: draft.sourceManifest.adapterVersion,
      sourceKind: draft.sourceManifest.sourceKind,
      files: draft.sourceManifest.files.map((file) => ({ name: 'importacao-canonica.xlsx', sizeBytes: file.sizeBytes, sha256: file.sha256 })),
    },
    normalization: structuredClone(draft.normalization),
    quality: { blockers: [], warnings: structuredClone(review.warnings) },
    corrections, observedOutcome: draft.observedOutcome ?? null,
    confirmedAt: draft.normalization.normalizedAt,
  };
  const batches: ImportBatchRecord[] = review.batches.map((batch) => {
    const valid = batch.rows.filter((row) => row.normalized !== null).length;
    return {
      id: batch.id, caseId: draft.id, batchSequence: batch.batchSequence,
      ownerSub: draft.ownerSub, companyId: company.id, sha256: batch.sha256, byteSize: batch.byteSize,
      layout: 'xlsx-operacoes/1.0.0', counts: { total: batch.rows.length, valid, invalid: batch.rows.length - valid },
    };
  });
  const events: ImportEventRecord[] = review.events.map((event) => {
    const correction = event.kind === 'OPERATION_CORRECTED' ? corrections.find((value) => value.id === event.id) : undefined;
    if (event.kind === 'OPERATION_CORRECTED' && correction === undefined) throw new InvalidDocumentError('Correção sem auditoria.');
    return {
      id: event.id, caseId: draft.id, eventSequence: event.eventSequence,
      ownerSub: draft.ownerSub, companyId: company.id, occurredAt: event.occurredAt,
      kind: event.kind, path: eventPath(event),
      audit: correction === undefined ? null : {
        originalValue: correction.originalValue, previousValue: correction.previousValue, nextValue: correction.nextValue,
      },
    };
  });
  let sequence = events.reduce((max, event) => Math.max(max, event.eventSequence), 0);
  for (const event of review.clientIdentity.events) {
    events.push({ id: event.id, caseId: draft.id, eventSequence: ++sequence, ownerSub: draft.ownerSub,
      companyId: company.id, occurredAt: event.occurredAt, kind: event.kind,
      path: `clients/${event.canonicalClientId}`, audit: null });
  }
  const validation = validateObservedCase(observedCase);
  if (!validation.ok) throw new InvalidDocumentError(validation.issues[0]?.message);
  return repository.confirmObservedCase({
    expectedRevision: 0, operationId,
    company: { id: company.id, ownerSub: company.ownerSub, displayName: company.displayName,
      aliases: [...company.aliases], createdAt: company.createdAt, updatedAt: company.updatedAt, revision: company.revision },
    observedCase, batches, events,
  });
}
