import { describe, expect, it } from 'vitest';

import type { ObservedCase } from '../cases/domain';
import { makeObservedCase } from '../study/fixtures';
import type { PortfolioSourceSnapshot } from '../study/model';
import { calendarForReplay, largestResidueDay, replayCompanies } from './navigation';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from './testFixtures';

describe('navegação do Replay', () => {
  it('maior resíduo é o dia com mais volume remetido (OUT + IN) no fechamento', () => {
    expect(largestResidueDay(replayDocumentFixture())).toEqual({ day: 2, valueBrl: '60' });
    const both = replayDocumentWithBothRemittancesFixture();
    const found = largestResidueDay(both);
    expect(found).not.toBeNull();
    const expected = Math.max(...both.days.map((day) => Number(day.closing?.remitted_out_brl ?? 0) + Number(day.closing?.remitted_in_brl ?? 0)));
    expect(Number(found!.valueBrl)).toBe(expected);
  });

  it('sem nenhuma remessa não há maior resíduo', () => {
    const document = replayDocumentFixture();
    document.days[2]!.closing!.remitted_out_brl = '0';
    expect(largestResidueDay(document)).toBeNull();
  });

  it('lista as empresas das ordens em ordem alfabética', () => {
    const companies = replayCompanies(replayDocumentFixture(), (id) => (id === 'out-1' ? 'Zeta' : 'Alfa'));
    expect(companies).toEqual(['Alfa', 'Zeta']);
  });

  const snapshot = (source: PortfolioSourceSnapshot['source'], knownDay = 0) => ({
    source, orders: [{ id: 'out-1', cliente_id: 'c', direcao: 'OUT', dia_conhecida: knownDay, dia_limite: 2, valor_brl: '100', finalidade: null, eh_efx: false }],
  }) as unknown as PortfolioSourceSnapshot;
  const observed: ObservedCase = makeObservedCase();

  it('com caso observado, D+n vira data real a partir do início da janela', () => {
    const calendar = calendarForReplay(replayDocumentFixture(), snapshot({ kind: 'OBSERVED_CASE', caseId: observed.id, caseRevision: observed.revision }), [observed]);
    expect(calendar?.(0)).toBe('01/09/2026');
    expect(calendar?.(2)).toBe('03/09/2026');
  });

  it('respeita deslocamento entre o dia do motor e o dia da origem', () => {
    const calendar = calendarForReplay(replayDocumentFixture(), snapshot({ kind: 'OBSERVED_CASE', caseId: observed.id, caseRevision: observed.revision }, 5), [observed]);
    expect(calendar?.(0)).toBe('06/09/2026');
  });

  it('carteira de empresas usa a data inicial mais antiga dos casos', () => {
    const later: ObservedCase = { ...observed, id: 'case-2', window: { ...observed.window, startDate: '2026-08-28' } };
    const source = { kind: 'AUTHORED', authoredPortfolioId: 'p', definition: { kind: 'EXPLICIT_ORDERS', orders: [], provenanceByOrder: {}, sourceCases: [
      { caseId: observed.id, caseRevision: 4, companyId: 'a' }, { caseId: later.id, caseRevision: 4, companyId: 'b' },
    ] } } as unknown as PortfolioSourceSnapshot['source'];
    expect(calendarForReplay(replayDocumentFixture(), snapshot(source), [observed, later])?.(1)).toBe('29/08/2026');
  });

  it('sem calendário conhecido não inventa data', () => {
    expect(calendarForReplay(replayDocumentFixture(), snapshot({ kind: 'AUTHORED', authoredPortfolioId: 'p' }), [observed])).toBeNull();
    expect(calendarForReplay(replayDocumentFixture(), snapshot({ kind: 'OBSERVED_CASE', caseId: 'sumiu', caseRevision: 1 }), [observed])).toBeNull();
    expect(calendarForReplay(replayDocumentFixture(), undefined, [observed])).toBeNull();
  });
});
