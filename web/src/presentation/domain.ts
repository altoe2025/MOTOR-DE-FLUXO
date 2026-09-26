import type { CommunicationDocumentV1 } from '../communication/domain';
import type { CommunicationMetric } from '../communication/domain';
import { formatBps, formatDecimal, formatFraction, formatMoney } from './format';

export type PresentationSelection = Readonly<{ studyId: string } & Pick<CommunicationDocumentV1['selection'],
  'scenarioId' | 'diagnosticExecutionId' | 'comparisonExecutionId' | 'replayDay'>>;

export type PresentationSectionId = 'resumo' | 'composicao';

export const PRIMARY_EXECUTIVE_METRIC_CODES: ReadonlySet<string> = new Set([
  'BASELINE_BRL', 'NETTED_BRL', 'SAVINGS_BRL', 'NETABILITY', 'GROSS_BRL',
]);

export function matchesPresentationSelection(document: CommunicationDocumentV1, selection: PresentationSelection): boolean {
  return document.study.id === selection.studyId
    && document.selection.scenarioId === selection.scenarioId
    && document.selection.diagnosticExecutionId === selection.diagnosticExecutionId
    && document.selection.comparisonExecutionId === selection.comparisonExecutionId
    && document.selection.replayDay === selection.replayDay;
}

/** Formatting is confined here; components only present published values. */
export function formatCommunicationMetric(metric: CommunicationMetric): string {
  if (metric.availability === 'UNAVAILABLE' || metric.value === null) return 'Não disponível';
  switch (metric.unit) {
    case 'BRL': return formatMoney(metric.value);
    case 'FRACTION': return formatFraction(metric.value);
    case 'BPS': return formatBps(metric.value);
    case 'DAYS': {
      const days = formatDecimal(metric.value, 1).replace(/,0$/, '');
      return `${days} ${days === '1' ? 'dia' : 'dias'}`;
    }
    case 'COUNT': return metric.value;
    case 'TEXT': return /^-?\d+\.\d{5,}$/.test(metric.value) ? formatDecimal(metric.value, 4) : metric.value;
  }
}
