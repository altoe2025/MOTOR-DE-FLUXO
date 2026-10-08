import Decimal from 'decimal.js';
import { observedInput } from '../communication/testFixtures';
import type { DeepMutable, DiagnosticExecutionRecord, StudyDocument } from '../study/model';

/** Test-only arithmetic fixtures; excluded from the production Docker context. */
export async function measuredStudyFixture() {
  const { study, execution: base } = await observedInput();
  study.executions = [base];
  const envelope = base.envelope!.selected_execution;
  const orders = envelope.input_snapshot.cenario.ordens.slice(0, 2);
  orders[0] = { ...orders[0]!, id: 'A-out', valor_brl: '100', dia_conhecida: 0 };
  orders[1] = { ...orders[1]!, id: 'B-in', valor_brl: '300', dia_conhecida: 0 };
  envelope.input_snapshot.cenario.ordens = orders;
  base.sourceSnapshot.orders = structuredClone(orders);
  const sampling = base.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') sampling.preview_request.cenario.ordens = structuredClone(orders);
  study.scenarios[0]!.sourceSnapshot.orders = structuredClone(orders);
  const aggregate = envelope.result.agregado;
  aggregate.ids_ordens_medidas = orders.map(order => order.id);
  aggregate.volume_bruto_periodo_brl = '400';
  aggregate.economia_periodo_brl = '10';
  aggregate.baseline_periodo = { iof: '20', carry: '0', spread: '0', espera: '0', fixo: '0', total: '20' };
  aggregate.netado_periodo = { iof: '10', carry: '0', spread: '0', espera: '0', fixo: '0', total: '10' };
  aggregate.volume_casado_periodo_brl = '0';
  aggregate.taxa_netabilidade_periodo = '0';
  aggregate.execucao_completa.ciclos = [{ ...aggregate.execucao_completa.ciclos[0]!, alocacoes: [
    { ordem_id: 'A-out', dia: 1, valor_brl: '50', tipo: 'REMETIDO', origem_casamento: null },
    { ordem_id: 'A-out', dia: 2, valor_brl: '50', tipo: 'REMETIDO', origem_casamento: null },
    { ordem_id: 'B-in', dia: 0, valor_brl: '300', tipo: 'REMETIDO', origem_casamento: null },
  ] }];
  return { study, base };
}

export function addPortfolioFixture(study: DeepMutable<StudyDocument>, base: DeepMutable<DiagnosticExecutionRecord>, id: string, kept: string[], savings: string) {
  const execution = structuredClone(base);
  execution.id = `${id}-execution`;
  execution.scenarioId = id;
  const envelope = execution.envelope!.selected_execution;
  envelope.scenario_id = id;
  envelope.input_snapshot.cenario.ordens = envelope.input_snapshot.cenario.ordens.filter(o => kept.includes(o.id));
  execution.sourceSnapshot.orders = structuredClone(envelope.input_snapshot.cenario.ordens);
  const sampling = execution.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') sampling.preview_request.cenario.ordens = structuredClone(execution.sourceSnapshot.orders);
  const a = envelope.result.agregado;
  a.ids_ordens_medidas = kept;
  const Exact = Decimal.clone({ precision: 200 });
  a.volume_bruto_periodo_brl = envelope.input_snapshot.cenario.ordens.reduce((sum, order) => sum.plus(order.valor_brl), new Exact(0)).toFixed();
  a.economia_periodo_brl = savings;
  a.baseline_periodo.total = '20';
  a.baseline_periodo.iof = '20';
  a.netado_periodo.total = new Exact(20).minus(savings).toFixed();
  a.netado_periodo.iof = a.netado_periodo.total;
  for (const c of a.execucao_completa.ciclos) c.alocacoes = c.alocacoes.filter(item => kept.includes(item.ordem_id));
  study.scenarios.push({ ...structuredClone(study.scenarios[0]!), id, name: id, sourceSnapshot: structuredClone(execution.sourceSnapshot) });
  study.executions.push(execution);
  return execution;
}

/**
 * Costs captured from simular using test_espera_periodica_preserva_custos_do_agregado
 * with 7 OUT orders of BRL 1, due day 1, opportunity cost 0.15/year (2026-09-30).
 * The legacy Decimal totals and savings are independently authoritative. This is
 * a faithful projection fixture, not a claim that the HTTP adapter publishes it:
 * that exact scenario currently fails the backend mechanism reconciliation gate.
 */
export async function periodicWaitingStudyFixture() {
  const { study, base } = await measuredStudyFixture();
  const envelope = base.envelope!.selected_execution;
  const orders = Array.from({ length: 7 }, (_, index) => ({
    ...envelope.input_snapshot.cenario.ordens[0]!,
    id: String(index), cliente_id: String(index % 3), direcao: 'OUT' as const,
    valor_brl: '1', dia_conhecida: 0, dia_limite: 1, eh_efx: false, finalidade: 'x',
  }));
  envelope.input_snapshot.cenario.ordens = orders;
  base.sourceSnapshot.orders = structuredClone(orders);
  study.scenarios[0]!.sourceSnapshot.orders = structuredClone(orders);
  const sampling = base.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') sampling.preview_request.cenario.ordens = structuredClone(orders);
  const aggregate = envelope.result.agregado;
  aggregate.ids_ordens_medidas = orders.map(order => order.id);
  aggregate.volume_bruto_periodo_brl = '7';
  aggregate.baseline_periodo = { iof: '0.245', carry: '0', spread: '0.0175', espera: '0', fixo: '280', total: '280.2625' };
  aggregate.netado_periodo = { iof: '0.245', carry: '0', spread: '0.0175', espera: '0.002876712328767123287671232877', fixo: '40', total: '40.26537671232876712328767123' };
  aggregate.economia_periodo_brl = '239.9971232876712328767123288';
  aggregate.execucao_completa.ciclos = [{ ...aggregate.execucao_completa.ciclos[0]!, alocacoes: orders.map(order => ({
    ordem_id: order.id, dia: 1, valor_brl: '1', tipo: 'REMETIDO', origem_casamento: null,
  })) }];
  return { study, base };
}

/**
 * Input and aggregate captured from executar_previa after the real publication
 * gate on 2026-09-30: one OUT of BRL 1, day 0 → 1, IOF .035, spread 25 bps,
 * fee 40, opportunity .15/year, window 1, horizon 10, LEGADO period.
 * Unlike the seven-order simulator fixture, this residue crossed the HTTP adapter.
 */
export async function publishedSingletonWaitingStudyFixture() {
  const { study, base } = await measuredStudyFixture();
  const envelope = base.envelope!.selected_execution;
  const order = { id: 'single-out', cliente_id: 'single', direcao: 'OUT' as const,
    valor_brl: '1', dia_conhecida: 0, dia_limite: 1, eh_efx: false, finalidade: 'x' };
  const costs = { iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25',
    custo_fixo_remessa: '40', custo_oportunidade_aa: '0.15', ptax: '5.4', iof_por_finalidade: [] };
  envelope.input_snapshot.cenario = { ordens: [order], janela_dias: 1, horizonte_dias: 10, custo: costs };
  envelope.input_snapshot.periodo = { modo: 'LEGADO' };
  base.sourceSnapshot.orders = [structuredClone(order)];
  study.scenarios[0]!.sourceSnapshot.orders = [structuredClone(order)];
  base.premisesSnapshot = { costs: structuredClone(costs), windowDays: 1 };
  study.scenarios[0]!.premises = structuredClone(base.premisesSnapshot);
  base.periodSnapshot = { httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: 10 };
  study.scenarios[0]!.period = structuredClone(base.periodSnapshot);
  const sampling = base.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') {
    sampling.preview_request.cenario = structuredClone(envelope.input_snapshot.cenario);
    sampling.preview_request.periodo = { modo: 'LEGADO' };
  }
  const baseline = { iof: '0.035', carry: '0', spread: '0.0025', espera: '0.00', fixo: '40', total: '40.0375' };
  const netted = { iof: '0.035', carry: '0', spread: '0.0025', espera: '0.0004109589041095890410958904110', fixo: '40', total: '40.03791095890410958904109589' };
  const savings = '-0.00041095890410958904109589';
  envelope.result.agregado = {
    execucao_completa: {
      ciclos: [
        { dia: 0, alocacoes: [], bruto_out: '1', bruto_in: '0', casado: '0', residuo: '0', direcao_residuo: 'OUT' },
        { dia: 1, alocacoes: [{ ordem_id: 'single-out', dia: 1, valor_brl: '1', tipo: 'REMETIDO', origem_casamento: null }],
          bruto_out: '1', bruto_in: '0', casado: '0', residuo: '1', direcao_residuo: 'OUT' },
      ],
      baseline: structuredClone(baseline), netado: structuredClone(netted), economia: savings,
      volume_casado_brl: '0', volume_autonetting_brl: '0', volume_netting_multilateral_brl: '0',
      taxa_netabilidade: '0', taxa_autonetting: '0', taxa_netting_multilateral: '0',
    },
    ids_ordens_medidas: ['single-out'], volume_bruto_periodo_brl: '1', volume_casado_periodo_brl: '0',
    volume_autonetting_periodo_brl: '0', volume_netting_multilateral_periodo_brl: '0', volume_remetido_periodo_brl: '1',
    baseline_periodo: baseline, netado_periodo: netted, economia_periodo_brl: savings,
    taxa_netabilidade_periodo: '0', taxa_autonetting_periodo: '0', taxa_netting_multilateral_periodo: '0',
    mecanismos: [
      { destino: 'INTRA_CLIENTE', volume_brl: '0', baseline_atribuido_brl: '0', custo_netado_brl: '0', economia_brl: '0' },
      { destino: 'INTER_CLIENTE', volume_brl: '0', baseline_atribuido_brl: '0', custo_netado_brl: '0', economia_brl: '0' },
      { destino: 'REMETIDO', volume_brl: '1', baseline_atribuido_brl: baseline.total, custo_netado_brl: netted.total, economia_brl: savings },
    ],
  };
  return { study, base };
}
