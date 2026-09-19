import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

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
});

describe('migrateDatabase', () => {
  it('runs migrations before exposing the repository', async () => {
    const target = new IndexedDbApplicationRepository({
      projectRef: PROJECT_REF,
      ownerSub: OWNER_SUB,
      migrationSources: { legacyStudies: [STUDY_SOURCE] },
    });

    const migrated = await target.getStudy('00000000-0000-4000-8000-000000000020');

    expect(migrated).toMatchObject({ schemaVersion: '2.0.0', ownerSub: OWNER_SUB });
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
      schemaVersion: '2.0.0',
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
    await expect(validateStoredStudy({ schemaVersion: '3.0.0' }, OWNER_SUB))
      .rejects.toBeInstanceOf(SchemaUnsupportedError);
    await expect(validateStoredStudy({ schemaVersion: '2.0.0' }, OWNER_SUB))
      .rejects.toBeInstanceOf(DocumentCorruptError);
  });

  it('checks the physical schema marker and validates records on every read', async () => {
    const database = await targetDatabase();
    const write = database.transaction(['studies', 'meta'], 'readwrite');
    write.objectStore('studies').put({
      study_id: 'corrupt-study',
      owner_sub: OWNER_SUB,
      deleted: 0,
      document: { schemaVersion: '2.0.0', id: 'corrupt-study', ownerSub: OWNER_SUB },
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
      const request = indexedDB.open(DATABASE_NAME, 2);
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
