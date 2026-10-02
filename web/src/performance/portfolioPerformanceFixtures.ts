import { observedInput } from '../communication/testFixtures';
import { createStudy } from '../study/domain';
import { fingerprintPortfolioSource, fingerprintScenarioInput } from '../study/fingerprints';
import type {
  DeepMutable,
  DiagnosticExecutionRecord,
  OrderFieldProvenance,
  ScenarioDocument,
  StudyDocument,
} from '../study/model';

export type PortfolioPerformanceOptions = Readonly<{
  currentResultCount?: 0 | 63 | 255;
}>;

const RECORDED_AT = '2026-09-23T12:00:00Z';

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function companyId(index: number): string {
  return `company-${String(index + 1).padStart(2, '0')}`;
}

function companyName(index: number): string {
  return `Empresa ${String(index + 1).padStart(2, '0')}`;
}

function masksFor(companyCount: number): number[] {
  return Array.from({ length: (1 << companyCount) - 1 }, (_, index) => index + 1);
}

function companiesForMask(companyCount: number, mask: number): string[] {
  return Array.from({ length: companyCount }, (_, index) => index)
    .filter((index) => (mask & (1 << index)) !== 0)
    .map(companyId);
}

function ordersForMask(
  companyCount: number,
  mask: number,
  allOrders: readonly StudyDocument['scenarios'][number]['sourceSnapshot']['orders'][number][],
) {
  const included = new Set(companiesForMask(companyCount, mask));
  return allOrders.filter((order) => included.has(order.cliente_id));
}

async function scenarioForComposition(
  base: ScenarioDocument,
  companyCount: number,
  mask: number,
): Promise<ScenarioDocument> {
  const orders = ordersForMask(companyCount, mask, base.sourceSnapshot.orders);
  const orderIds = new Set(orders.map((order) => order.id));
  const source = base.sourceSnapshot.source;
  if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') {
    throw new Error('Performance fixture requires an explicit authored portfolio.');
  }
  const sourceSnapshot = structuredClone(base.sourceSnapshot) as DeepMutable<typeof base.sourceSnapshot>;
  sourceSnapshot.orders = structuredClone(orders);
  if (sourceSnapshot.source.kind !== 'AUTHORED' || sourceSnapshot.source.definition?.kind !== 'EXPLICIT_ORDERS') {
    throw new Error('Authored portfolio definition is missing.');
  }
  sourceSnapshot.source.definition.orders = structuredClone(orders);
  sourceSnapshot.source.definition.companyByOrder = Object.fromEntries(
    Object.entries(source.definition.companyByOrder ?? {}).filter(([id]) => orderIds.has(id)),
  );
  sourceSnapshot.source.definition.provenanceByOrder = Object.fromEntries(
    Object.entries(source.definition.provenanceByOrder).filter(([id]) => orderIds.has(id)),
  ) as Record<string, DeepMutable<OrderFieldProvenance>>;
  sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(sourceSnapshot);

  const id = mask === (1 << companyCount) - 1 ? base.id : uuid(100 + mask);
  const draft = {
    ...structuredClone(base),
    id,
    name: mask === (1 << companyCount) - 1
      ? 'Todas as empresas juntas'
      : companiesForMask(companyCount, mask).map((company) => companyName(Number(company.slice(-2)) - 1)).join(' + '),
    sourceSnapshot,
  } as DeepMutable<ScenarioDocument>;
  draft.inputFingerprint = await fingerprintScenarioInput(draft);
  return draft;
}

function executionForScenario(
  template: DiagnosticExecutionRecord,
  studyId: string,
  scenario: ScenarioDocument,
  companyCount: number,
  mask: number,
): DiagnosticExecutionRecord {
  const execution = structuredClone(template) as DeepMutable<DiagnosticExecutionRecord>;
  const source = execution.envelope!.selected_execution;
  const orders = ordersForMask(companyCount, mask, scenario.sourceSnapshot.orders);
  const orderIds = orders.map((order) => order.id);
  const volume = String(orders.length * 100);
  const savings = String(mask);
  const baselineTotal = '1000';
  const nettedTotal = String(1000 - mask);
  const baseline = { iof: baselineTotal, carry: '0', spread: '0', espera: '0', fixo: '0', total: baselineTotal };
  const netted = { ...baseline, iof: nettedTotal, total: nettedTotal };

  execution.id = uuid(1000 + mask);
  execution.attemptId = uuid(2000 + mask);
  execution.scenarioId = scenario.id;
  execution.scenarioRevision = scenario.revision;
  execution.inputFingerprint = scenario.inputFingerprint;
  execution.sourceSnapshot = structuredClone(scenario.sourceSnapshot) as DeepMutable<DiagnosticExecutionRecord>['sourceSnapshot'];
  execution.premisesSnapshot = structuredClone(scenario.premises) as DeepMutable<DiagnosticExecutionRecord>['premisesSnapshot'];
  execution.periodSnapshot = structuredClone(scenario.period) as DeepMutable<DiagnosticExecutionRecord>['periodSnapshot'];
  execution.createdAt = RECORDED_AT;
  execution.finishedAt = RECORDED_AT;
  execution.jobId = uuid(3000 + mask);
  execution.requestSnapshot.idempotency_key = execution.jobId;
  execution.requestSnapshot.request_id = uuid(4000 + mask);
  execution.requestSnapshot.study_id = studyId;
  execution.requestSnapshot.scenario_id = scenario.id;
  execution.requestSnapshot.scenario_revision = scenario.revision;
  execution.requestSnapshot.input_fingerprint = scenario.inputFingerprint;
  if (execution.requestSnapshot.sampling.kind !== 'FIXED_INPUT') {
    throw new Error('Performance fixture requires a fixed-input diagnostic.');
  }
  execution.requestSnapshot.sampling.preview_request.study_id = studyId;
  execution.requestSnapshot.sampling.preview_request.scenario_id = scenario.id;
  execution.requestSnapshot.sampling.preview_request.cenario.ordens = structuredClone(orders);

  execution.envelope!.job_id = execution.jobId;
  execution.envelope!.request_fingerprint = scenario.inputFingerprint;
  source.execution_id = execution.id;
  source.request_id = execution.requestSnapshot.request_id;
  source.study_id = studyId;
  source.scenario_id = scenario.id;
  source.scenario_revision = scenario.revision;
  source.input_snapshot.cenario.ordens = structuredClone(orders);
  const aggregate = source.result.agregado;
  aggregate.ids_ordens_medidas = orderIds;
  aggregate.volume_bruto_periodo_brl = volume;
  aggregate.economia_periodo_brl = savings;
  aggregate.baseline_periodo = baseline;
  aggregate.netado_periodo = netted;
  aggregate.volume_casado_periodo_brl = '0';
  aggregate.taxa_netabilidade_periodo = '0';
  aggregate.execucao_completa.ciclos = [{
    ...aggregate.execucao_completa.ciclos[0]!,
    alocacoes: orders.map((order) => ({
      ordem_id: order.id,
      dia: order.dia_conhecida + 1,
      valor_brl: order.valor_brl,
      tipo: 'REMETIDO' as const,
      origem_casamento: null,
    })),
  }];
  execution.status = 'SUCCEEDED';
  return execution;
}

function reservationFor(terminal: DiagnosticExecutionRecord, mask: number): DiagnosticExecutionRecord {
  const reservation = structuredClone(terminal) as DeepMutable<DiagnosticExecutionRecord>;
  reservation.id = uuid(6000 + mask);
  reservation.status = 'QUEUED';
  reservation.envelope = null;
  reservation.finishedAt = null;
  return reservation;
}

/**
 * Builds current, deterministic portfolio diagnostics without network access.
 * Six and eight companies produce the application's 63 and 255 nonempty subsets.
 */
export async function makePortfolioStudy(
  companyCount: 6 | 8,
  options: PortfolioPerformanceOptions = {},
): Promise<StudyDocument> {
  const expectedCount = (1 << companyCount) - 1;
  const currentResultCount = options.currentResultCount ?? expectedCount;
  if (currentResultCount !== 0 && currentResultCount !== expectedCount) {
    throw new Error(`Expected 0 or ${expectedCount} current results for ${companyCount} companies.`);
  }

  const observed = await observedInput();
  const original = observed.study.scenarios[0]!;
  const provenance = original.sourceSnapshot.provenance[0]!;
  const orders = Array.from({ length: companyCount }, (_, index) => {
    const template = original.sourceSnapshot.orders[index % original.sourceSnapshot.orders.length]!;
    return {
      ...structuredClone(template),
      id: `order-${companyId(index)}`,
      cliente_id: companyId(index),
      valor_brl: '100',
      dia_conhecida: 0,
      dia_limite: 1,
    };
  });
  const provenanceByOrder = Object.fromEntries(orders.map((order) => [order.id, {
    cliente_id: provenance,
    dia_conhecida: provenance,
    dia_limite: provenance,
    valor_brl: provenance,
    finalidade: provenance,
    eh_efx: provenance,
  }])) as DeepMutable<typeof baseSnapshot.provenanceByOrder>;
  const companyByOrder = Object.fromEntries(orders.map((order, index) => [order.id, {
    companyId: companyId(index),
    companyName: companyName(index),
  }]));
  const baseSnapshot = structuredClone(original.sourceSnapshot) as DeepMutable<typeof original.sourceSnapshot>;
  baseSnapshot.source = {
    kind: 'AUTHORED',
    authoredPortfolioId: uuid(5001),
    definition: { kind: 'EXPLICIT_ORDERS', orders, companyByOrder, provenanceByOrder },
  } as DeepMutable<typeof baseSnapshot.source>;
  baseSnapshot.orders = orders;
  baseSnapshot.provenanceByOrder = provenanceByOrder as NonNullable<DeepMutable<typeof baseSnapshot.provenanceByOrder>>;

  const studyId = uuid(5000);
  const study = await createStudy({
    id: studyId,
    ownerSub: observed.study.ownerSub,
    name: `${companyCount}-company performance fixture`,
    now: RECORDED_AT,
    studyType: 'PORTFOLIO_COMBINATIONS',
    baseScenario: {
      ...structuredClone(original),
      id: uuid(5002),
      revision: 1,
      name: 'Todas as empresas juntas',
      sourceSnapshot: baseSnapshot,
    },
  });
  const base = study.scenarios[0]!;
  const masks = masksFor(companyCount);
  const compositions = [
    { mask: expectedCount, scenario: base },
    ...await Promise.all(masks.slice(0, -1).map(async (mask) => ({
      mask,
      scenario: await scenarioForComposition(base, companyCount, mask),
    }))),
  ];
  const executions = compositions.slice(0, currentResultCount).flatMap(({ mask, scenario }) => {
    const terminal = executionForScenario(observed.execution, studyId, scenario, companyCount, mask);
    return [reservationFor(terminal, mask), terminal];
  });
  return {
    ...structuredClone(study),
    scenarios: compositions.map(({ scenario }) => scenario),
    executions,
  };
}
