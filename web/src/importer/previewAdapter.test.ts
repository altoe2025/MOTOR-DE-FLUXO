import { describe, expect, it } from 'vitest';

import { validatePreviaRequest } from '../api/validators';
import type {
  ExecutionAssessment, ImportCatalog, ImportStudy, ImportStudyParameters,
  ISODate, ProjectedOperation,
} from './domain';
import { buildImportedPreviewRequest, PreviewAdapterError } from './previewAdapter';

const NOW = '2026-09-18T12:00:00Z';
const ORIGIN = {
  tipo: 'PADRAO_SINTETICO' as const,
  fonte: 'Catálogo fictício de teste',
  registrado_em_utc: '2026-09-17T00:00:00Z',
};
const COSTS = {
  iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
  spread_rail_bps: '25', custo_fixo_remessa: '40',
  custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
};
const PARAMETERS: ImportStudyParameters = {
  windowDays: 7,
  catalogVersion: 'a'.repeat(64),
  costs: COSTS,
  fieldOrigins: {
    windowDays: ORIGIN, iof_out: ORIGIN, iof_in: ORIGIN, carry_cnr: ORIGIN,
    spread_rail_bps: ORIGIN, custo_fixo_remessa: ORIGIN,
    custo_oportunidade_aa: ORIGIN, ptax: ORIGIN, iof_por_finalidade: ORIGIN,
  },
};
const CATALOG: ImportCatalog = {
  schema_version: '1.0.0', catalog_version: 'a'.repeat(64),
  status: 'CONFIGURADO', publicado_em_utc: '2026-09-17T00:00:00Z',
  finalidades: [{
    codigo: 'SERVICO', descricao: 'Finalidade fictícia',
    aliquotas: [
      { direcao: 'OUT', aliquota: '0.035' },
      { direcao: 'IN', aliquota: '0.0038' },
    ],
  }],
  custos_padrao: COSTS, custos_origem: ORIGIN, custos_calibrados: false,
};
const STUDY: ImportStudy = {
  schemaVersion: '1.0.0',
  id: '00000000-0000-4000-8000-000000000011',
  revision: 7, name: 'Nome privado',
  createdAtUtc: NOW, updatedAtUtc: NOW, batches: [], events: [],
};

function selected(
  id: string,
  direction: 'OUT' | 'IN',
  knownDate: string,
  deadlineDate: string,
  edited = false,
): ProjectedOperation {
  return {
    operationId: id, versionId: `version-${id}`, batchId: 'batch-1',
    batchSequence: 1, rowNumber: 2, canonicalClientId: 'client-shared',
    originVersionIds: [`version-${id}`],
    operation: {
      operationId: id, clientName: 'Cliente privado',
      profileClassification: 'Perfil privado', direction,
      knownDate: knownDate as ISODate, deadlineDate: deadlineDate as ISODate,
      valueBrl: '100', purposeCode: 'SERVICO',
    },
    audit: { edits: edited ? [{
      eventId: `edit-${id}`, at: NOW, field: 'valueBrl',
      originalValue: '90', previousValue: '90', nextValue: '100',
      rawValue: '100', error: null,
    }] : [] },
    excluded: false, executable: true, issues: [],
  };
}

function assessment(operations: ProjectedOperation[]): ExecutionAssessment {
  return {
    selected: operations, blockers: [], issues: [],
    omitted: { outsideRecut: 0, invalid: 0, excluded: 0, superseded: 0 },
    requiresPartialConfirmation: false, periodDays: 31,
  };
}

function build(operations: ProjectedOperation[]) {
  return buildImportedPreviewRequest({
    study: STUDY, assessment: assessment(operations), catalog: CATALOG,
    parameters: PARAMETERS,
    recut: { start: '2026-10-01' as ISODate, end: '2026-10-31' as ISODate },
    requestId: '00000000-0000-4000-8000-000000000012',
    scenarioId: '00000000-0000-4000-8000-000000000013',
    nowUtc: NOW,
  });
}

function resolvePointer(document: unknown, pointer: string): unknown {
  return pointer.slice(1).split('/').reduce<unknown>((current, token) => {
    if (Array.isArray(current)) return current[Number(token)];
    if (current !== null && typeof current === 'object') {
      return (current as Record<string, unknown>)[token];
    }
    return undefined;
  }, document);
}

describe('buildImportedPreviewRequest', () => {
  it('produz request dourado canônico sem pré-netar direções opostas', () => {
    const request = build([
      selected('OP-OUT', 'OUT', '2026-10-20', '2026-11-15', true),
      selected('OP-IN', 'IN', '2026-10-10', '2026-10-12'),
    ]);

    expect(request.cenario.ordens).toHaveLength(2);
    expect(request.cenario.ordens[0]?.cliente_id).toBe(request.cenario.ordens[1]?.cliente_id);
    expect(request.cenario.ordens.map((order) => order.id)).toEqual(['OP-IN', 'OP-OUT']);
    expect(request.cenario.ordens.map((order) => order.direcao)).toEqual(['IN', 'OUT']);
    expect(request.cenario.ordens.map((order) => [order.dia_conhecida, order.dia_limite]))
      .toEqual([[9, 11], [19, 45]]);
    expect(request.periodo).toEqual({
      modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 31,
    });
    expect(request.cenario.horizonte_dias).toBe(31);
    expect(request.cenario.janela_dias).toBe(7);
    expect(request.cenario.custo.iof_por_finalidade).toEqual([
      { finalidade: 'SERVICO', direcao: 'IN', aliquota: '0.0038' },
      { finalidade: 'SERVICO', direcao: 'OUT', aliquota: '0.035' },
    ]);
    expect(request.proveniencia['/ordens/0/valor_brl']?.tipo).toBe('DADO_OBSERVADO');
    expect(request.proveniencia['/ordens/1/valor_brl']?.tipo).toBe('ESTIMATIVA_USUARIO');
    expect(request.proveniencia['/ordens/0/eh_efx']?.tipo).toBe('NAO_COLETADO');
    expect(request.proveniencia['/custo/iof_out']?.tipo).toBe('PADRAO_SINTETICO');
    expect(request.proveniencia['/custo/iof_por_finalidade/0/aliquota']?.tipo)
      .toBe('DADO_OBSERVADO');
    expect(validatePreviaRequest(request)).toBe(true);
    for (const pointer of Object.keys(request.proveniencia)) {
      expect(resolvePointer(request.cenario, pointer), pointer).not.toBeUndefined();
    }
    const json = JSON.stringify(request);
    expect(json).not.toContain('Cliente privado');
    expect(json).not.toContain('Perfil privado');
    expect(json).not.toContain('Nome privado');
  });

  it('valida 1.000 ordens e permanece abaixo de 1 MiB', () => {
    const operations = Array.from({ length: 1000 }, (_, index) => (
      selected(`OP-${String(index).padStart(4, '0')}`, index % 2 === 0 ? 'IN' : 'OUT', '2026-10-10', '2026-10-12')
    ));
    const request = build(operations);
    const json = JSON.stringify(request);

    expect(request.cenario.ordens).toHaveLength(1000);
    expect(validatePreviaRequest(request)).toBe(true);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(1_048_576);
    expect(json).not.toContain('Cliente privado');
    expect(json).not.toContain('Perfil privado');
  });

  it('impede POST ao receber assessment bloqueado ou catálogo divergente', () => {
    const operation = selected('OP-1', 'OUT', '2026-10-10', '2026-10-12');
    expect(() => buildImportedPreviewRequest({
      study: STUDY,
      assessment: { ...assessment([operation]), blockers: [{
        code: 'UNRESOLVED_CONFLICT', message: 'bloqueado',
        operationId: null, field: null,
      }] },
      catalog: CATALOG, parameters: PARAMETERS,
      recut: { start: '2026-10-01' as ISODate, end: '2026-10-31' as ISODate },
      requestId: '00000000-0000-4000-8000-000000000012',
      scenarioId: '00000000-0000-4000-8000-000000000013', nowUtc: NOW,
    })).toThrow(PreviewAdapterError);
    expect(() => buildImportedPreviewRequest({
      study: STUDY, assessment: assessment([operation]),
      catalog: { ...CATALOG, catalog_version: 'b'.repeat(64) },
      parameters: PARAMETERS,
      recut: { start: '2026-10-01' as ISODate, end: '2026-10-31' as ISODate },
      requestId: '00000000-0000-4000-8000-000000000012',
      scenarioId: '00000000-0000-4000-8000-000000000013', nowUtc: NOW,
    })).toThrow(/versão do catálogo divergiu/);
  });

  it('recusa recorte diferente do período já avaliado', () => {
    const operation = selected('OP-1', 'OUT', '2026-10-10', '2026-10-12');

    expect(() => buildImportedPreviewRequest({
      study: STUDY, assessment: assessment([operation]), catalog: CATALOG,
      parameters: PARAMETERS,
      recut: { start: '2026-10-01' as ISODate, end: '2026-10-30' as ISODate },
      requestId: '00000000-0000-4000-8000-000000000012',
      scenarioId: '00000000-0000-4000-8000-000000000013', nowUtc: NOW,
    })).toThrow(/recorte diverge do período avaliado/);
  });
});
