import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import Decimal from 'decimal.js';

import type {
  CaseValidation,
  CaseValidationIssue,
  ObservedCase,
  ObservedCaseDraft,
} from './domain';
import observedCaseSchema from './observedCase.schema.json';

const ContractDecimal = Decimal.clone({ precision: 40 });
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validateSchema: ValidateFunction<ObservedCase> = ajv.compile(observedCaseSchema);
const validateDraftSchema: ValidateFunction<ObservedCaseDraft> = ajv.compile({
  $ref: `${observedCaseSchema.$id}#/$defs/ObservedCaseDraft`,
});

function schemaIssue(error: ErrorObject): CaseValidationIssue {
  return {
    path: error.instancePath === '' ? '/' : error.instancePath,
    code: 'INVALID_STRUCTURE',
    message: 'Caso observado inválido.',
  };
}

export function validateObservedCase(value: unknown): CaseValidation<ObservedCase> {
  if (!validateSchema(value)) {
    return { ok: false, issues: (validateSchema.errors ?? []).map(schemaIssue) };
  }
  if (value.quality.blockers.length > 0) {
    return {
      ok: false,
      issues: [{
        path: '/quality/blockers',
        code: 'INVALID_STRUCTURE',
        message: 'Caso confirmado não pode conter blockers ativos.',
      }],
    };
  }
  if (value.window.closingDate < value.window.startDate
    || value.window.closingDate > value.window.endDate) {
    return {
      ok: false,
      issues: [{
        path: '/window/closingDate',
        code: 'INVALID_WINDOW',
        message: 'Fechamento deve estar dentro da janela observada.',
      }],
    };
  }
  const seenOrderIds = new Set<string>();
  for (const [index, order] of value.orders.entries()) {
    if (seenOrderIds.has(order.id)) {
      return {
        ok: false,
        issues: [{
          path: `/orders/${index}/id`,
          code: 'DUPLICATE_ORDER',
          message: 'Identificador de ordem repetido.',
        }],
      };
    }
    seenOrderIds.add(order.id);
  }
  for (const [index, total] of value.controlTotals.entries()) {
    const direction = total.code === 'GROSS_OUT_BRL' ? 'OUT' : 'IN';
    const computed = value.orders
      .filter((order) => order.direction === direction)
      .reduce((sum, order) => sum.plus(order.valueBrl), new ContractDecimal(0));
    if (!computed.eq(total.valueBrl)) {
      return {
        ok: false,
        issues: [{
          path: `/controlTotals/${index}/valueBrl`,
          code: 'CONTROL_TOTAL_MISMATCH',
          message: 'Total de controle diverge das ordens observadas.',
        }],
      };
    }
  }
  return { ok: true, value };
}

export function validateObservedCaseDraft(
  value: unknown,
): CaseValidation<ObservedCaseDraft> {
  if (!validateDraftSchema(value)) {
    return { ok: false, issues: (validateDraftSchema.errors ?? []).map(schemaIssue) };
  }
  return { ok: true, value };
}
