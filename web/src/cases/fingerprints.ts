import Decimal from 'decimal.js';

import type { ObservedMetricCode } from './domain';
import type { PreviewEnvelope } from '../study/model';

const FinancialDecimal = Decimal.clone({ precision: 40 });

export type ObservedMetricCompatibility = Readonly<{
  code: ObservedMetricCode;
  label: string;
  canonicalPath: string;
  unit: 'BRL';
  definitionVersion: '1.0.0';
  readMotorValue(envelope: PreviewEnvelope): string;
}>;

function sum(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new FinancialDecimal(0)).toString();
}

function gross(direction: 'OUT' | 'IN') {
  return (envelope: PreviewEnvelope) => {
    const measuredOrderIds = new Set(envelope.result.agregado.ids_ordens_medidas);
    return sum(envelope.input_snapshot.cenario.ordens
      .filter((order) => measuredOrderIds.has(order.id))
      .filter((order) => order.direcao === direction)
      .map((order) => order.valor_brl));
  };
}

function remitted(direction: 'OUT' | 'IN') {
  return (envelope: PreviewEnvelope) => {
    const measuredOrderIds = new Set(envelope.result.agregado.ids_ordens_medidas);
    const directionByOrder = new Map(
      envelope.input_snapshot.cenario.ordens
        .filter((order) => measuredOrderIds.has(order.id))
        .map((order) => [order.id, order.direcao]),
    );
    return sum(envelope.result.agregado.execucao_completa.ciclos.flatMap((cycle) =>
      cycle.alocacoes
        .filter((allocation) => allocation.tipo === 'REMETIDO'
          && directionByOrder.get(allocation.ordem_id) === direction)
        .map((allocation) => allocation.valor_brl)));
  };
}

export const OBSERVED_METRIC_COMPATIBILITY: readonly ObservedMetricCompatibility[] = [
  {
    code: 'GROSS_OUT_BRL', label: 'Volume bruto OUT',
    canonicalPath: '/input_snapshot/cenario/ordens[direcao=OUT]/valor_brl:soma',
    unit: 'BRL', definitionVersion: '1.0.0', readMotorValue: gross('OUT'),
  },
  {
    code: 'GROSS_IN_BRL', label: 'Volume bruto IN',
    canonicalPath: '/input_snapshot/cenario/ordens[direcao=IN]/valor_brl:soma',
    unit: 'BRL', definitionVersion: '1.0.0', readMotorValue: gross('IN'),
  },
  {
    code: 'MATCHED_BRL', label: 'Volume casado',
    canonicalPath: '/result/agregado/volume_casado_periodo_brl',
    unit: 'BRL', definitionVersion: '1.0.0',
    readMotorValue: (envelope) => envelope.result.agregado.volume_casado_periodo_brl,
  },
  {
    code: 'REMITTED_OUT_BRL', label: 'Volume remetido OUT',
    canonicalPath: '/result/agregado/execucao_completa/ciclos/alocacoes[tipo=REMETIDO,direcao=OUT]/valor_brl:soma',
    unit: 'BRL', definitionVersion: '1.0.0', readMotorValue: remitted('OUT'),
  },
  {
    code: 'REMITTED_IN_BRL', label: 'Volume remetido IN',
    canonicalPath: '/result/agregado/execucao_completa/ciclos/alocacoes[tipo=REMETIDO,direcao=IN]/valor_brl:soma',
    unit: 'BRL', definitionVersion: '1.0.0', readMotorValue: remitted('IN'),
  },
  {
    code: 'TOTAL_COST_BRL', label: 'Custo total',
    canonicalPath: '/result/agregado/netado_periodo/total',
    unit: 'BRL', definitionVersion: '1.0.0',
    readMotorValue: (envelope) => envelope.result.agregado.netado_periodo.total,
  },
] as const;
