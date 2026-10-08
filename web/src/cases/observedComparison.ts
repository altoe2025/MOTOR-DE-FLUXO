import Decimal from 'decimal.js';

import type { ObservedMetric, ObservedOutcome } from './domain';
import { OBSERVED_METRIC_COMPATIBILITY } from './fingerprints';
import type { PreviewEnvelope } from '../study/model';

const FinancialDecimal = Decimal.clone({ precision: 40 });

type ComparisonBase = Readonly<{
  code: string;
  label: string;
  canonicalPath: string | null;
  unit: string;
  definitionVersion: string | null;
  observedValue: string | null;
  motorValue: string | null;
  difference: string | null;
  percentageDifference: string | null;
}>;

export type ObservedComparisonRow =
  | (ComparisonBase & Readonly<{ status: 'MATCHED' | 'DIFFERENT' }>)
  | (ComparisonBase & Readonly<{ status: 'NOT_OBSERVED' }>)
  | (ComparisonBase & Readonly<{
      status: 'INCOMPATIBLE';
      reason: 'UNMAPPED_CODE' | 'UNIT_MISMATCH' | 'DEFINITION_MISMATCH';
      explanation: string;
    }>);

export type ObservedComparison = Readonly<{
  observedSchemaVersion: string;
  rows: readonly ObservedComparisonRow[];
}>;

function incompatible(
  base: ComparisonBase,
  reason: Extract<ObservedComparisonRow, { status: 'INCOMPATIBLE' }>['reason'],
  explanation: string,
): ObservedComparisonRow {
  return { ...base, status: 'INCOMPATIBLE', reason, explanation };
}

function compareMetric(
  metric: ObservedMetric,
  registration: (typeof OBSERVED_METRIC_COMPATIBILITY)[number],
  envelope: PreviewEnvelope,
): ObservedComparisonRow {
  const motorValue = registration.readMotorValue(envelope);
  const base: ComparisonBase = {
    code: registration.code,
    label: registration.label,
    canonicalPath: registration.canonicalPath,
    unit: registration.unit,
    definitionVersion: registration.definitionVersion,
    observedValue: metric.value,
    motorValue,
    difference: null,
    percentageDifference: null,
  };
  if (metric.unit !== registration.unit) {
    return incompatible(
      base,
      'UNIT_MISMATCH',
      `Unidade observada ${metric.unit}; o contrato canônico exige ${registration.unit}.`,
    );
  }
  if (metric.definitionVersion !== registration.definitionVersion) {
    return incompatible(
      base,
      'DEFINITION_MISMATCH',
      `Definição observada ${metric.definitionVersion}; o contrato canônico exige ${registration.definitionVersion}.`,
    );
  }
  const observed = new FinancialDecimal(metric.value);
  const difference = new FinancialDecimal(motorValue).minus(observed);
  return {
    ...base,
    status: difference.isZero() ? 'MATCHED' : 'DIFFERENT',
    difference: difference.toString(),
    percentageDifference: observed.isZero() ? null : difference.dividedBy(observed).toString(),
  };
}

export function compareObservedToMotor(
  observed: ObservedOutcome,
  envelope: PreviewEnvelope,
): ObservedComparison {
  const metricsByCode = new Map(observed.metrics.map((metric) => [metric.code as string, metric]));
  const registeredCodes = new Set(OBSERVED_METRIC_COMPATIBILITY.map((item) => item.code as string));
  const rows: ObservedComparisonRow[] = OBSERVED_METRIC_COMPATIBILITY.map((registration) => {
    const metric = metricsByCode.get(registration.code);
    if (metric !== undefined) return compareMetric(metric, registration, envelope);
    return {
      code: registration.code,
      label: registration.label,
      canonicalPath: registration.canonicalPath,
      unit: registration.unit,
      definitionVersion: registration.definitionVersion,
      status: 'NOT_OBSERVED',
      observedValue: null,
      motorValue: registration.readMotorValue(envelope),
      difference: null,
      percentageDifference: null,
    };
  });
  const unmapped = observed.metrics
    .filter((metric) => !registeredCodes.has(metric.code))
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((metric): ObservedComparisonRow => incompatible(
      {
        code: metric.code,
        label: metric.code,
        canonicalPath: null,
        unit: metric.unit,
        definitionVersion: null,
        observedValue: metric.value,
        motorValue: null,
        difference: null,
        percentageDifference: null,
      },
      'UNMAPPED_CODE',
      `Código observado ${metric.code} não possui mapeamento canônico.`,
    ));
  return { observedSchemaVersion: observed.schemaVersion, rows: [...rows, ...unmapped] };
}
