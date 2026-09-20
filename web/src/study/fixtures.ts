import type { FieldProvenance, ObservedCase, ObservedOutcome } from '../cases/domain';
import type {
  DeepMutable,
  PortfolioSourceSnapshot,
  ScenarioDraft,
} from './model';

export const FIXTURE_NOW = '2026-09-19T12:00:00Z';
export const FIXTURE_OWNER = '00000000-0000-4000-8000-000000000001';

const observedProvenance: FieldProvenance = {
  kind: 'OBSERVED',
  source: 'arquivo-observado',
  version: '1',
  recordedAt: FIXTURE_NOW,
};

const syntheticProvenance: FieldProvenance = {
  kind: 'SYNTHETIC_DEFAULT',
  source: 'catálogo oficial',
  version: '1.0.0',
  recordedAt: FIXTURE_NOW,
  rule: 'dimensionamento-v1',
};

const authoredProvenance: FieldProvenance = {
  kind: 'USER_ESTIMATE',
  source: 'autoria manual',
  version: '1.0.0',
  recordedAt: FIXTURE_NOW,
};

export function makeObservedOutcome(): ObservedOutcome {
  return {
    schemaVersion: '1.0.0',
    metrics: [{
      code: 'GROSS_OUT_BRL',
      value: '100',
      unit: 'BRL',
      definitionVersion: '1.0.0',
      provenance: observedProvenance,
    }],
  };
}

export function makeObservedCase(): ObservedCase {
  return {
    schemaVersion: '2.0.0',
    id: 'case-1',
    ownerSub: FIXTURE_OWNER,
    companyId: 'company-1',
    status: 'CONFIRMED',
    revision: 4,
    window: { startDate: '2026-09-01', endDate: '2026-09-30', closingDate: '2026-09-30' },
    orders: [{
      id: 'observed-order-1',
      clientId: 'client-1',
      direction: 'OUT',
      knownDate: '2026-09-01',
      deadlineDate: '2026-09-03',
      valueBrl: '100',
      purposeCode: 'ANEXO_V_REMESSA_TERCEIRO',
      efxStatus: 'YES',
      provenance: [observedProvenance],
    }],
    controlTotals: [{ code: 'GROSS_OUT_BRL', valueBrl: '100', provenance: observedProvenance }],
    sourceManifest: {
      adapterId: 'fixture', adapterVersion: '1', sourceKind: 'XLSX',
      files: [{ name: 'anonimizado.xlsx', sizeBytes: 10, sha256: 'a'.repeat(64) }],
    },
    normalization: { rulesetId: 'fixture', rulesetVersion: '1', normalizedAt: FIXTURE_NOW },
    quality: { blockers: [], warnings: [] },
    corrections: [],
    observedOutcome: makeObservedOutcome(),
    confirmedAt: FIXTURE_NOW,
  };
}

function orders() {
  return [
    {
      id: 'order-b', cliente_id: 'client-b', direcao: 'IN' as const,
      dia_conhecida: 0, dia_limite: 2, valor_brl: '70',
      finalidade: 'ANEXO_V_DISPONIBILIDADE', eh_efx: false,
    },
    {
      id: 'order-a', cliente_id: 'client-a', direcao: 'OUT' as const,
      dia_conhecida: 0, dia_limite: 1, valor_brl: '100',
      finalidade: 'ANEXO_V_REMESSA_TERCEIRO', eh_efx: true,
    },
  ];
}

export function makeObservedSnapshot(caseRecord = makeObservedCase()): DeepMutable<PortfolioSourceSnapshot> {
  return {
    source: { kind: 'OBSERVED_CASE', caseId: caseRecord.id, caseRevision: caseRecord.revision },
    capturedAt: FIXTURE_NOW,
    orders: orders(),
    provenance: caseRecord.orders.flatMap((order) =>
      structuredClone(order.provenance) as DeepMutable<typeof order.provenance>),
    observedOutcome: structuredClone(caseRecord.observedOutcome) as DeepMutable<typeof caseRecord.observedOutcome>,
    sourceFingerprint: 'b'.repeat(64),
  };
}

export function makeAuthoredSnapshot(): DeepMutable<PortfolioSourceSnapshot> {
  return {
    source: { kind: 'AUTHORED', authoredPortfolioId: 'portfolio-1' },
    capturedAt: FIXTURE_NOW,
    orders: orders(),
    provenance: [structuredClone(authoredProvenance) as DeepMutable<FieldProvenance>],
    observedOutcome: null,
    sourceFingerprint: 'c'.repeat(64),
  };
}

export function makeSyntheticSnapshot(): DeepMutable<PortfolioSourceSnapshot> {
  return {
    source: {
      kind: 'SYNTHETIC',
      recipe: {
        exampleId: 'equilibrado',
        seeds: ['1'],
        composition: [{
          participant_id: null,
          order_count: 2,
          total_brl: '170',
          out_brl: '100',
          in_brl: '70',
          out_fraction: '0.588235294118',
        }],
        preparationVersion: '1.0.0',
        generatorVersion: 'dimensionamento-v1',
        motorBuildSha: 'd'.repeat(40),
        generationFingerprint: 'e'.repeat(64),
      },
    },
    capturedAt: FIXTURE_NOW,
    orders: orders(),
    provenance: [structuredClone(syntheticProvenance) as DeepMutable<FieldProvenance>],
    observedOutcome: null,
    sourceFingerprint: 'f'.repeat(64),
  };
}

export function makeScenarioDraft(
  overrides: Partial<DeepMutable<ScenarioDraft>> = {},
): DeepMutable<ScenarioDraft> {
  const base: DeepMutable<ScenarioDraft> = {
    id: '00000000-0000-4000-8000-000000000010',
    revision: 1,
    name: 'Cenário base',
    sourceSnapshot: makeSyntheticSnapshot(),
    premises: {
      costs: {
        iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
        custo_fixo_remessa: '40', custo_oportunidade_aa: '0',
        spread_rail_bps: '25', ptax: '5.40',
        iof_por_finalidade: [],
      },
      windowDays: 7,
    },
    period: {
      httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 30 },
    },
  };
  return Object.assign(base, structuredClone(overrides));
}
