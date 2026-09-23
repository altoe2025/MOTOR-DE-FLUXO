import type { ConfirmObservedCaseMutation } from './applicationRepository';
import { InvalidDocumentError } from './errors';

function fail(): never { throw new InvalidDocumentError('Metadados de importação inválidos.'); }

function exact(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) fail();
  if (actual.some((key) => !('value' in Object.getOwnPropertyDescriptor(value, key)!))) fail();
}

function text(value: unknown): boolean { return typeof value === 'string' && value.length > 0; }
function count(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

/** Closed records prevent raw review fields from leaking into rows or operation intent. */
export function validateImportRecords(input: ConfirmObservedCaseMutation): void {
  exact(input, ['expectedRevision', 'operationId', 'company', 'observedCase', 'batches', 'events']);
  exact(input.company, ['id', 'ownerSub', 'displayName', 'aliases', 'createdAt', 'updatedAt', 'revision']);
  const company = input.company;
  if (!text(company.id) || !text(company.ownerSub) || !text(company.displayName)
    || !Array.isArray(company.aliases) || !company.aliases.every(text)
    || !text(company.createdAt) || !Number.isFinite(Date.parse(company.createdAt))
    || !text(company.updatedAt) || !Number.isFinite(Date.parse(company.updatedAt))) fail();
  if (!Array.isArray(input.batches) || !Array.isArray(input.events)) fail();
  const batchSequences = new Set<number>();
  const batchIds = new Set<string>();
  for (const batch of input.batches) {
    exact(batch, ['id', 'caseId', 'batchSequence', 'ownerSub', 'companyId', 'sha256', 'byteSize', 'layout', 'counts']);
    exact(batch.counts, ['total', 'valid', 'invalid']);
    if (!text(batch.id) || typeof batch.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(batch.sha256)
      || !count(batch.byteSize) || batch.layout !== 'xlsx-operacoes/1.0.0'
      || !count(batch.counts.total) || !count(batch.counts.valid) || !count(batch.counts.invalid)
      || batch.counts.total !== batch.counts.valid + batch.counts.invalid
      || batchSequences.has(batch.batchSequence) || batchIds.has(batch.id)) fail();
    batchSequences.add(batch.batchSequence);
    batchIds.add(batch.id);
  }
  const kinds = ['BATCH_IMPORTED', 'BATCH_REVERTED', 'CONFLICT_RESOLVED', 'OPERATION_EXCLUDED', 'OPERATION_RESTORED', 'OPERATION_CORRECTED', 'CLIENT_ALIAS_ASSOCIATED'];
  const eventSequences = new Set<number>();
  const eventIds = new Set<string>();
  for (const event of input.events) {
    exact(event, ['id', 'caseId', 'eventSequence', 'ownerSub', 'companyId', 'occurredAt', 'kind', 'path', 'audit']);
    if (!text(event.id) || !text(event.path) || !text(event.occurredAt)
      || !Number.isFinite(Date.parse(event.occurredAt)) || !kinds.includes(event.kind)
      || eventSequences.has(event.eventSequence) || eventIds.has(event.id)) fail();
    if (event.audit !== null) {
      exact(event.audit, ['originalValue', 'previousValue', 'nextValue']);
      if (event.kind !== 'OPERATION_CORRECTED'
        || Object.values(event.audit).some((value) => value !== null && (typeof value !== 'string' || value.length > 128))) fail();
    } else if (event.kind === 'OPERATION_CORRECTED') fail();
    eventSequences.add(event.eventSequence);
    eventIds.add(event.id);
  }
}
