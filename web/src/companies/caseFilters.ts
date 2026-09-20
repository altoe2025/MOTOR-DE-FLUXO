import type { ObservedCase } from '../cases/domain';
import { caseHasNotCollected } from './companyOverview';

export type CaseQualityFilter = '' | 'WARNING' | 'BLOCKER' | 'NOT_COLLECTED';

export type CaseFilterState = Readonly<{
  periodStart: string;
  periodEnd: string;
  sourceKind: string;
  quality: CaseQualityFilter;
}>;

export const EMPTY_CASE_FILTERS: CaseFilterState = {
  periodStart: '', periodEnd: '', sourceKind: '', quality: '',
};

const qualities = new Set<CaseQualityFilter>(['', 'WARNING', 'BLOCKER', 'NOT_COLLECTED']);

export function filterObservedCases(
  cases: readonly ObservedCase[],
  filters: CaseFilterState,
): ObservedCase[] {
  return cases.filter((caseRecord) => {
    if (filters.periodStart !== '' && caseRecord.window.endDate < filters.periodStart) return false;
    if (filters.periodEnd !== '' && caseRecord.window.startDate > filters.periodEnd) return false;
    if (filters.sourceKind !== '' && caseRecord.sourceManifest.sourceKind !== filters.sourceKind) return false;
    if (filters.quality === 'WARNING' && caseRecord.quality.warnings.length === 0) return false;
    if (filters.quality === 'BLOCKER' && caseRecord.quality.blockers.length === 0) return false;
    if (filters.quality === 'NOT_COLLECTED' && !caseHasNotCollected(caseRecord)) return false;
    return true;
  });
}

export function serializeCaseFilters(filters: CaseFilterState): string {
  const query = new URLSearchParams();
  if (filters.periodStart !== '') query.set('inicio', filters.periodStart);
  if (filters.periodEnd !== '') query.set('fim', filters.periodEnd);
  if (filters.sourceKind !== '') query.set('tipo', filters.sourceKind);
  if (filters.quality !== '') query.set('qualidade', filters.quality);
  return query.toString();
}

export function parseCaseFilters(search: string): CaseFilterState {
  const query = new URLSearchParams(search);
  const quality = query.get('qualidade') ?? '';
  return {
    periodStart: query.get('inicio') ?? '',
    periodEnd: query.get('fim') ?? '',
    sourceKind: query.get('tipo') ?? '',
    quality: qualities.has(quality as CaseQualityFilter) ? quality as CaseQualityFilter : '',
  };
}
