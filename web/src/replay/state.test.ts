import { describe, expect, it } from 'vitest';

import { nextClosingDay, replayStateAt, replayTransition, sortOpenOrders } from './state';
import { replayDocumentFixture } from './testFixtures';

describe('estado determinístico do replay', () => {
  it('reconstrói dias vazios e preserva o saldo parcialmente coberto', () => {
    const replay = replayDocumentFixture();

    const dayZero = replayStateAt(replay, 0);
    const dayOne = replayStateAt(replay, 1);

    expect(dayZero.openOrders).toEqual([expect.objectContaining({ orderId: 'out-1', openValueBrl: '60' })]);
    expect(dayOne.openOrders).toEqual(dayZero.openOrders);
    expect(dayOne.phase).toBe('MEASUREMENT');
    expect(dayOne.endState.open_out_brl).toBe('60');
  });

  it('recalcula do documento ao voltar, saltar e recarregar sem depender do estado anterior', () => {
    const replay = replayDocumentFixture();

    expect(replayStateAt(replay, 2).openOrders).toEqual([]);
    expect(replayStateAt(replay, 0)).toEqual(replayStateAt(structuredClone(replay), 0));
    expect(replayStateAt(replay, 1)).toEqual(replayStateAt(replay, 1));
  });

  it('expõe transições sem inventar contrapartes e liquida a ordem no evento correto', () => {
    const replay = replayDocumentFixture();

    expect(replayTransition(replay, 1, 2)).toEqual([
      expect.objectContaining({ kind: 'CLOSING', day: 2 }),
      expect.objectContaining({ kind: 'BALANCE_UPDATED', orderId: 'out-1', openValueBrl: '0' }),
      expect.objectContaining({ kind: 'REMITTANCE', orderId: 'out-1', valueBrl: '60', direction: 'OUT' }),
      expect.objectContaining({ kind: 'ORDER_SETTLED', orderId: 'out-1' }),
    ]);
  });

  it('ordena por chegada ou EDF sem alterar o cálculo', () => {
    const replay = replayDocumentFixture();
    const extra = { ...replay.orders[0]!, id: 'out-0', known_day: 0, deadline_day: 1, value_brl: '10' };
    replay.orders.push(extra);
    replay.days[0]!.events.splice(2, 0, { kind: 'ORDER_ARRIVED', order_id: 'out-0', sequence: 2 });
    replay.days[0]!.end_state.open_out_brl = '70';
    replay.days[1]!.end_state.open_out_brl = '70';

    const state = replayStateAt(replay, 1);
    expect(sortOpenOrders(state.openOrders, 'ARRIVAL').map((order) => order.orderId)).toEqual(['out-0', 'out-1']);
    expect(sortOpenOrders(state.openOrders, 'EDF').map((order) => order.orderId)).toEqual(['out-0', 'out-1']);
    expect(nextClosingDay(replay, 0)).toBe(2);
    expect(nextClosingDay(replay, 2)).toBeNull();
  });

  it('falha fechado quando os saldos publicados não reconciliam', () => {
    const replay = replayDocumentFixture();
    replay.days[0]!.end_state.open_out_brl = '61';

    expect(() => replayStateAt(replay, 0)).toThrow(/não reconcilia/i);
  });
});
