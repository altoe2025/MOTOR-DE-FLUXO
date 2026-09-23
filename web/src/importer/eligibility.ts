import Decimal from 'decimal.js';

import type {
  CompanyRecord,
  CorrectionRecord,
  DataQualityIssue,
  FieldProvenance,
  ObservedCaseDraft,
  ObservedOrder,
} from '../cases/domain';
import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type {
  ClientIdentityState,
  EditableImportField,
  ImportBatch,
  ImportEvent,
  ImportPortfolio,
  ImportedVersionRow,
  NormalizedOperation,
  RawOperationCells,
} from './domain';
import { mergeClientAlias, normalizeClientNameKey, resolveClient } from './clients';
import { incorporateBatch, projectPortfolio, resolveVersionConflict, revertBatch } from './portfolio';
import type { ParsedImport } from './xlsxParser';
import { normalizeClientName, normalizeDirection, normalizePurposeCode } from './normalization';
import { validateImportedRows } from './validation';

const DecimalBrl = Decimal.clone({ precision: 40 });
const EPOCH = '1970-01-01';

export type CreateImportReviewInput = Readonly<{
  parsed: ParsedImport;
  company: CompanyRecord | null;
  ownerSub: string;
  now: string;
  positionIdentified?: boolean;
  controlTotals?: Readonly<{ out: string; in: string }>;
  clientIdentity?: ClientIdentityState;
}>;

export type ImportCommand =
  | Readonly<{ kind: 'CORRECT_FIELD'; versionId: string; operationId: string; field: EditableImportField; rawValue: string; actionId: string; at: string }>
  | Readonly<{ kind: 'ASSOCIATE_ALIAS'; alias: string; canonicalClientId: string; eventId: string; at: string }>
  | Readonly<{ kind: 'RESOLVE_CONFLICT'; operationId: string; selectedVersionId: string; eventId: string; at: string }>
  | Readonly<{ kind: 'EXCLUDE_OPERATION' | 'RESTORE_OPERATION'; operationId: string; eventId: string; at: string }>
  | Readonly<{ kind: 'REVERT_BATCH'; batchId: string; eventId: string; at: string }>
  | Readonly<{ kind: 'INCORPORATE_BATCH'; parsed: ParsedImport; at: string }>;

type ReviewContext = Readonly<{
  parsed: ParsedImport;
  positionIdentified: boolean;
  controlTotals: Readonly<{ out: string; in: string }> | null;
}>;

export type ImportReview = Readonly<{
  company: CompanyRecord | null;
  draft: ObservedCaseDraft;
  batches: readonly ImportBatch[];
  events: readonly ImportEvent[];
  blockers: readonly DataQualityIssue[];
  warnings: readonly DataQualityIssue[];
  clientIdentity: ClientIdentityState;
  context: ReviewContext;
}>;

function stableUuid(seed: string): string {
  const hash = (salt: number): string => {
    let value = 0x811c9dc5 ^ salt;
    for (const char of seed) {
      value = Math.imul(value ^ char.codePointAt(0)!, 0x01000193);
    }
    return (value >>> 0).toString(16).padStart(8, '0');
  };
  const bits = `${hash(0)}${hash(1)}${hash(2)}${hash(3)}`.split('');
  bits[12] = '5';
  bits[16] = '8';
  return `${bits.slice(0, 8).join('')}-${bits.slice(8, 12).join('')}-${bits.slice(12, 16).join('')}-${bits.slice(16, 20).join('')}-${bits.slice(20).join('')}`;
}

function observed(now: string): FieldProvenance {
  return { kind: 'OBSERVED', source: 'xlsx-operacoes', version: '1.0.0', recordedAt: now };
}

function notCollected(now: string): FieldProvenance {
  return { kind: 'NOT_COLLECTED', source: 'xlsx-operacoes', version: '1.0.0', recordedAt: now };
}

function derived(now: string, rule: string, inputs: readonly string[]): FieldProvenance {
  return { kind: 'DERIVED', source: 'xlsx-operacoes', version: '1.0.0', recordedAt: now, rule, inputs };
}

function corrected(now: string, actionId: string): FieldProvenance {
  return { kind: 'USER_CORRECTED', source: 'import-review', version: '1.0.0', recordedAt: now, actionId };
}

function emptyIdentity(): ClientIdentityState {
  return { revision: 0, clients: [], aliases: [], events: [] };
}

function issue(code: string, message: string, path?: string): DataQualityIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function rowIssues(row: ImportedVersionRow): Readonly<{ invalid: readonly DataQualityIssue[]; warnings: readonly DataQualityIssue[] }> {
  const invalid: DataQualityIssue[] = [];
  const warnings: DataQualityIssue[] = [];
  for (const error of row.errors) {
    if (error.code === 'PURPOSE_MISSING') {
      warnings.push(issue('PURPOSE_MISSING', 'Finalidade não informada.', `/rows/${row.rowNumber}/finalidade_codigo`));
    } else if (error.code === 'DIRECTION_INVALID') {
      invalid.push(issue('DIRECTION_UNKNOWN', 'Direção não identificada.', `/rows/${row.rowNumber}/direcao`));
    } else if (error.field === 'valor_brl') {
      invalid.push(issue('VALUE_NOT_POSITIVE', 'Valor BRL deve ser positivo.', `/rows/${row.rowNumber}/valor_brl`));
    } else if (error.field === 'data_conhecida' || error.field === 'data_limite') {
      invalid.push(issue('INVALID_DATE', 'Data da operação inválida.', `/rows/${row.rowNumber}/${error.field}`));
    } else if (error.code === 'DUPLICATE_ID_IN_BATCH') {
      invalid.push(issue('DUPLICATE_UNRESOLVED', 'ID repetido no mesmo lote.', `/rows/${row.rowNumber}/operacao_id`));
    } else {
      invalid.push(issue('ROW_INVALID', error.message, `/rows/${row.rowNumber}`));
    }
  }
  return { invalid, warnings };
}

function toBatch(input: CreateImportReviewInput, batchSequence = 1): { batch: ImportBatch; identity: ClientIdentityState; invalid: readonly DataQualityIssue[]; warnings: readonly DataQualityIssue[] } {
  const report = validateImportedRows(input.parsed.rows);
  let identity = input.clientIdentity ?? emptyIdentity();
  const invalid: DataQualityIssue[] = [];
  const warnings: DataQualityIssue[] = [];
  const rows: ImportedVersionRow[] = report.rows.map((sourceRow) => {
    const row = validateImportedRows([sourceRow.raw]).rows[0] ?? sourceRow;
    const found = rowIssues({ versionId: '', canonicalClientId: '', rowNumber: sourceRow.rowNumber, raw: row.raw, normalized: row.normalized, errors: row.errors });
    invalid.push(...found.invalid);
    warnings.push(...found.warnings);
    if (row.normalized === null) {
      let canonicalClientId = '';
      try {
        const name = normalizeClientName(row.raw.cliente_nome);
        const resolution = resolveClient(identity, name, input.now, () => stableUuid(`${input.ownerSub}:${input.company?.id ?? 'missing'}:${normalizeClientNameKey(name)}`));
        identity = resolution.state;
        canonicalClientId = resolution.client.id;
      } catch {
        // A linha segue bloqueada; não inventar identidade sem nome válido.
      }
      return { versionId: stableUuid(`${input.parsed.sha256}:row:${sourceRow.rowNumber}`), canonicalClientId, rowNumber: sourceRow.rowNumber, raw: row.raw, normalized: null, errors: row.errors };
    }
    const normalized = row.normalized;
    const resolution = resolveClient(
      identity,
      normalized.clientName,
      input.now,
      () => stableUuid(`${input.ownerSub}:${input.company?.id ?? 'missing'}:${normalizeClientNameKey(normalized.clientName)}`),
    );
    identity = resolution.state;
    return {
      versionId: stableUuid(`${input.parsed.sha256}:row:${sourceRow.rowNumber}`),
      canonicalClientId: resolution.client.id,
      rowNumber: sourceRow.rowNumber,
      raw: row.raw,
      normalized,
      errors: row.errors,
    };
  });
  return {
    batch: { id: stableUuid(`${input.parsed.sha256}:batch`), batchSequence, importedAt: input.now, rows },
    identity,
    invalid,
    warnings,
  };
}

function excludedOperationIds(events: readonly ImportEvent[]): Set<string> {
  const excluded = new Set<string>();
  for (const event of [...events].sort((left, right) => left.eventSequence - right.eventSequence)) {
    if (event.kind === 'OPERATION_EXCLUDED') excluded.add(event.operationId);
    if (event.kind === 'OPERATION_RESTORED') excluded.delete(event.operationId);
  }
  return excluded;
}

function currentRowIssues(rows: readonly ImportedVersionRow[], events: readonly ImportEvent[]): Readonly<{ invalid: readonly DataQualityIssue[]; warnings: readonly DataQualityIssue[] }> {
  const invalid: DataQualityIssue[] = [];
  const warnings: DataQualityIssue[] = [];
  const excluded = excludedOperationIds(events);
  for (const row of rows) {
    if (row.raw.operacao_id !== null && excluded.has(row.raw.operacao_id)) continue;
    const found = rowIssues(row);
    invalid.push(...found.invalid);
    warnings.push(...found.warnings);
  }
  return { invalid, warnings };
}

function ordersFor(portfolio: ImportPortfolio, identity: ClientIdentityState, corrections: readonly CorrectionRecord[], now: string): ObservedOrder[] {
  const correctionsByPath = new Map(corrections.map((item) => [item.fieldPath, item]));
  const excluded = excludedOperationIds(portfolio.events);
  return projectPortfolio(portfolio).currentOperations
    .filter((operation) => !excluded.has(operation.operationId))
    .map((operation) => {
      const value = operation.operation;
      const field = <T extends keyof Pick<NormalizedOperation, 'knownDate' | 'deadlineDate' | 'valueBrl' | 'purposeCode'>>(
        fieldName: T,
        fallback: FieldProvenance,
      ): FieldProvenance => {
        const change = correctionsByPath.get(`versions/${operation.versionId}/${fieldName}`);
        return change === undefined ? fallback : corrected(change.actionAt, change.id);
      };
      const base = observed(now);
      const purpose = value.purposeCode === null ? notCollected(now) : base;
      const efx = notCollected(now);
      return {
        id: operation.operationId,
        clientId: identity.aliases.find((alias) => alias.revokedAt === null && alias.normalizedName === normalizeClientNameKey(value.clientName))?.canonicalClientId ?? operation.canonicalClientId,
        direction: value.direction,
        knownDate: value.knownDate,
        deadlineDate: value.deadlineDate,
        valueBrl: value.valueBrl,
        purposeCode: value.purposeCode,
        efxStatus: 'NOT_COLLECTED',
        provenance: [base, efx],
        fieldProvenance: {
          knownDate: field('knownDate', base),
          deadlineDate: field('deadlineDate', base),
          valueBrl: field('valueBrl', base),
          purposeCode: field('purposeCode', purpose),
          efxStatus: efx,
        },
      };
    });
}

function totals(orders: readonly ObservedOrder[], now: string): Readonly<{ out: string; in: string; provenance: FieldProvenance }> {
  const total = (direction: 'OUT' | 'IN'): string => orders
    .filter((order) => order.direction === direction)
    .reduce((sum, order) => sum.plus(order.valueBrl), new DecimalBrl(0))
    .toFixed();
  return { out: total('OUT'), in: total('IN'), provenance: derived(now, 'sum-orders-by-direction', orders.map((order) => order.id)) };
}

function buildReview(
  company: CompanyRecord | null,
  ownerSub: string,
  batches: readonly ImportBatch[],
  events: readonly ImportEvent[],
  clientIdentity: ClientIdentityState,
  corrections: readonly CorrectionRecord[],
  context: ReviewContext,
  now: string,
): ImportReview {
  const portfolio: ImportPortfolio = { revision: corrections.length + events.length + 1, batches, events };
  const projection = projectPortfolio(portfolio);
  const orders = ordersFor(portfolio, clientIdentity, corrections, now);
  const generatedTotals = totals(orders, now);
  const declared = context.controlTotals;
  const quality = currentRowIssues(projection.rows, events);
  const blockers = [...quality.invalid];
  if (company === null) blockers.push(issue('COMPANY_MISSING', 'Empresa selecionada é obrigatória.'));
  if (company !== null && company.ownerSub !== ownerSub) blockers.push(issue('COMPANY_OWNER_MISMATCH', 'Empresa pertence a outro usuário.'));
  if (!context.positionIdentified) blockers.push(issue('POSITION_UNIDENTIFIED', 'A posição líquida a publicar não foi identificada.'));
  for (const conflict of projection.conflicts) blockers.push(issue('DUPLICATE_UNRESOLVED', `Conflito não resolvido em ${conflict.operationId}.`, `/orders/${conflict.operationId}`));
  if (declared !== null && (!new DecimalBrl(declared.out).eq(generatedTotals.out) || !new DecimalBrl(declared.in).eq(generatedTotals.in))) {
    blockers.push(issue('TOTAL_DIVERGENT', 'Total de controle diverge das ordens revisadas.', '/controlTotals'));
  }
  const windowDates = orders.flatMap((order) => [order.knownDate, order.deadlineDate]).sort();
  const startDate = windowDates[0] ?? EPOCH;
  const endDate = windowDates.at(-1) ?? EPOCH;
  const caseId = stableUuid(`${context.parsed.sha256}:${company?.id ?? 'missing'}:${ownerSub}`);
  const controlTotals = declared ?? { out: generatedTotals.out, in: generatedTotals.in };
  const warnings = [...quality.warnings];
  if (orders.some((order) => order.purposeCode === null) && !warnings.some((item) => item.code === 'PURPOSE_MISSING')) {
    warnings.push(issue('PURPOSE_MISSING', 'Finalidade não informada.'));
  }
  if (orders.length > 0) warnings.push(issue('EFX_NOT_COLLECTED', 'Status eFX não coletado no layout canônico.'));
  const draft: ObservedCaseDraft = {
    schemaVersion: '2.0.0',
    id: caseId,
    ownerSub,
    companyId: company?.id ?? 'missing-company',
    status: 'DRAFT',
    revision: Math.max(portfolio.revision, clientIdentity.revision + 1),
    window: { startDate, endDate, closingDate: endDate },
    orders,
    controlTotals: [
      { code: 'GROSS_OUT_BRL', valueBrl: controlTotals.out, provenance: declared === null ? generatedTotals.provenance : observed(now) },
      { code: 'GROSS_IN_BRL', valueBrl: controlTotals.in, provenance: declared === null ? generatedTotals.provenance : observed(now) },
    ],
    sourceManifest: {
      adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX',
      files: [{ name: 'importacao-canonica.xlsx', sizeBytes: context.parsed.byteSize, sha256: context.parsed.sha256 }],
    },
    normalization: { rulesetId: 'xlsx-operacoes', rulesetVersion: '1.0.0', normalizedAt: now },
    quality: { blockers, warnings },
    corrections,
    observedOutcome: null,
    confirmedAt: null,
  };
  return { company, draft, batches, events, blockers, warnings, clientIdentity, context };
}

export function createImportReview(input: CreateImportReviewInput): ImportReview {
  const prepared = toBatch(input);
  return buildReview(
    input.company,
    input.ownerSub,
    [prepared.batch],
    [],
    prepared.identity,
    [],
    { parsed: input.parsed, positionIdentified: input.positionIdentified ?? false, controlTotals: input.controlTotals ?? null },
    input.now,
  );
}

function normalizeEditedValue(field: EditableImportField, raw: string): string | null {
  switch (field) {
    case 'direction': return normalizeDirection(raw);
    case 'knownDate':
    case 'deadlineDate': return parseCivilDate(raw);
    case 'valueBrl': return parseBrlDecimal(raw);
    case 'purposeCode': return normalizePurposeCode(raw);
  }
}

function appendOperationEvent(
  review: ImportReview,
  kind: 'OPERATION_EXCLUDED' | 'OPERATION_RESTORED',
  command: Readonly<{ operationId: string; eventId: string; at: string }>,
): ImportReview {
  const sequence = review.events.reduce((maximum, event) => Math.max(maximum, event.eventSequence), 0) + 1;
  return rebuild(review, review.batches, [...review.events, { kind, id: command.eventId, eventSequence: sequence, occurredAt: command.at, operationId: command.operationId }], review.clientIdentity, review.draft.corrections, command.at);
}

function rebuild(
  review: ImportReview,
  batches: readonly ImportBatch[],
  events: readonly ImportEvent[],
  clientIdentity: ClientIdentityState,
  corrections: readonly CorrectionRecord[],
  now: string,
): ImportReview {
  return buildReview(review.company, review.draft.ownerSub, batches, events, clientIdentity, corrections, review.context, now);
}

export function applyImportCommand(review: ImportReview, command: ImportCommand): ImportReview {
  switch (command.kind) {
    case 'INCORPORATE_BATCH': {
      const prepared = toBatch({ parsed: command.parsed, company: review.company, ownerSub: review.draft.ownerSub, now: command.at, clientIdentity: review.clientIdentity }, review.batches.length + 1);
      const portfolio: ImportPortfolio = { revision: review.draft.revision, batches: review.batches, events: review.events };
      const next = incorporateBatch(portfolio, prepared.batch);
      return rebuild(review, next.batches, next.events, prepared.identity, review.draft.corrections, command.at);
    }
    case 'RESOLVE_CONFLICT': {
      const portfolio: ImportPortfolio = { revision: review.draft.revision, batches: review.batches, events: review.events };
      const next = resolveVersionConflict(portfolio, command);
      return rebuild(review, next.batches, next.events, review.clientIdentity, review.draft.corrections, command.at);
    }
    case 'REVERT_BATCH': {
      const portfolio: ImportPortfolio = { revision: review.draft.revision, batches: review.batches, events: review.events };
      const next = revertBatch(portfolio, command.batchId, command.eventId, command.at);
      return rebuild(review, next.batches, next.events, review.clientIdentity, review.draft.corrections, command.at);
    }
    case 'EXCLUDE_OPERATION': return appendOperationEvent(review, 'OPERATION_EXCLUDED', command);
    case 'RESTORE_OPERATION': return appendOperationEvent(review, 'OPERATION_RESTORED', command);
    case 'ASSOCIATE_ALIAS': {
      const identity = mergeClientAlias(review.clientIdentity, command.alias, command.canonicalClientId, command.at, () => command.eventId);
      return rebuild(review, review.batches, review.events, identity, review.draft.corrections, command.at);
    }
    case 'CORRECT_FIELD': {
      const portfolio: ImportPortfolio = { revision: review.draft.revision, batches: review.batches, events: review.events };
      const before = projectPortfolio(portfolio);
      const originalRow = review.batches.flatMap((batch) => batch.rows).find((row) => row.versionId === command.versionId);
      const previousVersion = before.versions.find((version) => version.versionId === command.versionId);
      if (originalRow === undefined || originalRow.raw.operacao_id !== command.operationId) throw new Error(`OPERATION_NOT_EDITABLE: operação ${command.operationId} não existe`);
      const rawField: Record<EditableImportField, keyof RawOperationCells> = {
        direction: 'direcao', knownDate: 'data_conhecida', deadlineDate: 'data_limite',
        valueBrl: 'valor_brl', purposeCode: 'finalidade_codigo',
      };
      const initial = validateImportedRows([originalRow.raw]).rows[0];
      if (initial === undefined) throw new Error('ROW_REVALIDATION_FAILED');
      const original = initial.normalized?.[command.field] ?? originalRow.raw[rawField[command.field]];
      const previous = previousVersion?.operation[command.field] ?? original;
      const sequence = review.events.reduce((maximum, event) => Math.max(maximum, event.eventSequence), 0) + 1;
      const event: ImportEvent = { kind: 'OPERATION_CORRECTED', id: command.actionId, eventSequence: sequence, occurredAt: command.at, versionId: command.versionId, operationId: command.operationId, field: command.field, rawValue: command.rawValue };
      const priorCorrection = review.draft.corrections.find((correction) => correction.fieldPath === `versions/${command.versionId}/${command.field}`);
      const correction: CorrectionRecord = {
        id: command.actionId,
        fieldPath: `versions/${command.versionId}/${command.field}`,
        originalValue: priorCorrection?.originalValue ?? original,
        previousValue: previous,
        nextValue: normalizeEditedValue(command.field, command.rawValue),
        actionAt: command.at,
        actorSub: review.draft.ownerSub,
      };
      return rebuild(review, review.batches, [...review.events, event], review.clientIdentity, [...review.draft.corrections, correction], command.at);
    }
  }
}
