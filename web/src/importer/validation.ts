import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type {
  ImportBatchDraft,
  ImportedRow,
  ImportRowError,
  NormalizedOperation,
  RawOperationCells,
} from './domain';
import { ImportValidationError } from './errors';
import type { ParsedWorkbook } from './xlsxParser';

type Field = keyof RawOperationCells;

function validationError(
  error: unknown,
  field: Field,
  rowNumber: number,
  value: string | null,
): ImportRowError {
  if (error instanceof ImportValidationError) {
    return {
      code: error.code,
      field,
      rowNumber,
      value,
      message: error.message,
    };
  }
  throw error;
}

function required(
  value: string | null,
  field: Field,
): string {
  if (value === null || value === '') {
    throw new ImportValidationError('REQUIRED', `${field} é obrigatório`);
  }
  return value;
}

function exact(value: string, field: Field): string {
  if (value.trim() !== value) {
    throw new ImportValidationError(
      'INVALID_FORMAT',
      `${field} não aceita espaços externos`,
    );
  }
  return value;
}

function validateField<T>(
  raw: RawOperationCells,
  field: Field,
  rowNumber: number,
  errors: ImportRowError[],
  validator: (value: string | null) => T,
): T | null {
  try {
    return validator(raw[field]);
  } catch (error: unknown) {
    errors.push(validationError(error, field, rowNumber, raw[field]));
    return null;
  }
}

function normalizeRow(
  raw: RawOperationCells,
  rowNumber: number,
): ImportedRow {
  const errors: ImportRowError[] = [];
  const operationId = validateField(
    raw,
    'operacao_id',
    rowNumber,
    errors,
    (value) => exact(required(value, 'operacao_id'), 'operacao_id'),
  );
  const clientName = validateField(
    raw,
    'cliente_nome',
    rowNumber,
    errors,
    (value) => {
      const normalized = required(value, 'cliente_nome')
        .trim()
        .replace(/\s+/g, ' ');
      if (normalized === '') {
        throw new ImportValidationError(
          'REQUIRED',
          'cliente_nome é obrigatório',
        );
      }
      return normalized;
    },
  );
  const direction = validateField(
    raw,
    'direcao',
    rowNumber,
    errors,
    (value): NormalizedOperation['direction'] => {
      const normalized = value?.trim().toUpperCase();
      if (normalized !== 'OUT' && normalized !== 'IN') {
        throw new ImportValidationError(
          'DIRECTION_INVALID',
          'direção deve ser OUT ou IN',
        );
      }
      return normalized;
    },
  );
  const knownDate = validateField(
    raw,
    'data_conhecida',
    rowNumber,
    errors,
    (value) => parseCivilDate(required(value, 'data_conhecida')),
  );
  const deadlineDate = validateField(
    raw,
    'data_limite',
    rowNumber,
    errors,
    (value) => parseCivilDate(required(value, 'data_limite')),
  );
  const valueBrl = validateField(
    raw,
    'valor_brl',
    rowNumber,
    errors,
    (value) => parseBrlDecimal(required(value, 'valor_brl')),
  );
  const purposeCode = validateField(
    raw,
    'finalidade_codigo',
    rowNumber,
    errors,
    (value) => {
      if (value === null || value === '') {
        errors.push({
          code: 'PURPOSE_MISSING',
          field: 'finalidade_codigo',
          rowNumber,
          value,
          message: 'PURPOSE_MISSING: finalidade não informada',
        });
        return null;
      }
      return exact(value, 'finalidade_codigo');
    },
  );

  if (
    knownDate !== null
    && deadlineDate !== null
    && deadlineDate < knownDate
  ) {
    errors.push({
      code: 'DATE_ORDER_INVALID',
      field: 'data_limite',
      rowNumber,
      value: raw.data_limite,
      message: 'DATE_ORDER_INVALID: data limite anterior à data conhecida',
    });
  }

  const blockingErrors = errors.filter(
    (error) => error.code !== 'PURPOSE_MISSING',
  );
  const normalized = blockingErrors.length === 0
    && operationId !== null
    && clientName !== null
    && direction !== null
    && knownDate !== null
    && deadlineDate !== null
    && valueBrl !== null
    ? {
        operationId,
        clientName,
        profileClassification: raw.classificacao_perfil?.trim() || null,
        direction,
        knownDate,
        deadlineDate,
        valueBrl,
        purposeCode,
      }
    : null;

  return { rowNumber, raw, normalized, errors };
}

function rejectDuplicateIds(rows: ImportedRow[]): void {
  const byId = new Map<string, ImportedRow[]>();
  for (const row of rows) {
    const id = row.raw.operacao_id;
    if (id === null || id === '' || id.trim() !== id) {
      continue;
    }
    const occurrences = byId.get(id) ?? [];
    occurrences.push(row);
    byId.set(id, occurrences);
  }

  for (const [id, occurrences] of byId) {
    if (occurrences.length < 2) {
      continue;
    }
    for (const row of occurrences) {
      row.errors.push({
        code: 'DUPLICATE_ID_IN_BATCH',
        field: 'operacao_id',
        rowNumber: row.rowNumber,
        value: row.raw.operacao_id,
        message: `DUPLICATE_ID_IN_BATCH: ID repetido ${id}`,
      });
      row.normalized = null;
    }
  }
}

export function validateImportedRows(
  workbook: ParsedWorkbook,
  nowUtc: string,
  idFactory: () => string,
): ImportBatchDraft {
  const rows = workbook.rows.map((raw, index) => normalizeRow(raw, index + 2));
  rejectDuplicateIds(rows);
  const valid = rows.filter((row) => row.normalized !== null).length;

  return {
    id: idFactory(),
    importedAtUtc: nowUtc,
    file: workbook.metadata,
    rows,
    summary: {
      total: rows.length,
      valid,
      invalid: rows.length - valid,
    },
  };
}
