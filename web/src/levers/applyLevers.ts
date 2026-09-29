import Decimal from 'decimal.js';

import type { FieldProvenance } from '../cases/domain';
import { groupOf } from '../pages/comparisonBoardBreakdown';
import type { CanonicalAuthoredOrder, OrderFieldProvenance } from '../study/model';

// Alavancas aplicadas às ordens de UMA empresa (prefixo do ID da operação).
// Ordem de aplicação: tirar ordens → volume → espaçamento → deslocamento → prazo.
export type Levers = Readonly<{
  group: string;
  removeCompany: boolean;
  removedOrderIds: readonly string[];
  volumeIn: string;
  volumeOut: string;
  spacingFactor: string;
  shiftDays: number;
  deadline: Readonly<{ mode: 'KEEP' }> | Readonly<{ mode: 'FIXED' | 'DELTA'; days: number }>;
}>;

export const NEUTRAL_LEVERS: Omit<Levers, 'group'> = {
  removeCompany: false, removedOrderIds: [], volumeIn: '1', volumeOut: '1', spacingFactor: '1', shiftDays: 0,
  deadline: { mode: 'KEEP' },
};

export type LeverResult = Readonly<{
  orders: CanonicalAuthoredOrder[];
  provenanceByOrder: Record<string, OrderFieldProvenance>;
  horizonDays: number;
}>;

function positiveFactor(value: string, label: string): Decimal {
  const parsed = /^\d+(?:\.\d+)?$/.test(value.trim()) ? new Decimal(value.trim()) : null;
  if (parsed === null || parsed.isNegative()) throw new Error(`${label}: use um número ≥ 0 com ponto decimal.`);
  return parsed;
}

export function describeLevers(levers: Levers): string {
  if (levers.removeCompany) return `sem ${levers.group}`;
  const parts: string[] = [];
  if (levers.removedOrderIds.length > 0) parts.push(`−${levers.removedOrderIds.length} ordem(ns)`);
  if (levers.volumeIn === levers.volumeOut && levers.volumeIn !== '1') parts.push(`volume ×${levers.volumeIn}`);
  else {
    if (levers.volumeIn !== '1') parts.push(`IN ×${levers.volumeIn}`);
    if (levers.volumeOut !== '1') parts.push(`OUT ×${levers.volumeOut}`);
  }
  if (levers.spacingFactor !== '1') parts.push(`espaçamento ×${levers.spacingFactor}`);
  if (levers.shiftDays !== 0) parts.push(`${levers.shiftDays > 0 ? '+' : ''}${levers.shiftDays} d`);
  if (levers.deadline.mode === 'FIXED') parts.push(`prazo ${levers.deadline.days} d`);
  if (levers.deadline.mode === 'DELTA' && levers.deadline.days !== 0) {
    parts.push(`prazo ${levers.deadline.days > 0 ? '+' : ''}${levers.deadline.days} d`);
  }
  return parts.length === 0 ? `${levers.group} sem mudança` : `${levers.group}: ${parts.join(', ')}`;
}

export function applyLevers(
  orders: readonly CanonicalAuthoredOrder[],
  provenanceByOrder: Readonly<Record<string, OrderFieldProvenance>>,
  levers: Levers,
  recordedAt: string,
  companyOf: (orderId: string) => string = groupOf,
): LeverResult {
  const volumeIn = positiveFactor(levers.volumeIn, 'Volume IN');
  const volumeOut = positiveFactor(levers.volumeOut, 'Volume OUT');
  const spacing = positiveFactor(levers.spacingFactor, 'Espaçamento');
  if (spacing.isZero()) throw new Error('Espaçamento precisa ser maior que zero.');
  if (!Number.isSafeInteger(levers.shiftDays)) throw new Error('Deslocamento precisa ser um número inteiro de dias.');
  if (levers.deadline.mode !== 'KEEP' && !Number.isSafeInteger(levers.deadline.days)) {
    throw new Error('Prazo precisa ser um número inteiro de dias.');
  }
  if (levers.deadline.mode === 'FIXED' && levers.deadline.days < 0) throw new Error('Prazo fixo não pode ser negativo.');
  const removed = new Set(levers.removedOrderIds);
  const lever: FieldProvenance = {
    kind: 'USER_ESTIMATE', source: `alavanca: ${describeLevers(levers)}`, version: '1.0.0', recordedAt,
  };

  const nextOrders: CanonicalAuthoredOrder[] = [];
  const nextProvenance: Record<string, OrderFieldProvenance> = {};
  for (const order of orders) {
    const provenance = provenanceByOrder[order.id];
    if (provenance === undefined) throw new Error(`Proveniência ausente para ${order.id}.`);
    if (companyOf(order.id) !== levers.group) {
      nextOrders.push(structuredClone(order) as CanonicalAuthoredOrder);
      nextProvenance[order.id] = structuredClone(provenance);
      continue;
    }
    if (levers.removeCompany || removed.has(order.id)) continue;

    const factor = order.direcao === 'IN' ? volumeIn : volumeOut;
    if (factor.isZero()) continue;
    const value = new Decimal(order.valor_brl).times(factor).toDecimalPlaces(2);
    const term = order.dia_limite - order.dia_conhecida;
    let known = spacing.equals(1) ? order.dia_conhecida : new Decimal(order.dia_conhecida).times(spacing).round().toNumber();
    let deadline = known + term;
    known += levers.shiftDays;
    deadline += levers.shiftDays;
    if (levers.deadline.mode === 'FIXED') deadline = known + levers.deadline.days;
    if (levers.deadline.mode === 'DELTA') deadline += levers.deadline.days;
    if (known < 0) { deadline -= known; known = 0; }
    if (deadline < known) deadline = known;

    const next = { ...structuredClone(order), valor_brl: factor.equals(1) ? order.valor_brl : value.toFixed(2), dia_conhecida: known, dia_limite: deadline } as CanonicalAuthoredOrder;
    const fields: OrderFieldProvenance = {
      ...structuredClone(provenance),
      ...(next.valor_brl !== order.valor_brl ? { valor_brl: lever } : {}),
      ...(known !== order.dia_conhecida ? { dia_conhecida: lever } : {}),
      ...(deadline !== order.dia_limite ? { dia_limite: lever } : {}),
    };
    nextOrders.push(next);
    nextProvenance[order.id] = fields;
  }
  if (nextOrders.length === 0) throw new Error('A variação ficou sem nenhuma ordem.');
  return {
    orders: nextOrders,
    provenanceByOrder: nextProvenance,
    horizonDays: Math.max(...nextOrders.map((order) => order.dia_limite)) + 1,
  };
}
