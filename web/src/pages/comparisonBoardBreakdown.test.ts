import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import type { CanonicalAuthoredOrder, CostPremises, PreviewEnvelope } from '../study/model';
import { breakdownByCompany, groupOf } from './comparisonBoardBreakdown';

const costs = {
  iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25',
  custo_fixo_remessa: '40', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [],
} as CostPremises;

const orders = [
  { id: 'AP-1', cliente_id: 'a', direcao: 'IN', valor_brl: '100', dia_conhecida: 0, dia_limite: 0, eh_efx: false, finalidade: null },
  { id: 'X-1', cliente_id: 'x', direcao: 'OUT', valor_brl: '60', dia_conhecida: 0, dia_limite: 0, eh_efx: false, finalidade: null },
] as unknown as CanonicalAuthoredOrder[];

// Netado do motor: IOF 40×0,0038 + carry 120×0,0004 + spread 40×0,0025 + fixo 40 = 40,3.
const envelope = {
  input_snapshot: { cenario: { ordens: orders, custo: costs } },
  result: { agregado: {
    ids_ordens_medidas: ['AP-1', 'X-1'],
    baseline_periodo: { total: '82.88' },
    netado_periodo: { total: '40.3' },
    execucao_completa: { ciclos: [{ alocacoes: [
      { ordem_id: 'AP-1', dia: 0, valor_brl: '60', tipo: 'CASADO', origem_casamento: 'INTER_CLIENTE' },
      { ordem_id: 'X-1', dia: 0, valor_brl: '60', tipo: 'CASADO', origem_casamento: 'INTER_CLIENTE' },
      { ordem_id: 'AP-1', dia: 0, valor_brl: '40', tipo: 'REMETIDO', origem_casamento: null },
    ] }] },
  } },
} as unknown as PreviewEnvelope;

describe('breakdownByCompany', () => {
  it('agrupa pelo prefixo do ID da operação', () => {
    expect(groupOf('AP-20260102-FOREIGNPIX-IN')).toBe('AP');
    expect(groupOf('x-out-01')).toBe('X');
  });

  it('reparte a economia por empresa e fecha com o total do motor', () => {
    const result = breakdownByCompany(envelope);
    expect(result.reconciled).toBe(true);
    const byGroup = Object.fromEntries(result.companies.map((item) => [item.group, item]));
    expect(byGroup.AP!.remitted).toBe('40');
    expect(byGroup.AP!.matchedOthers).toBe('60');
    expect(byGroup.AP!.savings).toBe('0.354');
    expect(byGroup.X!.savings).toBe('42.226');
    const total = result.companies.reduce((sum, item) => sum.plus(item.savings), new Decimal(0));
    expect(total.toFixed()).toBe('42.58');
  });

  it('debita espera das ordens casadas mesmo quando nenhuma empresa remete', () => {
    const fullyMatched = {
      input_snapshot: { cenario: { ordens: orders.map((order) => ({ ...order, valor_brl: '100' })),
        custo: { ...costs, iof_in: '0.01', iof_out: '0.01', carry_cnr: '0', spread_rail_bps: '0',
          custo_fixo_remessa: '0', custo_oportunidade_aa: '0.365' } } },
      result: { agregado: {
        ids_ordens_medidas: orders.map((order) => order.id),
        baseline_periodo: { total: '2' }, netado_periodo: { total: '0.2' },
        execucao_completa: { ciclos: [{ alocacoes: orders.map((order) => ({
          ordem_id: order.id, dia: 1, valor_brl: '100', tipo: 'CASADO', origem_casamento: 'INTER_CLIENTE',
        })) }] },
      } },
    } as unknown as PreviewEnvelope;
    const result = breakdownByCompany(fullyMatched);
    expect(result.reconciled).toBe(true);
    expect(result.companies.map((company) => company.netted)).toEqual(['0.1', '0.1']);
    expect(result.companies.map((company) => company.savings)).toEqual(['0.9', '0.9']);
  });

  it('atribui espera à empresa casada, sem transferi-la à remetente', () => {
    const waiting = structuredClone(envelope) as unknown as {
      input_snapshot: { cenario: { custo: { custo_oportunidade_aa: string } } };
      result: { agregado: { netado_periodo: { total: string }; execucao_completa: {
        ciclos: { alocacoes: { dia: number }[] }[];
      } } };
    };
    waiting.input_snapshot.cenario.custo.custo_oportunidade_aa = '0.365';
    waiting.result.agregado.netado_periodo.total = '40.46';
    waiting.result.agregado.execucao_completa.ciclos[0]!.alocacoes.forEach((allocation) => { allocation.dia = 1; });
    const result = breakdownByCompany(waiting as unknown as PreviewEnvelope);
    expect(result.reconciled).toBe(true);
    const byGroup = Object.fromEntries(result.companies.map((company) => [company.group, company]));
    expect(byGroup.AP!.savings).toBe('0.254');
    expect(byGroup.X!.savings).toBe('42.166');
  });
});
