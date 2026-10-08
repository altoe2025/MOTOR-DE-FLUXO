import { describe, expect, it } from 'vitest';

import { presentReplayDay, presentReplayHistory } from './presentation';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from './testFixtures';

describe('apresentação factual do Replay', () => {
  it('separa posição casada da contribuição dos dois lados', () => {
    const view = presentReplayDay(replayDocumentFixture(), 0);

    expect(view.matchedPositionBrl).toBe('40');
    expect(view.matchedContributionBrl).toBe('80');
    expect(view.openBrl).toBe('60');
    expect(view.explanation).toMatch(/duas pontas/i);
    expect(view.journal.join(' ')).toMatch(/decomposição ilustrativa/i);
  });

  it('explicita dia vazio sem inventar movimento', () => {
    const view = presentReplayDay(replayDocumentFixture(), 1);

    expect(view.hasOperationalEvent).toBe(false);
    expect(view.journal).toEqual(['Dia sem chegada, fechamento, casamento ou remessa. Saldos permanecem inalterados.']);
  });

  it('mantém remessas OUT e IN separadas do saldo aberto', () => {
    const view = presentReplayDay(replayDocumentWithBothRemittancesFixture(), 2);

    expect(view.remittedOutBrl).toBe('60');
    expect(view.remittedInBrl).toBe('20');
    expect(view.openBrl).toBe('0');
    expect(view.journal.join(' ')).toMatch(/remessa OUT.*60/i);
    expect(view.journal.join(' ')).toMatch(/remessa IN.*20/i);
  });

  it('constrói diário cumulativo somente até o dia selecionado e identifica cada operação', () => {
    const history = presentReplayHistory(replayDocumentWithBothRemittancesFixture(), 2);

    expect(history.map((entry) => entry.day)).toEqual([0, 2]);
    expect(history[0]?.entries).toContain('Ordem out-1 chegou e entrou na fila aberta.');
    expect(history[0]?.entries.join(' ')).toMatch(/netting multilateral.*out-1.*in-1/i);
    expect(history[1]?.entries.join(' ')).toMatch(/ordem out-1.*remetida OUT.*R\$\s*60,00/i);
    expect(history[1]?.entries.join(' ')).toMatch(/ordem in-2.*remetida IN.*R\$\s*20,00/i);
    expect(history.some((entry) => entry.day > 2)).toBe(false);
  });
});
