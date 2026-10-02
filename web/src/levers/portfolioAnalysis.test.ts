import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { collectPortfolioMetrics } from './portfolioAnalysis';
import { addPortfolioFixture, measuredStudyFixture, periodicWaitingStudyFixture, publishedSingletonWaitingStudyFixture } from './testFixtures';

describe('portfolio metrics', () => {
  it('reads a 255-scenario execution history in one pass while preserving candidate order', async () => {
    const { study, base } = await measuredStudyFixture();
    for (let index = 1; index < 255; index += 1) {
      const scenario = structuredClone(study.scenarios[0]!);
      scenario.id = `composition-${index}`;
      scenario.name = `Composition ${index}`;
      study.scenarios.push(scenario);
      const execution = structuredClone(base);
      execution.id = `execution-${index}`;
      execution.scenarioId = scenario.id;
      study.executions.push(execution);
    }
    let reads = 0;
    study.executions = new Proxy(study.executions, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const result = collectPortfolioMetrics(study);

    expect(result.candidates.map(row => row.scenarioId)).toEqual(study.scenarios.map(row => row.id));
    expect(result.excluded).toEqual([]);
    expect(reads).toBeLessThan(1020);
  });
  it('ignores obsolete combinations on direct opening without hiding ordinary-study scenarios', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    addPortfolioFixture(study, base, 'old-A', ['A-out'], '5');
    study.scenarios.find(row => row.id === 'old-A')!.premises.windowDays += 1;
    study.studyType = 'PORTFOLIO_COMBINATIONS';
    const current = collectPortfolioMetrics(study);
    expect(current.preparedCount).toBe(3);
    expect(current.excluded).toEqual([]);
    expect(current.candidates.map(row => row.scenarioId)).not.toContain('old-A');
    expect(current.complete).toBe(true);
    delete study.studyType;
    expect(collectPortfolioMetrics(study).preparedCount).toBe(4);
  });
  it('uses period money and allocation-weighted waiting, not full-horizon totals', async () => {
    const { study } = await measuredStudyFixture();
    const row = collectPortfolioMetrics(study).candidates[0]!;
    expect(row).toMatchObject({ savings: '10', volume: '400', baseline: '20', netted: '10', weightedWait: '150', waitP95Days: 2 });
    expect(row.costDelta.iof).toBe('10');
  });
  it('requires all unique subsets for complete coverage', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'A-copy', ['A-out'], '5');
    expect(collectPortfolioMetrics(study).complete).toBe(false);
    addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    expect(collectPortfolioMetrics(study).complete).toBe(true);
  });
  it('excludes missing allocations and stale executions without synthesizing zero', async () => {
    const { study, base } = await measuredStudyFixture();
    const a = addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    a.envelope!.selected_execution.result.agregado.execucao_completa.ciclos[0]!.alocacoes.pop();
    const b = addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    b.scenarioRevision = 0;
    const result = collectPortfolioMetrics(study);
    expect(result.candidates).toHaveLength(1);
    expect(result.excluded).toHaveLength(2);
  });
  it('keeps distinct IDs for companies with the same name', async () => {
    const { study, base } = await measuredStudyFixture();
    base.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'test', definition: {
      kind: 'EXPLICIT_ORDERS', orders: base.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'A-out': { companyId: 'id-a', companyName: 'Igual' }, 'B-in': { companyId: 'id-b', companyName: 'Igual' } },
    } };
    expect(collectPortfolioMetrics(study).candidates[0]!.companyIds).toEqual(['id-a', 'id-b']);
  });
  it('keeps baseline zero available for absolute objectives', async () => {
    const { study, base } = await measuredStudyFixture();
    const a = base.envelope!.selected_execution.result.agregado;
    a.baseline_periodo.total = '0'; a.baseline_periodo.iof = '0'; a.economia_periodo_brl = '-10';
    expect(collectPortfolioMetrics(study).candidates[0]!.baseline).toBe('0');
  });
  it('excludes partial companies rather than claiming their subset was evaluated', async () => {
    const { study, base } = await measuredStudyFixture();
    base.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'test', definition: {
      kind: 'EXPLICIT_ORDERS', orders: base.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'A-out': { companyId: 'one', companyName: 'One' }, 'B-in': { companyId: 'one', companyName: 'One' } },
    } };
    addPortfolioFixture(study, base, 'partial', ['A-out'], '5');
    const result = collectPortfolioMetrics(study);
    expect(result.candidates).toHaveLength(1);
    expect(result.excluded[0]).toMatchObject({ scenarioId: 'partial', reason: expect.stringMatching(/empresa/) });
  });
  it('counts companies outside the measured period without adding their volume or waiting', async () => {
    const { study, base } = await measuredStudyFixture();
    const a = base.envelope!.selected_execution.result.agregado;
    a.ids_ordens_medidas = ['A-out'];
    a.volume_bruto_periodo_brl = '100';
    const row = collectPortfolioMetrics(study).candidates[0]!;
    expect(row).toMatchObject({ companyIds: ['A', 'B'], companyNames: ['A', 'B'], volume: '100', weightedWait: '150', waitP95Days: 2, companyIdentitySource: 'LEGACY' });
  });
  it('includes resolution after the measurement window in weighted waiting and P95', async () => {
    const { study, base } = await measuredStudyFixture();
    const a = base.envelope!.selected_execution.result.agregado;
    a.execucao_completa.ciclos[0]!.alocacoes[1]!.dia = 10;
    expect(collectPortfolioMetrics(study).candidates[0]).toMatchObject({ weightedWait: '550', waitP95Days: 10 });
  });
  it('uses the first wait reaching exactly 95 percent of volume without interpolation', async () => {
    const { study, base } = await measuredStudyFixture();
    const a = base.envelope!.selected_execution.result.agregado;
    a.execucao_completa.ciclos[0]!.alocacoes[0]!.valor_brl = '80';
    a.execucao_completa.ciclos[0]!.alocacoes[1]!.valor_brl = '20';
    expect(collectPortfolioMetrics(study).candidates[0]!.waitP95Days).toBe(1);
  });
  it('conserves long decimals exactly without changing global Decimal precision', async () => {
    const { study, base } = await measuredStudyFixture();
    const envelope = base.envelope!.selected_execution;
    envelope.input_snapshot.cenario.ordens[0]!.valor_brl = '100.0000000000000000000000000000000000000001';
    const a = envelope.result.agregado;
    a.execucao_completa.ciclos[0]!.alocacoes[0]!.valor_brl = '50.0000000000000000000000000000000000000001';
    a.volume_bruto_periodo_brl = '400.0000000000000000000000000000000000000001';
    a.baseline_periodo.iof = '20.0000000000000000000000000000000000000001';
    a.baseline_periodo.total = a.baseline_periodo.iof;
    a.economia_periodo_brl = '10.0000000000000000000000000000000000000001';
    const precision = Decimal.precision;
    const row = collectPortfolioMetrics(study).candidates[0]!;
    expect(row.weightedWait).toBe('150.0000000000000000000000000000000000000001');
    expect(row.costDelta.iof).toBe('10.0000000000000000000000000000000000000001');
    expect(Decimal.precision).toBe(precision);
  });
  it.each(['NaN', 'Infinity', 'invalid'])('excludes invalid financial value %s without throwing or returning zero', async (value) => {
    const { study, base } = await measuredStudyFixture();
    base.envelope!.selected_execution.result.agregado.baseline_periodo.iof = value;
    const result = collectPortfolioMetrics(study);
    expect(result.candidates).toEqual([]);
    expect(result.excluded).toHaveLength(1);
    expect(result.complete).toBe(false);
  });
  it('does not count an invalid subset toward complete coverage and never mutates the study', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'B', ['B-in'], '3').scenarioRevision = 0;
    const before = structuredClone(study);
    const result = collectPortfolioMetrics(study);
    expect(result).toMatchObject({ preparedCount: 3, complete: false });
    expect(study).toEqual(before);
  });
  it.each(['negative baseline', 'negative netted', 'negative baseline component', 'negative netted component', 'netability', 'matched volume'])('excludes invalid %s instead of recommending its result', async (field) => {
    const { study, base } = await measuredStudyFixture();
    const a = base.envelope!.selected_execution.result.agregado;
    if (field === 'negative baseline') a.baseline_periodo.total = '-1';
    if (field === 'negative netted') a.netado_periodo.total = '-1';
    if (field === 'negative baseline component') a.baseline_periodo.carry = '-1';
    if (field === 'negative netted component') a.netado_periodo.spread = '-1';
    if (field === 'netability') a.taxa_netabilidade_periodo = '1';
    if (field === 'matched volume') {
      a.volume_casado_periodo_brl = '100';
      a.taxa_netabilidade_periodo = '0.25';
    }
    const result = collectPortfolioMetrics(study);
    expect(result.candidates).toEqual([]);
    expect(result.excluded).toHaveLength(1);
    expect(result.complete).toBe(false);
  });
  it('preserves authoritative totals and savings with independent legacy rounding residues', async () => {
    const { study } = await periodicWaitingStudyFixture();
    const result = collectPortfolioMetrics(study);
    expect(result.excluded).toEqual([]);
    const row = result.candidates[0]!;
    expect(row).toMatchObject({ baseline: '280.2625', netted: '40.26537671232876712328767123', savings: '239.9971232876712328767123288' });
    expect(row.costDelta).toEqual({ iof: '0', carry: '0', spread: '0', espera: '-0.002876712328767123287671232877', fixo: '240' });
    const Exact = Decimal.clone({ precision: 100 });
    const componentDelta = Object.values(row.costDelta).reduce((sum, value) => sum.plus(value), new Exact(0));
    // Legitimate independently propagated residues; not a financial inconsistency.
    expect(new Exact(row.savings).minus(componentDelta).toFixed()).toBe('0.000000000000000000000000032877');
    expect(new Exact(row.savings).minus(new Exact(row.baseline).minus(row.netted)).toFixed()).toBe('0.00000000000000000000000003');
  });
  it('accepts a singleton rounding residue admitted by the real adapter publication gate', async () => {
    const { study } = await publishedSingletonWaitingStudyFixture();
    const result = collectPortfolioMetrics(study);
    expect(result.excluded).toEqual([]);
    const row = result.candidates[0]!;
    expect(row).toMatchObject({ volume: '1', weightedWait: '1', waitP95Days: 1,
      baseline: '40.0375', netted: '40.03791095890410958904109589', savings: '-0.00041095890410958904109589' });
    expect(row.costDelta).toEqual({ iof: '0', carry: '0', spread: '0', espera: '-0.000410958904109589041095890411', fixo: '0' });
    const Exact = Decimal.clone({ precision: 100 });
    expect(new Exact(row.savings).minus(row.costDelta.espera).toFixed()).toBe('0.000000000000000000000000000411');
  });
  it('accepts the backend rounded ratio for a repeating netability fraction', async () => {
    const { study, base } = await measuredStudyFixture();
    const envelope = base.envelope!.selected_execution;
    envelope.input_snapshot.cenario.ordens[1]!.valor_brl = '50';
    const a = envelope.result.agregado;
    const allocations = a.execucao_completa.ciclos[0]!.alocacoes;
    allocations[0]!.tipo = 'CASADO';
    allocations[0]!.origem_casamento = 'INTER_CLIENTE';
    allocations[2]!.valor_brl = '50';
    a.volume_bruto_periodo_brl = '150';
    a.volume_casado_periodo_brl = '50';
    a.taxa_netabilidade_periodo = '0.3333333333333333333333333333';
    expect(collectPortfolioMetrics(study).candidates[0]).toMatchObject({ volume: '150', matchedVolume: '50', netability: '0.3333333333333333333333333333' });
    a.taxa_netabilidade_periodo = '0.3333333333333333333333333334';
    expect(collectPortfolioMetrics(study).candidates).toEqual([]);
  });
  it('excludes an ambiguous registered-ID/legacy-name collision and its comparisons', async () => {
    const { study, base } = await measuredStudyFixture();
    base.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'test', definition: {
      kind: 'EXPLICIT_ORDERS', orders: base.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'B-in': { companyId: 'A', companyName: 'Registered B' } },
    } };
    addPortfolioFixture(study, base, 'registered-only', ['B-in'], '3');
    const result = collectPortfolioMetrics(study);
    expect(result.candidates).toEqual([]);
    expect(result.excluded).toHaveLength(2);
    expect(result.excluded[0]!.reason).toMatch(/identifica|ambígua/);
    expect(result.complete).toBe(false);
  });
  it('preserves unambiguous mixed identities and complete subset coverage', async () => {
    const { study, base } = await measuredStudyFixture();
    base.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'test', definition: {
      kind: 'EXPLICIT_ORDERS', orders: base.sourceSnapshot.orders, provenanceByOrder: {},
      companyByOrder: { 'B-in': { companyId: 'id-b', companyName: 'Registered B' } },
    } };
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    const result = collectPortfolioMetrics(study);
    expect(result.candidates[0]).toMatchObject({ companyIds: ['A', 'id-b'], companyNames: ['A', 'Registered B'], companyIdentitySource: 'MIXED' });
    expect(result.complete).toBe(true);
  });
});
