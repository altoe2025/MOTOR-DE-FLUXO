import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import type { NormalizedOperation, RawOperationCells } from './domain';
import { ImportValidationError } from './errors';

export function requireOperationCell(value: string | null, field: keyof RawOperationCells): string {
  if (value === null || value === '') throw new ImportValidationError('REQUIRED', `Preencha a coluna ${field}; ela é obrigatória.`);
  return value;
}

function exact(value: string, field: keyof RawOperationCells): string {
  if (value.trim() !== value) throw new ImportValidationError('INVALID_FORMAT', `Tire os espaços do começo e do fim de ${field}.`);
  return value;
}

function limited(value: string, field: keyof RawOperationCells, maximum: number): string {
  if (value.length > maximum) throw new ImportValidationError('VALUE_OUT_OF_RANGE', `${field} passa de ${maximum} caracteres; encurte o texto.`);
  return value;
}

export function normalizeDirection(value: string | null): NormalizedOperation['direction'] {
  const direction = value?.trim().toUpperCase();
  if (direction !== 'OUT' && direction !== 'IN') throw new ImportValidationError('DIRECTION_INVALID', 'Use OUT (reais saem do Brasil) ou IN (moeda entra) na coluna direcao.');
  return direction;
}

export function normalizeProfileClassification(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : limited(normalized, 'classificacao_perfil', 120);
}

export function normalizePurposeCode(value: string | null): string | null {
  if (value === null || value === '') return null;
  return limited(exact(value, 'finalidade_codigo'), 'finalidade_codigo', 128);
}

export function normalizeClientName(value: string | null): string {
  const name = requireOperationCell(value, 'cliente_nome').trim().replace(/\s+/g, ' ');
  if (name === '') throw new ImportValidationError('REQUIRED', 'Preencha a coluna cliente_nome; ela é obrigatória.');
  return limited(name, 'cliente_nome', 200);
}

export function normalizeOperationId(value: string | null): string { return limited(exact(requireOperationCell(value, 'operacao_id'), 'operacao_id'), 'operacao_id', 128); }

export function normalizeOperation(raw: RawOperationCells): NormalizedOperation {
  return {
    operationId: normalizeOperationId(raw.operacao_id),
    clientName: normalizeClientName(raw.cliente_nome),
    profileClassification: normalizeProfileClassification(raw.classificacao_perfil),
    direction: normalizeDirection(raw.direcao),
    knownDate: parseCivilDate(requireOperationCell(raw.data_conhecida, 'data_conhecida')),
    deadlineDate: parseCivilDate(requireOperationCell(raw.data_limite, 'data_limite')),
    valueBrl: parseBrlDecimal(requireOperationCell(raw.valor_brl, 'valor_brl')),
    purposeCode: normalizePurposeCode(raw.finalidade_codigo),
  };
}
