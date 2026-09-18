import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type {
  NormalizedOperation,
  RawOperationCells,
} from './domain';
import { ImportValidationError } from './errors';

export function requireOperationCell(
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

export function normalizeDirection(
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

export function normalizeProfileClassification(
  value: string | null,
): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

export function normalizePurposeCode(value: string | null): string | null {
  if (value === null || value === '') {
    return null;
  }
  return exactValue(value, 'finalidade_codigo');
}

export function normalizeClientName(value: string | null): string {
  const name = requireOperationCell(value, 'cliente_nome')
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

export function normalizeOperationId(value: string | null): string {
  return exactValue(
    requireOperationCell(value, 'operacao_id'),
    'operacao_id',
  );
}

export function normalizeOperation(
  raw: RawOperationCells,
): NormalizedOperation {
  const operationId = normalizeOperationId(raw.operacao_id);
  const knownDate = parseCivilDate(
    requireOperationCell(raw.data_conhecida, 'data_conhecida'),
  );
  const deadlineDate = parseCivilDate(
    requireOperationCell(raw.data_limite, 'data_limite'),
  );

  return {
    operationId,
    clientName: normalizeClientName(raw.cliente_nome),
    profileClassification: normalizeProfileClassification(
      raw.classificacao_perfil,
    ),
    direction: normalizeDirection(raw.direcao),
    knownDate,
    deadlineDate,
    valueBrl: parseBrlDecimal(
      requireOperationCell(raw.valor_brl, 'valor_brl'),
    ),
    purposeCode: normalizePurposeCode(raw.finalidade_codigo),
  };
}
