import { describe, expect, it } from 'vitest';

import type { FieldProvenance, ObservedCase } from '../cases/domain';
import { makeObservedCase } from '../study/fixtures';
import {
  filterObservedCases,
  parseCaseFilters,
  serializeCaseFilters,
  type CaseFilterState,
} from './caseFilters';

function caseRecord(
  id: string,
  startDate: string,
  endDate: string,
  sourceKind: string,
  quality: ObservedCase['quality'] = { blockers: [], warnings: [] },
): ObservedCase {
  return {
    ...makeObservedCase(), id, sourceManifest: { ...makeObservedCase().sourceManifest, sourceKind }, quality,
    window: { startDate, endDate, closingDate: endDate },
  };
}

const empty: CaseFilterState = { periodStart: '', periodEnd: '', sourceKind: '', quality: '' };

describe('case filters', () => {
  it('inclui janelas que apenas intersectam o período consultado', () => {
    const cases = [
      caseRecord('before', '2025-12-01', '2025-12-31', 'CSV'),
      caseRecord('left-edge', '2025-12-20', '2026-01-02', 'CSV'),
      caseRecord('inside', '2026-01-10', '2026-01-12', 'XLSX'),
      caseRecord('right-edge', '2026-01-30', '2026-02-05', 'CSV'),
      caseRecord('after', '2026-02-01', '2026-02-28', 'CSV'),
    ];
    expect(filterObservedCases(cases, { ...empty, periodStart: '2026-01-01', periodEnd: '2026-01-31' }).map((item) => item.id))
      .toEqual(['left-edge', 'inside', 'right-edge']);
  });

  it('filtra pelo sourceKind exato', () => {
    const cases = [caseRecord('csv', '2026-01-01', '2026-01-02', 'CSV'), caseRecord('xlsx', '2026-01-01', '2026-01-02', 'XLSX')];
    expect(filterObservedCases(cases, { ...empty, sourceKind: 'XLSX' }).map((item) => item.id)).toEqual(['xlsx']);
  });

  it.each([
    ['WARNING', 'warning'],
    ['BLOCKER', 'blocker'],
    ['NOT_COLLECTED', 'not-collected'],
  ] as const)('distingue qualidade %s', (quality, expected) => {
    const notCollected: FieldProvenance = {
      kind: 'NOT_COLLECTED', source: 'importação', version: '1', recordedAt: '2026-01-01T00:00:00Z',
    };
    const cases = [
      caseRecord('warning', '2026-01-01', '2026-01-02', 'CSV', { blockers: [], warnings: [{ code: 'W', message: 'atenção' }] }),
      caseRecord('blocker', '2026-01-01', '2026-01-02', 'CSV', { blockers: [{ code: 'B', message: 'bloqueio' }], warnings: [] }),
      { ...caseRecord('not-collected', '2026-01-01', '2026-01-02', 'CSV'), orders: [{ ...makeObservedCase().orders[0]!, provenance: [notCollected] }] },
      caseRecord('clean', '2026-01-01', '2026-01-02', 'CSV'),
    ];
    expect(filterObservedCases(cases, { ...empty, quality }).map((item) => item.id)).toEqual([expected]);
  });

  it('reconhece NOT_COLLECTED no valor do campo, mesmo sem issue de qualidade', () => {
    const caseWithMissingEfx = {
      ...caseRecord('missing-efx', '2026-01-01', '2026-01-02', 'CSV'),
      orders: [{ ...makeObservedCase().orders[0]!, efxStatus: 'NOT_COLLECTED' as const }],
    };
    expect(filterObservedCases([caseWithMissingEfx], { ...empty, quality: 'NOT_COLLECTED' }).map((item) => item.id))
      .toEqual(['missing-efx']);
  });

  it('serializa em ordem estável e restaura somente valores suportados', () => {
    const state: CaseFilterState = {
      periodStart: '2026-01-01', periodEnd: '2026-01-31', sourceKind: 'XLSX', quality: 'WARNING',
    };
    expect(serializeCaseFilters(state)).toBe('inicio=2026-01-01&fim=2026-01-31&tipo=XLSX&qualidade=WARNING');
    expect(parseCaseFilters('?qualidade=WARNING&desconhecido=x&tipo=XLSX&fim=2026-01-31&inicio=2026-01-01')).toEqual(state);
    expect(parseCaseFilters('?qualidade=OUTRO')).toEqual(empty);
  });
});
