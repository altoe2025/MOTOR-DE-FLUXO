import Decimal from 'decimal.js';
import type { ConfirmObservedCaseMutation, ImportEventRecord } from './applicationRepository';
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

function rejectArrayProperties(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && (keys.length !== value.length + 1 || keys.some((key) =>
    key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)))) fail();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) fail();
    rejectArrayProperties(descriptor.value, seen);
  }
}

function canonicalAuditValue(field: string, value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  switch (field) {
    case 'direction': return value === 'OUT' || value === 'IN';
    case 'knownDate': case 'deadlineDate': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    case 'valueBrl': {
      if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) return false;
      const decimal = new Decimal(value);
      return decimal.gt(0) && decimal.lte('1000000000000') && decimal.toFixed() === value;
    }
    case 'purposeCode': return value.length > 0 && value.length <= 128 && value.trim() === value;
    default: return false;
  }
}

/** Dot-only operation IDs are opaque data, never relative path segments. */
export function encodeImportOrderSegment(id: string): string {
  const encoded = encodeURIComponent(id);
  return encoded === '.' || encoded === '..' ? encoded.replaceAll('.', '%2E') : encoded;
}

function validateEventContent(event: ImportEventRecord): void {
  const parts = event.path.split('/');
  const segment = parts[1] ?? '';
  const root = event.kind === 'BATCH_IMPORTED' || event.kind === 'BATCH_REVERTED' ? 'batches'
    : event.kind === 'CLIENT_ALIAS_ASSOCIATED' ? 'clients'
      : event.kind === 'OPERATION_EXCLUDED' || event.kind === 'OPERATION_RESTORED' ? 'orders' : 'versions';
  const corrected = event.kind === 'OPERATION_CORRECTED';
  if (parts[0] !== root || parts.length !== (corrected ? 3 : 2)
    || segment.length === 0 || segment === '.' || segment === '..') fail();
  if (root === 'orders') {
    try { if (encodeImportOrderSegment(decodeURIComponent(segment)) !== segment) fail(); } catch { fail(); }
  } else if (!/^[A-Za-z0-9._~-]+$/.test(segment)) fail();
  if (!corrected) { if (event.audit !== null) fail(); return; }
  const field = parts[2]!;
  if (!['direction', 'knownDate', 'deadlineDate', 'valueBrl', 'purposeCode'].includes(field)
    || event.audit === null) fail();
  exact(event.audit, ['originalValue', 'previousValue', 'nextValue']);
  if (!Object.values(event.audit).every((value) => canonicalAuditValue(field, value))
    || (field !== 'purposeCode' && event.audit.nextValue === null)) fail();
}

/** Closed records prevent raw review fields from leaking into rows or operation intent. */
export function validateImportRecords(input: ConfirmObservedCaseMutation): void {
  rejectArrayProperties(input);
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
    validateEventContent(event);
    eventSequences.add(event.eventSequence);
    eventIds.add(event.id);
  }
}
