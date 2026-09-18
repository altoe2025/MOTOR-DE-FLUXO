import { describe, expect, it } from 'vitest';

import type {
  ImportBatch,
  ImportCatalog,
  ImportedVersionRow,
  ImportStudy,
  ISODate,
} from './domain';
import { evaluateExecution } from './eligibility';
import { catalogExecutionAvailability } from './eligibility';
import { excludeOperation, projectPortfolio } from './portfolio';

function iso(value: string): ISODate {
  return value as ISODate;
}

function row(
  id: string,
  knownDate: string,
  deadlineDate: string,
  purposeCode: string | null = 'SERVICO',
  direction: 'OUT' | 'IN' = 'OUT',
): ImportedVersionRow {
  return {
    versionId: `version-${id}`,
    canonicalClientId: `client-${id}`,
    rowNumber: 2,
    raw: {
      operacao_id: id, cliente_nome: id, classificacao_perfil: null,
      direcao: direction, data_conhecida: knownDate,
      data_limite: deadlineDate, valor_brl: '100',
      finalidade_codigo: purposeCode,
    },
    normalized: {
      operationId: id, clientName: id, profileClassification: null,
      direction, knownDate: iso(knownDate), deadlineDate: iso(deadlineDate),
      valueBrl: '100', purposeCode,
    },
    errors: [],
  };
}

function projection(...rows: ImportedVersionRow[]) {
  const batch: ImportBatch = {
    schemaVersion: '1.0.0', id: 'batch-1', studyId: 'study-1', revision: 1,
    batchSequence: 1, importedAtUtc: '2026-09-18T10:00:00.000Z',
    file: {
      fileName: 'test.xlsx', fileSize: 1, fileLastModified: 0,
      sha256: 'a'.repeat(64),
    },
    rows: rows.map((item, index) => ({ ...item, rowNumber: index + 2 })),
  };
  const study: ImportStudy = {
    schemaVersion: '1.0.0', id: 'study-1', revision: 1, name: 'Estudo',
    createdAtUtc: '2026-09-18T10:00:00.000Z',
    updatedAtUtc: '2026-09-18T10:00:00.000Z', batches: [batch], events: [],
  };
  return { study, projection: projectPortfolio(study) };
}

function configuredCatalog(
  directions: Array<'OUT' | 'IN'> = ['OUT', 'IN'],
): ImportCatalog {
  return {
    schema_version: '1.0.0', catalog_version: 'a'.repeat(64),
    status: 'CONFIGURADO', publicado_em_utc: '2026-09-17T00:00:00Z',
    finalidades: [{
      codigo: 'SERVICO', descricao: 'Finalidade fictícia',
      aliquotas: directions.map((direcao) => ({ direcao, aliquota: '0.01' })),
    }],
    custos_padrao: {
      iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
      spread_rail_bps: '25', custo_fixo_remessa: '40',
      custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
    },
    custos_origem: {
      tipo: 'PADRAO_SINTETICO', fonte: 'Teste',
      registrado_em_utc: '2026-09-17T00:00:00Z',
    },
    custos_calibrados: false,
  };
}

const CATALOG = configuredCatalog();

describe('evaluateExecution', () => {
  it('exige catálogo carregado e versão registrada antes da execução', () => {
    expect(catalogExecutionAvailability(null, null)).toEqual({
      allowed: false, reason: 'CATALOG_NOT_LOADED',
    });
    expect(catalogExecutionAvailability({
      schema_version: '1.0.0', catalog_version: 'a'.repeat(64),
      status: 'NAO_CONFIGURADO', publicado_em_utc: '2026-09-17T00:00:00Z',
      finalidades: [], custos_padrao: {
        iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
        spread_rail_bps: '25', custo_fixo_remessa: '40',
        custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
      },
      custos_origem: {
        tipo: 'PADRAO_SINTETICO', fonte: 'Teste',
        registrado_em_utc: '2026-09-17T00:00:00Z',
      }, custos_calibrados: false,
    }, null)).toEqual({ allowed: false, reason: 'CATALOG_VERSION_MISSING' });
  });

  it('bloqueia catálogo sem regras suficientes ou com versão alterada', () => {
    const configured = configuredCatalog();
    const unavailable: ImportCatalog = {
      ...configured,
      status: 'NAO_CONFIGURADO',
      finalidades: [],
    };

    expect(catalogExecutionAvailability(
      unavailable,
      unavailable.catalog_version,
    )).toEqual({ allowed: false, reason: 'CATALOG_NOT_CONFIGURED' });
    expect(catalogExecutionAvailability(
      configured,
      'f'.repeat(64),
    )).toEqual({ allowed: false, reason: 'CATALOG_VERSION_CHANGED' });
    expect(catalogExecutionAvailability(
      configured,
      configured.catalog_version,
    )).toEqual({ allowed: true, reason: null });
  });

  it('usa recorte inclusivo e somente knownDate para inclusão', () => {
    const { projection: portfolio } = projection(
      row('START', '2028-02-28', '2028-03-10'),
      row('LEAP', '2028-02-29', '2028-03-10'),
      row('END', '2028-03-01', '2028-04-30'),
      row('BEFORE', '2028-02-27', '2028-02-29'),
      row('AFTER', '2028-03-02', '2028-03-03'),
    );

    const assessment = evaluateExecution(portfolio, {
      start: iso('2028-02-28'), end: iso('2028-03-01'),
    }, CATALOG);

    expect(assessment.selected.map((operation) => operation.operationId)).toEqual([
      'START', 'LEAP', 'END',
    ]);
    expect(assessment.omitted.outsideRecut).toBe(2);
    expect(assessment.periodDays).toBe(3);
  });

  it('usa menor e maior knownDate quando o recorte está vazio', () => {
    const { projection: portfolio } = projection(
      row('A', '2026-10-17', '2026-10-18'),
      row('B', '2026-10-20', '2026-10-21'),
    );

    const assessment = evaluateExecution(
      portfolio,
      { start: null, end: null },
      CATALOG,
    );

    expect(assessment.selected).toHaveLength(2);
    expect(assessment.periodDays).toBe(4);
  });

  it.each([
    [{ start: '2026-10-20', end: '2026-10-17' }, 'RECUT_INVERTED'],
    [{ start: '2026-01-01', end: '2028-01-01' }, 'RECUT_TOO_LONG'],
  ])('cria blocker global para recorte inválido', (recut, code) => {
    const { projection: portfolio } = projection(
      row('A', '2026-10-17', '2026-10-18'),
    );
    const assessment = evaluateExecution(portfolio, {
      start: iso(recut.start), end: iso(recut.end),
    }, CATALOG);

    expect(assessment.blockers).toContainEqual(expect.objectContaining({ code }));
    expect(assessment.selected).toEqual([]);
  });

  it('catálogo não configurado torna todas inválidas sem impedir edição', () => {
    const { projection: portfolio } = projection(
      row('A', '2026-10-17', '2026-10-18'),
      row('B', '2026-10-18', '2026-10-19'),
    );

    const assessment = evaluateExecution(portfolio, {
      start: iso('2026-10-17'), end: iso('2026-10-18'),
    }, { ...configuredCatalog(), status: 'NAO_CONFIGURADO', finalidades: [] });

    expect(assessment.selected).toEqual([]);
    expect(assessment.omitted.invalid).toBe(2);
    expect(assessment.blockers).toContainEqual(expect.objectContaining({
      code: 'ZERO_EXECUTABLE_OPERATIONS',
    }));
  });

  it.each([
    [null, 'OUT', 'PURPOSE_MISSING'],
    ['DESCONHECIDA', 'OUT', 'PURPOSE_UNKNOWN'],
    ['SERVICO', 'IN', 'PURPOSE_DIRECTION_INVALID'],
  ] as const)('invalida finalidade %s para direção %s', (purpose, direction, code) => {
    const restrictedCatalog = configuredCatalog(['OUT']);
    const { projection: portfolio } = projection(
      row('VALID', '2026-10-17', '2026-10-18'),
      row('INVALID', '2026-10-17', '2026-10-18', purpose, direction),
    );

    const assessment = evaluateExecution(portfolio, {
      start: iso('2026-10-17'), end: iso('2026-10-17'),
    }, restrictedCatalog);

    expect(assessment.selected).toHaveLength(1);
    expect(assessment.omitted.invalid).toBe(1);
    expect(assessment.requiresPartialConfirmation).toBe(true);
    expect(assessment.issues).toContainEqual(expect.objectContaining({
      operationId: 'INVALID', code,
    }));
  });

  it('conta exclusões sem apagar a operação', () => {
    const source = projection(row('A', '2026-10-17', '2026-10-18'));
    const excluded = excludeOperation(source.study, {
      operationId: 'A', eventId: 'exclude-1', at: '2026-09-18T11:00:00.000Z',
    });

    const assessment = evaluateExecution(projectPortfolio(excluded), {
      start: iso('2026-10-17'), end: iso('2026-10-17'),
    }, CATALOG);

    expect(assessment.omitted.excluded).toBe(1);
    expect(assessment.selected).toEqual([]);
  });

  it('bloqueia conflito não resolvido', () => {
    const source = projection(row('A', '2026-10-17', '2026-10-18'));
    const conflictingBatch: ImportBatch = {
      ...source.study.batches[0]!,
      id: 'batch-2',
      batchSequence: 2,
      rows: [{
        ...row('A', '2026-10-17', '2026-10-18'),
        versionId: 'version-A-2',
        normalized: {
          ...row('A', '2026-10-17', '2026-10-18').normalized!,
          valueBrl: '200',
        },
      }],
    };
    const conflicted = projectPortfolio({
      ...source.study,
      batches: [...source.study.batches, conflictingBatch],
    });

    const assessment = evaluateExecution(conflicted, {
      start: iso('2026-10-17'), end: iso('2026-10-17'),
    }, CATALOG);

    expect(assessment.blockers).toContainEqual(expect.objectContaining({
      code: 'UNRESOLVED_CONFLICT',
      operationId: 'A',
    }));
  });

  it('conta conflito excluído e volta a bloquear após restauração', () => {
    const source = projection(row('A', '2026-10-17', '2026-10-18'));
    const conflictingBatch: ImportBatch = {
      ...source.study.batches[0]!, id: 'batch-2', batchSequence: 2,
      rows: [{
        ...row('A', '2026-10-17', '2026-10-18'),
        versionId: 'version-A-2',
        normalized: {
          ...row('A', '2026-10-17', '2026-10-18').normalized!, valueBrl: '200',
        },
      }],
    };
    const conflictedStudy = {
      ...source.study,
      batches: [...source.study.batches, conflictingBatch],
    };
    const excluded = excludeOperation(conflictedStudy, {
      operationId: 'A', eventId: 'exclude-conflict',
      at: '2026-09-18T11:00:00.000Z',
    });
    const assessment = evaluateExecution(projectPortfolio(excluded), {
      start: iso('2026-10-17'), end: iso('2026-10-17'),
    }, CATALOG);

    expect(assessment.omitted.excluded).toBe(1);
    expect(assessment.blockers).not.toContainEqual(expect.objectContaining({
      code: 'UNRESOLVED_CONFLICT',
    }));
  });

  it('invalida deadline acima de 730 dias e mantém as demais', () => {
    const { projection: portfolio } = projection(
      row('VALID', '2026-01-01', '2026-01-02'),
      row('INVALID', '2026-01-01', '2028-01-02'),
    );

    const assessment = evaluateExecution(portfolio, {
      start: iso('2026-01-01'), end: iso('2026-01-01'),
    }, CATALOG);

    expect(assessment.selected).toHaveLength(1);
    expect(assessment.omitted.invalid).toBe(1);
    expect(assessment.requiresPartialConfirmation).toBe(true);
    expect(assessment.issues).toContainEqual(expect.objectContaining({
      code: 'DEADLINE_OUT_OF_RANGE',
      operationId: 'INVALID',
    }));
  });

  it('bloqueia mais de mil operações selecionadas', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => (
      row(`OP-${index}`, '2026-10-17', '2026-10-18')
    ));
    const { projection: portfolio } = projection(...rows);

    const assessment = evaluateExecution(portfolio, {
      start: iso('2026-10-17'), end: iso('2026-10-17'),
    }, CATALOG);

    expect(assessment.selected).toHaveLength(1001);
    expect(assessment.blockers).toContainEqual(expect.objectContaining({
      code: 'EXECUTION_LIMIT_EXCEEDED',
    }));
  });
});
