import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { canonical } from '../study/fingerprints';
import { DocumentCorruptError, SchemaUnsupportedError } from './errors';
import { IndexedDbApplicationRepository } from './indexedDbApplicationRepository';
import {
  migrateDatabase,
  readRecoveredDraft,
  validateStoredStudy,
} from './migrations';

const PROJECT_REF = 'project-test';
const OWNER_SUB = 'owner-a';
const DATABASE_NAME = `motor-fluxo:app:v2:${PROJECT_REF}:${OWNER_SUB}`;
const STAGE2_PROJECT_REF = 'stage2-fixture';
const STAGE2_OWNER_SUB = 'owner-stage2-fixture';
const STAGE2_DATABASE_NAME = `motor-fluxo:app:v2:${STAGE2_PROJECT_REF}:${STAGE2_OWNER_SUB}`;

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8').trimEnd();
}

const DRAFT_SOURCE = {
  sourceKey: `localStorage:motor-fluxo:draft:v1:${OWNER_SUB}`,
  raw: fixture('stage1-draft-v1.json'),
};
const STUDY_SOURCE = {
  sourceKey: 'study-memory-v1:00000000-0000-4000-8000-000000000020',
  raw: fixture('study-document-v1.json'),
};
const IMPORTER_SOURCE = {
  sourceKey: 'indexeddb:motor-fluxo:imports:v1:project-test:owner-a',
  raw: fixture('importer-database-v1.json'),
};

type Stage2Archive = Readonly<{
  databaseName: string;
  version: number;
  stores: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}>;

function stage2Archive(): Stage2Archive {
  return JSON.parse(fixture('application-database-v1-stage2.json')) as Stage2Archive;
}

function createV1StoreSchema(database: IDBDatabase): void {
  const companies = database.createObjectStore('companies', { keyPath: 'company_id' });
  companies.createIndex('by_owner', 'owner_sub');
  companies.createIndex('by_owner_display_name', ['owner_sub', 'display_name']);
  const cases = database.createObjectStore('observed_cases', { keyPath: 'case_id' });
  cases.createIndex('by_owner', 'owner_sub');
  cases.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  const batches = database.createObjectStore('import_batches', { keyPath: ['case_id', 'batch_sequence'] });
  batches.createIndex('by_owner', 'owner_sub');
  batches.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  batches.createIndex('by_owner_case', ['owner_sub', 'case_id']);
  const events = database.createObjectStore('import_events', { keyPath: ['case_id', 'event_sequence'] });
  events.createIndex('by_owner', 'owner_sub');
  events.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  events.createIndex('by_owner_case', ['owner_sub', 'case_id']);
  const studies = database.createObjectStore('studies', { keyPath: 'study_id' });
  studies.createIndex('by_owner', 'owner_sub');
  studies.createIndex('by_owner_deleted', ['owner_sub', 'deleted']);
  const executions = database.createObjectStore('executions', { keyPath: ['study_id', 'execution_id'] });
  executions.createIndex('by_owner', 'owner_sub');
  executions.createIndex('by_owner_study', ['owner_sub', 'study_id']);
  const operations = database.createObjectStore('operations', { keyPath: 'operation_id' });
  operations.createIndex('by_owner', 'owner_sub');
  operations.createIndex('by_owner_entity', ['owner_sub', 'entity_kind', 'entity_id']);
  database.createObjectStore('meta', { keyPath: 'key' });
}

async function installStage2V1(
  mutate?: (archive: { stores: Record<string, Record<string, unknown>[]> }) => void,
): Promise<void> {
  const archive = structuredClone(stage2Archive()) as unknown as {
    stores: Record<string, Record<string, unknown>[]>;
  };
  const study = archive.stores.studies?.[2];
  const executionRows = archive.stores.executions ?? [];
  if (study === undefined) throw new Error('Fixture Stage 2 incompleta.');
  const legacyDocument = {
    ...(study.document as Record<string, unknown>),
    executions: executionRows.map((row) => row.document),
  };
  archive.stores.operations = [
    {
      operation_id: 'legacy-save', owner_sub: STAGE2_OWNER_SUB, entity_kind: 'study',
      entity_id: study.study_id, intent: canonical({
        expectedRevision: 2, operationId: 'legacy-save', document: legacyDocument,
      }),
      result_document: study.document,
      result_execution_ids: executionRows.map((row) => row.execution_id),
    },
    {
      operation_id: 'legacy-restore', owner_sub: STAGE2_OWNER_SUB, entity_kind: 'restore_study',
      entity_id: study.study_id,
      intent: canonical({ action: 'restoreStudy', id: study.study_id, expectedRevision: 2 }),
      result_document: study.document,
      result_execution_ids: executionRows.map((row) => row.execution_id),
    },
  ];
  mutate?.(archive);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(STAGE2_DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      createV1StoreSchema(request.result);
      const transaction = request.transaction!;
      for (const storeName of request.result.objectStoreNames) {
        for (const row of archive.stores[storeName] ?? []) transaction.objectStore(storeName).add(row);
      }
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

const connections: IDBDatabase[] = [];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      connections.push(request.result);
      resolve(request.result);
    };
  });
}

async function targetDatabase(): Promise<IDBDatabase> {
  const repository = new IndexedDbApplicationRepository({ projectRef: PROJECT_REF, ownerSub: OWNER_SUB });
  await repository.listStudies();
  repository.close();
  return openDatabase(DATABASE_NAME);
}

async function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`blocked: ${name}`));
    request.onsuccess = () => resolve();
  });
}

afterEach(async () => {
  for (const database of connections.splice(0)) database.close();
  await deleteDatabase(DATABASE_NAME);
  await deleteDatabase(STAGE2_DATABASE_NAME);
});

describe('physical schema 1 to 2', () => {
  it('migrates the real Stage 2 fixture, execution rows and idempotent operation payloads', async () => {
    await installStage2V1();
    const target = new IndexedDbApplicationRepository({
      projectRef: STAGE2_PROJECT_REF,
      ownerSub: STAGE2_OWNER_SUB,
    });

    const studies = await target.listStudies({ includeDeleted: true });
    expect(studies).toHaveLength(3);
    expect(studies.every((study) => study.schemaVersion === '3.0.0')).toBe(true);
    expect(studies.every((study) => study.evidenceSnapshots.length === 0)).toBe(true);
    expect(studies.flatMap((study) => study.executions)
      .every((execution) => execution.kind === 'PREVIEW')).toBe(true);
    expect(JSON.stringify(studies)).not.toContain('generationInputSnapshot');

    const migrated = studies.find((study) => study.id.endsWith('302'))!;
    expect(await target.saveStudy({
      expectedRevision: 2,
      operationId: 'legacy-save',
      document: migrated,
    })).toEqual(migrated);
    expect(await target.restoreStudy(migrated.id, 2, 'legacy-restore')).toEqual(migrated);
    target.close();

    const database = await openDatabase(STAGE2_DATABASE_NAME);
    const transaction = database.transaction(['meta', 'operations'], 'readonly');
    const metaRequest = transaction.objectStore('meta').get('schema_version');
    const operationsRequest = transaction.objectStore('operations').getAll();
    expect([...database.objectStoreNames]).toContain('profile_versions');
    expect([...database.objectStoreNames]).toContain('chat_conversations');
    expect([...database.objectStoreNames]).toContain('chat_operations');
    expect(database.version).toBe(3);
    const [meta, operations] = await Promise.all([
      requestResult(metaRequest),
      requestResult<Array<Record<string, unknown>>>(operationsRequest),
    ]);
    expect(meta).toEqual({ key: 'schema_version', value: 3 });
    expect(operations).toHaveLength(2);
    expect(operations.every((row) =>
      (row.result_document as Record<string, unknown>).schemaVersion === '3.0.0')).toBe(true);
    expect(operations.every((row) => Array.isArray(row.result_execution_ids))).toBe(true);
    database.close();

    const reopened = new IndexedDbApplicationRepository({
      projectRef: STAGE2_PROJECT_REF,
      ownerSub: STAGE2_OWNER_SUB,
    });
    expect((await reopened.listStudies({ includeDeleted: true })).map((study) => study.id))
      .toEqual(studies.map((study) => study.id));
    reopened.close();
  });

  it('rolls back every migrated row, the ninth store and schema marker when the second study fails', async () => {
    await installStage2V1((archive) => {
      const second = archive.stores.studies?.[1];
      if (second === undefined) throw new Error('Fixture sem segundo estudo.');
      (second.document as Record<string, unknown>).schemaVersion = '99.0.0';
    });
    const target = new IndexedDbApplicationRepository({
      projectRef: STAGE2_PROJECT_REF,
      ownerSub: STAGE2_OWNER_SUB,
    });
    await expect(target.listStudies()).rejects.toBeInstanceOf(SchemaUnsupportedError);
    target.close();

    const database = await openDatabase(STAGE2_DATABASE_NAME);
    expect(database.version).toBe(1);
    expect([...database.objectStoreNames]).not.toContain('profile_versions');
    const transaction = database.transaction(['studies', 'executions', 'operations', 'meta'], 'readonly');
    const studies = await requestResult<Array<{ document: Record<string, unknown> }>>(
      transaction.objectStore('studies').getAll(),
    );
    expect(studies.map((row) => row.document.schemaVersion)).toEqual(['2.0.0', '99.0.0', '2.0.0']);
    expect(await requestResult(transaction.objectStore('meta').get('schema_version')))
      .toEqual({ key: 'schema_version', value: 1 });
    database.close();
  });

  it('rejects and preserves a future logical marker inside a physical V1 database', async () => {
    await installStage2V1((archive) => {
      const marker = archive.stores.meta?.[0];
      if (marker === undefined) throw new Error('Fixture sem marcador lógico.');
      marker.value = 99;
    });
    const target = new IndexedDbApplicationRepository({
      projectRef: STAGE2_PROJECT_REF,
      ownerSub: STAGE2_OWNER_SUB,
    });
    await expect(target.listStudies()).rejects.toBeInstanceOf(SchemaUnsupportedError);
    target.close();

    const database = await openDatabase(STAGE2_DATABASE_NAME);
    expect(database.version).toBe(1);
    expect([...database.objectStoreNames]).not.toContain('profile_versions');
    expect(await requestResult(database.transaction('meta').objectStore('meta').get('schema_version')))
      .toEqual({ key: 'schema_version', value: 99 });
    database.close();
  });
});

describe('migrateDatabase', () => {
  it('runs migrations before exposing the repository', async () => {
    const target = new IndexedDbApplicationRepository({
      projectRef: PROJECT_REF,
      ownerSub: OWNER_SUB,
      migrationSources: { legacyStudies: [STUDY_SOURCE] },
    });

    const migrated = await target.getStudy('00000000-0000-4000-8000-000000000020');

    expect(migrated).toMatchObject({ schemaVersion: '3.0.0', ownerSub: OWNER_SUB });
    target.close();
  });

  it('migrates a real 1.0 study and preserves the other two real legacy formats explicitly', async () => {
    const database = await targetDatabase();

    const result = await migrateDatabase(database, {
      ownerSub: OWNER_SUB,
      stage1Drafts: [DRAFT_SOURCE],
      legacyStudies: [STUDY_SOURCE],
      importerDatabases: [IMPORTER_SOURCE],
    });

    expect(result).toEqual({
      migratedStudyIds: ['00000000-0000-4000-8000-000000000020'],
      recoveredDrafts: [{
        sourceKey: DRAFT_SOURCE.sourceKey,
        ownerSub: OWNER_SUB,
        legacyStudyId: 'stage-1-draft',
        name: 'Carteira Amanda',
        updatedAt: '2026-09-13T01:00:00.000Z',
        saved: false,
      }],
      archivedImporterSourceKeys: [IMPORTER_SOURCE.sourceKey],
    });
    expect(await readRecoveredDraft(database, OWNER_SUB)).toEqual(result.recoveredDrafts[0]);

    const transaction = database.transaction(['studies', 'meta'], 'readonly');
    const [rows, meta] = await Promise.all([
      requestResult<Array<{ document: Record<string, unknown> }>>(
        transaction.objectStore('studies').getAll(),
      ),
      requestResult<Array<{ key: string; value: unknown }>>(
        transaction.objectStore('meta').getAll(),
      ),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.document).toMatchObject({
      schemaVersion: '3.0.0',
      ownerSub: OWNER_SUB,
      scenarios: [{ sourceSnapshot: { source: { kind: 'AUTHORED' } } }],
    });
    expect(meta.filter((row) => row.key.startsWith('migration:'))).toHaveLength(3);
    expect(meta).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: expect.stringMatching(/^original:/),
        value: expect.objectContaining({ raw: STUDY_SOURCE.raw }),
      }),
      expect.objectContaining({
        key: expect.stringMatching(/^archive:importer:/),
        value: expect.objectContaining({ raw: IMPORTER_SOURCE.raw }),
      }),
    ]));
  });

  it('is idempotent and does not duplicate destination records or markers', async () => {
    const database = await targetDatabase();
    const sources = {
      ownerSub: OWNER_SUB,
      stage1Drafts: [DRAFT_SOURCE],
      legacyStudies: [STUDY_SOURCE],
      importerDatabases: [IMPORTER_SOURCE],
    };

    const first = await migrateDatabase(database, sources);
    const second = await migrateDatabase(database, sources);

    expect(second).toEqual(first);
    const transaction = database.transaction(['studies', 'meta'], 'readonly');
    expect(await requestResult(transaction.objectStore('studies').count())).toBe(1);
    const meta = await requestResult<Array<{ key: string }>>(transaction.objectStore('meta').getAll());
    expect(meta.filter((row) => row.key.startsWith('migration:'))).toHaveLength(3);
  });

  it('aborts destination, original backup and marker together when a write fails', async () => {
    const database = await targetDatabase();
    const transaction = database.transaction('studies', 'readwrite');
    transaction.objectStore('studies').add({
      study_id: '00000000-0000-4000-8000-000000000020',
      owner_sub: OWNER_SUB,
      deleted: 0,
      document: { occupied: true },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });

    await expect(migrateDatabase(database, {
      ownerSub: OWNER_SUB,
      legacyStudies: [STUDY_SOURCE],
    })).rejects.toBeTruthy();

    const read = database.transaction('meta', 'readonly').objectStore('meta');
    const meta = await requestResult<Array<{ key: string }>>(read.getAll());
    expect(meta.some((row) => row.key.startsWith('migration:'))).toBe(false);
    expect(meta.some((row) => row.key.startsWith('original:'))).toBe(false);
    expect(STUDY_SOURCE.raw).toContain('"study_schema_version": "1.0.0"');
  });

  it('rejects future schema versions and corrupt documents with typed errors', async () => {
    const database = await targetDatabase();
    const future = JSON.stringify({
      ...JSON.parse(STUDY_SOURCE.raw) as Record<string, unknown>,
      study_schema_version: '99.0.0',
    });

    await expect(migrateDatabase(database, {
      ownerSub: OWNER_SUB,
      legacyStudies: [{ sourceKey: 'future-study', raw: future }],
    })).rejects.toBeInstanceOf(SchemaUnsupportedError);
    await expect(migrateDatabase(database, {
      ownerSub: OWNER_SUB,
      legacyStudies: [{ sourceKey: 'broken-study', raw: '{broken' }],
    })).rejects.toBeInstanceOf(DocumentCorruptError);
    await expect(validateStoredStudy({ schemaVersion: '99.0.0' }, OWNER_SUB))
      .rejects.toBeInstanceOf(SchemaUnsupportedError);
    await expect(validateStoredStudy({ schemaVersion: '3.0.0' }, OWNER_SUB))
      .rejects.toBeInstanceOf(DocumentCorruptError);
  });

  it('checks the physical schema marker and validates records on every read', async () => {
    const database = await targetDatabase();
    const write = database.transaction(['studies', 'meta'], 'readwrite');
    write.objectStore('studies').put({
      study_id: 'corrupt-study',
      owner_sub: OWNER_SUB,
      deleted: 0,
      document: { schemaVersion: '3.0.0', id: 'corrupt-study', ownerSub: OWNER_SUB },
    });
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onabort = () => reject(write.error);
    });
    database.close();

    const corruptReader = new IndexedDbApplicationRepository({
      projectRef: PROJECT_REF,
      ownerSub: OWNER_SUB,
    });
    await expect(corruptReader.getStudy('corrupt-study'))
      .rejects.toBeInstanceOf(DocumentCorruptError);
    corruptReader.close();

    const reopened = await openDatabase(DATABASE_NAME);
    const futureWrite = reopened.transaction('meta', 'readwrite');
    futureWrite.objectStore('meta').put({ key: 'schema_version', value: 99 });
    await new Promise<void>((resolve, reject) => {
      futureWrite.oncomplete = () => resolve();
      futureWrite.onabort = () => reject(futureWrite.error);
    });
    reopened.close();

    const futureReader = new IndexedDbApplicationRepository({
      projectRef: PROJECT_REF,
      ownerSub: OWNER_SUB,
    });
    await expect(futureReader.listStudies()).rejects.toBeInstanceOf(SchemaUnsupportedError);
    futureReader.close();
  });

  it('maps a future IndexedDB version to SCHEMA_UNSUPPORTED', async () => {
    const future = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    future.close();
    const target = new IndexedDbApplicationRepository({
      projectRef: PROJECT_REF,
      ownerSub: OWNER_SUB,
    });

    await expect(target.listStudies()).rejects.toBeInstanceOf(SchemaUnsupportedError);
    target.close();
  });
});
