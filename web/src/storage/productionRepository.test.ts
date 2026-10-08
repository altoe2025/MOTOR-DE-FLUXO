// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserApplicationRepository } from './productionRepository';

const OWNER = 'owner-production';
const PROJECT = 'project-production';
const TARGET = `motor-fluxo:app:v2:${PROJECT}:${OWNER}`;
const IMPORTER = `motor-fluxo:imports:v1:${PROJECT}:${OWNER}`;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function open(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (name === IMPORTER) request.result.createObjectStore('studies', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function remove(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

afterEach(async () => {
  localStorage.clear();
  await Promise.all([remove(TARGET), remove(IMPORTER)]);
});

describe('createBrowserApplicationRepository', () => {
  it('liga fontes legadas reais ao bootstrap e preserva original e markers sem binários', async () => {
    localStorage.setItem(`motor-fluxo:draft:v1:${OWNER}`, JSON.stringify({
      version: 1,
      owner_sub: OWNER,
      study_id: 'draft-production',
      name: 'Rascunho legado',
      updated_at: '2026-09-19T12:00:00Z',
    }));
    const legacy = await open(IMPORTER, 1);
    const write = legacy.transaction('studies', 'readwrite');
    write.objectStore('studies').put({ id: 'legacy-import', ownerSub: OWNER, note: 'texto' });
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onabort = () => reject(write.error);
    });
    legacy.close();

    const repository = createBrowserApplicationRepository({ projectRef: PROJECT, ownerSub: OWNER });
    await repository.listStudies();
    repository.close();

    const target = await open(TARGET);
    const meta = await requestResult<Array<{ key: string; value: unknown }>>(
      target.transaction('meta', 'readonly').objectStore('meta').getAll(),
    );
    target.close();
    expect(meta.map((row) => row.key)).toEqual(expect.arrayContaining([
      `original:localStorage:motor-fluxo:draft:v1:${OWNER}`,
      `migration:localStorage:motor-fluxo:draft:v1:${OWNER}`,
      `original:indexeddb:${IMPORTER}`,
      `migration:indexeddb:${IMPORTER}`,
      `archive:importer:indexeddb:${IMPORTER}`,
    ]));
    expect(JSON.stringify(meta)).not.toMatch(/Blob|ArrayBuffer|File/);
  });
});
