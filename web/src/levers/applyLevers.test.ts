import { describe, expect, it } from 'vitest';

import type { FieldProvenance } from '../cases/domain';
import type { CanonicalAuthoredOrder, OrderFieldProvenance } from '../study/model';
import { applyLevers, describeLevers, NEUTRAL_LEVERS } from './applyLevers';

const observed: FieldProvenance = { kind: 'OBSERVED', source: 'xlsx', version: '1', recordedAt: '2026-01-01T00:00:00Z' };
const order = (id: string, direcao: 'IN' | 'OUT', valor: string, known: number, deadline: number) => ({
  id, cliente_id: id.split('-')[0], direcao, valor_brl: valor, dia_conhecida: known, dia_limite: deadline,
  eh_efx: false, finalidade: null,
}) as unknown as CanonicalAuthoredOrder;
const orders = [
  order('AP-1', 'IN', '100.00', 0, 2),
  order('Y-OUT-01', 'OUT', '15000000', 8, 13),
  order('Y-IN-01', 'IN', '5000000', 15, 20),
];
const provenance = Object.fromEntries(orders.map((item) => [item.id, {
  dia_conhecida: observed, dia_limite: observed, eh_efx: observed, finalidade: observed, valor_brl: observed,
} satisfies OrderFieldProvenance]));
const now = '2026-09-25T00:00:00Z';

describe('applyLevers', () => {
  it('multiplica só o OUT da empresa escolhida e marca a proveniência', () => {
    const result = applyLevers(orders, provenance, { ...NEUTRAL_LEVERS, group: 'Y', volumeOut: '2' }, now);
    expect(result.orders.find((item) => item.id === 'Y-OUT-01')?.valor_brl).toBe('30000000.00');
    expect(result.orders.find((item) => item.id === 'Y-IN-01')?.valor_brl).toBe('5000000');
    expect(result.orders.find((item) => item.id === 'AP-1')).toEqual(orders[0]);
    expect(result.provenanceByOrder['Y-OUT-01']?.valor_brl.kind).toBe('USER_ESTIMATE');
    expect(result.provenanceByOrder['Y-IN-01']?.valor_brl.kind).toBe('OBSERVED');
  });

  it('desloca datas, mantém o prazo e estende o horizonte', () => {
    const result = applyLevers(orders, provenance, { ...NEUTRAL_LEVERS, group: 'Y', shiftDays: 3 }, now);
    const out = result.orders.find((item) => item.id === 'Y-OUT-01')!;
    expect([out.dia_conhecida, out.dia_limite]).toEqual([11, 16]);
    expect(result.horizonDays).toBe(24);
  });

  it('estica o calendário pelo espaçamento e fixa o prazo', () => {
    const result = applyLevers(orders, provenance, {
      ...NEUTRAL_LEVERS, group: 'Y', spacingFactor: '0.5', deadline: { mode: 'FIXED', days: 1 },
    }, now);
    const inbound = result.orders.find((item) => item.id === 'Y-IN-01')!;
    expect([inbound.dia_conhecida, inbound.dia_limite]).toEqual([8, 9]);
  });

  it('não deixa data negativa nem prazo antes da data conhecida', () => {
    const result = applyLevers(orders, provenance, {
      ...NEUTRAL_LEVERS, group: 'AP', shiftDays: -5, deadline: { mode: 'DELTA', days: -10 },
    }, now);
    const ap = result.orders.find((item) => item.id === 'AP-1')!;
    expect([ap.dia_conhecida, ap.dia_limite]).toEqual([0, 0]);
  });

  it('tira ordens escolhidas ou a empresa inteira', () => {
    const some = applyLevers(orders, provenance, { ...NEUTRAL_LEVERS, group: 'Y', removedOrderIds: ['Y-IN-01'] }, now);
    expect(some.orders.map((item) => item.id)).toEqual(['AP-1', 'Y-OUT-01']);
    expect(some.provenanceByOrder['Y-IN-01']).toBeUndefined();
    const none = applyLevers(orders, provenance, { ...NEUTRAL_LEVERS, group: 'Y', removeCompany: true }, now);
    expect(none.orders.map((item) => item.id)).toEqual(['AP-1']);
    expect(() => applyLevers([orders[1]!], provenance, { ...NEUTRAL_LEVERS, group: 'Y', removeCompany: true }, now))
      .toThrow('sem nenhuma ordem');
  });

  it('descreve as alavancas para nomear a variação', () => {
    expect(describeLevers({ ...NEUTRAL_LEVERS, group: 'Y', volumeOut: '2', shiftDays: 3 })).toBe('Y: OUT ×2, +3 d');
    expect(describeLevers({ ...NEUTRAL_LEVERS, group: 'X', removeCompany: true })).toBe('sem X');
  });
});
