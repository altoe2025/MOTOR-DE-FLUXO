import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type { ImportedRow, ImportRowError, ImportValidationReport, RawOperationCells } from './domain';
import { ImportValidationError } from './errors';
import { normalizeClientName, normalizeDirection, normalizeOperationId, normalizeProfileClassification, normalizePurposeCode, requireOperationCell } from './normalization';

type Field = keyof RawOperationCells;
type MutableRow = { rowNumber: number; raw: RawOperationCells; normalized: ImportedRow['normalized']; errors: ImportRowError[] };

function toRowError(error: unknown, field: Field, rowNumber: number, value: string | null): ImportRowError {
  if (error instanceof ImportValidationError) return { code: error.code, field, rowNumber, value, message: error.message };
  throw error;
}

function validate<T>(raw: RawOperationCells, field: Field, rowNumber: number, errors: ImportRowError[], validator: (value: string | null) => T): T | null {
  try { return validator(raw[field]); } catch (error) { errors.push(toRowError(error, field, rowNumber, raw[field])); return null; }
}

function normalizeRow(raw: RawOperationCells, rowNumber: number): MutableRow {
  const errors: ImportRowError[] = [];
  const operationId = validate(raw, 'operacao_id', rowNumber, errors, normalizeOperationId);
  const clientName = validate(raw, 'cliente_nome', rowNumber, errors, normalizeClientName);
  const profileClassification = validate(raw, 'classificacao_perfil', rowNumber, errors, normalizeProfileClassification);
  const direction = validate(raw, 'direcao', rowNumber, errors, normalizeDirection);
  const knownDate = validate(raw, 'data_conhecida', rowNumber, errors, (value) => parseCivilDate(requireOperationCell(value, 'data_conhecida')));
  const deadlineDate = validate(raw, 'data_limite', rowNumber, errors, (value) => parseCivilDate(requireOperationCell(value, 'data_limite')));
  const valueBrl = validate(raw, 'valor_brl', rowNumber, errors, (value) => parseBrlDecimal(requireOperationCell(value, 'valor_brl')));
  const purposeCode = validate(raw, 'finalidade_codigo', rowNumber, errors, normalizePurposeCode);
  if (knownDate !== null && deadlineDate !== null && deadlineDate < knownDate) errors.push({ code: 'DATE_ORDER_INVALID', field: 'data_limite', rowNumber, value: raw.data_limite, message: 'DATE_ORDER_INVALID: data limite anterior à data conhecida' });
  return { rowNumber, raw, errors, normalized: errors.length === 0 && operationId !== null && clientName !== null && direction !== null && knownDate !== null && deadlineDate !== null && valueBrl !== null ? { operationId, clientName, profileClassification, direction, knownDate, deadlineDate, valueBrl, purposeCode } : null };
}

function rejectDuplicates(rows: MutableRow[]): void {
  const byId = new Map<string, MutableRow[]>();
  for (const row of rows) {
    const id = row.raw.operacao_id;
    if (id === null || id === '' || id.trim() !== id) continue;
    const occurrences = byId.get(id) ?? []; occurrences.push(row); byId.set(id, occurrences);
  }
  for (const [id, occurrences] of byId) {
    if (occurrences.length < 2) continue;
    for (const row of occurrences) { row.errors.push({ code: 'DUPLICATE_ID_IN_BATCH', field: 'operacao_id', rowNumber: row.rowNumber, value: row.raw.operacao_id, message: `DUPLICATE_ID_IN_BATCH: ID repetido ${id}` }); row.normalized = null; }
  }
}

export function validateImportedRows(rawRows: readonly RawOperationCells[]): ImportValidationReport {
  const rows = rawRows.map((raw, index) => normalizeRow(raw, index + 2));
  rejectDuplicates(rows);
  const valid = rows.filter((row) => row.normalized !== null).length;
  return { rows, summary: { total: rows.length, valid, invalid: rows.length - valid } };
}
