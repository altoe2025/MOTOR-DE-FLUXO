import { describe, expect, it } from 'vitest';

import { measuredPeriodLabel, premisesDivergence, savingsBps } from './comparisonBoardMetrics';

describe('savingsBps', () => {
  it('é a economia sobre o volume bruto medido, em pontos-base', () => {
    expect(savingsBps('1500', '1000000')).toBe('15');
    expect(savingsBps('39526.53', '3158281.13')).toBe('125.15');
  });

  it('não inventa número sem volume', () => {
    expect(savingsBps('10', '0')).toBeNull();
  });

  it('mantém sinal quando o pool custa mais', () => {
    expect(savingsBps('-50', '100000')).toBe('-5');
  });
});

describe('measuredPeriodLabel', () => {
  it('período natural mostra dias medidos e aquecimento', () => {
    expect(measuredPeriodLabel({ modo: 'NATURAL', dias_aquecimento: 30, periodo_medicao_dias: 30 })).toBe('30 dias medidos (+30 de aquecimento)');
    expect(measuredPeriodLabel({ modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 1 })).toBe('1 dia medido');
  });

  it('período legado mostra o horizonte', () => {
    expect(measuredPeriodLabel({ modo: 'LEGADO' }, 45)).toBe('horizonte de 45 dias');
  });
});

describe('premisesDivergence', () => {
  const costs = { iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25', custo_fixo_remessa: '40', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [] };
  const premises = (patch: Record<string, unknown> = {}, windowDays = 7) => ({ windowDays, costs: { ...costs, ...patch } });

  it('sem diferença não marca nada', () => {
    expect(premisesDivergence([{ key: 'a', premises: premises() }, { key: 'b', premises: premises() }]))
      .toEqual({ differing: [], fields: [] });
  });

  it('marca as linhas fora do grupo mais comum e diz quais campos mudam', () => {
    const result = premisesDivergence([
      { key: 'a', premises: premises() },
      { key: 'b', premises: premises() },
      { key: 'c', premises: premises({ iof_out: '0.038' }, 3) },
    ]);
    expect(result.differing).toEqual(['c']);
    expect(result.fields).toEqual(['janela', 'IOF OUT']);
  });

  it('compara números, não texto', () => {
    expect(premisesDivergence([{ key: 'a', premises: premises({ ptax: '5.4' }) }, { key: 'b', premises: premises() }]).differing).toEqual([]);
  });
});
