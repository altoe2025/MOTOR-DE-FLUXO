import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type {
  NormalizedOperation,
  RawOperationCells,
} from './domain';
import { ImportValidationError } from './errors';

function requireCell(
  value: string | null,
  field: keyof RawOperationCells,
): string {
  if (value === null || value === '') {
    throw new ImportValidationError(
      'REQUIRED',
      `${field} é obrigatório`,
    );
  }
  return value;
}

function exactValue(
  value: string,
  field: keyof RawOperationCells,
): string {
  if (value.trim() !== value) {
    throw new ImportValidationError(
      'INVALID_FORMAT',
      `${field} não aceita espaços externos`,
    );
  }
  return value;
}

function normalizeDirection(
  value: string | null,
): NormalizedOperation['direction'] {
  const direction = value?.trim().toUpperCase();
  if (direction !== 'OUT' && direction !== 'IN') {
    throw new ImportValidationError(
      'DIRECTION_INVALID',
      'direção deve ser OUT ou IN',
    );
  }
  return direction;
}

function normalizeOptionalTrimmed(
  value: string | null,
): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

function normalizePurpose(value: string | null): string | null {
  if (value === null || value === '') {
    return null;
  }
  return exactValue(value, 'finalidade_codigo');
}

function normalizeClientName(value: string | null): string {
  const name = requireCell(value, 'cliente_nome')
    .trim()
    .replace(/\s+/g, ' ');
  if (name === '') {
    throw new ImportValidationError(
      'REQUIRED',
      'cliente_nome é obrigatório',
    );
  }
  return name;
}

export function normalizeOperation(
  raw: RawOperationCells,
): NormalizedOperation {
  const operationId = exactValue(
    requireCell(raw.operacao_id, 'operacao_id'),
    'operacao_id',
  );
  const knownDate = parseCivilDate(
    requireCell(raw.data_conhecida, 'data_conhecida'),
  );
  const deadlineDate = parseCivilDate(
    requireCell(raw.data_limite, 'data_limite'),
  );

  return {
    operationId,
    clientName: normalizeClientName(raw.cliente_nome),
    profileClassification: normalizeOptionalTrimmed(
      raw.classificacao_perfil,
    ),
    direction: normalizeDirection(raw.direcao),
    knownDate,
    deadlineDate,
    valueBrl: parseBrlDecimal(
      requireCell(raw.valor_brl, 'valor_brl'),
    ),
    purposeCode: normalizePurpose(raw.finalidade_codigo),
  };
}
