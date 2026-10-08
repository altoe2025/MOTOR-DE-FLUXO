import { BinaryDataNotAllowedError } from './errors';
import { IndexedDbApplicationRepository } from './indexedDbApplicationRepository';
import type { MigrationOptions } from './migrations';

type BrowserRepositoryScope = Readonly<{ projectRef: string; ownerSub: string }>;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function containsBinary(value: unknown, seen = new Set<object>()): boolean {
  if (value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
    || (typeof File !== 'undefined' && value instanceof File)) return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value instanceof Map) {
    return [...value].some(([key, item]) => containsBinary(key, seen) || containsBinary(item, seen));
  }
  if (value instanceof Set) return [...value].some((item) => containsBinary(item, seen));
  return Object.values(value).some((item) => containsBinary(item, seen));
}

function serializeLegacy(value: unknown): string {
  if (containsBinary(value)) {
    throw new BinaryDataNotAllowedError();
  }
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map) return [...item.entries()];
    if (item instanceof Set) return [...item.values()];
    return item;
  });
}

async function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB.databases !== 'function') return null;
  const exists = (await indexedDB.databases()).some((database) => database.name === name);
  if (!exists) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function importerSource(projectRef: string, ownerSub: string) {
  const databaseName = `motor-fluxo:imports:v1:${projectRef}:${ownerSub}`;
  const database = await openExistingDatabase(databaseName);
  if (database === null) return null;
  try {
    const stores: Record<string, unknown[]> = {};
    for (const storeName of database.objectStoreNames) {
      const transaction = database.transaction(storeName, 'readonly');
      stores[storeName] = await requestResult(transaction.objectStore(storeName).getAll());
    }
    return {
      sourceKey: `indexeddb:${databaseName}`,
      raw: serializeLegacy({ databaseName, version: database.version, stores }),
    };
  } finally {
    database.close();
  }
}

export async function discoverLegacyMigrationSources(
  scope: BrowserRepositoryScope,
): Promise<Omit<MigrationOptions, 'ownerSub'>> {
  const stage1Drafts = [];
  const draftKey = `motor-fluxo:draft:v1:${scope.ownerSub}`;
  try {
    const raw = window.localStorage.getItem(draftKey);
    if (raw !== null) stage1Drafts.push({ sourceKey: `localStorage:${draftKey}`, raw });
  } catch {
    // Storage bloqueado é tratado pelo fluxo normal; nenhuma origem é inventada.
  }
  const importer = await importerSource(scope.projectRef, scope.ownerSub);
  return {
    ...(stage1Drafts.length === 0 ? {} : { stage1Drafts }),
    ...(importer === null ? {} : { importerDatabases: [importer] }),
  };
}

export function createBrowserApplicationRepository(scope: BrowserRepositoryScope) {
  return new IndexedDbApplicationRepository({
    ...scope,
    migrationSourceLoader: () => discoverLegacyMigrationSources(scope),
  });
}
