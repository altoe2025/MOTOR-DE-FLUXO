import { describe, expect, it } from 'vitest';

import type {
  ImportBatch,
  EditableField,
  ImportedVersionRow,
  ImportStudy,
  ISODate,
} from './domain';
import {
  editOperation,
  excludeOperation,
  incorporateBatch,
  projectPortfolio,
  resolveVersionConflict,
  restoreOperation,
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

  it('conta linhas inválidas preservadas para exigir confirmação parcial', () => {
    const invalid = row('version-invalid', 'OP-INVALID', '100', 3);
    invalid.normalized = null;
    invalid.errors = [{
      code: 'REQUIRED', field: 'cliente_nome', rowNumber: 3,
      value: null, message: 'cliente obrigatório',
    }];

    const projection = projectPortfolio(study([
      batch('batch-1', 1, [row('version-valid', 'OP-VALID', '100'), invalid]),
    ]));

    expect(projection.counts.invalidRows).toBe(1);
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

describe('histórico de edição e exclusão', () => {
  it.each<{
    field: EditableField;
    rawValue: string;
    originalValue: string | null;
    nextValue: string | null;
  }>([
    { field: 'direction', rawValue: ' in ', originalValue: 'OUT', nextValue: 'IN' },
    { field: 'knownDate', rawValue: '18/10/2026', originalValue: '2026-10-17', nextValue: '2026-10-18' },
    { field: 'deadlineDate', rawValue: '20/10/2026', originalValue: '2026-10-19', nextValue: '2026-10-20' },
    { field: 'valueBrl', rawValue: '120,00', originalValue: '100', nextValue: '120' },
    { field: 'purposeCode', rawValue: 'COMERCIO', originalValue: 'SERVICO', nextValue: 'COMERCIO' },
  ])('audita a edição de $field', ({ field, rawValue, originalValue, nextValue }) => {
    const original = study([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ]);

    const edited = editOperation(original, {
      operationId: 'OP-1',
      field,
      rawValue,
      eventId: `event-${field}`,
      at: '2026-09-18T11:00:00.000Z',
    });
    const operation = projectPortfolio(edited).operations[0];

    expect(operation?.operation[field]).toBe(nextValue);
    expect(operation?.audit.edits).toEqual([{
      eventId: `event-${field}`,
      at: '2026-09-18T11:00:00.000Z',
      field,
      originalValue,
      previousValue: originalValue,
      nextValue,
      rawValue,
      error: null,
    }]);
    expect(original.events).toEqual([]);
  });

  it('preserva ordem para IDs numéricos e nomes do protótipo', () => {
    const projection = projectPortfolio(study([
      batch('batch-1', 1, [
        row('version-10', '10', '100', 2),
        row('version-2', '2', '100', 3),
        row('version-proto', '__proto__', '100', 4),
        row('version-constructor', 'constructor', '100', 5),
      ]),
    ]));

    expect(projection.operations.map((operation) => operation.operationId)).toEqual([
      '10', '2', '__proto__', 'constructor',
    ]);
    expect(projection.versionsByOperationId.__proto__).toHaveLength(1);
    expect(projection.versionsByOperationId.constructor).toHaveLength(1);
  });

  it('mantém toda a trilha ao editar novamente e voltar ao original', () => {
    const original = study([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ]);
    const first = editOperation(original, {
      operationId: 'OP-1', field: 'valueBrl', rawValue: '120',
      eventId: 'event-1', at: '2026-09-18T11:00:00.000Z',
    });
    const restored = editOperation(first, {
      operationId: 'OP-1', field: 'valueBrl', rawValue: '100',
      eventId: 'event-2', at: '2026-09-18T12:00:00.000Z',
    });

    const operation = projectPortfolio(restored).operations[0];
    expect(operation?.operation.valueBrl).toBe('100');
    expect(operation?.audit.edits).toEqual([
      expect.objectContaining({
        eventId: 'event-1', originalValue: '100',
        previousValue: '100', nextValue: '120',
      }),
      expect.objectContaining({
        eventId: 'event-2', originalValue: '100',
        previousValue: '120', nextValue: '100',
      }),
    ]);
  });

  it('persiste edição inválida como rascunho sem injetá-la na operação', () => {
    const original = study([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ]);

    const edited = editOperation(original, {
      operationId: 'OP-1', field: 'valueBrl', rawValue: '-1',
      eventId: 'event-invalid', at: '2026-09-18T11:00:00.000Z',
    });
    const operation = projectPortfolio(edited).operations[0];

    expect(operation?.operation.valueBrl).toBe('100');
    expect(operation?.executable).toBe(false);
    expect(operation?.audit.edits.at(-1)).toMatchObject({
      rawValue: '-1',
      nextValue: null,
      error: { code: 'VALUE_OUT_OF_RANGE' },
    });
  });

  it('exclui e restaura por eventos append-only sem mutar o estudo', () => {
    const original = study([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ]);
    const excluded = excludeOperation(original, {
      operationId: 'OP-1', eventId: 'event-exclude',
      at: '2026-09-18T11:00:00.000Z',
    });
    const restored = restoreOperation(excluded, {
      operationId: 'OP-1', eventId: 'event-restore',
      at: '2026-09-18T12:00:00.000Z',
    });

    expect(projectPortfolio(excluded).operations[0]?.excluded).toBe(true);
    expect(projectPortfolio(restored).operations[0]?.excluded).toBe(false);
    expect(restored.events.slice(-2).map((event) => event.kind)).toEqual([
      'OPERATION_EXCLUDED', 'OPERATION_RESTORED',
    ]);
    expect(original.events).toEqual([]);
  });
});
