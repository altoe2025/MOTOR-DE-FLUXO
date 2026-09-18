import { describe, expect, it } from 'vitest';

import type {
  ImportBatch,
  ImportedVersionRow,
  ImportStudy,
  ISODate,
} from './domain';
import {
  incorporateBatch,
  projectPortfolio,
  resolveVersionConflict,
  revertBatch,
} from './portfolio';

const RAW = {
  operacao_id: 'OP-1',
  cliente_nome: 'Cliente',
  classificacao_perfil: null,
  direcao: 'OUT',
  data_conhecida: '2026-10-17',
  data_limite: '2026-10-19',
  valor_brl: '100',
  finalidade_codigo: 'SERVICO',
} as const;

function row(
  versionId: string,
  operationId: string,
  valueBrl: string,
  rowNumber = 2,
  canonicalClientId = 'client-1',
): ImportedVersionRow {
  return {
    versionId,
    canonicalClientId,
    rowNumber,
    raw: { ...RAW, operacao_id: operationId, valor_brl: valueBrl },
    normalized: {
      operationId,
      clientName: 'Cliente',
      profileClassification: null,
      direction: 'OUT',
      knownDate: '2026-10-17' as ISODate,
      deadlineDate: '2026-10-19' as ISODate,
      valueBrl,
      purposeCode: 'SERVICO',
    },
    errors: [],
  };
}

function batch(
  id: string,
  batchSequence: number,
  rows: ImportedVersionRow[],
  importedAtUtc = '2026-09-18T10:00:00.000Z',
): ImportBatch {
  return {
    schemaVersion: '1.0.0',
    id,
    studyId: 'study-1',
    revision: 1,
    batchSequence,
    importedAtUtc,
    file: {
      fileName: `${id}.xlsx`,
      fileSize: 100,
      fileLastModified: 0,
      sha256: id.padEnd(64, '0'),
    },
    rows,
  };
}

function study(
  batches: ImportBatch[] = [],
  events: ImportStudy['events'] = [],
): ImportStudy {
  return {
    schemaVersion: '1.0.0',
    id: 'study-1',
    revision: 1,
    name: 'Estudo',
    createdAtUtc: '2026-09-18T10:00:00.000Z',
    updatedAtUtc: '2026-09-18T10:00:00.000Z',
    batches,
    events,
  };
}

describe('projectPortfolio', () => {
  it('ordena lotes por batchSequence e linhas por rowNumber', () => {
    const projection = projectPortfolio(study([
      batch('aaa-batch', 2, [
        row('batch-2-row-4', 'OP-4', '400', 4),
        row('batch-2-row-2', 'OP-3', '300', 2),
      ], '2026-09-18T08:00:00.000Z'),
      batch('zzz-batch', 1, [
        row('batch-1-row-3', 'OP-2', '200', 3),
        row('batch-1-row-2', 'OP-1', '100', 2),
      ], '2026-09-18T20:00:00.000Z'),
    ]));

    expect(projection.versions.map((version) => version.versionId)).toEqual([
      'batch-1-row-2',
      'batch-1-row-3',
      'batch-2-row-2',
      'batch-2-row-4',
    ]);
  });

  it('aplica resoluções por eventSequence, não por UUID ou timestamp', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '200')]),
    ], [
      {
        kind: 'CONFLICT_RESOLVED',
        id: 'aaa-event',
        eventSequence: 2,
        occurredAtUtc: '2026-09-18T09:00:00.000Z',
        operationId: 'OP-X',
        selectedVersionId: 'version-2',
      },
      {
        kind: 'CONFLICT_RESOLVED',
        id: 'zzz-event',
        eventSequence: 1,
        occurredAtUtc: '2026-09-18T20:00:00.000Z',
        operationId: 'OP-X',
        selectedVersionId: 'version-1',
      },
    ]));

    expect(projection.currentOperations).toContainEqual(
      expect.objectContaining({
        operationId: 'OP-X',
        versionId: 'version-2',
      }),
    );
  });

  it('produz a mesma projeção com arrays de entrada embaralhados', () => {
    const first = batch('batch-1', 1, [row('version-1', 'OP-X', '100')]);
    const second = batch('batch-2', 2, [row('version-2', 'OP-X', '200')]);
    const events: ImportStudy['events'] = [{
      kind: 'CONFLICT_RESOLVED',
      id: 'event-1',
      eventSequence: 1,
      occurredAtUtc: '2026-09-18T12:00:00.000Z',
      operationId: 'OP-X',
      selectedVersionId: 'version-1',
    }];

    expect(projectPortfolio(study([second, first], events))).toEqual(
      projectPortfolio(study([first, second], [...events].reverse())),
    );
  });

  it('rejeita sequências repetidas em vez de desempatar por ID', () => {
    expect(() => projectPortfolio(study([
      batch('batch-z', 1, [row('version-1', 'OP-1', '100')]),
      batch('batch-a', 1, [row('version-2', 'OP-2', '200')]),
    ]))).toThrow('INVALID_BATCH_SEQUENCE');

    expect(() => projectPortfolio(study([
      batch('batch-1', 1, [
        row('version-1', 'OP-1', '100', 2),
        row('version-2', 'OP-2', '200', 2),
      ]),
    ]))).toThrow('INVALID_ROW_NUMBER');

    const duplicateEvents: ImportStudy['events'] = [
      {
        kind: 'BATCH_REVERTED',
        id: 'event-z',
        eventSequence: 1,
        occurredAtUtc: '2026-09-18T20:00:00.000Z',
        batchId: 'batch-1',
      },
      {
        kind: 'BATCH_IMPORTED',
        id: 'event-a',
        eventSequence: 1,
        occurredAtUtc: '2026-09-18T08:00:00.000Z',
        batchId: 'batch-1',
      },
    ];
    expect(() => projectPortfolio(study([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ], duplicateEvents))).toThrow('INVALID_EVENT_SEQUENCE');
  });

  it('adiciona ID novo como operação vigente', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [row('version-1', 'OP-NEW', '100')]),
    ]));

    expect(projection.currentOperations).toEqual([
      expect.objectContaining({
        operationId: 'OP-NEW',
        versionId: 'version-1',
        originVersionIds: ['version-1'],
      }),
    ]);
    expect(projection.conflicts).toEqual([]);
  });

  it('mantém conteúdo único e registra origens quando versões são idênticas', () => {
    const first = row('version-1', 'OP-SAME', '100');
    first.normalized!.profileClassification = 'A';
    const second = row('version-2', 'OP-SAME', '100');
    second.normalized!.profileClassification = 'B';

    const projection = projectPortfolio(study([
      batch('batch-1', 1, [first]),
      batch('batch-2', 2, [second]),
    ]));

    expect(projection.currentOperations).toEqual([
      expect.objectContaining({
        operationId: 'OP-SAME',
        versionId: 'version-1',
        originVersionIds: ['version-1', 'version-2'],
      }),
    ]);
    expect(projection.conflicts).toEqual([]);
  });

  it('cria conflito sem escolher vencedor para conteúdo diferente', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '200')]),
    ]));

    expect(projection.currentOperations).toEqual([]);
    expect(projection.conflicts).toEqual([{
      operationId: 'OP-X',
      versionIds: ['version-1', 'version-2'],
    }]);
  });

  it('não cria candidata quando o ID se repete dentro do mesmo lote', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [
        row('version-1', 'OP-DUP', '100', 2),
        row('version-2', 'OP-DUP', '100', 3),
      ]),
    ]));

    expect(projection.versionsByOperationId['OP-DUP']).toBeUndefined();
    expect(projection.currentOperations).toEqual([]);
  });

  it('inclui UUID canônico do cliente na comparação de conteúdo', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100', 2, 'client-1')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '100', 2, 'client-2')]),
    ]));

    expect(projection.conflicts).toHaveLength(1);
  });
});

describe('comandos do portfólio', () => {
  it('incorpora lote sem mutar o estudo recebido', () => {
    const original = study();
    const nextBatch = batch('batch-1', 1, [row('version-1', 'OP-1', '100')]);

    const incorporated = incorporateBatch(original, nextBatch);

    expect(original.batches).toEqual([]);
    expect(original.events).toEqual([]);
    expect(incorporated.batches).toEqual([nextBatch]);
    expect(incorporated.events.at(-1)).toMatchObject({
      kind: 'BATCH_IMPORTED',
      batchId: 'batch-1',
      eventSequence: 1,
    });
  });

  it('resolve conflito somente com versão existente e ativa', () => {
    const conflicted = study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '200')]),
    ]);

    const resolved = resolveVersionConflict(conflicted, {
      operationId: 'OP-X',
      selectedVersionId: 'version-2',
    });

    expect(projectPortfolio(resolved).currentOperations).toContainEqual(
      expect.objectContaining({ versionId: 'version-2' }),
    );
    expect(() => resolveVersionConflict(conflicted, {
      operationId: 'OP-X',
      selectedVersionId: 'missing-version',
    })).toThrow('VERSION_NOT_ACTIVE');
  });

  it('permite substituir uma resolução por outra versão ativa', () => {
    const conflicted = study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '200')]),
    ]);
    const firstResolution = resolveVersionConflict(conflicted, {
      operationId: 'OP-X',
      selectedVersionId: 'version-1',
    });

    const secondResolution = resolveVersionConflict(firstResolution, {
      operationId: 'OP-X',
      selectedVersionId: 'version-2',
    });

    expect(secondResolution.events.at(-1)).toMatchObject({
      eventSequence: 2,
      selectedVersionId: 'version-2',
    });
    expect(projectPortfolio(secondResolution).currentOperations).toContainEqual(
      expect.objectContaining({ versionId: 'version-2' }),
    );
  });

  it.each([
    ['lote que só adiciona', 'OP-NEW', '100'],
    ['lote que cria versão diferente', 'OP-BASE', '200'],
    ['lote com versão idêntica', 'OP-BASE', '100'],
  ])('reverte completamente %s', (_name, operationId, valueBrl) => {
    const base = study([
      batch('batch-1', 1, [row('version-1', 'OP-BASE', '100')]),
    ]);
    const before = projectPortfolio(base);
    const incorporated = incorporateBatch(
      base,
      batch('batch-2', 2, [row('version-2', operationId, valueBrl)]),
    );

    const reverted = revertBatch(incorporated, 'batch-2');

    expect(projectPortfolio(reverted)).toEqual(before);
    expect(reverted.batches).toHaveLength(2);
    expect(reverted.events.at(-1)).toMatchObject({
      kind: 'BATCH_REVERTED',
      batchId: 'batch-2',
    });
  });

  it('ignora resolução que ficou inválida após reversão', () => {
    const conflicted = study([
      batch('batch-1', 1, [row('version-1', 'OP-X', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-X', '200')]),
    ]);
    const resolved = resolveVersionConflict(conflicted, {
      operationId: 'OP-X',
      selectedVersionId: 'version-2',
    });

    const reverted = revertBatch(resolved, 'batch-2');

    expect(projectPortfolio(reverted).currentOperations).toEqual([
      expect.objectContaining({ versionId: 'version-1' }),
    ]);
    expect(projectPortfolio(reverted).conflicts).toEqual([]);
  });
});
