import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';

const name = 'motor-fluxo:app:v2:chat-upgrade:owner-a';
const oldStores = ['companies', 'observed_cases', 'import_batches', 'import_events', 'studies',
  'executions', 'operations', 'profile_versions', 'meta'];
let repository: IndexedDbApplicationRepository | undefined;
const connections: IDBDatabase[] = [];
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function seedV2(marker = 2) {
  const request = indexedDB.open(name, 2);
  request.onupgradeneeded = () => {
    // Each existing store carries opaque data: chat migration must leave it byte-for-byte intact.
    for (const store of oldStores) {
      const target = request.result.createObjectStore(store, { keyPath: 'key' });
      target.add({ key: `sentinel:${store}`, document: { id: store, nested: ['preserve', 42] } });
      if (store === 'meta') {
        target.add({ key: 'schema_version', value: marker });
        target.add({ key: 'demo:installation', value: { status: 'REMOVED', ownerSub: 'owner-a' } });
      }
    }
  };
  const db = await requestResult(request); db.close();
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
  it('upgrades 2 to 3 preserving every prior store and demo marker in the same database', async () => {
    await seedV2();
    await upgrade();
    const db = await open();
    expect(db.version).toBe(3);
    for (const store of oldStores) {
      expect(await requestResult(db.transaction(store).objectStore(store).get(`sentinel:${store}`)))
        .toEqual({ key: `sentinel:${store}`, document: { id: store, nested: ['preserve', 42] } });
    }
    expect(await requestResult(db.transaction('meta').objectStore('meta').get('demo:installation')))
      .toEqual({ key: 'demo:installation', value: { status: 'REMOVED', ownerSub: 'owner-a' } });
    expect(await requestResult(db.transaction('meta').objectStore('meta').get('schema_version')))
      .toEqual({ key: 'schema_version', value: 3 });
    expect([...db.objectStoreNames]).toEqual([...oldStores, 'chat_conversations', 'chat_operations'].sort());
  });

  it('rolls back both new stores and marker on interrupted versionchange and succeeds on retry', async () => {
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
