import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';
import { createStudy } from '../study/domain';
import { FIXTURE_NOW, makeScenarioDraft } from '../study/fixtures';

const name = 'motor-fluxo:app:v2:chat-upgrade:owner-a';
const oldStores = ['companies', 'observed_cases', 'import_batches', 'import_events', 'studies',
  'executions', 'operations', 'profile_versions', 'meta'];
const oldSchema: Record<string, {
  keyPath: string | string[];
  indexes: Array<[string, string | string[], IDBIndexParameters?]>;
}> = {
  companies: { keyPath: 'company_id', indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_display_name', ['owner_sub', 'display_name']],
  ] },
  observed_cases: { keyPath: 'case_id', indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_company', ['owner_sub', 'company_id']],
  ] },
  import_batches: { keyPath: ['case_id', 'batch_sequence'], indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_company', ['owner_sub', 'company_id']],
    ['by_owner_case', ['owner_sub', 'case_id']],
  ] },
  import_events: { keyPath: ['case_id', 'event_sequence'], indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_company', ['owner_sub', 'company_id']],
    ['by_owner_case', ['owner_sub', 'case_id']],
  ] },
  studies: { keyPath: 'study_id', indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_deleted', ['owner_sub', 'deleted']],
  ] },
  executions: { keyPath: ['study_id', 'execution_id'], indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_study', ['owner_sub', 'study_id']],
  ] },
  operations: { keyPath: 'operation_id', indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_entity', ['owner_sub', 'entity_kind', 'entity_id']],
  ] },
  profile_versions: { keyPath: 'profile_version_id', indexes: [
    ['by_owner', 'owner_sub'], ['by_owner_company', ['owner_sub', 'company_id']],
    ['by_owner_company_version', ['owner_sub', 'company_id', 'version'], { unique: true }],
  ] },
  meta: { keyPath: 'key', indexes: [] },
};
let repository: IndexedDbApplicationRepository | undefined;
const connections: IDBDatabase[] = [];
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function seedV2(marker = 2) {
  const { executions, ...document } = await createStudy({
    id: 'sentinel:studies', ownerSub: 'owner-a', name: 'Estudo anterior ao chat',
    now: FIXTURE_NOW, baseScenario: makeScenarioDraft(),
  });
  void executions;
  const originalRows = new Map<string, Record<string, unknown>>();
  const request = indexedDB.open(name, 2);
  request.onupgradeneeded = () => {
    // Use real v2 keys/indexes; v5 derives summaries and preserves source documents.
    for (const store of oldStores) {
      const schema = oldSchema[store]!;
      const target = request.result.createObjectStore(store, { keyPath: schema.keyPath });
      for (const [index, keyPath, options] of schema.indexes) target.createIndex(index, keyPath, options);
      const fields = Array.isArray(schema.keyPath) ? schema.keyPath : [schema.keyPath];
      const row: Record<string, unknown> = {
        ...Object.fromEntries(fields.map((field) => [field, field.endsWith('_sequence') ? 0 : `sentinel:${store}`])),
        owner_sub: 'owner-a', document: { id: store, nested: ['preserve', 42] },
      };
      if (store === 'studies') Object.assign(row, { deleted: 0, document });
      if (store === 'executions') Object.assign(row, { study_id: document.id, sequence: 0 });
      originalRows.set(store, row);
      target.add(row);
      if (store === 'meta') {
        target.add({ key: 'schema_version', value: marker });
        target.add({ key: 'demo:installation', value: { status: 'REMOVED', ownerSub: 'owner-a' } });
      }
    }
  };
  const db = await requestResult(request); db.close();
  return originalRows;
}
async function open() {
  const db = await requestResult(indexedDB.open(name)); connections.push(db); return db;
}
function upgrade() {
  repository = new IndexedDbApplicationRepository({ projectRef: 'chat-upgrade', ownerSub: 'owner-a' });
  return repository.listChatConversations(null);
}
afterEach(async () => {
  vi.restoreAllMocks(); repository?.close(); connections.splice(0).forEach((db) => db.close());
  await requestResult(indexedDB.deleteDatabase(name));
});

describe('chat physical upgrade', () => {
  it('upgrades 2 to 4 preserving every prior store and demo marker in the same database', async () => {
    const originalRows = await seedV2();
    await upgrade();
    const db = await open();
    expect(db.version).toBe(5);
    for (const store of oldStores) {
      expect(await requestResult(db.transaction(store).objectStore(store).getAll()))
        .toContainEqual(originalRows.get(store));
    }
    expect(await requestResult(db.transaction('meta').objectStore('meta').get('demo:installation')))
      .toEqual({ key: 'demo:installation', value: { status: 'REMOVED', ownerSub: 'owner-a' } });
    expect(await requestResult(db.transaction('meta').objectStore('meta').get('schema_version')))
      .toEqual({ key: 'schema_version', value: 5 });
    expect([...db.objectStoreNames]).toEqual([...oldStores, 'chat_conversations', 'chat_operations', 'study_summaries'].sort());
    expect(await requestResult(db.transaction('study_summaries').objectStore('study_summaries').get('sentinel:studies')))
      .toMatchObject({ study_id: 'sentinel:studies', owner_sub: 'owner-a', deleted: 0,
        document: { name: 'Estudo anterior ao chat', scenarioCount: 1, hasExecutions: true } });
  });

  it('rolls back new stores and marker on interrupted versionchange and succeeds on retry', async () => {
    await seedV2();
    const original = IDBDatabase.prototype.createObjectStore;
    vi.spyOn(IDBDatabase.prototype, 'createObjectStore').mockImplementation(function (this: IDBDatabase, store, options) {
      const result = original.call(this, store, options);
      if (store === 'chat_operations') result.transaction.abort();
      return result;
    });
    await expect(upgrade()).rejects.toBeDefined();
    vi.restoreAllMocks();
    const db = await open();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toEqual([...oldStores].sort());
    expect(await requestResult(db.transaction('meta').objectStore('meta').get('schema_version')))
      .toEqual({ key: 'schema_version', value: 2 });
    db.close();
    expect(await upgrade()).toEqual([]);
  });

  it('rejects a mismatching logical marker without changing the previous physical database', async () => {
    await seedV2(99);
    await expect(upgrade()).rejects.toMatchObject({ code: 'SCHEMA_UNSUPPORTED' });
    const db = await open();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toEqual([...oldStores].sort());
  });
});
