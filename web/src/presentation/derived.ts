import Decimal from 'decimal.js';

import type { CommunicationMetric } from '../communication/domain';

// Contas derivadas da apresentação ficam aqui; os componentes só formatam.

/** Soma de métricas publicadas; null se alguma estiver indisponível. */
export function sumMetrics(metrics: readonly (CommunicationMetric | undefined)[]): string | null {
  if (metrics.some((metric) => metric?.availability !== 'AVAILABLE' || metric.value === null)) return null;
  return metrics.reduce((total, metric) => total.plus(metric!.value!), new Decimal(0)).toFixed();
}

/** value − reference, ou null quando faltar um dos lados. */
export function difference(value: string | null | undefined, reference: string | null | undefined): string | null {
  return value == null || reference == null ? null : new Decimal(value).minus(reference).toFixed();
}
