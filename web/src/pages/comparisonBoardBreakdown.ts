import Decimal from 'decimal.js';

import type { CanonicalAuthoredOrder, CostPremises, PreviewEnvelope } from '../study/model';

// Reparte o resultado agregado do motor por empresa. A empresa de uma ordem é o
// prefixo do ID da operação antes do primeiro hífen (AP-…, X-…, Y-…), porque o
// nome do cliente não fica salvo depois da importação.
//
// IOF, carry e espera são exatos por alocação, como em motor/custo.py. Spread e custo fixo
// do netado são cobrados por remessa agregada, sem dono; aqui são repartidos na
// proporção do volume REMETIDO de cada empresa.

export type CompanyBreakdown = Readonly<{
  group: string;
  volume: string;
  matchedOwn: string;
  matchedOthers: string;
  remitted: string;
  baseline: string;
  netted: string;
  savings: string;
}>;

export type Breakdown = Readonly<{
  companies: readonly CompanyBreakdown[];
  reconciled: boolean;
}>;

const BPS = new Decimal(10000);
const TOLERANCE = new Decimal('0.05');

export function groupOf(orderId: string): string {
  const prefix = orderId.split('-')[0]?.trim();
  return prefix === undefined || prefix === '' ? orderId : prefix.toUpperCase();
}

function iofRate(costs: CostPremises, order: CanonicalAuthoredOrder): Decimal {
  const rule = costs.iof_por_finalidade.find((item) =>
    item.finalidade === order.finalidade && item.direcao === order.direcao);
  if (rule !== undefined) return new Decimal(rule.aliquota);
  return new Decimal(order.direcao === 'OUT' ? costs.iof_out : costs.iof_in);
}

type Accumulator = {
  volume: Decimal; matchedOwn: Decimal; matchedOthers: Decimal; remitted: Decimal;
  baseline: Decimal; nettedExact: Decimal;
};

export function breakdownByCompany(
  envelope: PreviewEnvelope,
  companyOf: (orderId: string) => string = groupOf,
): Breakdown {
  const { ordens: orders, custo: costs } = envelope.input_snapshot.cenario;
  const aggregate = envelope.result.agregado;
  const measured = new Set(aggregate.ids_ordens_medidas);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const groups = new Map<string, Accumulator>();
  const bucket = (orderId: string) => {
    const key = companyOf(orderId);
    let value = groups.get(key);
    if (value === undefined) {
      value = { volume: new Decimal(0), matchedOwn: new Decimal(0), matchedOthers: new Decimal(0),
        remitted: new Decimal(0), baseline: new Decimal(0), nettedExact: new Decimal(0) };
      groups.set(key, value);
    }
    return value;
  };

  let baselineTotal = new Decimal(0);
  for (const order of orders) {
    if (!measured.has(order.id)) continue;
    const value = new Decimal(order.valor_brl);
    const cost = value.times(iofRate(costs, order))
      .plus(value.times(costs.spread_rail_bps).div(BPS))
      .plus(costs.custo_fixo_remessa);
    const target = bucket(order.id);
    target.volume = target.volume.plus(value);
    target.baseline = target.baseline.plus(cost);
    baselineTotal = baselineTotal.plus(cost);
  }

  let exactTotal = new Decimal(0);
  let remittedTotal = new Decimal(0);
  for (const cycle of aggregate.execucao_completa.ciclos) {
    for (const allocation of cycle.alocacoes) {
      const order = orderById.get(allocation.ordem_id);
      if (order === undefined || !measured.has(order.id)) continue;
      const value = new Decimal(allocation.valor_brl);
      const target = bucket(order.id);
      const wait = value.times(allocation.dia - order.dia_conhecida)
        .times(costs.custo_oportunidade_aa).div(365);
      target.nettedExact = target.nettedExact.plus(wait);
      exactTotal = exactTotal.plus(wait);
      if (allocation.tipo === 'REMETIDO') {
        const iof = value.times(iofRate(costs, order));
        target.remitted = target.remitted.plus(value);
        target.nettedExact = target.nettedExact.plus(iof);
        exactTotal = exactTotal.plus(iof);
        remittedTotal = remittedTotal.plus(value);
      } else {
        const carry = value.times(costs.carry_cnr);
        if (allocation.origem_casamento === 'INTRA_CLIENTE') target.matchedOwn = target.matchedOwn.plus(value);
        else target.matchedOthers = target.matchedOthers.plus(value);
        target.nettedExact = target.nettedExact.plus(carry);
        exactTotal = exactTotal.plus(carry);
      }
    }
  }

  const nettedTotal = new Decimal(aggregate.netado_periodo.total);
  const shared = nettedTotal.minus(exactTotal);
  const companies = [...groups.entries()].map(([group, value]) => {
    const share = remittedTotal.isZero() ? new Decimal(0) : shared.times(value.remitted).div(remittedTotal);
    const netted = value.nettedExact.plus(share);
    return {
      group,
      volume: value.volume.toFixed(),
      matchedOwn: value.matchedOwn.toFixed(),
      matchedOthers: value.matchedOthers.toFixed(),
      remitted: value.remitted.toFixed(),
      baseline: value.baseline.toFixed(),
      netted: netted.toFixed(),
      savings: value.baseline.minus(netted).toFixed(),
    };
  }).sort((left, right) => left.group.localeCompare(right.group));

  const reconciled = baselineTotal.minus(aggregate.baseline_periodo.total).abs().lte(TOLERANCE)
    && shared.gte(TOLERANCE.negated())
    && (remittedTotal.isZero() ? shared.abs().lte(TOLERANCE) : true);
  return { companies, reconciled };
}
