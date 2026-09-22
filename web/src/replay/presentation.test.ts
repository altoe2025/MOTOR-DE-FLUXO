import { describe, expect, it } from 'vitest';

import { presentReplayDay } from './presentation';
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
});
