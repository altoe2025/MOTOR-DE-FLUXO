import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import demo from '../demo/generated/demo-study.v1.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { createStudy, duplicateStudy, renameStudy } from '../study/domain';
import { makeScenarioDraft, FIXTURE_NOW } from '../study/fixtures';
import { IndexedDbApplicationRepository, STORE_NAMES } from './indexedDbApplicationRepository';

const repositories: IndexedDbApplicationRepository[] = [];
const names = new Set<string>();
function repository(ownerSub = 'demo-owner', projectRef = 'demo-project') {
  names.add(`motor-fluxo:app:v2:${encodeURIComponent(projectRef)}:${encodeURIComponent(ownerSub)}`);
  const result = new IndexedDbApplicationRepository({ ownerSub, projectRef });
  repositories.push(result);
  return result;
}
const input = (operationId = 'install-1', mode: 'FIRST_EMPTY_SESSION' | 'EXPLICIT_RESTORE' = 'FIRST_EMPTY_SESSION') => ({
  package: structuredClone(demo) as unknown as DemoStudyPackageV1, operationId, mode,
});
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}
async function database() {
  return request(indexedDB.open('motor-fluxo:app:v2:demo-project:demo-owner'));
}
async function rows() {
  const db = await database();
  try {
    const tx = db.transaction([...STORE_NAMES]);
    return Object.fromEntries(await Promise.all(STORE_NAMES.map(async (name) => [name, await request(tx.objectStore(name).getAll())])));
  } finally { db.close(); }
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const repo of repositories.splice(0)) repo.close();
  for (const name of names) await request(indexedDB.deleteDatabase(name));
  names.clear();
});

// Each case validates multiple copies of the complete 3 MB bundle.
describe('atomic demo installation', { timeout: 30000 }, () => {
  it('installs the whole package and retries identically across reload', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    expect(installed.ownerSub).toBe('demo-owner');
    expect(installed.scenarios).toHaveLength(5);
    expect(installed.executions).toHaveLength(10);
    expect(await repo.listStudies()).toEqual([installed]);
    expect(await repo.listCompanies()).toHaveLength(12);
    expect(await repo.listObservedCases()).toHaveLength(12);
    expect(await repo.listOperationalProfileVersions()).toHaveLength(12);
    const before = await rows();
    expect(before.meta).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'demo:installation', value: expect.objectContaining({ status: 'INSTALLED', studyId: installed.id }) })]));
    repo.close();
    expect(await repository().installDemoStudy(input())).toEqual(installed);
    expect(await rows()).toEqual(before);
  });

  it('serializes simultaneous first-session installations into one package', async () => {
    const attempts = await Promise.allSettled([
      repository().installDemoStudy(input('tab-a')),
      repository().installDemoStudy(input('tab-b')),
    ]);
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((item) => item.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: 'DEMO_INSTALL_SKIPPED' }) }),
    ]);
    expect(await repository().listStudies()).toHaveLength(1);
    expect(await repository().listCompanies()).toHaveLength(12);
  });

  it('never auto-installs over any existing study, including trash', async () => {
    const repo = repository();
    const study = await createStudy({ id: crypto.randomUUID(), ownerSub: 'demo-owner', name: 'Meu estudo', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
    await repo.saveStudy({ document: { ...study, deletedAt: FIXTURE_NOW }, expectedRevision: 0, operationId: 'user-save' });
    const before = await rows();
    await expect(repo.installDemoStudy(input())).rejects.toMatchObject({ code: 'DEMO_INSTALL_SKIPPED' });
    expect(await rows()).toEqual(before);
  });

  it('purges atomically, blocks resurrection and explicitly restores without changing another study', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    await repo.purgeStudy(installed.id);
    await repo.purgeStudy(installed.id);
    const removed = await rows();
    expect(removed.meta).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'demo:installation', value: expect.objectContaining({ status: 'REMOVED' }) })]));
    expect(removed.studies).toHaveLength(0);
    expect(removed.executions).toHaveLength(0);
    expect(removed.operations).toEqual([expect.objectContaining({ entity_kind: 'purged' })]);
    repo.close();
    const next = repository();
    await expect(next.installDemoStudy(input('new-session'))).rejects.toMatchObject({ code: 'DEMO_INSTALL_SKIPPED' });
    await expect(next.installDemoStudy(input())).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    const other = await createStudy({ id: crypto.randomUUID(), ownerSub: 'demo-owner', name: 'Trabalho do usuário', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
    await next.saveStudy({ document: other, expectedRevision: 0, operationId: 'user-save' });
    const restored = await next.installDemoStudy(input('restore', 'EXPLICIT_RESTORE'));
    expect(restored.id).not.toBe(installed.id);
    expect(await next.getStudy(other.id)).toEqual(other);
    expect(await next.listStudies()).toHaveLength(2);
    expect(await next.installDemoStudy(input('restore', 'EXPLICIT_RESTORE'))).toEqual(restored);
  });

  it('explicit restore of an installed demo preserves edits and immutable profiles', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    const renamed = await renameStudy(installed, 'Minha exploração', FIXTURE_NOW);
    await repo.saveStudy({ document: renamed, expectedRevision: installed.revision, operationId: 'rename' });
    const profiles = await repo.listOperationalProfileVersions();
    const result = await repo.installDemoStudy(input('another-restore', 'EXPLICIT_RESTORE'));
    expect(result).toEqual(renamed);
    expect(await repo.listOperationalProfileVersions()).toEqual(profiles);
    expect(await repo.listStudies()).toEqual([renamed]);
  });

  it('keeps owner and project independent even for equal operation IDs', async () => {
    const a = await repository().installDemoStudy(input());
    const bRepo = repository('owner-b');
    const cRepo = repository('demo-owner', 'other-project');
    const b = await bRepo.installDemoStudy(input());
    const c = await cRepo.installDemoStudy(input());
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(b.ownerSub).toBe('owner-b');
    expect(await bRepo.getStudy(a.id)).toBeNull();
    await bRepo.purgeStudy(a.id);
    expect(await repository().getStudy(a.id)).toEqual(a);
    expect(await cRepo.listStudies()).toEqual([c]);
  });

  it('rejects reuse of an operation ID with a different intent', async () => {
    const repo = repository();
    await repo.installDemoStudy(input());
    const before = await rows();
    await expect(repo.installDemoStudy(input('install-1', 'EXPLICIT_RESTORE'))).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(await rows()).toEqual(before);
  });

  it.each(['companies', 'observed_cases', 'profile_versions', 'studies', 'executions', 'operations', 'meta'])('rolls back every store when %s fails and recovers on retry', async (store) => {
    const repo = repository();
    await repo.listStudies();
    const before = await rows();
    const add = IDBObjectStore.prototype.add;
    const put = IDBObjectStore.prototype.put;
    const fail = function(this: IDBObjectStore, original: typeof add, args: Parameters<typeof add>) {
      if (this.name === store) throw new DOMException('Disk full', 'QuotaExceededError');
      return original.apply(this, args);
    };
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, ...args) { return fail.call(this, add, args); });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args) { return fail.call(this, put, args); });
    await expect(repo.installDemoStudy(input())).rejects.toThrow('Disk full');
    vi.restoreAllMocks();
    expect(await rows()).toEqual(before);
    repo.close();
    expect((await repository().installDemoStudy(input())).executions).toHaveLength(10);
  });

  it('aborts asynchronous request failure without committing a partial package', async () => {
    const repo = repository();
    await repo.listStudies();
    const before = await rows();
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, ...args) {
      const result = original.apply(this, args);
      if (this.name === 'executions') original.apply(this, args);
      return result;
    });
    await expect(repo.installDemoStudy(input())).rejects.toBeDefined();
    vi.restoreAllMocks();
    expect(await rows()).toEqual(before);
  });

  it('rolls back removal and marker together on storage failure', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    const before = await rows();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args) {
      if (this.name === 'meta') throw new DOMException('Disk full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(repo.purgeStudy(installed.id)).rejects.toThrow('Disk full');
    vi.restoreAllMocks();
    expect(await rows()).toEqual(before);
  });

  it('rejects partial, binary and hidden raw payloads before opening storage', async () => {
    const repo = repository();
    const open = vi.spyOn(indexedDB, 'open');
    for (const corrupt of [
      { ...input(), package: { ...demo, profiles: [] } },
      { ...input(), raw: new Uint8Array([1]) },
      { ...input(), raw: 'private input' },
      { ...input(), package: { ...demo, companies: Object.assign([...demo.companies], { raw: 'private input' }) } },
    ]) {
      await expect(repo.installDemoStudy(corrupt as unknown as ReturnType<typeof input>)).rejects.toBeDefined();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('snapshots caller input before asynchronous validation and opening storage', async () => {
    const candidate = input();
    const repo = repository();
    const installing = repo.installDemoStudy(candidate);
    (candidate.package.companies[0] as { displayName: string }).displayName = 'mutated';
    const installed = await installing;
    expect(installed.ownerSub).toBe('demo-owner');
    expect((await repo.listCompanies()).some((company) => company.displayName === 'mutated')).toBe(false);
  });

  it('preserves demo evidence referenced by a user copy after removing the original', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    const copy = await duplicateStudy(installed, FIXTURE_NOW, () => crypto.randomUUID());
    await repo.saveStudy({ document: copy, expectedRevision: 0, operationId: 'copy' });
    const profiles = await repo.listOperationalProfileVersions();
    await repo.purgeStudy(installed.id);
    await repo.installDemoStudy(input('restore-copy', 'EXPLICIT_RESTORE'));
    expect(await repo.getStudy(copy.id)).toEqual(copy);
    expect(await repo.listOperationalProfileVersions()).toEqual(expect.arrayContaining(profiles));
  });

  it('rejects a corrupt installed demo before restore writes anything', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    const db = await database();
    const tx = db.transaction('studies', 'readwrite');
    const store = tx.objectStore('studies');
    const row = await request(store.get(installed.id));
    row.document.deletedAt = FIXTURE_NOW;
    row.document.scenarios[0].sourceSnapshot.sourceFingerprint = '0'.repeat(64);
    await request(store.put(row));
    db.close();
    const before = await rows();
    await expect(repo.installDemoStudy(input('restore-corrupt', 'EXPLICIT_RESTORE'))).rejects.toMatchObject({ code: 'DOCUMENT_CORRUPT' });
    expect(await rows()).toEqual(before);
  });

  it('does not return an idempotent ghost when the installed study is missing', async () => {
    const repo = repository();
    const installed = await repo.installDemoStudy(input());
    const db = await database();
    await request(db.transaction('studies', 'readwrite').objectStore('studies').delete(installed.id));
    db.close();
    const before = await rows();
    await expect(repo.installDemoStudy(input())).rejects.toMatchObject({ code: 'DOCUMENT_CORRUPT' });
    expect(await rows()).toEqual(before);
  });

  it('does not commit after logout closes the repository during materialization', async () => {
    const repo = repository();
    await repo.listStudies();
    const before = await rows();
    const installing = repo.installDemoStudy(input());
    repo.close();
    await expect(installing).rejects.toMatchObject({ code: 'STORAGE_CLOSED' });
    expect(await rows()).toEqual(before);
  });
});
