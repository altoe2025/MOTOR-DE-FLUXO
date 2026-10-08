import { describe, expect, it } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import type { DeepMutable, DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { recommendPortfolios } from './portfolioRecommendation';

type MutableExecution = DeepMutable<DiagnosticExecutionRecord>;

async function fixture() {
  const input = await observedInput();
  input.study.executions = [input.execution];
  const envelope = input.execution.envelope!.selected_execution;
  const orders = envelope.input_snapshot.cenario.ordens;
  orders[0]!.id = 'A-out';
  orders[0]!.valor_brl = '100';
  orders[1]!.id = 'B-in';
  orders[1]!.valor_brl = '300';
  input.execution.sourceSnapshot.orders = structuredClone(orders);
  input.study.scenarios[0]!.sourceSnapshot.orders = structuredClone(orders);
  const sampling = input.execution.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') sampling.preview_request.cenario.ordens = structuredClone(orders);
  const aggregate = envelope.result.agregado;
  aggregate.ids_ordens_medidas = orders.map((order) => order.id);
  aggregate.volume_bruto_periodo_brl = '400';
  aggregate.economia_periodo_brl = '10';
  aggregate.execucao_completa.ciclos = [{ ...aggregate.execucao_completa.ciclos[0]!, alocacoes: [
    { ordem_id: 'A-out', dia: 1, valor_brl: '50', tipo: 'REMETIDO', origem_casamento: null },
    { ordem_id: 'A-out', dia: 2, valor_brl: '50', tipo: 'REMETIDO', origem_casamento: null },
    { ordem_id: 'B-in', dia: 0, valor_brl: '300', tipo: 'REMETIDO', origem_casamento: null },
  ] }];
  return { study: input.study, base: input.execution };
}

function variation(study: DeepMutable<StudyDocument>, base: MutableExecution, id: string, kept: string[], savings: string) {
  const execution = structuredClone(base);
  execution.id = `${id}-execution`;
  execution.scenarioId = id;
  const envelope = execution.envelope!.selected_execution;
  envelope.scenario_id = id;
  const orders = envelope.input_snapshot.cenario.ordens.filter((order) => kept.includes(order.id));
  envelope.input_snapshot.cenario.ordens = orders;
  execution.sourceSnapshot.orders = structuredClone(orders);
  const sampling = execution.requestSnapshot.sampling;
  if (sampling.kind === 'FIXED_INPUT') sampling.preview_request.cenario.ordens = structuredClone(orders);
  const aggregate = envelope.result.agregado;
  aggregate.ids_ordens_medidas = kept;
  aggregate.volume_bruto_periodo_brl = String(orders.reduce((sum, order) => sum + Number(order.valor_brl), 0));
  aggregate.economia_periodo_brl = savings;
  aggregate.execucao_completa.ciclos.forEach((cycle) => {
    cycle.alocacoes = cycle.alocacoes.filter((allocation) => kept.includes(allocation.ordem_id));
  });
  study.scenarios.push({ ...structuredClone(study.scenarios[0]!), id, name: id,
    sourceSnapshot: structuredClone(execution.sourceSnapshot) });
  study.executions.push(execution);
  return execution;
}

describe('recommendPortfolios', () => {
  it('ranks absolute savings with decimal precision and preserves study order on ties', async () => {
    const { study, base } = await fixture();
    variation(study, base, 'higher', ['B-in'], '10.000000000000000001');
    variation(study, base, 'tie', ['A-out'], '10');
    const result = recommendPortfolios(study, null);
    expect(result.winner?.scenarioId).toBe('higher');
    expect(result.candidates.map((candidate) => candidate.scenarioId)).toEqual(['higher', study.baseScenarioId, 'tie']);
    expect(result.winner).toMatchObject({ companies: ['B'], savings: '10.000000000000000001', volume: '300' });
  });

  it('measures waiting by allocation volume and applies the inclusive limit before choosing', async () => {
    const { study, base } = await fixture();
    variation(study, base, 'slow', ['A-out'], '30');
    const result = recommendPortfolios(study, 0.375);
    expect(result.candidates.find((candidate) => candidate.scenarioId === study.baseScenarioId)?.waitDays).toBe(0.375);
    expect(result.candidates.find((candidate) => candidate.scenarioId === 'slow')).toMatchObject({ waitDays: 1.5, eligible: false });
    expect(result.winner?.scenarioId).toBe(study.baseScenarioId);
    expect(recommendPortfolios(study, 0.374).winner).toBeNull();
  });

  it('does not use edited source snapshots to calculate volumes or waiting', async () => {
    const { study, base } = await fixture();
    study.scenarios[0]!.sourceSnapshot.orders[0]!.valor_brl = '999999';
    base.sourceSnapshot.orders[0]!.valor_brl = '999999';
    expect(recommendPortfolios(study, null).winner).toMatchObject({ volume: '400', waitDays: 0.375 });
  });

  it('excludes stale, missing, and regenerated diagnostics with useful reasons', async () => {
    const { study, base } = await fixture();
    const stale = variation(study, base, 'stale', ['A-out'], '50');
    stale.scenarioRevision = 0;
    variation(study, base, 'missing', ['A-out'], '50').envelope = null;
    const generated = variation(study, base, 'generated', ['A-out'], '50');
    Object.assign(generated.requestSnapshot.sampling, { kind: 'GENERATED_INPUT' });
    const result = recommendPortfolios(study, null);
    expect(result.candidates).toHaveLength(1);
    expect(result.excluded.map((item) => item.reason).join(' ')).toMatch(/desatualizado/);
    expect(result.excluded.map((item) => item.reason).join(' ')).toMatch(/diagnóstico/);
    expect(result.excluded.map((item) => item.reason).join(' ')).toMatch(/regenerad/);
  });

  it.each(['cost', 'window', 'horizon', 'calendar', 'order', 'company', 'engine'])('excludes a changed %s instead of attributing its effect to composition', async (field) => {
    const { study, base } = await fixture();
    const changed = variation(study, base, 'changed', ['A-out'], '50');
    const envelope = changed.envelope!.selected_execution;
    if (field === 'cost') envelope.input_snapshot.cenario.custo.iof_out = '0.035';
    if (field === 'window') envelope.input_snapshot.cenario.janela_dias += 1;
    if (field === 'horizon') envelope.input_snapshot.cenario.horizonte_dias += 1;
    if (field === 'calendar') envelope.input_snapshot.periodo = { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 3 };
    if (field === 'order') envelope.input_snapshot.cenario.ordens[0]!.dia_limite += 1;
    if (field === 'engine') envelope.motor_build_sha = 'another-build';
    if (field === 'company') changed.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'authored', definition: {
      kind: 'EXPLICIT_ORDERS', orders: changed.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'A-out': { companyId: 'another-company', companyName: 'Other' } },
    } };
    const result = recommendPortfolios(study, null);
    expect(result.excluded).toEqual([expect.objectContaining({ scenarioId: 'changed', reason: expect.any(String) })]);
    expect(result.winner?.scenarioId).toBe(study.baseScenarioId);
  });

  it('excludes partial removal of orders from a retained company', async () => {
    const { study, base } = await fixture();
    base.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'authored', definition: {
      kind: 'EXPLICIT_ORDERS', orders: base.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'A-out': { companyId: 'one', companyName: 'Same' }, 'B-in': { companyId: 'one', companyName: 'Same' } },
    } };
    variation(study, base, 'partial', ['A-out'], '100');
    const result = recommendPortfolios(study, null);
    expect(result.excluded[0]).toMatchObject({ scenarioId: 'partial' });
    expect(result.excluded[0]!.reason).toMatch(/empresa/);
  });

  it('does not recommend when the base has no current comparable execution', async () => {
    const { study, base } = await fixture();
    variation(study, base, 'solo', ['A-out'], '100');
    base.scenarioRevision = 0;
    expect(recommendPortfolios(study, null)).toMatchObject({ candidates: [], winner: null });
  });
});
