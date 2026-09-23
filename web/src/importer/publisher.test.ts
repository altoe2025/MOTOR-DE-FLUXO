import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import { BinaryDataNotAllowedError, InvalidDocumentError, OperationConflictError, OwnerMismatchError, RevisionConflictError } from '../storage/errors';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';
import { applyImportCommand, createImportReview, type ImportReview } from './eligibility';
import { confirmImport } from './publisher';

const now = '2026-09-23T12:00:00.000Z';
const company: CompanyRecord = { id: 'company-1', ownerSub: 'owner-a', displayName: 'Empresa', aliases: [], createdAt: now, updatedAt: now, revision: 1 };
const row = { operacao_id: 'OP-1', cliente_nome: 'NOME BRUTO CONFIDENCIAL', classificacao_perfil: null, direcao: 'OUT', data_conhecida: '2026-09-01', data_limite: '2026-09-07', valor_brl: '100,50', finalidade_codigo: null };
const stores = ['companies', 'observed_cases', 'import_batches', 'import_events', 'operations'] as const;
const repositories: IndexedDbApplicationRepository[] = [];

function repository(ownerSub = 'owner-a', projectRef = 'publisher'): IndexedDbApplicationRepository {
  const value = new IndexedDbApplicationRepository({ projectRef, ownerSub });
  repositories.push(value);
  return value;
}

function review(): ImportReview {
  return createImportReview({ parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: 'a'.repeat(64), byteSize: 123, rows: [row] }, company, ownerSub: 'owner-a', now, positionIdentified: true });
}

function correctedReview(): ImportReview {
  const initial = review();
  return applyImportCommand(initial, { kind: 'CORRECT_FIELD', versionId: initial.batches[0]!.rows[0]!.versionId, operationId: 'OP-1', field: 'valueBrl', rawValue: '125,50', actionId: 'correction-1', at: '2026-09-23T12:01:00.000Z' });
}

async function storedRows(): Promise<Record<string, unknown[]>> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('motor-fluxo:app:v2:publisher:owner-a');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(stores, 'readonly');
    return Object.fromEntries(await Promise.all(stores.map((name) => new Promise<[string, unknown[]]>((resolve, reject) => {
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => resolve([name, request.result]);
      request.onerror = () => reject(request.error);
    }))));
  } finally { database.close(); }
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const target of repositories.splice(0)) target.close();
  for (const database of await indexedDB.databases()) {
    if (database.name === undefined) continue;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(database.name!);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
});

describe('confirmImport', () => {
  it('publishes a reviewed case at persisted revision 1 and retains canonical audit and warnings only', async () => {
    const source = correctedReview();
    const target = repository();
    const result = await confirmImport(source, target, 'publish-1');
    expect(result).toMatchObject({ schemaVersion: '2.0.0', status: 'CONFIRMED', revision: 1, confirmedAt: '2026-09-23T12:01:00.000Z', orders: [{ id: 'OP-1', valueBrl: '125.5', efxStatus: 'NOT_COLLECTED' }] });
    expect(result.quality.warnings.map((warning) => warning.code)).toContain('EFX_NOT_COLLECTED');
    expect(await target.getObservedCase(result.id)).toEqual(result);
    expect(source.draft.status).toBe('DRAFT');
    const persisted = await storedRows();
    expect(persisted.import_batches).toEqual([expect.objectContaining({ document: {
      id: source.batches[0]!.id, caseId: result.id, batchSequence: 1, ownerSub: 'owner-a', companyId: company.id,
      sha256: 'a'.repeat(64), byteSize: 123, layout: 'xlsx-operacoes/1.0.0', counts: { total: 1, valid: 1, invalid: 0 },
    } })]);
    expect(persisted.import_events).toEqual([expect.objectContaining({ document: expect.objectContaining({ kind: 'OPERATION_CORRECTED', path: `versions/${source.batches[0]!.rows[0]!.versionId}/valueBrl`, audit: { originalValue: '100.5', previousValue: '100.5', nextValue: '125.5' } }) })]);
    const serialized = JSON.stringify(persisted);
    for (const forbidden of ['NOME BRUTO CONFIDENCIAL', 'rawValue', '125,50', '100,50', '"raw"', '"rows"', '"parsed"']) expect(serialized).not.toContain(forbidden);
  });

  it('redacts invalid original correction input instead of storing the raw cell in the case or audit', async () => {
    const initial = createImportReview({ parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: 'b'.repeat(64), byteSize: 123, rows: [{ ...row, direcao: 'SEGREDO CELULA' }] }, company, ownerSub: 'owner-a', now, positionIdentified: true });
    const fixed = applyImportCommand(initial, { kind: 'CORRECT_FIELD', versionId: initial.batches[0]!.rows[0]!.versionId, operationId: 'OP-1', field: 'direction', rawValue: 'OUT', actionId: 'fix-direction', at: now });
    const result = await confirmImport(fixed, repository(), 'fix');
    expect(result.corrections[0]).toMatchObject({ originalValue: null, previousValue: null, nextValue: 'OUT' });
    expect(JSON.stringify(await storedRows())).not.toContain('SEGREDO CELULA');
  });

  it.each(stores)('rolls back all five stores when %s rejects its write', async (store) => {
    const target = repository();
    await target.listCompanies();
    const method = store === 'companies' || store === 'observed_cases' ? 'put' : 'add';
    const original = IDBObjectStore.prototype[method];
    const fault = vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      if (this.name === store) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await expect(confirmImport(correctedReview(), target, 'failed')).rejects.toThrow('Injected quota failure');
    fault.mockRestore();
    expect(await storedRows()).toEqual({ companies: [], observed_cases: [], import_batches: [], import_events: [], operations: [] });
    await expect(confirmImport(correctedReview(), target, 'failed')).resolves.toMatchObject({ revision: 1 });
  });

  it('replays the identical operation after reload, but conflicts when an operation ID is reused for another intent', async () => {
    const source = correctedReview();
    const target = repository();
    const first = await confirmImport(source, target, 'same');
    target.close();
    expect(await confirmImport(structuredClone(source), repository(), 'same')).toEqual(first);
    expect((await storedRows()).operations).toHaveLength(1);
    await expect(confirmImport(review(), repository(), 'same')).rejects.toBeInstanceOf(OperationConflictError);
  });

  it('also rolls back when an asynchronous IndexedDB request fails after all writes were queued', async () => {
    const target = repository();
    await target.listCompanies();
    const original = IDBObjectStore.prototype.add;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      const request = original.apply(this, args);
      if (this.name === 'operations') original.apply(this, args); // Real duplicate-key request aborts later.
      return request;
    });
    await expect(confirmImport(correctedReview(), target, 'async-failure')).rejects.toBeInstanceOf(DOMException);
    fault.mockRestore();
    expect(await storedRows()).toEqual({ companies: [], observed_cases: [], import_batches: [], import_events: [], operations: [] });
  });

  it('persists an explicit identity association without copying client names or alias source text', async () => {
    const source = createImportReview({ parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: 'a'.repeat(64), byteSize: 123, rows: [row, { ...row, operacao_id: 'OP-2', cliente_nome: 'OUTRO NOME BRUTO' }] }, company, ownerSub: 'owner-a', now, positionIdentified: true });
    const canonicalClientId = source.draft.orders[0]!.clientId;
    const associated = applyImportCommand(source, { kind: 'ASSOCIATE_ALIAS', alias: 'OUTRO NOME BRUTO', canonicalClientId, eventId: 'alias-1', at: now });
    const result = await confirmImport(associated, repository(), 'alias');
    expect(result.orders.map((order) => order.clientId)).toEqual([canonicalClientId, canonicalClientId]);
    const persisted = await storedRows();
    expect(persisted.import_events).toEqual([expect.objectContaining({ document: expect.objectContaining({ kind: 'CLIENT_ALIAS_ASSOCIATED', path: `clients/${canonicalClientId}`, audit: null }) })]);
    expect(JSON.stringify(persisted)).not.toContain('NOME BRUTO');
    expect(JSON.stringify(persisted)).not.toContain('normalizedName');
  });

  it('has exactly one CAS winner across two instances and leaves no losing operation', async () => {
    const source = correctedReview();
    const outcomes = await Promise.allSettled([confirmImport(source, repository(), 'first'), confirmImport(source, repository(), 'second')]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({ reason: expect.any(RevisionConflictError) });
    expect((await storedRows()).operations).toHaveLength(1);
  });

  it('isolates accounts and projects and refuses a company/draft owner mismatch', async () => {
    const result = await confirmImport(review(), repository(), 'owner-a');
    const foreign = repository('owner-b');
    expect(await foreign.getObservedCase(result.id)).toBeNull();
    expect(await foreign.listCompanies()).toEqual([]);
    expect(await repository('owner-a', 'another-project').getObservedCase(result.id)).toBeNull();
    await expect(confirmImport(review(), foreign, 'owner-b')).rejects.toBeInstanceOf(OwnerMismatchError);
    await expect(confirmImport({ ...review(), company: { ...company, ownerSub: 'owner-b' } }, repository(), 'mismatch')).rejects.toBeInstanceOf(OwnerMismatchError);
  });

  it.each(['blocker', 'invalid-total', 'missing-company'] as const)('rejects %s before opening a database', async (kind) => {
    const source = review();
    const invalid = kind === 'blocker' ? { ...source, blockers: [{ code: 'BLOCKED', message: 'Bloqueado' }] }
      : kind === 'missing-company' ? { ...source, company: null }
        : { ...source, draft: { ...source.draft, controlTotals: [{ ...source.draft.controlTotals[0]!, valueBrl: '999' }] } };
    await expect(confirmImport(invalid, repository(), kind)).rejects.toBeInstanceOf(InvalidDocumentError);
    expect(await indexedDB.databases()).toEqual([]);
  });

  it.each([new Blob(['secret']), new File(['secret'], 'secret.xlsx'), new ArrayBuffer(4), new Uint8Array(4)])('rejects a binary review attachment before opening a database (%s)', async (binary) => {
    await expect(confirmImport({ ...review(), binary } as ImportReview, repository(), 'binary')).rejects.toBeInstanceOf(BinaryDataNotAllowedError);
    expect(await indexedDB.databases()).toEqual([]);
  });
});
