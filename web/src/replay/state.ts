import Decimal from 'decimal.js';

import type {
  OpenReplayOrder,
  ReplayAllocationEvent,
  ReplayDocument,
  ReplayPhase,
  ReplaySort,
  ReplayState,
  ReplayTransition,
} from './domain';
import { ReplayStateError } from './domain';

function decimal(value: string): Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new ReplayStateError(`Valor monetário inválido no replay: ${value}`);
  }
}

function decimalText(value: Decimal): string {
  if (value.isZero()) return '0';
  return value.toFixed().replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function phaseAt(document: ReplayDocument, day: number): ReplayPhase {
  if (day < document.period.measurement_start_day) return 'WARMUP';
  if (day <= document.period.measurement_end_day) return 'MEASUREMENT';
  return 'SETTLEMENT';
}

function assertDay(document: ReplayDocument, day: number): void {
  if (!Number.isInteger(day) || day < 0 || day > document.period.settlement_end_day) {
    throw new ReplayStateError(`Dia ${day} fora do período do replay.`);
  }
  if (document.days.length !== document.period.settlement_end_day + 1
      || document.days.some((item, index) => item.day !== index)) {
    throw new ReplayStateError('A linha do tempo do replay não é contínua.');
  }
}

function reconcile(label: string, actual: Decimal, published: string, day: number): void {
  if (!actual.equals(decimal(published))) {
    throw new ReplayStateError(`${label} não reconcilia no dia ${day}.`);
  }
}

export function replayStateAt(document: ReplayDocument, day: number): ReplayState {
  assertDay(document, day);
  const orders = new Map(document.orders.map((order) => [order.id, order]));
  const balances = new Map<string, Decimal>();
  let matchedPosition = new Decimal(0);
  let measuredMatchedContribution = new Decimal(0);
  let remittedOut = new Decimal(0);
  let remittedIn = new Decimal(0);

  for (const replayDay of document.days.slice(0, day + 1)) {
    for (const event of [...replayDay.events].sort((left, right) => left.sequence - right.sequence)) {
      const order = orders.get(event.order_id);
      if (order === undefined) throw new ReplayStateError(`Evento referencia ordem inexistente: ${event.order_id}.`);
      if (event.kind === 'ORDER_ARRIVED') {
        if (balances.has(order.id)) throw new ReplayStateError(`Chegada duplicada da ordem ${order.id}.`);
        balances.set(order.id, decimal(order.value_brl));
        continue;
      }
      const current = balances.get(order.id);
      if (current === undefined) throw new ReplayStateError(`Alocação anterior à chegada da ordem ${order.id}.`);
      const value = decimal(event.value_brl);
      const next = current.minus(value);
      if (value.isNegative() || next.isNegative()) throw new ReplayStateError(`Saldo negativo na ordem ${order.id}.`);
      balances.set(order.id, next);
      if (event.allocation_type === 'CASADO' && order.cohort === 'MEASUREMENT') {
        measuredMatchedContribution = measuredMatchedContribution.plus(value);
      }
      if (event.allocation_type === 'REMETIDO') {
        if (event.direction === 'OUT') remittedOut = remittedOut.plus(value);
        else remittedIn = remittedIn.plus(value);
      }
    }
    if (replayDay.closing !== null) {
      matchedPosition = matchedPosition.plus(decimal(replayDay.closing.matched_position_brl));
    }
    const openOut = [...balances].reduce((sum, [orderId, value]) => (
      orders.get(orderId)?.direction === 'OUT' ? sum.plus(value) : sum
    ), new Decimal(0));
    const openIn = [...balances].reduce((sum, [orderId, value]) => (
      orders.get(orderId)?.direction === 'IN' ? sum.plus(value) : sum
    ), new Decimal(0));
    reconcile('Saldo OUT', openOut, replayDay.end_state.open_out_brl, replayDay.day);
    reconcile('Saldo IN', openIn, replayDay.end_state.open_in_brl, replayDay.day);
    reconcile('Posição casada acumulada', matchedPosition, replayDay.end_state.matched_position_accumulated_brl, replayDay.day);
    reconcile('Contribuição casada medida', measuredMatchedContribution, replayDay.end_state.measured_matched_contribution_accumulated_brl, replayDay.day);
    reconcile('Remetido OUT acumulado', remittedOut, replayDay.end_state.remitted_out_accumulated_brl, replayDay.day);
    reconcile('Remetido IN acumulado', remittedIn, replayDay.end_state.remitted_in_accumulated_brl, replayDay.day);
  }

  const openOrders = [...balances.entries()].flatMap(([orderId, value]): OpenReplayOrder[] => {
    if (value.isZero()) return [];
    const order = orders.get(orderId);
    if (order === undefined) return [];
    return [{
      orderId: order.id,
      clientId: order.client_id,
      direction: order.direction,
      cohort: order.cohort,
      knownDay: order.known_day,
      deadlineDay: order.deadline_day,
      originalValueBrl: order.value_brl,
      openValueBrl: decimalText(value),
    }];
  });
  const selectedDay = document.days[day]!;
  return Object.freeze({
    day,
    phase: phaseAt(document, day),
    openOrders: Object.freeze(openOrders),
    closing: selectedDay.closing,
    endState: selectedDay.end_state,
  });
}

export function sortOpenOrders(orders: readonly OpenReplayOrder[], sort: ReplaySort): readonly OpenReplayOrder[] {
  return [...orders].sort((left, right) => {
    if (sort === 'EDF') {
      const deadline = left.deadlineDay - right.deadlineDay;
      if (deadline !== 0) return deadline;
    } else {
      const arrival = left.knownDay - right.knownDay;
      if (arrival !== 0) return arrival;
    }
    return left.orderId.localeCompare(right.orderId);
  });
}

export function nextClosingDay(document: ReplayDocument, currentDay: number): number | null {
  return document.days.find((day) => day.day > currentDay && day.closing !== null)?.day ?? null;
}

export function replayTransition(document: ReplayDocument, fromDay: number, toDay: number): readonly ReplayTransition[] {
  if (toDay !== fromDay + 1) return [];
  assertDay(document, toDay);
  const day = document.days[toDay]!;
  const previous = fromDay >= 0 ? replayStateAt(document, fromDay) : null;
  const balances = new Map(previous?.openOrders.map((order) => [order.orderId, decimal(order.openValueBrl)]) ?? []);
  const orders = new Map(document.orders.map((order) => [order.id, order]));
  const transitions: ReplayTransition[] = [];
  const events = [...day.events].sort((left, right) => left.sequence - right.sequence);
  for (const event of events) {
    if (event.kind !== 'ORDER_ARRIVED') continue;
    const order = orders.get(event.order_id);
    if (order === undefined) throw new ReplayStateError(`Evento referencia ordem inexistente: ${event.order_id}.`);
    balances.set(order.id, decimal(order.value_brl));
    transitions.push({ kind: 'ARRIVAL', day: toDay, orderId: order.id });
  }
  if (day.closing !== null) {
    transitions.push({ kind: 'CLOSING', day: toDay, triggers: day.closing.triggers });
    for (const segment of day.closing.flow_segments) transitions.push({ kind: 'FLOW_SEGMENT', day: toDay, segment });
  }
  const settled = new Set<string>();
  for (const event of events.filter((item): item is ReplayAllocationEvent => item.kind === 'ALLOCATION')) {
    const current = balances.get(event.order_id);
    if (current === undefined) throw new ReplayStateError(`Alocação anterior à chegada da ordem ${event.order_id}.`);
    const next = current.minus(decimal(event.value_brl));
    balances.set(event.order_id, next);
    transitions.push({ kind: 'BALANCE_UPDATED', day: toDay, orderId: event.order_id, openValueBrl: decimalText(next) });
    if (event.allocation_type === 'REMETIDO') {
      transitions.push({ kind: 'REMITTANCE', day: toDay, orderId: event.order_id, direction: event.direction, valueBrl: event.value_brl });
    }
    if (next.isZero() && !settled.has(event.order_id)) {
      settled.add(event.order_id);
      transitions.push({ kind: 'ORDER_SETTLED', day: toDay, orderId: event.order_id });
    }
  }
  replayStateAt(document, toDay);
  return Object.freeze(transitions);
}
