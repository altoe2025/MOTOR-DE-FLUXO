import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import type { ImportStudy, ISODate } from './domain';
import {
  databaseName,
  IndexedDbImportRepository,
} from './indexedDbRepository';

const PROJECT = 'project-test';
const OWNER = 'owner-a';
const NAME = databaseName(PROJECT, OWNER);

function makeStudy(id = 'study-1', revision = 1): ImportStudy {
  return {
    schemaVersion: '1.0.0',
    id,
    revision,
    name: 'Operações reais',
    createdAtUtc: '2026-09-18T10:00:00.000Z',
    updatedAtUtc: '2026-09-18T10:00:00.000Z',
    batches: [{
      schemaVersion: '1.0.0',
      id: 'batch-1',
      studyId: id,
      revision: 1,
      batchSequence: 1,
      importedAtUtc: '2026-09-18T10:00:00.000Z',
      file: {
        fileName: 'operacoes.xlsx',
        fileSize: 100,
        fileLastModified: 1_800_000_000_000,
        sha256: 'sha-256',
      },
      rows: [{
        versionId: 'version-1',
        canonicalClientId: 'client-1',
        rowNumber: 2,
        raw: {
          operacao_id: 'OP-1',
          cliente_nome: 'Cliente Á',
          classificacao_perfil: null,
          direcao: 'OUT',
          data_conhecida: '18/09/2026',
          data_limite: '20/09/2026',
          valor_brl: '100,00',
          finalidade_codigo: 'SERVICO',
        },
        normalized: {
          operationId: 'OP-1',
          clientName: 'Cliente Á',
          profileClassification: null,
          direction: 'OUT',
          knownDate: '2026-09-18' as ISODate,
          deadlineDate: '2026-09-20' as ISODate,
          valueBrl: '100',
          purposeCode: 'SERVICO',
        },
        errors: [],
      }, {
        versionId: 'version-invalid',
        canonicalClientId: 'client-1',
        rowNumber: 3,
        raw: {
          operacao_id: 'OP-2',
          cliente_nome: 'Cliente Á',
          classificacao_perfil: null,
          direcao: '???',
          data_conhecida: null,
          data_limite: null,
          valor_brl: 'x',
          finalidade_codigo: null,
        },
        normalized: null,
        errors: [{
          code: 'DIRECTION_INVALID',
          field: 'direcao',
          rowNumber: 3,
          value: '???',
          message: 'direção inválida',
        }],
      }],
    }],
    events: [{
      kind: 'BATCH_IMPORTED',
      id: 'event-1',
      eventSequence: 1,
      occurredAtUtc: '2026-09-18T10:00:00.000Z',
      batchId: 'batch-1',
    }],
  };
}

function repository(ownerSub = OWNER): IndexedDbImportRepository {
  return new IndexedDbImportRepository({
    indexedDB,
    projectRef: PROJECT,
    ownerSub,
    broadcastChannelFactory: null,
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function all(database: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`blocked: ${name}`));
    request.onsuccess = () => resolve();
  });
}

afterEach(async () => {
  await deleteDatabase(NAME);
  await deleteDatabase(databaseName(PROJECT, 'owner-b'));
});

describe('databaseName', () => {
  it('isola por projeto e conta', () => {
    expect(databaseName('project', 'owner')).toBe(
      'motor-fluxo:imports:v1:project:owner',
    );
    expect(databaseName('project', 'owner-a')).not.toBe(
      databaseName('project', 'owner-b'),
    );
  });

  it.each([
    ['', 'owner'],
    ['   ', 'owner'],
    ['project', ''],
    ['project:other', 'owner'],
    ['project', 'owner:other'],
  ])('rejeita escopo inválido', (projectRef, ownerSub) => {
    expect(() => databaseName(projectRef, ownerSub)).toThrow(
      'INVALID_DATABASE_SCOPE',
    );
  });
});

describe('schema e round-trip', () => {
  it('cria sete stores sem expor IDBDatabase pela porta', async () => {
    const target = repository();
    await target.listStudies();
    target.close();

    const database = await openDatabase(NAME);
    expect([...database.objectStoreNames]).toEqual([
      'aliases',
      'batches',
      'clients',
      'events',
      'executions',
      'studies',
      'versions',
    ]);
    const transaction = database.transaction([...database.objectStoreNames]);
    for (const storeName of [
      'aliases', 'batches', 'clients', 'events', 'executions', 'versions',
    ]) {
      expect([...transaction.objectStore(storeName).indexNames]).toContain(
        'study_id',
      );
    }
    database.close();
  });

  it('preserva estudo, linha inválida, alias e execução', async () => {
    const target = repository();
    const original = makeStudy();
    await target.createStudy(original);
    await target.saveExecution({
      id: 'execution-1',
      studyId: original.id,
      ownerSub: OWNER,
      studyRevision: 1,
      createdAtUtc: '2026-09-18T11:00:00.000Z',
      operationIds: ['OP-1'],
      request: { source: 'REAL_OPERATIONS' },
      response: { status: 'SUCCEEDED' },
    }, 1);

    await expect(target.loadStudy(original.id)).resolves.toEqual(original);
    expect((await target.loadStudy(original.id))?.batches[0]?.rows[1]).toEqual(
      original.batches[0]?.rows[1],
    );
    target.close();

    const database = await openDatabase(NAME);
    expect(await all(database, 'aliases')).toEqual([
      expect.objectContaining({
        studyId: original.id,
        normalizedName: 'cliente a',
        canonicalClientId: 'client-1',
      }),
    ]);
    expect(await all(database, 'executions')).toEqual([
      expect.objectContaining({ id: 'execution-1', ownerSub: OWNER }),
    ]);
    database.close();
  });

  it('recusa conteúdo binário antes de abrir a transação', async () => {
    const target = repository();
    const invalid = makeStudy() as ImportStudy & { originalFile: ArrayBuffer };
    invalid.originalFile = new ArrayBuffer(4);

    await expect(target.createStudy(invalid)).rejects.toThrow(
      'BINARY_DATA_NOT_ALLOWED',
    );
    await expect(target.listStudies()).resolves.toEqual([]);
    target.close();
  });

  it('não permite execução de outra conta', async () => {
    const target = repository();
    await target.createStudy(makeStudy());
    await expect(target.saveExecution({
      id: 'execution-foreign',
      studyId: 'study-1',
      ownerSub: 'owner-b',
      studyRevision: 1,
      createdAtUtc: '2026-09-18T11:00:00.000Z',
      operationIds: [],
      request: {},
      response: {},
    }, 1)).rejects.toThrow('OWNER_SCOPE_MISMATCH');
    target.close();
  });

  it('separa bancos de contas diferentes', async () => {
    const first = repository();
    const second = repository('owner-b');
    await first.createStudy(makeStudy());

    await expect(second.loadStudy('study-1')).resolves.toBeNull();
    first.close();
    second.close();
  });

  it('rejeita registro adulterado com ownerSub de outra conta', async () => {
    const target = repository();
    await target.listStudies();
    target.close();
    const database = await openDatabase(NAME);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('studies', 'readwrite');
      transaction.objectStore('studies').put({
        id: 'study-foreign',
        ownerSub: 'owner-b',
        document: makeStudy('study-foreign'),
        appliedOperations: new Map(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    const reopened = repository();
    await expect(reopened.loadStudy('study-foreign')).rejects.toThrow(
      'OWNER_SCOPE_MISMATCH',
    );
    reopened.close();
  });

  it('fecha a conexão ao receber versionchange', async () => {
    const target = repository();
    await target.listStudies();

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(NAME, 2);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('upgrade bloqueado'));
      request.onsuccess = () => resolve(request.result);
    });

    upgraded.close();
    target.close();
  });
});

describe('exclusão local', () => {
  it('close preserva os dados para reabertura', async () => {
    const first = repository();
    await first.createStudy(makeStudy());
    first.close();

    const reopened = repository();
    await expect(reopened.loadStudy('study-1')).resolves.toEqual(makeStudy());
    reopened.close();
  });

  it('deleteStudy remove todas as chaves do estudo', async () => {
    const target = repository();
    await target.createStudy(makeStudy());
    await target.deleteStudy('study-1');
    await expect(target.loadStudy('study-1')).resolves.toBeNull();
    target.close();

    const database = await openDatabase(NAME);
    for (const storeName of database.objectStoreNames) {
      expect(await all(database, storeName)).toEqual([]);
    }
    database.close();
  });

  it('deleteAllLocalData não apaga banco de outra conta', async () => {
    const first = repository();
    const second = repository('owner-b');
    await first.createStudy(makeStudy());
    await second.createStudy(makeStudy('study-b'));

    await first.deleteAllLocalData();
    await expect(second.loadStudy('study-b')).resolves.toMatchObject({
      id: 'study-b',
    });
    second.close();
  });

  it('informa quando outra aba bloqueia apagar todos os dados', async () => {
    const first = repository();
    await first.createStudy(makeStudy());
    const blockingConnection = await openDatabase(NAME);
    blockingConnection.onversionchange = () => undefined;

    await expect(first.deleteAllLocalData()).rejects.toThrow(
      'DATABASE_DELETE_BLOCKED',
    );
    blockingConnection.close();
  });
});
