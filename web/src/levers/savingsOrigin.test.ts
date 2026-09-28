import { describe, expect, it } from 'vitest';

import type { ScenarioDerivation } from '../study/model';
import { savingsOrigin, type ScenarioRow } from './savingsOrigin';

const PREMISES = { windowDays: 7, costs: { iof_out: '0.035' } };
const PERIOD = { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 30 } };

function company(group: string, savings: string) {
  return { group, savings, matchedOwn: '0', matchedOthers: '0', volume: '100' };
}

function row(id: string, groups: readonly [string, string][], extra: Partial<{
  derivation: ScenarioDerivation; premises: unknown; period: unknown; fingerprint: string;
}> = {}): ScenarioRow {
  return {
    scenario: {
      id, name: id,
      sourceSnapshot: { sourceFingerprint: extra.fingerprint ?? `fp-${id}` },
      premises: extra.premises ?? PREMISES, period: extra.period ?? PERIOD,
      ...(extra.derivation === undefined ? {} : { derivation: extra.derivation }),
    },
    execution: null, envelope: null,
    breakdown: { companies: groups.map(([group, savings]) => company(group, savings)), reconciled: true },
  } as unknown as ScenarioRow;
}

const alone = (companyName: string, base = 'base', baseFingerprint = 'fp-base'): ScenarioDerivation => ({
  kind: 'COMPANY_ALONE', baseScenarioId: base, baseSourceFingerprint: baseFingerprint, companies: [companyName],
});

describe('savingsOrigin', () => {
  const base = row('base', [['A', '100'], ['B', '50']]);

  it('ignora variação de alavanca com uma empresa criada antes da empresa sozinha', () => {
    const doubled = row('a-volume-x2', [['A', '999']]);
    const soloA = row('so-a', [['A', '40']], { derivation: alone('A') });
    const origin = savingsOrigin([base, doubled, soloA], base);
    expect(origin.find((entry) => entry.item.group === 'A')?.solo?.savings).toBe('40');
  });

  it('não atribui quando só existe a variação alterada', () => {
    const doubled = row('a-volume-x2', [['A', '999']]);
    expect(savingsOrigin([base, doubled], base).every((entry) => entry.solo === undefined)).toBe(true);
  });

  it('não atribui empresa sozinha gerada de outra base, de outra versão da base ou com premissas diferentes', () => {
    const otherBase = row('so-a-outra', [['A', '1']], { derivation: alone('A', 'outra-base') });
    const staleBase = row('so-a-velha', [['A', '2']], { derivation: alone('A', 'base', 'fp-antiga') });
    const otherPremises = row('so-a-premissa', [['A', '3']], {
      derivation: alone('A'), premises: { ...PREMISES, windowDays: 3 },
    });
    const otherPeriod = row('so-a-periodo', [['A', '4']], {
      derivation: alone('A'), period: { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 60 } },
    });
    const origin = savingsOrigin([base, otherBase, staleBase, otherPremises, otherPeriod], base);
    expect(origin.every((entry) => entry.solo === undefined)).toBe(true);
  });

  it('não usa "retirar uma por vez" como empresa sozinha', () => {
    const withoutB = row('sem-b', [['A', '70']], {
      derivation: { kind: 'LEAVE_ONE_OUT', baseScenarioId: 'base', baseSourceFingerprint: 'fp-base', companies: ['A'] },
    });
    expect(savingsOrigin([base, withoutB], base).every((entry) => entry.solo === undefined)).toBe(true);
  });
});
